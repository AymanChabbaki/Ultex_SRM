/**
 * Import the historical LIMEX arrivals workbook and arrival folders.
 * Existing CRM values are never overwritten: only blank fields are filled.
 * Files are copied to UPLOADS_DIR and represented in `documents`.
 *
 * Dry run: node scripts/import_arrivages_folder.js --source /import/arrivages
 * Apply:   node scripts/import_arrivages_folder.js --source /import/arrivages --apply
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const SOURCE_ONLY = process.argv.includes('--source-only');
const sourceArg = process.argv.indexOf('--source');
const SOURCE = path.resolve(sourceArg >= 0 ? process.argv[sourceArg + 1] : '/import/arrivages');
const UPLOADS = path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'));
const EXCLUDED_DIRS = new Set(['access', 'modele', 'data client']);

const clean = value => value == null || value === '-' ? '' : String(value).trim();
const norm = value => clean(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
const arrivalNorm = value => {
  const digits = clean(value).match(/\d+/)?.[0] || '';
  return digits.replace(/^0+/, '') || digits;
};
const blank = value => value == null || value === '' || (Array.isArray(value) && !value.length);
const isoDate = value => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};
const fillBlanks = (existing, incoming) => {
  const result = { ...(existing || {}) };
  for (const [key, value] of Object.entries(incoming)) {
    if (blank(result[key]) && !blank(value)) result[key] = value;
  }
  return result;
};
const excelValue = value => {
  if (value && typeof value === 'object' && 'result' in value) return value.result;
  if (value && typeof value === 'object' && Array.isArray(value.richText)) return value.richText.map(x => x.text).join('');
  if (value && typeof value === 'object' && 'text' in value) return value.text;
  return value;
};
const safePart = value => clean(value).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 120) || 'sans-nom';

function arrivalStatus(value) {
  const status = norm(value);
  if (status.includes('ANNUL')) return 'Annulé';
  if (status.includes('LIVR')) return 'Livré totalement';
  if (status.includes('DOUAN')) return 'En dédouanement';
  if (status.includes('SHIPPING') || status.includes('TRANSIT')) return 'En transit';
  if (status.includes('RAMASS')) return 'Marchandise enlevée';
  if (status.includes('PRODUCTION')) return 'Préparation';
  if (status.includes('PAIEMENT')) return 'Bloqué';
  return value ? 'Historique partiellement migré' : 'Préparation';
}

function transportMode(freight, service) {
  const f = norm(freight);
  const s = clean(service).toUpperCase();
  if (f.includes('AERI')) return `Aérien — ${s || 'Express'}`;
  if (f.includes('MARIT')) return `Maritime — ${s || 'Groupage'}`;
  if (f.includes('ROUT')) return `Routier — ${s || 'Standard'}`;
  return clean(freight);
}

function parseFolder(name) {
  const match = name.match(/^(?:arri(?:vage)?|arriode)\s*(\d+)?\s*(?:code)?\s*(.+)?$/i);
  if (!match) return null;
  return { arrivalNo: clean(match[1]).replace(/^0+/, '') || '', clientCode: clean(match[2]) };
}

function walkFiles(root) {
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function documentCategory(filename) {
  const n = norm(filename);
  if (n.includes('PROFORMA') || /(^|[^A-Z])PI([^A-Z]|$)/i.test(filename)) return 'Proforma fournisseur';
  if (n.includes('PACKING') || n.includes('COLISAGE')) return 'Packing list';
  if (n.includes('DUM')) return 'DUM';
  if (n.includes('BL') || n.includes('AWB') || n.includes('LTA')) return 'Transport / BL / AWB';
  if (n.includes('COC') || n.includes('CERTIF')) return 'Certificat / conformité';
  if (n.includes('FACTURE')) return 'Facture';
  if (n.includes('PAIEMENT') || n.includes('VIREMENT') || n.includes('QUITTANCE') || n.includes('RECU')) return 'Paiement / justificatif';
  if (/\.(jpe?g|png|gif|webp)$/i.test(filename)) return 'Photo / image';
  if (/\.(mp4|mov|avi|mkv)$/i.test(filename)) return 'Vidéo';
  return 'Autre';
}

async function nextCode(prefix) {
  const year = new Date().getFullYear();
  const key = `${prefix}-${year}`;
  const counter = await prisma.sequenceCounter.upsert({
    where: { key }, update: { val: { increment: 1 } }, create: { key, val: 1 }
  });
  return `${prefix}${year}-${String(counter.val).padStart(6, '0')}`;
}

async function main() {
  if (!fs.existsSync(SOURCE)) throw new Error(`Dossier source introuvable: ${SOURCE}`);
  const workbookPath = fs.readdirSync(SOURCE).map(n => path.join(SOURCE, n))
    .find(p => /ARRIVAGE.*\.xlsx$/i.test(path.basename(p)));
  if (!workbookPath) throw new Error('Classeur ARRIVAGE .xlsx introuvable dans la source.');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const sheet = workbook.worksheets.find(item => norm(item.name).includes('ARRIVAGEGENERAL'));
  if (!sheet) throw new Error('Feuille ARRIVAGE GENERAL introuvable.');
  const rows = [];
  for (let rowNo = 3; rowNo <= sheet.rowCount; rowNo++) {
    const row = sheet.getRow(rowNo);
    rows.push(Array.from({ length: 25 }, (_, index) => excelValue(row.getCell(index + 1).value)));
  }
  const sourceRows = rows.filter(row => clean(row[4]) || clean(row[6]) || clean(row[7])).map((row, index) => {
    const arrivalNo = clean(row[4]).replace(/^N[^0-9]*/i, '').replace(/^0+/, '') || clean(row[4]);
    const clientCode = clean(row[6]);
    const confirmationDate = isoDate(row[8]);
    const year = confirmationDate?.slice(0, 4) || 'sans-annee';
    return {
      sourceKey: `${year}:${arrivalNo}:${norm(clientCode)}:${index + 3}`,
      arrivalNo, clientCode,
      data: {
        ancienNumero: arrivalNo ? `Arrivage ${arrivalNo}` : '',
        nomInterne: [arrivalNo && `Arrivage ${arrivalNo}`, clientCode && `code ${clientCode}`].filter(Boolean).join(' — '),
        codeClientSource: clientCode,
        nomClientSource: clean(row[7]), produitSource: clean(row[5]),
        paysOrigine: clean(row[0]), modeTransport: transportMode(row[1], row[3]),
        incotermSource: clean(row[2]), serviceSource: clean(row[3]),
        dateConfirmationSource: confirmationDate, totalImporteSource: clean(row[9] || row[11]),
        dateEngagementSource: isoDate(row[10]), datePaiementSource: isoDate(row[12]),
        modePaiementSource: clean(row[13]), numeroProformaSource: clean(row[14]),
        volumePoidsSource: clean(row[15]), compagnieSource: clean(row[16]),
        offreTransportSource: clean(row[17]), trackingSource: clean(row[18]),
        dateDepartReelle: isoDate(row[19]), dateArriveeReelle: isoDate(row[20]),
        dateSortieSource: isoDate(row[21]), statut: arrivalStatus(row[22]),
        remarques: clean(row[22]), type: 'Import', sourceImportArrivages: true,
      }
    };
  });

  const arrivalFolders = fs.readdirSync(SOURCE, { withFileTypes: true })
    .filter(e => e.isDirectory() && !EXCLUDED_DIRS.has(e.name.toLowerCase()))
    .map(e => ({ entry: e, parsed: parseFolder(e.name) })).filter(x => x.parsed);
  if (SOURCE_ONLY) {
    const fileCount = arrivalFolders.reduce((sum, item) => sum + walkFiles(path.join(SOURCE, item.entry.name)).length, 0);
    console.log(`SOURCE OK: lignes arrivages=${sourceRows.length}, dossiers arrivages=${arrivalFolders.length}, fichiers=${fileCount}.`);
    return;
  }

  const existingArrivals = await prisma.collectionItem.findMany({ where: { collection: 'arrivages' } });
  const bySourceKey = new Map(existingArrivals.filter(x => x.data?.sourceArrivageKey).map(x => [x.data.sourceArrivageKey, x]));
  const byPair = new Map();
  for (const item of existingArrivals) {
    const key = `${arrivalNorm(item.data?.ancienNumero)}:${norm(item.data?.codeClientSource)}`;
    if (key !== ':') byPair.set(key, item);
  }

  const importedByPair = new Map();
  let created = 0, updated = 0, documentsCreated = 0, documentsSkipped = 0;
  for (const row of sourceRows) {
    const pair = `${arrivalNorm(row.arrivalNo)}:${norm(row.clientCode)}`;
    let item = bySourceKey.get(row.sourceKey) || byPair.get(pair);
    const incoming = { ...row.data, sourceArrivageKey: row.sourceKey };
    if (!item) {
      created++;
      if (APPLY) {
        const code = await nextCode('ARR');
        const data = { id: code, code, ...incoming, ts: Date.now() };
        item = await prisma.collectionItem.create({ data: { collection: 'arrivages', code, data } });
      } else {
        item = { code: `PREVIEW-${row.sourceKey}`, data: incoming };
      }
    } else {
      const merged = fillBlanks(item.data, incoming);
      if (JSON.stringify(merged) !== JSON.stringify(item.data)) {
        updated++;
        if (APPLY) item = await prisma.collectionItem.update({ where: { id: item.id }, data: { data: merged } });
      }
    }
    if (item) importedByPair.set(pair, item);
  }

  for (const { entry, parsed } of arrivalFolders) {
    const pair = `${arrivalNorm(parsed.arrivalNo)}:${norm(parsed.clientCode)}`;
    let arrival = importedByPair.get(pair) || byPair.get(pair);
    if (!arrival && parsed.clientCode) {
      const matches = [...importedByPair.entries()].filter(([key]) => key.endsWith(`:${norm(parsed.clientCode)}`));
      if (matches.length === 1) arrival = matches[0][1];
    }
    if (!arrival) {
      console.warn(`Dossier non rattaché: ${entry.name}`);
      continue;
    }

    for (const sourceFile of walkFiles(path.join(SOURCE, entry.name))) {
      const relativeSource = path.relative(SOURCE, sourceFile).replace(/\\/g, '/');
      const fingerprint = crypto.createHash('sha256').update(relativeSource.toLowerCase()).digest('hex');
      const exists = await prisma.collectionItem.findFirst({
        where: { collection: 'documents', data: { path: ['sourceArrivageFingerprint'], equals: fingerprint } }
      });
      if (exists) { documentsSkipped++; continue; }
      documentsCreated++;
      if (!APPLY) continue;

      const relativeStorage = path.join('arrivages', safePart(arrival.code), `${fingerprint.slice(0, 12)}-${safePart(path.basename(sourceFile))}`);
      const destination = path.join(UPLOADS, relativeStorage);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(sourceFile, destination);
      const code = await nextCode('DOC');
      const data = {
        id: code, code, nom: path.basename(sourceFile), type: documentCategory(sourceFile),
        typeFichier: path.extname(sourceFile).slice(1).toUpperCase() || 'Fichier',
        arrivage: arrival.code, storagePath: relativeStorage.replace(/\\/g, '/'),
        sourceArrivageFingerprint: fingerprint, sourceRelativePath: relativeSource,
        version: 1, statut: 'Reçu', confidentialite: 'Public (services autorisés)',
        commentaire: `Importé depuis le dossier historique ${entry.name}.`, ts: Date.now(),
      };
      await prisma.collectionItem.create({ data: { collection: 'documents', code, data } });
    }
  }

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: arrivages créés=${created}, enrichis=${updated}, documents à créer=${documentsCreated}, documents déjà présents=${documentsSkipped}.`);
  if (!APPLY) console.log('Relancez avec --apply pour écrire les données et copier les fichiers.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
