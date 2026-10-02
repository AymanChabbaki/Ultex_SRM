/**
 * Import the SIEMA prospects CSV into the physically isolated CRM V2 database.
 *
 * Safety:
 * - refuses to run unless CRM_INSTANCE=v2;
 * - preview only unless --apply and the explicit confirmation token are passed;
 * - idempotent through a deterministic importSourceId per CSV row;
 * - reuses one unambiguous client matched by phone/email, but still creates a
 *   new demande for this SIEMA prospect row;
 * - never connects to or writes the principal CRM database.
 *
 * Usage inside ubos_backend_v2_prod:
 *   node scripts/import_siema_prospects_v2.js --file /tmp/siema-prospects.csv --report /tmp/siema-preview.json
 *   node scripts/import_siema_prospects_v2.js --file /tmp/siema-prospects.csv --apply --confirm import-siema-prospects-v2 --report /tmp/siema-result.json
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
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
const CONFIRM_TOKEN = 'import-siema-prospects-v2';
const SOURCE_NAME = 'Import SIEMA Prospects';
const prisma = new PrismaClient();

function clean(value) {
  return String(value ?? '').replace(/\u0000/g, '').trim();
}

function normalize(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
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

const HEADER = [
  'Nom de l’entreprise',
  'Activité',
  'Nom et prénom du contact',
  'Fonction',
  'Téléphone / WhatsApp',
  'Email',
  'Site web',
  'Produits fabriqués ou distribués',
  'Pays d’approvisionnement',
  'Besoins éventuels en sourcing/importation',
];

function findHeaderIndex(rows) {
  return rows.findIndex(row => normalize(row[0]) === normalize(HEADER[0])
    && normalize(row[2]) === normalize(HEADER[2]));
}

function emailTokens(raw) {
  return [...new Set(clean(raw).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)?.map(value => value.toLowerCase()) || [])];
}

const COUNTRY_BY_DIAL_CODE = [
  ['962', 'Jordanie'],
  ['420', 'République tchèque'],
  ['212', 'Maroc'],
  ['20', 'Égypte'],
  ['90', 'Turquie'],
  ['39', 'Italie'],
  ['49', 'Allemagne'],
  ['86', 'Chine'],
  ['91', 'Inde'],
  ['7', 'Russie'],
];

function countryFromInternationalPhone(phone) {
  const digits = clean(phone).replace(/\D/g, '').replace(/^00/, '');
  return COUNTRY_BY_DIAL_CODE.find(([prefix]) => digits.startsWith(prefix))?.[1] || '';
}

function inferCountry(record) {
  const firstRawPhone = clean(record.phoneRaw).split(/[;|]/)[0];
  const explicitInternational = /^\s*(?:\+|00)/.test(firstRawPhone)
    ? countryFromInternationalPhone(firstRawPhone)
    : '';
  if (explicitInternational) return explicitInternational;

  const digits = firstRawPhone.replace(/\D/g, '');
  const domainHints = normalize(`${record.emailRaw} ${record.website}`);
  if (/^212\d+/.test(digits) || /^0[567]\d{8}$/.test(digits) || /\.ma(?:\b|\/)/.test(domainHints)) return 'Maroc';
  if (/^962\d+/.test(digits)) return 'Jordanie';
  if (/^20\d+/.test(digits)) return 'Égypte';
  if (/^90\d+/.test(digits) || /\.tr(?:\b|\/)/.test(domainHints)) return 'Turquie';
  if (/^39\d+/.test(digits)) return 'Italie';
  if (/^49\d+/.test(digits)) return 'Allemagne';
  if (/^91\d+/.test(digits)) return 'Inde';
  if (/^420\d+/.test(digits) || /\.cz(?:\b|\/)/.test(domainHints)) return 'République tchèque';
  if (/^7\d{10}$/.test(digits) || /\.ru(?:\b|\/)/.test(domainHints)) return 'Russie';
  if (/^514\d{7}$/.test(digits)) return 'Canada';
  if (/\.es(?:\b|\/)/.test(domainHints)) return 'Espagne';
  if (
    /^86\d+/.test(digits)
    || (/^1\d{10}$/.test(digits) && /(?:qq\.com|chinagoods|\.cn(?:\b|\/))/.test(domainHints))
  ) return 'Chine';
  return '';
}

function phoneTokens(raw, country = '') {
  const tokens = [];
  for (const part of clean(raw).split(/[;|]/)) {
    let phone = part.replace(/\([^)]*\)/g, '').replace(/\D/g, '');
    if (phone.startsWith('00')) phone = phone.slice(2);
    if (/^0[567]\d{8}$/.test(phone)) phone = `212${phone.slice(1)}`;
    if (country === 'Maroc' && /^[567]\d{8}$/.test(phone)) phone = `212${phone}`;
    if (country === 'Espagne' && /^[6789]\d{8}$/.test(phone)) phone = `34${phone}`;
    if (country === 'Canada' && /^\d{10}$/.test(phone)) phone = `1${phone}`;
    if (country === 'Chine' && /^1\d{10}$/.test(phone)) phone = `86${phone}`;
    if (phone.length >= 7) tokens.push(phone);
  }
  return [...new Set(tokens)];
}

function stableSourceId(values) {
  const identity = [values.company, values.contact, values.phoneRaw, values.emailRaw]
    .map(normalize).join('|');
  return `siema:${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}

function analyse(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) throw new Error('En-tête SIEMA introuvable dans le CSV.');
  const records = [];
  const invalid = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const values = rows[index];
    if (!values.some(value => clean(value))) continue;
    const record = {
      rowNumber: index + 1,
      company: clean(values[0]),
      activity: clean(values[1]),
      contact: clean(values[2]),
      role: clean(values[3]),
      phoneRaw: clean(values[4]),
      emailRaw: clean(values[5]),
      website: clean(values[6]),
      products: clean(values[7]),
      sourcingCountries: clean(values[8]),
      sourcingNeed: clean(values[9]),
    };
    record.country = inferCountry(record);
    record.phones = phoneTokens(record.phoneRaw, record.country);
    record.emails = emailTokens(record.emailRaw);
    record.primaryPhone = record.phones[0] || '';
    record.primaryEmail = record.emails[0] || '';
    record.importSourceId = stableSourceId(record);
    if (!record.company || !record.contact || (!record.primaryPhone && !record.primaryEmail) || !record.country) {
      invalid.push({
        rowNumber: record.rowNumber,
        company: record.company,
        contact: record.contact,
        reason: !record.country ? 'pays impossible à déterminer' : 'identité ou coordonnées insuffisantes',
      });
    } else {
      records.push(record);
    }
  }
  return { records, invalid };
}

function countriesSummary(records) {
  return records.reduce((summary, record) => {
    summary[record.country] = (summary[record.country] || 0) + 1;
    return summary;
  }, {});
}

function clientIdentitySets(client) {
  const data = client.data || {};
  return {
    phones: new Set([
      ...phoneTokens(data.telephone, data.pays),
      ...phoneTokens(data.whatsapp, data.pays),
      ...phoneTokens(data.telephonesSource, data.pays),
      ...(Array.isArray(data.telephones) ? data.telephones.flatMap(value => phoneTokens(value, data.pays)) : []),
    ]),
    emails: new Set([
      ...emailTokens(data.email),
      ...emailTokens(data.emailsSource),
      ...(Array.isArray(data.emails) ? data.emails.flatMap(emailTokens) : []),
    ]),
  };
}

function matchClients(record, clients) {
  return clients.filter(client => {
    const identity = clientIdentitySets(client);
    return record.phones.some(value => identity.phones.has(value))
      || record.emails.some(value => identity.emails.has(value));
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
    // A dedicated advisory lock makes E-code allocation safe if two SIEMA
    // imports or users run at the same time. Codes always continue after the
    // highest E code already present; deleted/skipped codes are not recycled.
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

function mergeClientData(existing, record, code, today) {
  const current = existing?.data || {};
  const allPhones = [...new Set([...phoneTokens(current.telephonesSource || current.telephone), ...record.phones])];
  const allEmails = [...new Set([...emailTokens(current.emailsSource || current.email), ...record.emails])];
  return {
    ...current,
    id: code,
    code,
    codeClientUltex: current.codeClientUltex || code,
    nom: current.nom || record.contact,
    raisonSociale: current.raisonSociale || record.company,
    telephone: current.telephone || record.primaryPhone,
    whatsapp: current.whatsapp || record.primaryPhone,
    email: current.email || record.primaryEmail,
    pays: current.pays || record.country,
    siteWeb: current.siteWeb || record.website,
    secteurActivite: current.secteurActivite || record.activity,
    activitePrincipale: current.activitePrincipale || record.activity,
    produitsVendus: current.produitsVendus || record.products,
    produitsSouhaites: current.produitsSouhaites || record.sourcingNeed,
    paysImport: current.paysImport || record.sourcingCountries,
    representantLegal: current.representantLegal || record.contact,
    segment: current.segment || 'Prospect',
    sourcePremierContact: current.sourcePremierContact || 'Salon',
    datePremierContact: current.datePremierContact || today,
    dateEntreeData: current.dateEntreeData || today,
    dateDerniereDemande: today,
    dateCreation: current.dateCreation || today,
    nbRelances: Number(current.nbRelances || 0),
    telephones: allPhones,
    emails: allEmails,
    telephonesSource: [current.telephonesSource, record.phoneRaw].filter(Boolean).join(' ; '),
    emailsSource: [current.emailsSource, record.emailRaw].filter(Boolean).join(' ; '),
    sourceDonnees: current.sourceDonnees || SOURCE_NAME,
    paysContactSource: record.country,
    importSiema: true,
  };
}

async function insertRecord(record, matchedClient, now) {
  const today = now.toISOString().slice(0, 10);
  // Reserving the numeric identity uses its own advisory-lock transaction;
  // every actual CRM record for the row is then written atomically below.
  const reservedCode = matchedClient ? '' : await reserveNextEClientCode();
  return prisma.$transaction(async tx => {
    const createdClient = !matchedClient;
    const client = matchedClient
      ? await tx.collectionItem.update({
        where: { collection_id: { collection: 'clients', id: matchedClient.id } },
        data: { data: mergeClientData(matchedClient, record, matchedClient.code, today) },
      })
      : await tx.collectionItem.create({
        data: {
          collection: 'clients', id: reservedCode, code: reservedCode, createdAt: now,
          data: mergeClientData(null, record, reservedCode, today),
        },
      });

    let contact = await tx.collectionItem.findFirst({
      where: { collection: 'contacts', data: { path: ['importSourceId'], equals: record.importSourceId } },
    });
    if (!contact) {
      contact = await createItem(tx, 'contacts', 'CT', {
        nom: record.contact,
        fonction: record.role,
        societe: record.company,
        telephone: record.primaryPhone,
        whatsapp: record.primaryPhone,
        email: record.primaryEmail,
        pays: record.country,
        telephones: record.phones,
        emails: record.emails,
        telephoneSource: record.phoneRaw,
        emailSource: record.emailRaw,
        siteWeb: record.website,
        source: 'Salon',
        statut: 'En échange',
        typeContact: 'Prospect',
        codeClientAssocie: client.code,
        sourceDonnees: SOURCE_NAME,
        importSourceId: record.importSourceId,
        importSourceRow: record.rowNumber,
      }, now);
    }

    const demande = await createItem(tx, 'demandes', 'DMD', {
      client: client.code,
      codeClientUltex: client.code,
      dateDemande: today,
      dateHeureReception: now.toISOString(),
      source: 'Salon',
      canalReception: 'Salon',
      sourceSynchronisation: SOURCE_NAME,
      responsableData: 'Data',
      objectifGeneral: record.sourcingNeed || record.products || `Prospection SIEMA — ${record.activity}`,
      typeProjet: 'Prospection',
      urgence: 'Normale',
      statut: 'Nouvelle',
      remarqueGenerale: [
        `Entreprise : ${record.company}`,
        `Activité : ${record.activity}`,
        `Contact : ${record.contact} — ${record.role}`,
        `Pays (indicatif téléphonique) : ${record.country}`,
        `Téléphones source : ${record.phoneRaw}`,
        `E-mails source : ${record.emailRaw}`,
        record.website ? `Site web : ${record.website}` : '',
        record.products ? `Produits : ${record.products}` : '',
        record.sourcingCountries ? `Pays d’approvisionnement : ${record.sourcingCountries}` : '',
        record.sourcingNeed ? `Besoin sourcing/importation : ${record.sourcingNeed}` : '',
      ].filter(Boolean).join('\n'),
      importSourceId: record.importSourceId,
      importSourceRow: record.rowNumber,
    }, now);

    let line = null;
    if (record.products || record.sourcingNeed) {
      const product = record.sourcingNeed || record.products;
      line = await createItem(tx, 'demandeLignes', 'DL', {
        demande: demande.code,
        referenceMetier: `P1-${client.code}`,
        typeTraitement: 'Sourcing',
        nomProduit: product,
        designationTechnique: record.products,
        paysOrigine: record.sourcingCountries,
        statutFournisseur: 'À rechercher',
        statut: 'Brouillon',
        sourceSynchronisation: SOURCE_NAME,
        importSourceId: record.importSourceId,
        ts: now.getTime(),
      }, now);
    }
    return { client: client.code, createdClient, contact: contact.code, demande: demande.code, line: line?.code || null };
  });
}

async function saveReport(path, report) {
  if (!path) return;
  await writeFile(resolve(path), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Rapport : ${resolve(path)}`);
}

async function main() {
  if (!FILE) throw new Error('Usage: --file <SIEMA Prospects.csv> [--inspect-only|--apply --confirm import-siema-prospects-v2] [--report <report.json>]');

  const file = resolve(FILE);
  const analysis = analyse(await readFile(file, 'utf8'));
  if (INSPECT_ONLY) {
    const report = {
      generatedAt: new Date().toISOString(),
      mode: 'inspect-only',
      file,
      sourceRows: analysis.records.length + analysis.invalid.length,
      validRows: analysis.records.length,
      invalidRows: analysis.invalid,
      countries: countriesSummary(analysis.records),
    };
    await saveReport(REPORT, report);
    console.log(`Inspection SIEMA: ${report.validRows} ligne(s) valide(s), ${report.invalidRows.length} rejet(s), aucune connexion et aucune écriture.`);
    return;
  }
  if (process.env.CRM_INSTANCE !== 'v2') {
    throw new Error('Sécurité: cet import doit être exécuté uniquement dans ubos_backend_v2_prod (CRM_INSTANCE=v2).');
  }
  if (APPLY && CONFIRM !== CONFIRM_TOKEN) throw new Error(`Confirmation requise: --confirm ${CONFIRM_TOKEN}`);

  const clients = await prisma.collectionItem.findMany({ where: { collection: 'clients' } });
  const existingImports = await prisma.collectionItem.findMany({
    where: { collection: 'demandes', data: { path: ['sourceSynchronisation'], equals: SOURCE_NAME } },
    select: { data: true },
  });
  const importedIds = new Set(existingImports.map(item => item.data?.importSourceId).filter(Boolean));
  const plan = analysis.records.map(record => {
    if (importedIds.has(record.importSourceId)) return { record, action: 'already_imported', matches: [] };
    const matches = matchClients(record, clients);
    if (matches.length > 1) return { record, action: 'conflict', matches: matches.map(item => item.code) };
    return { record, action: matches.length === 1 ? 'reuse_client' : 'create_client', matches };
  });
  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'preview',
    crmInstance: process.env.CRM_INSTANCE,
    file,
    sourceRows: analysis.records.length + analysis.invalid.length,
    validRows: analysis.records.length,
    invalidRows: analysis.invalid,
    countries: countriesSummary(analysis.records),
    summary: {
      createClient: plan.filter(item => item.action === 'create_client').length,
      reuseClient: plan.filter(item => item.action === 'reuse_client').length,
      alreadyImported: plan.filter(item => item.action === 'already_imported').length,
      conflicts: plan.filter(item => item.action === 'conflict').length,
    },
    conflicts: plan.filter(item => item.action === 'conflict').map(item => ({
      rowNumber: item.record.rowNumber,
      company: item.record.company,
      contact: item.record.contact,
      matchingClients: item.matches,
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
    if (item.action === 'already_imported' || item.action === 'conflict') continue;
    const result = await insertRecord(item.record, item.matches[0] || null, new Date());
    report.results.push({ rowNumber: item.record.rowNumber, company: item.record.company, ...result });
  }
  report.inserted = report.results.length;
  await saveReport(REPORT, report);
  console.log(`Import V2 terminé: ${report.inserted} demande(s), ${report.summary.createClient} nouveau(x) client(s), ${report.summary.reuseClient} client(s) réutilisé(s).`);
}

main()
  .catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
