/**
 * Import a Meta "Formulaire export" CSV into the physically isolated CRM V2.
 *
 * Safety:
 * - refuses database access unless CRM_INSTANCE=v2;
 * - inspect-only parses the file without connecting to PostgreSQL;
 * - preview is the default; writes require --apply and a confirmation token;
 * - skips Meta's dummy/test lead;
 * - idempotent by Meta lead ID;
 * - creates only E client codes, continuing after the highest existing E code;
 * - reuses an existing client only when exactly one matching client already
 *   has an E code; ambiguous/non-E matches are reported and skipped.
 *
 * Usage inside ubos_backend_v2_prod:
 *   node scripts/import_meta_export_leads_v2.js --file /tmp/ultex-export.csv --inspect-only --report /tmp/meta-export-inspect.json
 *   node scripts/import_meta_export_leads_v2.js --file /tmp/ultex-export.csv --report /tmp/meta-export-preview.json
 *   node scripts/import_meta_export_leads_v2.js --file /tmp/ultex-export.csv --apply --confirm import-meta-export-v2 --report /tmp/meta-export-result.json
 */
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const hasFlag = flag => args.includes(flag);
const argValue = (name, fallback = '') => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const APPLY = hasFlag('--apply');
const INSPECT_ONLY = hasFlag('--inspect-only');
const FILE = argValue('--file');
const REPORT = argValue('--report');
const CONFIRM = argValue('--confirm');
const CONFIRM_TOKEN = 'import-meta-export-v2';
const SOURCE_NAME = 'Meta Formulaire export';
const prisma = new PrismaClient();

function clean(value) {
  return String(value ?? '').replace(/\u0000/g, '').trim();
}

function normalize(value) {
  return clean(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function headerKey(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error('CSV invalide : guillemet non fermé.');
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function answerText(value) {
  return clean(value)
    .replace(/_/g, ' ')
    .replace(/\s+([.,;!?])/g, '$1')
    .replace(/\s+/g, ' ');
}

function emailTokens(raw) {
  return [...new Set(clean(raw).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)?.map(value => value.toLowerCase()) || [])];
}

function normalizePhone(raw) {
  let phone = clean(raw).replace(/^p:/i, '').replace(/\D/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (/^0[567]\d{8}$/.test(phone)) phone = `212${phone.slice(1)}`;
  if (/^[567]\d{8}$/.test(phone)) phone = `212${phone}`;
  return phone;
}

const COUNTRY_BY_DIAL_CODE = [
  ['212', 'Maroc'],
  ['353', 'Irlande'],
  ['34', 'Espagne'],
  ['33', 'France'],
  ['216', 'Tunisie'],
  ['1', 'Canada'],
];

function countryFromPhone(phone) {
  return COUNTRY_BY_DIAL_CODE.find(([prefix]) => phone.startsWith(prefix))?.[1] || '';
}

function normalizeOwner(value) {
  const owner = normalize(value);
  if (owner === 'zoubida') return 'Zoubida';
  if (owner === 'oumaima') return 'Oumaima';
  return clean(value);
}

function platformLabel(value) {
  const platform = normalize(value);
  if (platform === 'fb' || platform === 'facebook') return 'Facebook';
  if (platform === 'ig' || platform === 'instagram') return 'Instagram';
  return clean(value) || 'Meta';
}

function requiredIndex(headers, key) {
  const index = headers.findIndex(value => headerKey(value) === key);
  if (index < 0) throw new Error(`Colonne requise introuvable : ${key}`);
  return index;
}

function questionnaireIndex(headers, startsWith) {
  const index = headers.findIndex(value => headerKey(value).startsWith(startsWith));
  if (index < 0) throw new Error(`Questionnaire Meta incomplet : ${startsWith}`);
  return index;
}

function analyse(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error('CSV vide ou sans données.');
  const headers = rows[0];
  const indexes = {
    leadId: requiredIndex(headers, 'id'),
    createdTime: requiredIndex(headers, 'created_time'),
    adId: requiredIndex(headers, 'ad_id'),
    adName: requiredIndex(headers, 'ad_name'),
    adsetId: requiredIndex(headers, 'adset_id'),
    adsetName: requiredIndex(headers, 'adset_name'),
    campaignId: requiredIndex(headers, 'campaign_id'),
    campaignName: requiredIndex(headers, 'campaign_name'),
    formId: requiredIndex(headers, 'form_id'),
    formName: requiredIndex(headers, 'form_name'),
    organic: requiredIndex(headers, 'is_organic'),
    platform: requiredIndex(headers, 'platform'),
    email: requiredIndex(headers, 'email'),
    phone: requiredIndex(headers, 'phone_number'),
    name: requiredIndex(headers, 'full_name'),
    leadStatus: requiredIndex(headers, 'lead_status'),
    volume: questionnaireIndex(headers, 'quel_est_votre_volume_d_exportation_actuel'),
    partners: questionnaireIndex(headers, 'avez_vous_deja_des_partenaires'),
    frustration: questionnaireIndex(headers, 'quelle_est_votre_plus_grande_frustration_logistique'),
    product: questionnaireIndex(headers, 'quel_type_de_produit_souhaitez_vous_importer_ou_exporter'),
  };
  const records = [];
  const invalid = [];
  const skippedTests = [];
  const seenLeadIds = new Set();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const values = rows[rowIndex];
    if (!values.some(value => clean(value))) continue;
    const leadId = clean(values[indexes.leadId]);
    const sourceFields = values.slice(0, headers.length);
    const isTest = sourceFields.some(value => normalize(value).includes('<test lead:'))
      || normalize(values[indexes.email]) === 'test@meta.com';
    if (isTest) {
      skippedTests.push({ rowNumber: rowIndex + 1, leadId });
      continue;
    }

    const createdAt = new Date(clean(values[indexes.createdTime]));
    const phone = normalizePhone(values[indexes.phone]);
    const emails = emailTokens(values[indexes.email]);
    const country = countryFromPhone(phone);
    const record = {
      rowNumber: rowIndex + 1,
      leadId,
      importSourceId: `meta-export:${leadId}`,
      createdAt,
      name: clean(values[indexes.name]),
      phone,
      phoneRaw: clean(values[indexes.phone]),
      emails,
      email: emails[0] || '',
      emailRaw: clean(values[indexes.email]),
      country,
      product: answerText(values[indexes.product]),
      volume: answerText(values[indexes.volume]),
      partners: answerText(values[indexes.partners]),
      frustration: answerText(values[indexes.frustration]),
      platform: platformLabel(values[indexes.platform]),
      leadStatus: clean(values[indexes.leadStatus]),
      organic: normalize(values[indexes.organic]) === 'true',
      owner: normalizeOwner(values[20]),
      internalNotes: [clean(values[21]), clean(values[22])].filter(Boolean).join('\n'),
      adId: clean(values[indexes.adId]),
      adName: clean(values[indexes.adName]),
      adsetId: clean(values[indexes.adsetId]),
      adsetName: clean(values[indexes.adsetName]),
      campaignId: clean(values[indexes.campaignId]),
      campaignName: clean(values[indexes.campaignName]),
      formId: clean(values[indexes.formId]),
      formName: clean(values[indexes.formName]),
    };
    const reasons = [];
    if (!record.leadId) reasons.push('ID Meta manquant');
    if (seenLeadIds.has(record.leadId)) reasons.push('ID Meta dupliqué dans le fichier');
    if (Number.isNaN(record.createdAt.getTime())) reasons.push('date de création invalide');
    if (!record.name) reasons.push('nom manquant');
    if (!record.phone) reasons.push('téléphone manquant ou invalide');
    if (!record.email) reasons.push('e-mail manquant ou invalide');
    if (!record.product) reasons.push('produit manquant');
    if (!record.country) reasons.push('pays impossible à déterminer depuis le téléphone');
    if (reasons.length) invalid.push({ rowNumber: record.rowNumber, leadId, name: record.name, reasons });
    else records.push(record);
    if (record.leadId) seenLeadIds.add(record.leadId);
  }
  return { records, invalid, skippedTests };
}

function countriesSummary(records) {
  return records.reduce((summary, record) => {
    summary[record.country] = (summary[record.country] || 0) + 1;
    return summary;
  }, {});
}

function ownersSummary(records) {
  return records.reduce((summary, record) => {
    const owner = record.owner || 'Non affecté';
    summary[owner] = (summary[owner] || 0) + 1;
    return summary;
  }, {});
}

function clientIdentity(client) {
  const data = client.data || {};
  const phones = [data.telephone, data.whatsapp, ...(Array.isArray(data.telephones) ? data.telephones : [])]
    .map(normalizePhone)
    .filter(Boolean);
  const emails = [data.email, ...(Array.isArray(data.emails) ? data.emails : [])]
    .flatMap(emailTokens);
  return { phones: new Set(phones), emails: new Set(emails) };
}

function matchClients(record, clients) {
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

async function reserveNextEClientCode() {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(6900, 5)`;
    const clients = await tx.collectionItem.findMany({
      where: { collection: 'clients' },
      select: { id: true, code: true, data: true },
    });
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
  }, { maxWait: 15000, timeout: 30000 });
}

function mergeClientData(existing, record, code) {
  const current = existing?.data || {};
  const phones = [...new Set([
    ...[current.telephone, current.whatsapp, ...(Array.isArray(current.telephones) ? current.telephones : [])]
      .map(normalizePhone).filter(Boolean),
    record.phone,
  ])];
  const emails = [...new Set([
    ...[current.email, ...(Array.isArray(current.emails) ? current.emails : [])].flatMap(emailTokens),
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
    responsableCommercial: current.responsableCommercial || record.owner,
    responsableData: current.responsableData || record.owner,
    produitsSouhaites: current.produitsSouhaites || record.product,
    volumeExportation: current.volumeExportation || record.volume,
    partenairesFiables: current.partenairesFiables || record.partners,
    frustrationLogistique: current.frustrationLogistique || record.frustration,
    nbRelances: Number(current.nbRelances || 0),
    telephones: phones,
    emails,
    metaLeadIds: [...new Set([...(Array.isArray(current.metaLeadIds) ? current.metaLeadIds : []), record.leadId])],
    importMetaExport: true,
  };
}

async function insertRecord(record, matchedClient) {
  const reservedCode = matchedClient ? '' : await reserveNextEClientCode();
  return prisma.$transaction(async tx => {
    const createdClient = !matchedClient;
    const client = matchedClient
      ? await tx.collectionItem.update({
        where: { collection_id: { collection: 'clients', id: matchedClient.id } },
        data: { data: mergeClientData(matchedClient, record, matchedClient.code) },
      })
      : await tx.collectionItem.create({
        data: {
          collection: 'clients',
          id: reservedCode,
          code: reservedCode,
          createdAt: record.createdAt,
          data: mergeClientData(null, record, reservedCode),
        },
      });

    let contact = await tx.collectionItem.findFirst({
      where: { collection: 'contacts', data: { path: ['importSourceId'], equals: record.importSourceId } },
    });
    if (!contact) {
      contact = await createItem(tx, 'contacts', 'CT', {
        nom: record.name,
        telephone: record.phone,
        whatsapp: record.phone,
        email: record.email,
        pays: record.country,
        telephones: [record.phone],
        emails: record.emails,
        source: record.platform,
        statut: 'En échange',
        typeContact: 'Prospect',
        codeClientAssocie: client.code,
        sourceDonnees: SOURCE_NAME,
        importSourceId: record.importSourceId,
        metaLeadId: record.leadId,
        importSourceRow: record.rowNumber,
      }, record.createdAt);
    }

    let demande = await tx.collectionItem.findFirst({
      where: { collection: 'demandes', data: { path: ['importSourceId'], equals: record.importSourceId } },
    });
    if (!demande) {
      demande = await createItem(tx, 'demandes', 'DMD', {
        client: client.code,
        codeClientUltex: client.code,
        dateDemande: record.createdAt.toISOString().slice(0, 10),
        dateHeureReception: record.createdAt.toISOString(),
        source: 'Meta Lead Ads',
        canalReception: 'Réseaux sociaux',
        plateformeSource: record.platform,
        sourceSynchronisation: SOURCE_NAME,
        createdManually: false,
        responsableData: record.owner || 'Data',
        objectifGeneral: record.product,
        sensOperation: 'Export',
        typeProjet: 'Exportation',
        urgence: 'Normale',
        statut: 'Nouvelle',
        remarqueGenerale: [
          `Produit à importer ou exporter : ${record.product}`,
          `Volume d’exportation : ${record.volume}`,
          `Partenaires fiables : ${record.partners}`,
          `Frustration logistique : ${record.frustration}`,
          record.internalNotes ? `Notes internes : ${record.internalNotes}` : '',
          `Source : ${record.platform} — ${record.formName || 'Formulaire export'}`,
        ].filter(Boolean).join('\n'),
        importSourceId: record.importSourceId,
        metaLeadId: record.leadId,
        importSourceRow: record.rowNumber,
        metaLeadStatus: record.leadStatus,
        metaCampaign: {
          organic: record.organic,
          platform: record.platform,
          adId: record.adId,
          adName: record.adName,
          adsetId: record.adsetId,
          adsetName: record.adsetName,
          campaignId: record.campaignId,
          campaignName: record.campaignName,
          formId: record.formId,
          formName: record.formName,
        },
      }, record.createdAt);
    }

    let line = await tx.collectionItem.findFirst({
      where: { collection: 'demandeLignes', data: { path: ['importSourceId'], equals: record.importSourceId } },
    });
    if (!line) {
      line = await createItem(tx, 'demandeLignes', 'DL', {
        demande: demande.code,
        referenceMetier: `P1-${client.code}`,
        nomProduit: record.product,
        designationTechnique: record.product,
        typeTraitement: 'Qualification export',
        routeTraitement: 'Closing',
        statutFournisseur: 'À définir',
        statut: 'Nouvelle',
        sourceSynchronisation: SOURCE_NAME,
        importSourceId: record.importSourceId,
        metaLeadId: record.leadId,
        ts: record.createdAt.getTime(),
      }, record.createdAt);
    }

    return {
      leadId: record.leadId,
      client: client.code,
      createdClient,
      contact: contact.code,
      demande: demande.code,
      line: line.code,
    };
  });
}

async function saveReport(path, report) {
  if (!path) return;
  await writeFile(resolve(path), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Rapport : ${resolve(path)}`);
}

async function main() {
  if (!FILE) throw new Error('Usage: --file <ultex export.csv> [--inspect-only|--apply --confirm import-meta-export-v2] [--report <report.json>]');
  const file = resolve(FILE);
  const analysis = analyse(await readFile(file, 'utf8'));
  const baseReport = {
    generatedAt: new Date().toISOString(),
    file,
    sourceRows: analysis.records.length + analysis.invalid.length + analysis.skippedTests.length,
    validRows: analysis.records.length,
    invalidRows: analysis.invalid,
    skippedTests: analysis.skippedTests,
    countries: countriesSummary(analysis.records),
    owners: ownersSummary(analysis.records),
  };

  if (INSPECT_ONLY) {
    const report = { ...baseReport, mode: 'inspect-only' };
    await saveReport(REPORT, report);
    console.log(`Inspection Meta export: ${report.validRows} ligne(s) valide(s), ${report.invalidRows.length} rejet(s), ${report.skippedTests.length} test(s) ignoré(s), aucune connexion et aucune écriture.`);
    return;
  }
  if (process.env.CRM_INSTANCE !== 'v2') {
    throw new Error('Sécurité: cet import doit être exécuté uniquement dans ubos_backend_v2_prod (CRM_INSTANCE=v2).');
  }
  if (APPLY && CONFIRM !== CONFIRM_TOKEN) throw new Error(`Confirmation requise: --confirm ${CONFIRM_TOKEN}`);

  const [clients, demandes] = await Promise.all([
    prisma.collectionItem.findMany({ where: { collection: 'clients' } }),
    prisma.collectionItem.findMany({
      where: { collection: 'demandes' },
      select: { id: true, code: true, data: true },
    }),
  ]);
  const importedBySourceId = new Map(
    demandes.map(item => [item.data?.importSourceId, item]).filter(([sourceId]) => sourceId),
  );
  const clientsByCode = new Map();
  for (const client of clients) {
    for (const value of [client.id, client.code, client.data?.codeClientUltex]) {
      if (value) clientsByCode.set(String(value), client);
    }
  }

  const plan = analysis.records.map(record => {
    const imported = importedBySourceId.get(record.importSourceId);
    if (imported) {
      const code = String(imported.data?.client || imported.data?.codeClientUltex || '');
      return /^E\d+$/.test(code)
        ? { record, action: 'already_imported', client: clientsByCode.get(code), imported }
        : { record, action: 'conflict_non_e_import', matches: code ? [code] : [] };
    }
    const matches = matchClients(record, clients);
    if (matches.length > 1) return { record, action: 'conflict_ambiguous', matches: matches.map(item => item.code) };
    if (matches.length === 1 && !/^E\d+$/.test(String(matches[0].code || ''))) {
      return { record, action: 'conflict_non_e_match', matches: [matches[0].code] };
    }
    return { record, action: matches.length === 1 ? 'reuse_e_client' : 'create_e_client', matches };
  });

  const report = {
    ...baseReport,
    mode: APPLY ? 'apply' : 'preview',
    crmInstance: process.env.CRM_INSTANCE,
    summary: {
      createEClient: plan.filter(item => item.action === 'create_e_client').length,
      reuseEClient: plan.filter(item => item.action === 'reuse_e_client').length,
      alreadyImported: plan.filter(item => item.action === 'already_imported').length,
      conflicts: plan.filter(item => item.action.startsWith('conflict_')).length,
    },
    conflicts: plan.filter(item => item.action.startsWith('conflict_')).map(item => ({
      rowNumber: item.record.rowNumber,
      leadId: item.record.leadId,
      name: item.record.name,
      reason: item.action,
      matchingClients: item.matches || [],
    })),
    results: [],
  };
  console.log(JSON.stringify(report.summary));

  if (!APPLY) {
    await saveReport(REPORT, report);
    console.log(`PREVIEW: aucune écriture. Relancez avec --apply --confirm ${CONFIRM_TOKEN}.`);
    return;
  }

  for (const item of plan) {
    if (!['create_e_client', 'reuse_e_client'].includes(item.action)) continue;
    report.results.push(await insertRecord(item.record, item.matches[0] || null));
  }
  report.inserted = report.results.length;
  await saveReport(REPORT, report);
  console.log(`Import Meta export V2 terminé: ${report.inserted} demande(s), ${report.summary.createEClient} nouveau(x) client(s) E, ${report.summary.reuseEClient} client(s) E réutilisé(s), ${report.summary.conflicts} conflit(s) ignoré(s).`);
}

main()
  .catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

