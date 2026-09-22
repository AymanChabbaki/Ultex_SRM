/**
 * Seed the historical DATA CSV into UBOS CRM.
 *
 * Safety rules:
 * - dry-run by default; --apply is required to write;
 * - an existing client code is skipped with all of its children;
 * - one transaction creates client + contact + demande + product line;
 * - duplicated or malformed source codes are reported and never guessed;
 * - source dates are used as createdAt, so a historical import cannot appear
 *   as today's new leads.
 *
 * Usage (inside ubos_backend_prod):
 *   node scripts/seed_data_csv_to_crm.js --file /tmp/Copie-de-DATA.csv --report /tmp/data-seed-preview.json
 *   node scripts/seed_data_csv_to_crm.js --file /tmp/Copie-de-DATA.csv --apply --report /tmp/data-seed-result.json
 *
 * Structural inspection without a database connection:
 *   node scripts/seed_data_csv_to_crm.js --file /tmp/Copie-de-DATA.csv --inspect-only
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
const TEST_WRITE_ROLLBACK = hasFlag('--test-write-rollback');
const FILE = argValue('--file');
const REPORT = argValue('--report');
const BATCH_SIZE = Math.max(1, Math.min(250, Number(argValue('--batch-size', '50')) || 50));
const SOURCE_NAME = 'Import CSV DATA historique';
const STANDARD_CODE = /^L\d+$/;

function usage(message = '') {
  if (message) console.error(message);
  console.error('Usage: node scripts/seed_data_csv_to_crm.js --file <DATA.csv> [--apply|--test-write-rollback] [--report <report.json>] [--batch-size 50]');
  process.exitCode = 2;
}

function clean(value) {
  return String(value ?? '').replace(/\u0000/g, '').trim();
}

function decodeCsv(buffer) {
  // This export is Windows-1252 (for example, "Expérience" contains byte E9),
  // not UTF-8. TextDecoder also preserves any characters representable by the
  // original export rather than replacing every accented letter.
  return new TextDecoder('windows-1252').decode(buffer).replace(/^\uFEFF/, '');
}

function parseDelimited(text, delimiter = ';') {
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
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
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

function normalizeText(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function normalizePhone(value) {
  let phone = clean(value).replace(/\D/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (/^0[67]\d{8}$/.test(phone)) phone = `212${phone.slice(1)}`;
  if (/^[67]\d{8}$/.test(phone)) phone = `212${phone}`;
  return phone;
}

function emailFrom(values) {
  for (const value of values) {
    const match = clean(value).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (match) return match[0].toLowerCase();
  }
  return '';
}

function validDateParts(day, month, year) {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateIso(year, month, day) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDate(value, yearHint = 2025) {
  const raw = clean(value);
  let match = raw.match(/(?:^|\D)(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\D|$)/);
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    const month = Number(match[2]);
    const day = Number(match[1]);
    return validDateParts(day, month, year) ? dateIso(year, month, day) : '';
  }
  match = raw.match(/(?:^|\D)(20\d{2})-(\d{1,2})-(\d{1,2})(?:\D|$)/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    return validDateParts(day, month, year) ? dateIso(year, month, day) : '';
  }
  match = raw.match(/(?:^|\D)(\d{1,2})[/-](\d{1,2})(?:\D|$)/);
  if (match) {
    const month = Number(match[2]);
    const day = Number(match[1]);
    return validDateParts(day, month, yearHint) ? dateIso(yearHint, month, day) : '';
  }
  return '';
}

function explicitYear(values) {
  for (const value of values) {
    const match = clean(value).match(/(?:^|\D)(20\d{2})(?:\D|$)|(?:^|\D)\d{1,2}[/-]\d{1,2}[/-](20\d{2})(?:\D|$)/);
    if (match) return Number(match[1] || match[2]);
  }
  return 0;
}

function mapDataTag(value) {
  const normalized = normalizeText(value).replace(/[.]/g, '').replace(/\s+/g, ' ').trim();
  const tags = new Map([
    ['pas pret', 'Pas prêt'],
    ['faible qualite', 'Faible qualité'],
    ['pas interesse', 'Pas intéressé'],
    ['pas interessee', 'Pas intéressé'],
    ['pas intresse', 'Pas intéressé'],
    ['pas intressee', 'Pas intéressé'],
    ['pas interresse', 'Pas intéressé'],
    ['pas interressee', 'Pas intéressé'],
    ['pas reponse', 'Pas réponse'],
    ['pas de reponse', 'Pas réponse'],
    ['traite', 'Traité'],
    ['en cours', 'En cours de traitement'],
    ['en cours de traitement', 'En cours de traitement'],
    ['double codage', 'Double codage'],
    ['num ironne', 'Num ironné'],
    ['numero ironne', 'Num ironné'],
    ['reclamation', 'Réclamation'],
    ['test', 'Test'],
  ]);
  return tags.get(normalized) || '';
}

function isStateCandidate(value) {
  const text = clean(value);
  if (!text || parseDate(text, 2025)) return false;
  if (/^20\d{2}-\d{2}-\d{2}.*(?:UTC|Z)$/i.test(text)) return false;
  return true;
}

function stateInfo(row) {
  const raw = row.slice(12, 22).map(clean).filter(Boolean);
  const states = raw.filter(isStateCandidate);
  let dataTag = '';
  for (const state of states) {
    const mapped = mapDataTag(state);
    if (mapped) dataTag = mapped;
  }
  return { raw, states, latest: states.at(-1) || '', dataTag };
}

function parseQuantity(value) {
  const raw = clean(value);
  const numbers = raw.match(/\d+(?:[.,]\d+)?/g) || [];
  if (numbers.length !== 1) return undefined;
  const number = Number(numbers[0].replace(',', '.'));
  return Number.isFinite(number) ? number : undefined;
}

function inferUnit(value) {
  const normalized = normalizeText(value);
  if (/\bkg\b|kilo/.test(normalized)) return 'Kg';
  if (/tonne/.test(normalized)) return 'Tonnes';
  if (/litre|\bl\b/.test(normalized)) return 'Litres';
  if (/carton/.test(normalized)) return 'Cartons';
  if (/\bpcs?\b|piece/.test(normalized)) return 'Pièces';
  if (/metre/.test(normalized)) return 'Mètres';
  if (/lot/.test(normalized)) return 'Lots';
  return '';
}

function historiqueSuivi(states, code, sourceDate) {
  return states.map((etat, index) => ({
    id: `csv-data-${code}-${index + 1}`,
    ts: Date.parse(`${sourceDate}T12:00:00.000Z`) + index,
    date: sourceDate,
    version: index + 1,
    utilisateur: SOURCE_NAME,
    action: 'État importé',
    avant: index ? states[index - 1] : '',
    etat,
    notes: 'Valeur historique conservée telle quelle depuis le fichier DATA.',
  }));
}

function makeSourceRecord(row, rowNumber, sourceDate) {
  const code = clean(row[1]).toUpperCase();
  const name = clean(row[3]) || code;
  const phoneRaw = clean(row[4]);
  const product = clean(row[6]) || 'Produit non renseigné';
  const quantityRaw = clean(row[9]);
  const state = stateInfo(row);
  const email = emailFrom([row[3], row[5], row[11]]);
  const sourceId = `csv-data:${code}`;
  const notes = [
    clean(row[11]) && `Observation : ${clean(row[11])}`,
    clean(row[7]) && `Expérience : ${clean(row[7])}`,
    clean(row[8]) && `Fournisseur / origine : ${clean(row[8])}`,
    quantityRaw && `Quantité source : ${quantityRaw}`,
    clean(row[10]) && `Lien / image : ${clean(row[10])}`,
    state.latest && `Dernier état historique : ${state.latest}`,
  ].filter(Boolean).join('\n');
  return {
    rowNumber,
    code,
    sourceId,
    sourceDate,
    createdAt: new Date(`${sourceDate}T12:00:00.000Z`),
    name,
    phoneRaw,
    phone: normalizePhone(phoneRaw),
    email,
    serviceSource: clean(row[2]),
    companyOrCity: clean(row[5]),
    product,
    experience: clean(row[7]),
    supplierOrigin: clean(row[8]),
    quantityRaw,
    quantity: parseQuantity(quantityRaw),
    unit: inferUnit(quantityRaw),
    image: clean(row[10]),
    observation: clean(row[11]),
    state,
    notes,
    sourceRow: row.slice(0, 22).map(clean),
  };
}

function analyze(rows) {
  if (!rows.length) throw new Error('Le fichier CSV est vide.');
  const header = rows[0].map(clean);
  if (normalizeText(header[1]) !== 'code client' || normalizeText(header[3]) !== 'nom du client') {
    throw new Error(`Colonnes inattendues : attendu "Code client" en colonne 2 et "Nom du client" en colonne 4.`);
  }

  const parsed = [];
  const invalid = [];
  let blankCodeRows = 0;
  let contextYear = 2025;
  let contextDate = '2025-01-01';
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const relevantDates = [row[0], row[12], row[14], row[16], row[18], row[20]];
    const year = explicitYear(relevantDates);
    if (year) contextYear = year;
    const dividerDate = parseDate(row[0], contextYear);
    if (dividerDate) contextDate = dividerDate;

    const rawCode = clean(row[1]);
    if (!rawCode) {
      blankCodeRows += 1;
      continue;
    }
    const code = rawCode.toUpperCase();
    if (!STANDARD_CODE.test(code)) {
      invalid.push({ row: index + 1, code: rawCode, reason: 'Code non standard : attendu L suivi uniquement de chiffres.' });
      continue;
    }
    const rowDate = parseDate(row[12], contextYear) || dividerDate || contextDate;
    contextDate = rowDate || contextDate;
    parsed.push(makeSourceRecord(row, index + 1, rowDate || '2025-01-01'));
  }

  const groups = new Map();
  for (const record of parsed) {
    if (!groups.has(record.code)) groups.set(record.code, []);
    groups.get(record.code).push(record);
  }
  const duplicates = [...groups.entries()].filter(([, values]) => values.length > 1).map(([code, values]) => ({
    code,
    rows: values.map(value => value.rowNumber),
    names: values.map(value => value.name),
    reason: 'Le même code source appartient à plusieurs lignes; aucune ligne de ce code ne sera créée.',
  }));
  const duplicateCodes = new Set(duplicates.map(value => value.code));
  const eligible = parsed.filter(record => !duplicateCodes.has(record.code));
  return { header, parsed, eligible, invalid, duplicates, blankCodeRows };
}

async function nextCode(tx, prefix) {
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const sequence = await tx.sequenceCounter.upsert({
      where: { key: prefix },
      create: { key: prefix, val: 1 },
      update: { val: { increment: 1 } },
    });
    const code = `${prefix}${String(sequence.val).padStart(6, '0')}`;
    const used = await tx.collectionItem.findUnique({ where: { id: code }, select: { id: true } });
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

async function insertRecord(tx, record) {
  // Recheck under the transaction so a concurrent sync cannot create the
  // same client between preview and apply.
  const existing = await tx.collectionItem.findFirst({
    where: {
      collection: 'clients',
      OR: [
        { id: record.code },
        { code: record.code },
        { data: { path: ['codeClientUltex'], equals: record.code } },
      ],
    },
    select: { id: true },
  });
  if (existing) return { skipped: true, reason: 'existing_client' };
  const collision = await tx.collectionItem.findUnique({ where: { id: record.code }, select: { collection: true } });
  if (collision) return { skipped: true, reason: `global_id_collision:${collision.collection}` };

  const history = historiqueSuivi(record.state.states, record.code, record.sourceDate);
  const clientData = {
    id: record.code,
    code: record.code,
    codeClientUltex: record.code,
    nom: record.name,
    telephone: record.phone,
    telephoneSource: record.phoneRaw,
    email: record.email,
    societeOuVilleSource: record.companyOrCity,
    segment: 'Prospect',
    sourceDonnees: SOURCE_NAME,
    sourcePremierContact: 'Autre',
    datePremierContact: record.sourceDate,
    dateDerniereDemande: record.sourceDate,
    dateEntreeData: record.sourceDate,
    nbRelances: 0,
    dataTag: record.state.dataTag,
    etatSource: record.state.latest,
    etatsSourceBruts: record.state.raw,
    etatVersion: history.length,
    historiqueSuivi: history,
    remarque: record.notes,
    importSourceId: record.sourceId,
    importSourceRow: record.rowNumber,
  };
  await tx.collectionItem.create({
    data: { collection: 'clients', id: record.code, code: record.code, data: clientData, createdAt: record.createdAt },
  });

  const contact = await createItem(tx, 'contacts', 'CT', {
    nom: record.name,
    telephone: record.phone,
    telephoneSource: record.phoneRaw,
    whatsapp: record.phone,
    email: record.email,
    typeContact: 'Client',
    codeClientAssocie: record.code,
    sourceDonnees: SOURCE_NAME,
    remarque: record.observation,
    importSourceId: record.sourceId,
  }, record.createdAt);

  const demande = await createItem(tx, 'demandes', 'DMD', {
    client: record.code,
    codeClientUltex: record.code,
    dateDemande: record.sourceDate,
    dateHeureReception: `${record.sourceDate}T12:00:00.000Z`,
    source: 'Autre',
    canalReception: 'Autre',
    sourceSynchronisation: SOURCE_NAME,
    sourceHistorique: record.serviceSource,
    createdManually: false,
    responsableData: 'Data',
    objectifGeneral: record.product,
    urgence: 'Normale',
    statut: 'Nouvelle',
    dataTag: record.state.dataTag,
    etatSource: record.state.latest,
    etatsSourceBruts: record.state.raw,
    remarqueGenerale: record.notes,
    importSourceId: record.sourceId,
    importSourceRow: record.rowNumber,
  }, record.createdAt);

  const line = await createItem(tx, 'demandeLignes', 'DL', {
    demande: demande.code,
    referenceMetier: `P1-${record.code}`,
    nomProduit: record.product,
    designationTechnique: record.product,
    quantite: record.quantity,
    quantiteSource: record.quantityRaw,
    unite: record.unit,
    lienProduit: /^https?:\/\//i.test(record.image) ? record.image : '',
    imageSource: record.image,
    statutFournisseur: record.supplierOrigin ? 'Client a son fournisseur' : 'À rechercher',
    fournisseurOrigineSource: record.supplierOrigin,
    experienceImportSource: record.experience,
    commentairesOffre: record.observation,
    statut: 'Brouillon',
    sourceSynchronisation: SOURCE_NAME,
    importSourceId: record.sourceId,
    ts: record.createdAt.getTime(),
  }, record.createdAt);
  return { skipped: false, contact: contact.code, demande: demande.code, line: line.code };
}

async function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function loadExisting(prisma, codes) {
  const clients = await prisma.collectionItem.findMany({
    where: { collection: 'clients' },
    select: { id: true, code: true, data: true },
  });
  const existing = new Set();
  const wanted = new Set(codes);
  for (const client of clients) {
    for (const candidate of [client.id, client.code, client.data?.codeClientUltex]) {
      if (wanted.has(candidate)) existing.add(candidate);
    }
  }
  const collisions = new Map();
  for (const part of await chunks(codes, 500)) {
    const matches = await prisma.collectionItem.findMany({
      where: { id: { in: part }, collection: { not: 'clients' } },
      select: { id: true, collection: true },
    });
    for (const item of matches) collisions.set(item.id, item.collection);
  }
  return { existing, collisions };
}

function reportBase(file, analysis) {
  return {
    generatedAt: new Date().toISOString(),
    mode: INSPECT_ONLY ? 'inspect-only' : TEST_WRITE_ROLLBACK ? 'test-write-rollback' : APPLY ? 'apply' : 'dry-run',
    file,
    source: {
      totalRowsIncludingHeader: analysis.parsed.length + analysis.invalid.length + analysis.blankCodeRows + 1,
      rowsWithValidStandardCode: analysis.parsed.length,
      eligibleUniqueCodes: analysis.eligible.length,
      blankCodeRows: analysis.blankCodeRows,
      invalidCodes: analysis.invalid,
      duplicateCodeConflicts: analysis.duplicates,
    },
  };
}

async function saveReport(path, report) {
  if (!path) return;
  await writeFile(resolve(path), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Rapport : ${resolve(path)}`);
}

async function main() {
  if (!FILE) return usage('Le paramètre --file est obligatoire.');
  const file = resolve(FILE);
  const text = decodeCsv(await readFile(file));
  const analysis = analyze(parseDelimited(text));
  const report = reportBase(file, analysis);

  console.log(`CSV: ${analysis.parsed.length} ligne(s) à code L standard, ${analysis.eligible.length} code(s) unique(s) éligible(s).`);
  console.log(`Source rejetée: ${analysis.invalid.length} code(s) non standard, ${analysis.duplicates.length} conflit(s) de code dupliqué.`);
  if (INSPECT_ONLY) {
    await saveReport(REPORT, report);
    console.log('Inspection terminée; aucune connexion CRM et aucune écriture.');
    return;
  }

  const prisma = new PrismaClient();
  try {
    const codes = analysis.eligible.map(record => record.code);
    const { existing, collisions } = await loadExisting(prisma, codes);
    const planned = analysis.eligible.filter(record => !existing.has(record.code) && !collisions.has(record.code));
    const skippedExisting = analysis.eligible.filter(record => existing.has(record.code)).map(record => record.code);
    const idCollisions = analysis.eligible.filter(record => collisions.has(record.code)).map(record => ({
      code: record.code,
      collection: collisions.get(record.code),
    }));
    Object.assign(report, {
      crm: {
        existingCodesSkipped: skippedExisting.length,
        missingCodesToInsert: planned.length,
        globalIdCollisions: idCollisions,
      },
      existingCodes: skippedExisting,
      plannedCodes: planned.map(record => record.code),
    });
    console.log(`CRM: ${skippedExisting.length} code(s) existant(s) à ignorer; ${planned.length} nouveau(x) client(s) à créer; ${idCollisions.length} collision(s) bloquée(s).`);

    if (TEST_WRITE_ROLLBACK) {
      if (!planned.length) {
        console.log('Aucun code manquant disponible pour tester une écriture annulée.');
      } else {
        const marker = Symbol('ROLLBACK_OK');
        try {
          await prisma.$transaction(async tx => {
            await insertRecord(tx, planned[0]);
            throw marker;
          }, { maxWait: 30000, timeout: 120000 });
        } catch (error) {
          if (error !== marker) throw error;
        }
        console.log(`Test d'écriture réussi pour ${planned[0].code}; transaction annulée, aucune donnée conservée.`);
      }
      await saveReport(REPORT, report);
      return;
    }

    if (!APPLY) {
      await saveReport(REPORT, report);
      console.log('Dry-run uniquement. Relancez avec --apply après vérification du rapport.');
      return;
    }

    const inserted = [];
    const skippedDuringApply = [];
    const batches = await chunks(planned, BATCH_SIZE);
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const results = await prisma.$transaction(async tx => {
        // Serializes this historical seed with another invocation of itself.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(6912, 20260922)`;
        const values = [];
        for (const record of batches[batchIndex]) values.push({ record, result: await insertRecord(tx, record) });
        return values;
      }, { maxWait: 30000, timeout: 120000 });
      for (const { record, result } of results) {
        if (result.skipped) skippedDuringApply.push({ code: record.code, reason: result.reason });
        else inserted.push({ code: record.code, contact: result.contact, demande: result.demande, productLine: result.line });
      }
      console.log(`Lot ${batchIndex + 1}/${batches.length}: ${inserted.length} insertion(s) cumulée(s).`);
    }
    report.result = {
      insertedCount: inserted.length,
      skippedDuringApplyCount: skippedDuringApply.length,
      inserted,
      skippedDuringApply,
    };
    await saveReport(REPORT, report);
    console.log(`Terminé: ${inserted.length} client(s), contact(s), demande(s) et ligne(s) produit créés atomiquement.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
