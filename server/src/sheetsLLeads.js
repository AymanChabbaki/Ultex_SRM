// Both L-code sheets use this transaction; no counter lives in Google Sheets.
export function normalizeLeadPhone(value) {
  let phone = String(value ?? '').replace(/\D/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (/^0[67]\d{8}$/.test(phone)) phone = `212${phone.slice(1)}`;
  if (/^[67]\d{8}$/.test(phone)) phone = `212${phone}`;
  return phone;
}

function inputError(message, status = 400, code = 'INVALID_SHEET_LEAD') {
  return Object.assign(new Error(message), { status, code });
}

const lLeadErrorLogState = new Map();
const L_LEAD_ERROR_LOG_WINDOW_MS = 60_000;

function logLLeadSyncError({ status, sheetLeadId, code, message }) {
  const now = Date.now();
  const key = `${status}:${code}:${message}`;
  const previous = lLeadErrorLogState.get(key);
  if (previous && now - previous.loggedAt < L_LEAD_ERROR_LOG_WINDOW_MS) {
    previous.suppressed += 1;
    return;
  }
  const suppressedSuffix = previous?.suppressed
    ? ` suppressed=${previous.suppressed}`
    : '';
  console.error(
    `L-sheet lead sync failed: status=${status} id=${sheetLeadId} code=${code} reason=${message}${suppressedSuffix}`,
  );
  lLeadErrorLogState.set(key, { loggedAt: now, suppressed: 0 });
  // Validation messages are bounded, but keep the process cache bounded too.
  if (lLeadErrorLogState.size > 100) {
    const oldestKey = [...lLeadErrorLogState.entries()]
      .sort((left, right) => left[1].loggedAt - right[1].loggedAt)[0]?.[0];
    if (oldestKey) lLeadErrorLogState.delete(oldestKey);
  }
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

export function nextLNumberFromCurrentClients(codes, minimum = 0) {
  // The live client table is authoritative. A stale high-water counter must
  // not survive deliberate code corrections/renames (for example, if the
  // current maximum was corrected from L7010 back to L7004, the next code is
  // L7005). Gaps below the current maximum are still never filled.
  let highest = Number(minimum) || 0;
  for (const value of codes || []) {
    const code = String(value || '').trim().toUpperCase();
    if (/^L\d+$/.test(code)) highest = Math.max(highest, Number(code.slice(1)));
  }
  return highest + 1;
}

function datedClient(client) {
  const values = [client.data?.dateCreation, client.data?.datePremierContact, client.createdAt]
    .map(value => value ? new Date(value).getTime() : NaN)
    .filter(Number.isFinite);
  return values.length ? Math.min(...values) : Number.MAX_SAFE_INTEGER;
}

function splitClientCode(client) {
  const code = String(client?.code || client?.id || '').trim().toUpperCase();
  const match = code.match(/^([A-Z]*)(\d+)$/);
  return { code, prefix: match?.[1] ?? '', number: match ? Number(match[2]) : Number.MAX_SAFE_INTEGER };
}

export function chooseCanonicalPhoneClient(clients = []) {
  return [...clients].sort((left, right) => {
    const a = splitClientCode(left);
    const b = splitClientCode(right);
    // Within the same CRM series, the lower number is the established code
    // (L1635 must win over an accidental L6947 duplicate).
    if (a.prefix === b.prefix && a.number !== b.number) return a.number - b.number;
    const dateDifference = datedClient(left) - datedClient(right);
    if (dateDifference) return dateDifference;
    const sourceDifference = Number(left.data?.sourceDonnees === 'Google Sheets')
      - Number(right.data?.sourceDonnees === 'Google Sheets');
    if (sourceDifference) return sourceDifference;
    return a.code.localeCompare(b.code, 'fr', { numeric: true });
  })[0] || null;
}

async function mergePhoneClients(tx, matches) {
  const canonical = chooseCanonicalPhoneClient(matches);
  if (!canonical || matches.length < 2) return canonical;
  const duplicates = matches.filter(client => client.id !== canonical.id);
  const data = { ...canonical.data };
  for (const duplicate of duplicates) {
    for (const [key, value] of Object.entries(duplicate.data || {})) {
      if ((data[key] === undefined || data[key] === null || data[key] === '') && value != null && value !== '') data[key] = value;
    }
  }
  data.id = canonical.code;
  data.code = canonical.code;
  data.codeClientUltex = canonical.code;
  const updated = await tx.collectionItem.update({ where: { id: canonical.id }, data: { data } });

  for (const duplicate of duplicates) {
    for (const field of ['client', 'codeClientAssocie', 'codeClient', 'codeClientUltex']) {
      const references = await tx.collectionItem.findMany({
        where: { data: { path: [field], equals: duplicate.code } }
      });
      for (const reference of references) {
        await tx.collectionItem.update({
          where: { collection_id: { collection: reference.collection, id: reference.id } },
          data: { data: { ...reference.data, [field]: canonical.code } }
        });
      }
    }
    await tx.collectionItem.delete({
      where: { collection_id: { collection: 'clients', id: duplicate.id } }
    });
  }
  return updated;
}

async function nextCode(tx, prefix, minimum = 0) {
  if (prefix === 'L') {
    // The current highest client code is authoritative. The advisory lock in
    // syncLLead serializes this read + create path across server processes.
    const clients = await tx.collectionItem.findMany({ where: { collection: 'clients' }, select: { id: true, code: true, data: true } });
    const occupiedCodes = [];
    for (const client of clients) {
      for (const code of [client.id, client.code, client.data?.codeClientUltex]) {
        if (/^L\d+$/.test(code || '')) occupiedCodes.push(code);
      }
    }
    let number = nextLNumberFromCurrentClients(occupiedCodes, minimum);
    for (let attempt = 0; attempt < 10000; attempt += 1, number += 1) {
      const code = `L${number}`;
      const used = await tx.collectionItem.findFirst({ where: { OR: [{ id: code }, { code }] } });
      if (used) continue;
      await tx.sequenceCounter.upsert({
        where: { key: 'L' },
        create: { key: 'L', val: number },
        // Keep the counter as a diagnostic mirror only. It is deliberately
        // allowed to move down after staff correct the highest live L code.
        update: { val: number },
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
    let client = matches.length > 1 ? await mergePhoneClients(tx, matches) : matches[0];
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
      // The row's actual code is canonical. Never carry forward stale JSON
      // identity left by an old import/browser snapshot.
      data.id = client.code;
      data.code = client.code;
      data.codeClientUltex = client.code;
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
      const status = Number(error.status) || 500;
      const retryable = status >= 500 || status === 408 || status === 429;
      const sheetLeadId = String(req.body?.sheetLeadId || 'sans-identifiant').slice(0, 250);
      const publicMessage = error.status
        ? error.message
        : 'Synchronisation impossible. Réessayez avec le même CRM_SYNC_ID.';
      // Include the safe row identifier and validation reason. The previous
      // log only printed "400", which made a bad Sheet row impossible to
      // diagnose while its one-minute trigger flooded the container logs.
      logLLeadSyncError({
        status,
        sheetLeadId,
        code: error.code || 'internal',
        message: publicMessage,
      });
      res.status(status).json({
        error: publicMessage,
        code: error.code || (retryable ? 'SYNC_TEMPORARY_FAILURE' : 'INVALID_SHEET_LEAD'),
        retryable,
        sheetLeadId,
      });
    }
  };
}
