const SOURCE_NAME = 'Meta Formulaire export';
const ALLOWED_SHEETS = new Set(['Formulaire export', 'Formulaire export (v4)']);

function inputError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function clean(value, limit = 10000) {
  if (value == null) return '';
  if (!['string', 'number', 'boolean'].includes(typeof value)) throw inputError('Valeur de formulaire invalide');
  const result = String(value).replace(/\u0000/g, '').trim();
  if (result.length > limit) throw inputError('Valeur de formulaire trop longue');
  return result;
}

function normalizedText(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
}

function answerText(value) {
  return clean(value).replace(/_/g, ' ').replace(/\s+([.,;!?])/g, '$1').replace(/\s+/g, ' ');
}

export function normalizeMetaExportPhone(raw) {
  let phone = clean(raw, 100).replace(/^p:/i, '').replace(/\D/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (/^0[567]\d{8}$/.test(phone)) phone = `212${phone.slice(1)}`;
  if (/^[567]\d{8}$/.test(phone)) phone = `212${phone}`;
  return phone;
}

function emailsFrom(raw) {
  return [...new Set(clean(raw, 1000).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)?.map(value => value.toLowerCase()) || [])];
}

const COUNTRY_BY_DIAL_CODE = [
  ['971', 'Émirats arabes unis'], ['974', 'Qatar'], ['966', 'Arabie saoudite'],
  ['353', 'Irlande'], ['351', 'Portugal'], ['225', "Côte d’Ivoire"], ['223', 'Mali'],
  ['222', 'Mauritanie'], ['221', 'Sénégal'], ['216', 'Tunisie'], ['213', 'Algérie'],
  ['212', 'Maroc'], ['20', 'Égypte'], ['90', 'Turquie'], ['86', 'Chine'],
  ['49', 'Allemagne'], ['44', 'Royaume-Uni'], ['39', 'Italie'], ['34', 'Espagne'],
  ['33', 'France'], ['32', 'Belgique'], ['31', 'Pays-Bas'], ['1', 'Canada / États-Unis'],
];

export function countryFromMetaExportPhone(phone) {
  return COUNTRY_BY_DIAL_CODE.find(([prefix]) => String(phone).startsWith(prefix))?.[1] || '';
}

function parseCreatedTime(value) {
  const raw = clean(value, 100);
  const normalized = raw.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const date = new Date(normalized);
  if (!raw || Number.isNaN(date.getTime())) throw inputError('created_time invalide');
  return date;
}

function platformLabel(value) {
  const platform = normalizedText(value);
  if (platform === 'fb' || platform === 'facebook') return 'Facebook';
  if (platform === 'ig' || platform === 'instagram') return 'Instagram';
  return clean(value, 100) || 'Meta';
}

export function validateMetaExportV2Lead(body = {}) {
  const sheetName = clean(body.sheetName, 100);
  if (!ALLOWED_SHEETS.has(sheetName)) throw inputError('Feuille non autorisée');

  const leadId = clean(body.leadId, 250);
  const name = clean(body.fullName, 500);
  const phone = normalizeMetaExportPhone(body.phone);
  const emails = emailsFrom(body.email);
  const product = answerText(body.product);
  const sourceValues = Object.values(body).map(value => typeof value === 'string' ? normalizedText(value) : '');
  const isTest = sourceValues.some(value => value.includes('<test lead:')) || emails.includes('test@meta.com');
  if (isTest) return { ignored: true, reason: 'Meta test lead', leadId };
  if (!leadId || !name || !product) throw inputError('id, full_name et produit sont requis');
  if (!/^\d{8,15}$/.test(phone)) throw inputError('Numéro de téléphone invalide');

  const createdAt = parseCreatedTime(body.createdTime);
  const language = sheetName === 'Formulaire export (v4)' ? 'ar' : 'fr';
  return {
    ignored: false,
    sheetName,
    sheetRow: Number(body.sheetRow) || null,
    language,
    leadId,
    importSourceId: `meta-export:${leadId}`,
    createdAt,
    name,
    phone,
    phoneRaw: clean(body.phone, 100),
    emails,
    email: emails[0] || '',
    country: countryFromMetaExportPhone(phone),
    product,
    volume: answerText(body.volume),
    exportExperience: answerText(body.exportExperience),
    partners: answerText(body.partners),
    frustration: answerText(body.frustration),
    platform: platformLabel(body.platform),
    leadStatus: clean(body.leadStatus, 200),
    priority: clean(body.priority, 200),
    organic: ['true', '1', 'oui', 'yes'].includes(normalizedText(body.organic)),
    adId: clean(body.adId, 250),
    adName: clean(body.adName, 1000),
    adsetId: clean(body.adsetId, 250),
    adsetName: clean(body.adsetName, 1000),
    campaignId: clean(body.campaignId, 250),
    campaignName: clean(body.campaignName, 1000),
    formId: clean(body.formId, 250),
    formName: clean(body.formName, 1000) || sheetName,
  };
}

function clientIdentity(client) {
  const data = client.data || {};
  return {
    phones: new Set([data.telephone, data.whatsapp, ...(Array.isArray(data.telephones) ? data.telephones : [])]
      .map(normalizeMetaExportPhone).filter(Boolean)),
    emails: new Set([data.email, ...(Array.isArray(data.emails) ? data.emails : [])].flatMap(emailsFrom)),
  };
}

function matchingClients(record, clients) {
  return clients.filter(client => {
    const identity = clientIdentity(client);
    return identity.phones.has(record.phone) || record.emails.some(email => identity.emails.has(email));
  });
}

async function nextCode(tx, prefix) {
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const sequence = await tx.sequenceCounter.upsert({
      where: { key: prefix },
      create: { key: prefix, val: 1 },
      update: { val: { increment: 1 } },
    });
    const code = `${prefix}${String(sequence.val).padStart(6, '0')}`;
    const used = await tx.collectionItem.findFirst({ where: { OR: [{ id: code }, { code }] }, select: { id: true } });
    if (!used) return code;
  }
  throw new Error(`Impossible de générer un code ${prefix} libre.`);
}

async function createItem(tx, collection, prefix, values, createdAt) {
  const code = await nextCode(tx, prefix);
  return tx.collectionItem.create({
    data: { collection, id: code, code, data: { ...values, id: code, code }, createdAt },
  });
}

async function reserveNextEClientCode(tx, clients) {
  let highest = 0;
  for (const client of clients) {
    for (const value of [client.id, client.code, client.data?.codeClientUltex]) {
      const match = clean(value).toUpperCase().match(/^E(\d+)$/);
      if (match) highest = Math.max(highest, Number(match[1]));
    }
  }
  const counterKey = 'CLIENT_E';
  const current = await tx.sequenceCounter.findUnique({ where: { key: counterKey } });
  let number = Math.max(highest + 1, Number(current?.val || 0) + 1, 1);
  for (let attempt = 0; attempt < 10000; attempt += 1, number += 1) {
    const code = `E${number}`;
    const used = await tx.collectionItem.findFirst({
      where: { OR: [{ id: code }, { code }, { data: { path: ['codeClientUltex'], equals: code } }] },
      select: { id: true },
    });
    if (used) continue;
    await tx.sequenceCounter.upsert({
      where: { key: counterKey },
      create: { key: counterKey, val: number },
      update: { val: number },
    });
    return code;
  }
  throw new Error('Aucun code client E disponible.');
}

function mergeClientData(existing, record, code) {
  const current = existing?.data || {};
  const phones = [...new Set([
    ...[current.telephone, current.whatsapp, ...(Array.isArray(current.telephones) ? current.telephones : [])]
      .map(normalizeMetaExportPhone).filter(Boolean),
    record.phone,
  ])];
  const emails = [...new Set([
    ...[current.email, ...(Array.isArray(current.emails) ? current.emails : [])].flatMap(emailsFrom),
    ...record.emails,
  ])];
  const sourceDay = record.createdAt.toISOString().slice(0, 10);
  return {
    ...current,
    id: code,
    code,
    codeClientUltex: code,
    nom: current.nom || record.name,
    telephone: current.telephone || record.phone,
    whatsapp: current.whatsapp || record.phone,
    email: current.email || record.email,
    pays: current.pays || record.country,
    segment: current.segment || 'Prospect',
    sourcePremierContact: current.sourcePremierContact || record.platform,
    sourceDonnees: current.sourceDonnees || SOURCE_NAME,
    datePremierContact: current.datePremierContact || sourceDay,
    dateEntreeData: current.dateEntreeData || record.createdAt.toISOString(),
    dateDerniereDemande: sourceDay,
    dateCreation: current.dateCreation || sourceDay,
    produitsSouhaites: current.produitsSouhaites || record.product,
    volumeExportation: current.volumeExportation || record.volume,
    experienceExportOnssa: current.experienceExportOnssa || record.exportExperience,
    partenairesFiables: current.partenairesFiables || record.partners,
    frustrationLogistique: current.frustrationLogistique || record.frustration,
    nbRelances: Number(current.nbRelances || 0),
    telephones: phones,
    emails,
    metaLeadIds: [...new Set([...(Array.isArray(current.metaLeadIds) ? current.metaLeadIds : []), record.leadId])],
    importMetaExport: true,
  };
}

function leadNotes(record) {
  return [
    `Produit à importer ou exporter : ${record.product}`,
    record.volume ? `Volume d’exportation : ${record.volume}` : '',
    record.exportExperience ? `ONSSA / expérience export : ${record.exportExperience}` : '',
    record.partners ? `Partenaires fiables : ${record.partners}` : '',
    record.frustration ? `Frustration logistique : ${record.frustration}` : '',
    record.priority ? `Priorité Meta : ${record.priority}` : '',
    `Source : ${record.platform} — ${record.formName}`,
  ].filter(Boolean).join('\n');
}

export async function syncMetaExportV2Lead(prisma, body, crmInstance) {
  if (crmInstance !== 'v2') throw inputError('Cette synchronisation est réservée au CRM V2.', 403);
  const record = validateMetaExportV2Lead(body);
  if (record.ignored) return { status: 'ignored', reason: record.reason, leadId: record.leadId };

  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(6900, 5)`;
    const previous = await tx.collectionItem.findFirst({
      where: { collection: 'demandes', data: { path: ['importSourceId'], equals: record.importSourceId } },
    });
    if (previous) {
      return {
        status: 'ok', reused: true,
        client: { code: previous.data.client || previous.data.codeClientUltex },
        demande: { code: previous.code },
      };
    }

    const clients = await tx.collectionItem.findMany({ where: { collection: 'clients' } });
    const matches = matchingClients(record, clients);
    if (matches.length > 1) throw inputError(`Plusieurs clients V2 correspondent à ce téléphone/e-mail : ${matches.map(item => item.code).join(', ')}`, 409);
    if (matches.length === 1 && !/^E\d+$/.test(String(matches[0].code || ''))) {
      throw inputError(`Le client correspondant utilise le code non-E ${matches[0].code}. Corrigez-le avant la synchronisation.`, 409);
    }

    let client = matches[0] || null;
    const createdClient = !client;
    if (client) {
      client = await tx.collectionItem.update({
        where: { collection_id: { collection: 'clients', id: client.id } },
        data: { data: mergeClientData(client, record, client.code) },
      });
    } else {
      const code = await reserveNextEClientCode(tx, clients);
      client = await tx.collectionItem.create({
        data: {
          collection: 'clients', id: code, code, createdAt: record.createdAt,
          data: mergeClientData(null, record, code),
        },
      });
    }

    const contact = await createItem(tx, 'contacts', 'CT', {
      nom: record.name, telephone: record.phone, whatsapp: record.phone,
      email: record.email, pays: record.country, telephones: [record.phone], emails: record.emails,
      source: record.platform, statut: 'En échange', typeContact: 'Prospect',
      codeClientAssocie: client.code, sourceDonnees: SOURCE_NAME,
      importSourceId: record.importSourceId, metaLeadId: record.leadId, importSourceRow: record.sheetRow,
    }, record.createdAt);

    const demande = await createItem(tx, 'demandes', 'DMD', {
      client: client.code, codeClientUltex: client.code,
      dateDemande: record.createdAt.toISOString().slice(0, 10),
      dateHeureReception: record.createdAt.toISOString(),
      source: 'Meta Lead Ads', canalReception: 'Réseaux sociaux', plateformeSource: record.platform,
      sourceSynchronisation: SOURCE_NAME, createdManually: false, responsableData: 'Data',
      objectifGeneral: record.product, sensOperation: 'Export', typeProjet: 'Exportation',
      urgence: 'Normale', statut: 'Nouvelle', remarqueGenerale: leadNotes(record),
      importSourceId: record.importSourceId, metaLeadId: record.leadId, importSourceRow: record.sheetRow,
      sourceSheet: record.sheetName, sourceLanguage: record.language,
      metaLeadStatus: record.leadStatus, metaPriority: record.priority,
      metaCampaign: {
        organic: record.organic, platform: record.platform,
        adId: record.adId, adName: record.adName, adsetId: record.adsetId, adsetName: record.adsetName,
        campaignId: record.campaignId, campaignName: record.campaignName,
        formId: record.formId, formName: record.formName,
      },
      sheetSourceData: { ...record, createdAt: record.createdAt.toISOString() },
    }, record.createdAt);

    const line = await createItem(tx, 'demandeLignes', 'DL', {
      demande: demande.code, referenceMetier: `P1-${client.code}`,
      nomProduit: record.product, designationTechnique: record.product,
      typeTraitement: 'Qualification export', routeTraitement: 'Closing',
      statutFournisseur: 'À définir', statut: 'Nouvelle', sourceSynchronisation: SOURCE_NAME,
      importSourceId: record.importSourceId, metaLeadId: record.leadId, ts: record.createdAt.getTime(),
    }, record.createdAt);

    return {
      status: 'ok', reused: false, createdClient,
      client: { code: client.code }, contact: { code: contact.code },
      demande: { code: demande.code }, line: { code: line.code },
    };
  }, { maxWait: 15000, timeout: 30000 });
}

export function metaExportV2LeadHandler(prisma, crmInstance) {
  return async (req, res) => {
    try {
      res.json(await syncMetaExportV2Lead(prisma, req.body, crmInstance));
    } catch (error) {
      console.error('Meta export V2 sheet sync failed:', error.code || error.status || 'internal');
      res.status(error.status || 500).json({
        error: error.status ? error.message : 'Synchronisation CRM V2 impossible. Réessayez avec le même ID Meta.',
      });
    }
  };
}
