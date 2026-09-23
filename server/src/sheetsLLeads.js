// Both L-code sheets use this transaction; no counter lives in Google Sheets.
export function normalizeLeadPhone(value) {
  let phone = String(value ?? '').replace(/\D/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (/^0[67]\d{8}$/.test(phone)) phone = `212${phone.slice(1)}`;
  if (/^[67]\d{8}$/.test(phone)) phone = `212${phone}`;
  return phone;
}

function inputError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

export function validateSheetLead(body = {}) {
  const fields = ['sheetLeadId', 'nom', 'telephone', 'dateReception', 'produit',
    'societe', 'email', 'pays', 'volumeImportation', 'fournisseurFiable',
    'frustrationActuelle', 'browserId', 'sheetFormat'];
  const data = {};
  for (const field of fields) {
    const value = body[field];
    if (value != null && !['string', 'number'].includes(typeof value)) throw inputError(`${field} invalide`);
    data[field] = String(value ?? '').trim();
    if (data[field].length > (field === 'sheetLeadId' ? 250 : 10000)) throw inputError(`${field} trop long`);
  }
  data.telephone = normalizeLeadPhone(data.telephone);
  if (!data.sheetLeadId || !data.nom || !data.produit) throw inputError('Identifiant, nom et produit requis');
  if (!/^\d{9,15}$/.test(data.telephone)) throw inputError('Téléphone invalide');
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(data.dateReception)
      || !Number.isFinite(Date.parse(data.dateReception))) throw inputError('Date de réception ISO avec fuseau horaire requise');
  data.dateReception = new Date(data.dateReception).toISOString();
  return data;
}

export function firstAvailableLNumber(codes, minimum = 0) {
  const occupied = new Set();
  for (const value of codes || []) {
    const code = String(value || '').trim().toUpperCase();
    if (/^L\d+$/.test(code)) occupied.add(Number(code.slice(1)));
  }
  let candidate = Number(minimum) + 1;
  while (occupied.has(candidate)) candidate += 1;
  return candidate;
}

async function nextCode(tx, prefix, minimum = 0) {
  // L codes intentionally fill the first free number after the reserved
  // range. SequenceCounter is a high-water mark only: deleting a complete
  // test lead releases its L code, so the next lead must reuse that gap.
  // The caller holds a PostgreSQL advisory transaction lock, keeping this
  // scan-and-create allocation safe across processes and both Sheets.
  if (prefix === 'L') {
    const clients = await tx.collectionItem.findMany({ where: { collection: 'clients' }, select: { id: true, code: true, data: true } });
    const occupiedCodes = [];
    for (const client of clients) {
      for (const code of [client.id, client.code, client.data?.codeClientUltex]) {
        if (/^L\d+$/.test(code || '')) occupiedCodes.push(code);
      }
    }
    for (let attempt = 0; attempt < 10000; attempt++) {
      const number = firstAvailableLNumber(occupiedCodes, minimum);
      const code = `L${number}`;
      const used = await tx.collectionItem.findFirst({ where: { OR: [{ id: code }, { code }] } });
      if (used) {
        occupiedCodes.push(code);
        continue;
      }
      const current = await tx.sequenceCounter.findUnique({ where: { key: 'L' } });
      await tx.sequenceCounter.upsert({
        where: { key: 'L' },
        create: { key: 'L', val: number },
        update: { val: Math.max(number, current?.val || 0) },
      });
      return code;
    }
    throw new Error('Aucun code L disponible');
  }
  for (let attempt = 0; attempt < 10000; attempt++) {
    const seq = await tx.sequenceCounter.upsert({ where: { key: prefix },
      create: { key: prefix, val: 1 }, update: { val: { increment: 1 } } });
    const code = prefix + String(seq.val).padStart(6, '0');
    const used = await tx.collectionItem.findFirst({ where: { OR: [{ id: code }, { code }] } });
    if (!used) return code;
  }
  throw new Error('Aucun code disponible');
}

const bySource = (collection, sheetLeadId) => ({ collection, data: { path: ['sheetLeadId'], equals: sheetLeadId } });
async function createItem(tx, collection, prefix, values, minimum) {
  const code = await nextCode(tx, prefix, minimum);
  return tx.collectionItem.create({ data: { collection, id: code, code, data: { ...values, id: code, code } } });
}

export async function syncLLead(prisma, body) {
  const lead = validateSheetLead(body);
  return prisma.$transaction(async tx => {
    // PostgreSQL lock is shared across server processes and held until commit.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(6912, 2026)`;
    const previous = await tx.collectionItem.findFirst({ where: bySource('demandes', lead.sheetLeadId) });
    if (previous) {
      return { status: 'ok', reused: true, client: { code: previous.data.client }, demande: { code: previous.code } };
    }

    const clients = await tx.collectionItem.findMany({ where: { collection: 'clients' } });
    const matches = clients.filter(c => normalizeLeadPhone(c.data?.telephone) === lead.telephone);
    if (matches.length > 1) throw inputError('Plusieurs clients ont ce téléphone. Fusionnez-les dans le CRM avant de réessayer.', 409);
    let client = matches[0];
    const date = lead.dateReception.slice(0, 10);
    if (!client) {
      client = await createItem(tx, 'clients', 'L', {
        nom: lead.nom, telephone: lead.telephone, email: lead.email, societe: lead.societe,
        pays: lead.pays, segment: 'Prospect', sourceDonnees: 'Google Sheets',
        datePremierContact: date, dateDerniereDemande: date, dateEntreeData: date,
        nbRelances: 0, dataTag: '', sheetLeadId: lead.sheetLeadId,
      }, 6912);
      client = await tx.collectionItem.update({ where: { id: client.id }, data: {
        data: { ...client.data, codeClientUltex: client.code },
      } });
    } else {
      // A returning lead must not replace CRM-owned tags, deadlines or identity.
      const data = { ...client.data };
      for (const field of ['email', 'societe', 'pays']) if (!data[field] && lead[field]) data[field] = lead[field];
      data.dateDerniereDemande = [data.dateDerniereDemande || '', date].sort().at(-1);
      client = await tx.collectionItem.update({ where: { id: client.id }, data: { data } });
    }

    let contact = await tx.collectionItem.findFirst({ where: {
      collection: 'contacts', data: { path: ['codeClientAssocie'], equals: client.code },
    } });
    if (!contact) contact = await createItem(tx, 'contacts', 'CT', {
      nom: lead.nom, telephone: lead.telephone, email: lead.email,
      typeContact: 'Client', codeClientAssocie: client.code, sourceDonnees: 'Google Sheets',
    });

    const labels = { societe: 'Société', pays: 'Pays', volumeImportation: "Volume d’importation",
      fournisseurFiable: 'Fournisseur fiable', frustrationActuelle: 'Frustration actuelle', browserId: 'Browser ID' };
    const notes = Object.entries(labels).filter(([key]) => lead[key]).map(([key, label]) => `${label} : ${lead[key]}`).join('\n');
    const demande = await createItem(tx, 'demandes', 'DMD', {
      sheetLeadId: lead.sheetLeadId, client: client.code, codeClientUltex: client.code,
      dateDemande: date, dateHeureReception: lead.dateReception,
      source: 'Google', canalReception: 'Google Sheets', sourceSynchronisation: 'Google Sheets',
      createdManually: false, responsableData: 'Data', objectifGeneral: lead.produit,
      statut: 'Nouvelle', urgence: 'Normale', remarqueGenerale: notes,
      sheetSourceData: lead,
    });
    await createItem(tx, 'demandeLignes', 'DL', {
      sheetLeadId: lead.sheetLeadId, demande: demande.code, referenceMetier: `P1-${client.code}`,
      nomProduit: lead.produit, statut: 'Brouillon', sourceSynchronisation: 'Google Sheets', ts: Date.now(),
    });
    return { status: 'ok', reused: false, client: { code: client.code }, contact: { code: contact.code }, demande: { code: demande.code } };
  }, { maxWait: 15000, timeout: 30000 });
}

export function lLeadHandler(prisma) {
  return async (req, res) => {
    try { res.json(await syncLLead(prisma, req.body)); }
    catch (error) {
      console.error('L-sheet lead sync failed:', error.code || error.status || 'internal');
      res.status(error.status || 500).json({ error: error.status ? error.message : 'Synchronisation impossible. Réessayez avec le même CRM_SYNC_ID.' });
    }
  };
}
