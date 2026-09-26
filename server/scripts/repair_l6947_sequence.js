/**
 * One-off, atomic repair for the 2026-09-25 Google Sheets L-code shift.
 *
 * Correct result:
 *   - accidental duplicate L6947 is merged into established client L1635;
 *   - every existing demande is preserved and repointed to L1635;
 *   - L6948..L6956 are renamed, in order, to L6947..L6955;
 *   - all structured client references and business reference suffixes move;
 *   - rerunning is harmless because a transaction marker blocks repetition.
 *
 * Usage:
 *   node scripts/repair_l6947_sequence.js
 *   node scripts/repair_l6947_sequence.js --apply --confirm shift-L6947-L6956
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const confirmationIndex = process.argv.indexOf('--confirm');
const CONFIRMATION = confirmationIndex >= 0 ? String(process.argv[confirmationIndex + 1] || '') : '';
const REQUIRED_CONFIRMATION = 'shift-L6947-L6956';
const MARKER_KEY = 'REPAIR_L6947_SHIFT_20260926';
const MERGE_FROM = 'L6947';
const MERGE_INTO = 'L1635';
const SHIFT = [
  ['L6948', 'L6947'],
  ['L6949', 'L6948'],
  ['L6950', 'L6949'],
  ['L6951', 'L6950'],
  ['L6952', 'L6951'],
  ['L6953', 'L6952'],
  ['L6954', 'L6953'],
  ['L6955', 'L6954'],
  ['L6956', 'L6955'],
];
const REFERENCE_FIELDS = ['client', 'codeClientAssocie', 'codeClient', 'clientCode', 'codeClientUltex'];

function phoneKey(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

async function demandeIdentityBridgeCount(db) {
  return db.collectionItem.count({
    where: {
      collection: 'demandes',
      AND: [
        { data: { path: ['client'], equals: MERGE_FROM } },
        { data: { path: ['codeClientUltex'], equals: MERGE_INTO } },
      ],
    },
  });
}

async function clientByCode(db, code) {
  return db.collectionItem.findFirst({
    where: { collection: 'clients', OR: [{ id: code }, { code }] }
  });
}

async function referenceCounts(db, code) {
  const counts = {};
  for (const field of REFERENCE_FIELDS) {
    counts[field] = await db.collectionItem.count({
      where: { data: { path: [field], equals: code } }
    });
  }
  counts.referenceMetier = await db.collectionItem.count({
    where: { data: { path: ['referenceMetier'], string_ends_with: `-${code}` } }
  });
  return counts;
}

async function repointReferences(tx, oldCode, newCode) {
  const counts = {};
  for (const field of REFERENCE_FIELDS) {
    counts[field] = await tx.$executeRawUnsafe(
      `UPDATE collection_items
       SET data = jsonb_set(data, ARRAY[$1]::text[], to_jsonb($2::text), false)
       WHERE data->>$1 = $3`,
      field, newCode, oldCode
    );
  }
  counts.referenceMetier = await tx.$executeRaw`
    UPDATE collection_items
    SET data = jsonb_set(
      data,
      '{referenceMetier}',
      to_jsonb(regexp_replace(data->>'referenceMetier', ${`-${oldCode}$`}, ${`-${newCode}`})),
      false
    )
    WHERE COALESCE(data->>'referenceMetier', '') ~ ${`-${oldCode}$`}
  `;
  const audit = await tx.auditLog.updateMany({ where: { objet: oldCode }, data: { objet: newCode } });
  counts.audit = audit.count;
  return counts;
}

async function mergeAccidentalClient(tx, source, canonical) {
  const merged = { ...canonical.data };
  for (const [key, value] of Object.entries(source.data || {})) {
    if ((merged[key] === undefined || merged[key] === null || merged[key] === '') && value != null && value !== '') merged[key] = value;
  }
  for (const dateField of ['dateDerniereDemande', 'dateEntreeData']) {
    merged[dateField] = [canonical.data?.[dateField] || '', source.data?.[dateField] || ''].sort().at(-1);
  }
  merged.id = MERGE_INTO;
  merged.code = MERGE_INTO;
  merged.codeClientUltex = MERGE_INTO;
  await tx.collectionItem.update({
    where: { id: canonical.id },
    data: { data: merged }
  });
  const references = await repointReferences(tx, MERGE_FROM, MERGE_INTO);
  await tx.collectionItem.delete({
    where: { collection_id: { collection: 'clients', id: source.id } }
  });
  return references;
}

async function renameClient(tx, oldCode, newCode) {
  const renamed = await tx.$executeRaw(Prisma.sql`
    UPDATE collection_items
    SET id = ${newCode},
        code = ${newCode},
        data = data || jsonb_build_object('id', ${newCode}, 'code', ${newCode}, 'codeClientUltex', ${newCode})
    WHERE collection = 'clients' AND id = ${oldCode} AND code = ${oldCode}
  `);
  if (renamed !== 1) throw new Error(`Renommage impossible: ${oldCode} -> ${newCode} (client source absent ou ambigu).`);
  return { renamed, references: await repointReferences(tx, oldCode, newCode) };
}

async function inspectPlan() {
  const marker = await prisma.sequenceCounter.findUnique({ where: { key: MARKER_KEY } });
  if (marker) return { alreadyApplied: true, marker: MARKER_KEY };

  const codes = [MERGE_INTO, MERGE_FROM, ...SHIFT.map(([oldCode]) => oldCode)];
  const rows = [];
  for (const code of codes) {
    const client = await clientByCode(prisma, code);
    rows.push({
      code,
      found: Boolean(client),
      name: client?.data?.nom || '',
      phone: client?.data?.telephone || '',
      jsonCode: client?.data?.codeClientUltex || '',
      references: client ? await referenceCounts(prisma, code) : {},
    });
  }
  const missing = rows.filter(row => !row.found).map(row => row.code);
  if (missing.length) throw new Error(`Précondition échouée. Clients absents: ${missing.join(', ')}`);

  const source = await clientByCode(prisma, MERGE_FROM);
  const canonical = await clientByCode(prisma, MERGE_INTO);
  const sourcePhone = phoneKey(source.data?.telephone);
  const canonicalPhone = phoneKey(canonical.data?.telephone);
  const identityPointsToCanonical = String(source.data?.codeClientUltex || '') === MERGE_INTO;
  // This is the exact stale state visible on the dashboard as
  // [L1635](#ficheClient:L6947): the demande's persisted link is L6947,
  // while its ULTEX identity already says L1635. It is stronger evidence
  // than a phone match because phones may be absent or edited later.
  const demandeIdentityBridges = await demandeIdentityBridgeCount(prisma);
  const samePhone = Boolean(sourcePhone && sourcePhone === canonicalPhone);
  if (!identityPointsToCanonical && !samePhone && demandeIdentityBridges === 0) {
    throw new Error(
      `Sécurité: fusion ${MERGE_FROM} -> ${MERGE_INTO} non prouvée. `
      + `Source=${source.data?.nom || '—'} (${sourcePhone || 'sans téléphone'}), `
      + `cible=${canonical.data?.nom || '—'} (${canonicalPhone || 'sans téléphone'}), `
      + 'aucune demande client/codeClientUltex concordante.'
    );
  }
  return { alreadyApplied: false, merge: `${MERGE_FROM} -> ${MERGE_INTO}`, proof: { identityPointsToCanonical, samePhone, demandeIdentityBridges }, shift: SHIFT, clients: rows };
}

async function main() {
  const plan = await inspectPlan();
  console.info(JSON.stringify({ mode: APPLY ? 'APPLY' : 'PREVIEW', ...plan }, null, 2));
  if (plan.alreadyApplied) {
    console.info('Réparation déjà appliquée; aucune modification.');
    return;
  }
  if (!APPLY) {
    console.info(`Aucune écriture. Pour appliquer: node scripts/repair_l6947_sequence.js --apply --confirm ${REQUIRED_CONFIRMATION}`);
    return;
  }
  if (CONFIRMATION !== REQUIRED_CONFIRMATION) {
    throw new Error(`Confirmation requise: --confirm ${REQUIRED_CONFIRMATION}`);
  }

  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(6947, 6956)`;
    const marker = await tx.sequenceCounter.findUnique({ where: { key: MARKER_KEY } });
    if (marker) return { alreadyApplied: true };

    const source = await clientByCode(tx, MERGE_FROM);
    const canonical = await clientByCode(tx, MERGE_INTO);
    if (!source || !canonical) throw new Error('Les clients de fusion ont changé depuis la prévisualisation.');
    const mergeReferences = await mergeAccidentalClient(tx, source, canonical);
    const shifts = [];
    for (const [oldCode, newCode] of SHIFT) shifts.push({ oldCode, newCode, ...(await renameClient(tx, oldCode, newCode)) });
    await tx.sequenceCounter.create({ data: { key: MARKER_KEY, val: 1 } });
    return { alreadyApplied: false, mergeReferences, shifts };
  }, { maxWait: 30000, timeout: 120000 });

  console.info(JSON.stringify({ status: 'done', ...result }, null, 2));
  console.info('Toutes les demandes historiques ont été conservées; seules leurs références client ont été corrigées.');
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
