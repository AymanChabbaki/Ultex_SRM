/**
 * Align CRM L6947..L6956 with the authoritative Data sheet.
 *
 * CRM before:
 *   L6947 Planche de surf (later lead, should be L6956)
 *   L6948 Repeter wifi ... L6956 Sac pour femme
 * Correct rotation:
 *   L6948->L6947, ... L6956->L6955, old L6947->L6956
 *
 * No client or demande is deleted. All structured references are repointed in
 * the same transaction. Preview is the default.
 *
 *   node scripts/rotate_l6947_l6956.js
 *   node scripts/rotate_l6947_l6956.js --apply --confirm rotate-L6947-L6956
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const confirmationIndex = process.argv.indexOf('--confirm');
const CONFIRMATION = confirmationIndex >= 0 ? String(process.argv[confirmationIndex + 1] || '') : '';
const REQUIRED_CONFIRMATION = 'rotate-L6947-L6956';
const MARKER_KEY = 'REPAIR_L6947_L6956_ROTATION_20260926_V2';
const TEMP_CODE = '__ROTATE_L6947_20260926__';
const REFERENCE_FIELDS = ['client', 'codeClientAssocie', 'codeClient', 'clientCode', 'codeClientUltex'];
const EXPECTED = [
  { code: 'L6947', product: 'planche de surf' },
  { code: 'L6948', product: 'repeter wifi' },
  { code: 'L6949', product: 'quad 100' },
  { code: 'L6950', product: 'mugs 3d' },
  { code: 'L6951', product: 'chaussures de sport' },
  { code: 'L6952', product: 'pop corn' },
  { code: 'L6953', product: 'dashcam' },
  { code: 'L6954', product: 'led' },
  { code: 'L6955', product: '2 طن' },
  { code: 'L6956', product: 'sac pour femme' },
];
const SHIFT = EXPECTED.slice(1).map(({ code }) => [code, `L${Number(code.slice(1)) - 1}`]);

function normalized(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function clientByCode(db, code) {
  return db.collectionItem.findFirst({
    where: { collection: 'clients', OR: [{ id: code }, { code }] },
  });
}

async function demandesForClient(db, code) {
  return db.collectionItem.findMany({
    where: {
      collection: 'demandes',
      OR: [
        { data: { path: ['client'], equals: code } },
        { data: { path: ['codeClientUltex'], equals: code } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
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

async function renameClient(tx, oldCode, newCode) {
  const renamed = await tx.$executeRaw(Prisma.sql`
    UPDATE collection_items
    SET id = ${newCode},
        code = ${newCode},
        data = data || jsonb_build_object('id', ${newCode}, 'code', ${newCode}, 'codeClientUltex', ${newCode})
    WHERE collection = 'clients' AND id = ${oldCode} AND code = ${oldCode}
  `);
  if (renamed !== 1) throw new Error(`Renommage impossible: ${oldCode} -> ${newCode}.`);
  return { renamed, references: await repointReferences(tx, oldCode, newCode) };
}

async function inspectPlan(db, { checkMarker = true } = {}) {
  if (checkMarker) {
    const marker = await db.sequenceCounter.findUnique({ where: { key: MARKER_KEY } });
    if (marker) return { alreadyApplied: true, marker: MARKER_KEY };
  }
  const temporary = await clientByCode(db, TEMP_CODE);
  if (temporary) throw new Error(`Sécurité: le code temporaire ${TEMP_CODE} est déjà occupé.`);

  const rows = [];
  for (const expected of EXPECTED) {
    const client = await clientByCode(db, expected.code);
    if (!client) throw new Error(`Précondition échouée: client ${expected.code} introuvable.`);
    const demandes = await demandesForClient(db, expected.code);
    const products = demandes.map(item => String(item.data?.objectifGeneral || '')).filter(Boolean);
    if (!products.some(product => normalized(product).includes(normalized(expected.product)))) {
      throw new Error(
        `Sécurité: ${expected.code} ne correspond pas au produit attendu "${expected.product}". `
        + `Produits trouvés: ${products.join(' | ') || 'aucun'}.`
      );
    }
    rows.push({
      code: expected.code,
      client: client.data?.nom || '',
      phone: client.data?.telephone || '',
      products,
      target: expected.code === 'L6947' ? 'L6956' : `L${Number(expected.code.slice(1)) - 1}`,
    });
  }
  return { alreadyApplied: false, rotation: rows };
}

async function main() {
  const plan = await inspectPlan(prisma);
  console.info(JSON.stringify({ mode: APPLY ? 'APPLY' : 'PREVIEW', ...plan }, null, 2));
  if (plan.alreadyApplied) {
    console.info('Rotation déjà appliquée; aucune modification.');
    return;
  }
  if (!APPLY) {
    console.info(`Aucune écriture. Pour appliquer: node scripts/rotate_l6947_l6956.js --apply --confirm ${REQUIRED_CONFIRMATION}`);
    return;
  }
  if (CONFIRMATION !== REQUIRED_CONFIRMATION) {
    throw new Error(`Confirmation requise: --confirm ${REQUIRED_CONFIRMATION}`);
  }

  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(6947, 6956)`;
    const marker = await tx.sequenceCounter.findUnique({ where: { key: MARKER_KEY } });
    if (marker) return { alreadyApplied: true };
    await inspectPlan(tx, { checkMarker: false });

    const steps = [];
    steps.push({ from: 'L6947', to: TEMP_CODE, ...(await renameClient(tx, 'L6947', TEMP_CODE)) });
    for (const [oldCode, newCode] of SHIFT) {
      steps.push({ from: oldCode, to: newCode, ...(await renameClient(tx, oldCode, newCode)) });
    }
    steps.push({ from: TEMP_CODE, to: 'L6956', ...(await renameClient(tx, TEMP_CODE, 'L6956')) });

    const counter = await tx.sequenceCounter.findUnique({ where: { key: 'L' } });
    await tx.sequenceCounter.upsert({
      where: { key: 'L' },
      create: { key: 'L', val: 6956 },
      update: { val: Math.max(6956, counter?.val || 0) },
    });
    await tx.sequenceCounter.create({ data: { key: MARKER_KEY, val: 1 } });
    return { alreadyApplied: false, steps };
  }, { maxWait: 30000, timeout: 120000 });

  console.info(JSON.stringify({ status: 'done', ...result }, null, 2));
  console.info('Rotation terminée. Aucun client, aucune demande et aucun document supprimés.');
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
