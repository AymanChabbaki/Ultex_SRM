/**
 * Seed the historical Click CSV (R-codes and numeric client codes) into CRM.
 *
 * Dry-run is the default. --apply is required to write. For every missing
 * client code, client + contact + demande + product line are created in one
 * transaction. Existing client codes are skipped with all their children.
 * Ambiguous duplicated codes and non R/numeric codes are never guessed.
 *
 * Usage:
 *   node scripts/seed_click_csv_to_crm.js --file /tmp/click.csv --report /tmp/click-preview.json
 *   node scripts/seed_click_csv_to_crm.js --file /tmp/click.csv --apply --report /tmp/click-result.json
 *   node scripts/seed_click_csv_to_crm.js --file /tmp/click.csv --inspect-only
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
const SOURCE_NAME = 'Import CSV Click historique';

function usage(message = '') {
  if (message) console.error(message);
  console.error('Usage: node scripts/seed_click_csv_to_crm.js --file <click.csv> [--apply|--test-write-rollback] [--report <report.json>]');
  process.exitCode = 2;
}

const clean = value => String(value ?? '').replace(/\u0000/g, '').trim();

function decodeCsv(buffer) {
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
    } else if (char === '"') {
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

function classifyCode(value) {
  const code = clean(value).toUpperCase();
  if (/^R\d+$/.test(code)) return { code, family: 'R' };
  if (/^\d+$/.test(code)) return { code, family: 'NUMERIC' };
  if (/^L\d+$/.test(code)) return { code, family: 'L_EXCLUDED' };
  return { code, family: 'INVALID' };
}

function normalizePhone(value) {
  let phone = clean(value).replace(/\D/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (/^0[67]\d{8}$/.test(phone)) phone = `212${phone.slice(1)}`;
  if (/^[67]\d{8}$/.test(phone)) phone = `212${phone}`;
  return phone;
}

function validDateParts(day, month, year) {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const dateIso = (year, month, day) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

function parseDate(value, yearHint = 2024) {
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
  if (!match) return '';
  const month = Number(match[2]);
  const day = Number(match[1]);
  return validDateParts(day, month, yearHint) ? dateIso(yearHint, month, day) : '';
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
  const exact = new Map([
    ['pas pret', 'Pas prêt'],
    ['faible qualite', 'Faible qualité'],
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
  if (exact.has(normalized)) return exact.get(normalized);
  if (normalized.startsWith('pas ') && /(interess|intress)/.test(normalized)) return 'Pas intéressé';
  return '';
}

function isStateCandidate(value) {
  const text = clean(value);
  if (!text || parseDate(text, 2024)) return false;
  if (/^20\d{2}-\d{2}-\d{2}.*(?:UTC|Z)$/i.test(text)) return false;
  return normalizeText(text) !== 'etat';
}

function stateInfo(row) {
  const raw = row.slice(10, 20).map(clean).filter(Boolean);
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
  const parsed = Number(numbers[0].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
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

function mapSource(value) {
  const normalized = normalizeText(value);
  if (normalized.includes('meta') || normalized.includes('metta')) return { source: 'Meta', canal: 'Réseaux sociaux' };
  if (normalized.includes('whats')) return { source: 'WhatsApp', canal: 'WhatsApp' };
  if (normalized.includes('google')) return { source: 'Google', canal: 'Site web' };
  if (normalized.includes('youtube')) return { source: 'YouTube', canal: 'Réseaux sociaux' };
  if (normalized.includes('recommand')) return { source: 'Référence', canal: 'Recommandation' };
  if (normalized.includes('appel') || normalized.includes('telephone')) return { source: 'Téléphone', canal: 'Appel téléphonique' };
  return { source: 'Autre', canal: 'Autre' };
}

function historiqueSuivi(states, code, sourceDate) {
  return states.map((etat, index) => ({
    id: `csv-click-${code}-${index + 1}`,
    ts: Date.parse(`${sourceDate}T12:00:00.000Z`) + index,
    date: sourceDate,
    version: index + 1,
    utilisateur: SOURCE_NAME,
    action: 'État importé',
    avant: index ? states[index - 1] : '',
    etat,
    notes: 'Valeur historique conservée telle quelle depuis le fichier Click.',
  }));
}

function makeSourceRecord(row, rowNumber, sourceDate, classification) {
  const code = classification.code;
  const product = clean(row[5]) || 'Produit non renseigné';
  const quantityRaw = clean(row[6]);
  const state = stateInfo(row);
  const source = mapSource(row[3]);
  const notes = [
    clean(row[9]) && `Observation : ${clean(row[9])}`,
    clean(row[8]) && `Détails produit : ${clean(row[8])}`,
    clean(row[7]) && `Prix cible source : ${clean(row[7])}`,
    quantityRaw && `Quantité source : ${quantityRaw}`,
    clean(row[2]) && clean(row[2]) !== '-' && `Formulaire / code transformé : ${clean(row[2])}`,
    state.latest && `Dernier état historique : ${state.latest}`,
  ].filter(Boolean).join('\n');
  return {
    rowNumber,
    code,
    family: classification.family,
    sourceId: `csv-click:${code}`,
    sourceDate,
    createdAt: new Date(`${sourceDate}T12:00:00.000Z`),
    name: `Client ${code}`,
    transformedCode: clean(row[2]),
    sourceRaw: clean(row[3]),
    source,
    phoneRaw: clean(row[4]),
    phone: normalizePhone(row[4]),
    product,
    quantityRaw,
    quantity: parseQuantity(quantityRaw),
    unit: inferUnit(quantityRaw),
    targetPriceRaw: clean(row[7]),
    details: clean(row[8]),
    observation: clean(row[9]),
    state,
    notes,
  };
}

function analyze(rows) {
  if (rows.length < 2) throw new Error('Le fichier CSV est vide ou incomplet.');
  const header = rows[0].map(clean);
  if (normalizeText(header[1]) !== 'code client' || normalizeText(header[4]) !== 'contact') {
    throw new Error('Colonnes inattendues : attendu "Code client" en colonne 2 et "Contact" en colonne 5.');
  }

  const parsed = [];
  const excluded = [];
  let blankCodeRows = 0;
  let contextYear = 2024;
  let contextDate = '2024-05-04';
  for (let index = 2; index < rows.length; index += 1) {
    const row = rows[index];
    const relevantDates = [row[0], row[10], row[12], row[14], row[16], row[18]];
    const year = explicitYear(relevantDates);
    if (year) contextYear = year;
    const dividerDate = parseDate(row[0], contextYear);
    if (dividerDate) contextDate = dividerDate;

    const rawCode = clean(row[1]);
    if (!rawCode) {
      blankCodeRows += 1;
      continue;
    }
    const classification = classifyCode(rawCode);
    if (!['R', 'NUMERIC'].includes(classification.family)) {
      excluded.push({
        row: index + 1,
        code: rawCode,
        reason: classification.family === 'L_EXCLUDED'
          ? 'Code L hors périmètre de cet import R/numérique.'
          : 'Code non standard : attendu R suivi de chiffres, ou uniquement des chiffres.',
      });
      continue;
    }
    const rowDate = parseDate(row[10], contextYear) || dividerDate || contextDate;
    contextDate = rowDate || contextDate;
    parsed.push(makeSourceRecord(row, index + 1, rowDate || '2024-05-04', classification));
  }

  const groups = new Map();
  for (const record of parsed) {
    if (!groups.has(record.code)) groups.set(record.code, []);
    groups.get(record.code).push(record);
  }
  const duplicates = [...groups.entries()].filter(([, values]) => values.length > 1).map(([code, values]) => ({
    code,
    rows: values.map(value => value.rowNumber),
    phones: values.map(value => value.phoneRaw),
    reason: 'Le même code source appartient à plusieurs lignes; aucune ligne de ce code ne sera créée.',
  }));
  const duplicateCodes = new Set(duplicates.map(value => value.code));
  const eligible = parsed.filter(record => !duplicateCodes.has(record.code));
  const familyCounts = values => values.reduce((counts, value) => {
    counts[value.family] = (counts[value.family] || 0) + 1;
    return counts;
  }, {});
  return { rowsCount: rows.length, parsed, eligible, excluded, duplicates, blankCodeRows, familyRows: familyCounts(parsed), familyEligible: familyCounts(eligible) };
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
  return tx.collectionItem.create({ data: { collection, id: code, code, data: { ...values, id: code, code }, createdAt } });
}

async function insertRecord(tx, record) {
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
    segment: 'Prospect',
    sourceDonnees: SOURCE_NAME,
    sourcePremierContact: record.source.source,
    sourceHistorique: record.sourceRaw,
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
    codeTransformeSource: record.transformedCode,
    nomACompleter: true,
    importSourceId: record.sourceId,
    importSourceRow: record.rowNumber,
  };
  await tx.collectionItem.create({ data: { collection: 'clients', id: record.code, code: record.code, data: clientData, createdAt: record.createdAt } });

  const contact = await createItem(tx, 'contacts', 'CT', {
    nom: record.name,
    telephone: record.phone,
    telephoneSource: record.phoneRaw,
    whatsapp: record.phone,
    typeContact: 'Client',
    codeClientAssocie: record.code,
    source: record.source.source,
    sourceDonnees: SOURCE_NAME,
    nomACompleter: true,
    remarque: record.observation,
    importSourceId: record.sourceId,
  }, record.createdAt);

  const demande = await createItem(tx, 'demandes', 'DMD', {
    client: record.code,
    codeClientUltex: record.code,
    dateDemande: record.sourceDate,
    dateHeureReception: `${record.sourceDate}T12:00:00.000Z`,
    source: record.source.source,
    canalReception: record.source.canal,
    sourceSynchronisation: SOURCE_NAME,
    sourceHistorique: record.sourceRaw,
    createdManually: false,
    responsableData: 'Data',
    objectifGeneral: record.product,
    urgence: 'Normale',
    statut: 'Nouvelle',
    dataTag: record.state.dataTag,
    etatSource: record.state.latest,
    etatsSourceBruts: record.state.raw,
    remarqueGenerale: record.notes,
    codeTransformeSource: record.transformedCode,
    importSourceId: record.sourceId,
    importSourceRow: record.rowNumber,
  }, record.createdAt);

  const line = await createItem(tx, 'demandeLignes', 'DL', {
    demande: demande.code,
    referenceMetier: `P1-${record.code}`,
    nomProduit: record.product,
    designationTechnique: record.product,
    description: record.details,
    quantite: record.quantity,
    quantiteSource: record.quantityRaw,
    unite: record.unit,
    prixCibleSource: record.targetPriceRaw,
    commentairesOffre: record.observation,
    statutFournisseur: 'À rechercher',
    statut: 'Brouillon',
    sourceSynchronisation: SOURCE_NAME,
    importSourceId: record.sourceId,
    ts: record.createdAt.getTime(),
  }, record.createdAt);
  return { skipped: false, contact: contact.code, demande: demande.code, line: line.code };
}

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function loadExisting(prisma, codes) {
  const clients = await prisma.collectionItem.findMany({ where: { collection: 'clients' }, select: { id: true, code: true, data: true } });
  const wanted = new Set(codes);
  const existing = new Set();
  for (const client of clients) {
    for (const candidate of [client.id, client.code, client.data?.codeClientUltex]) {
      if (wanted.has(candidate)) existing.add(candidate);
    }
  }
  const collisions = new Map();
  for (const part of chunks(codes, 500)) {
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
      totalRows: analysis.rowsCount,
      validRowsByFamily: analysis.familyRows,
      eligibleUniqueCodesByFamily: analysis.familyEligible,
      eligibleUniqueCodes: analysis.eligible.length,
      blankCodeRows: analysis.blankCodeRows,
      excludedCodes: analysis.excluded,
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
  const analysis = analyze(parseDelimited(decodeCsv(await readFile(file))));
  const report = reportBase(file, analysis);
  console.log(`CSV: R=${analysis.familyRows.R || 0} ligne(s), numériques=${analysis.familyRows.NUMERIC || 0} ligne(s).`);
  console.log(`Éligibles uniques: R=${analysis.familyEligible.R || 0}, numériques=${analysis.familyEligible.NUMERIC || 0}, total=${analysis.eligible.length}.`);
  console.log(`Source bloquée/exclue: ${analysis.excluded.length} ligne(s), ${analysis.duplicates.length} conflit(s) de code dupliqué.`);

  if (INSPECT_ONLY) {
    await saveReport(REPORT, report);
    console.log('Inspection terminée; aucune connexion CRM et aucune écriture.');
    return;
  }

  const prisma = new PrismaClient();
  try {
    const { existing, collisions } = await loadExisting(prisma, analysis.eligible.map(record => record.code));
    const planned = analysis.eligible.filter(record => !existing.has(record.code) && !collisions.has(record.code));
    const skippedExisting = analysis.eligible.filter(record => existing.has(record.code)).map(record => record.code);
    const idCollisions = analysis.eligible.filter(record => collisions.has(record.code)).map(record => ({ code: record.code, collection: collisions.get(record.code) }));
    report.crm = { existingCodesSkipped: skippedExisting.length, missingCodesToInsert: planned.length, globalIdCollisions: idCollisions };
    report.existingCodes = skippedExisting;
    report.plannedCodes = planned.map(record => record.code);
    console.log(`CRM: ${skippedExisting.length} code(s) existant(s) à ignorer; ${planned.length} nouveau(x) à créer; ${idCollisions.length} collision(s) bloquée(s).`);

    if (TEST_WRITE_ROLLBACK) {
      if (planned.length) {
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
    const batches = chunks(planned, BATCH_SIZE);
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const results = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(9592, 5962)`;
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
    report.result = { insertedCount: inserted.length, skippedDuringApplyCount: skippedDuringApply.length, inserted, skippedDuringApply };
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
