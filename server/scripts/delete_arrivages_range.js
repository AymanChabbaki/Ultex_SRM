/**
 * Delete a bounded range of CRM Arrivages and clean their direct references.
 *
 * Preview (default):
 *   node scripts/delete_arrivages_range.js
 *
 * Apply:
 *   node scripts/delete_arrivages_range.js --apply \
 *     --confirm delete-ARR2026-000001-ARR2026-000246
 *
 * Optional custom range:
 *   node scripts/delete_arrivages_range.js \
 *     --from ARR2026-000001 --to ARR2026-000246
 *
 * Uploaded files are intentionally kept on disk so they remain recoverable.
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

function argument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '') : fallback;
}

const FROM_CODE = argument('--from', 'ARR2026-000001').toUpperCase();
const TO_CODE = argument('--to', 'ARR2026-000246').toUpperCase();
const CONFIRMATION = argument('--confirm');
const REQUIRED_CONFIRMATION = `delete-${FROM_CODE}-${TO_CODE}`;
const OWNED_COLLECTIONS = new Set([
  'analysesLimex',
  'arrivageMessages',
  'actionsLimex',
  'suivisLimex',
]);

function parseArrivalCode(value) {
  const match = /^ARR(\d{4})-(\d{6})$/.exec(String(value || '').trim().toUpperCase());
  if (!match) throw new Error(`Code Arrivage invalide: ${value}`);
  return { year: match[1], sequence: Number(match[2]) };
}

function targetCodes() {
  const from = parseArrivalCode(FROM_CODE);
  const to = parseArrivalCode(TO_CODE);
  if (from.year !== to.year || from.sequence > to.sequence) {
    throw new Error('La plage Arrivage est invalide ou traverse plusieurs années.');
  }
  if (to.sequence - from.sequence > 10_000) {
    throw new Error('Sécurité: la plage demandée dépasse 10 000 Arrivages.');
  }
  return Array.from(
    { length: to.sequence - from.sequence + 1 },
    (_, index) => `ARR${from.year}-${String(from.sequence + index).padStart(6, '0')}`,
  );
}

function nonEmpty(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function hasIndependentDocumentLink(data = {}, targets) {
  const hasBusinessLink = ['client', 'commande', 'demande', 'codeClient', 'codeClientUltex']
    .some(field => nonEmpty(data[field]));
  const dossier = String(data.dossier || '').trim().toUpperCase();
  return hasBusinessLink || (nonEmpty(dossier) && !targets.has(dossier));
}

function removeArrivalReference(row, targets) {
  const data = { ...(row.data || {}) };
  if (targets.has(String(data.arrivage || '').toUpperCase())) delete data.arrivage;
  if (targets.has(String(data.dossier || '').toUpperCase())) delete data.dossier;
  if (Array.isArray(data.arrivages)) {
    data.arrivages = data.arrivages.filter(code => !targets.has(String(code || '').toUpperCase()));
  }
  return {
    data,
    dossier: targets.has(String(row.dossier || '').toUpperCase()) ? null : row.dossier,
  };
}

async function inspect(db, codes) {
  const targets = new Set(codes);
  const arrivals = await db.collectionItem.findMany({
    where: { collection: 'arrivages', code: { in: codes } },
    orderBy: { code: 'asc' },
  });

  const references = await db.$queryRaw(Prisma.sql`
    SELECT id, collection, code, dossier, data
    FROM collection_items
    WHERE collection <> 'arrivages'
      AND (
        dossier IN (${Prisma.join(codes)})
        OR data->>'arrivage' IN (${Prisma.join(codes)})
        OR data->>'dossier' IN (${Prisma.join(codes)})
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(data->'arrivages') = 'array' THEN data->'arrivages' ELSE '[]'::jsonb END
          ) AS linked_arrivage(code)
          WHERE linked_arrivage.code IN (${Prisma.join(codes)})
        )
      )
    ORDER BY collection, code, id
  `);

  const ownedRows = references.filter(row => OWNED_COLLECTIONS.has(row.collection));
  const documentRows = references.filter(row => row.collection === 'documents');
  const documentsToDelete = documentRows.filter(row => !hasIndependentDocumentLink(row.data, targets));
  const documentsToDetach = documentRows.filter(row => hasIndependentDocumentLink(row.data, targets));
  const rowsToDetach = references.filter(row => (
    !OWNED_COLLECTIONS.has(row.collection) && row.collection !== 'documents'
  ));

  const commandCodes = new Set();
  arrivals.forEach(arrival => {
    (Array.isArray(arrival.data?.commandes) ? arrival.data.commandes : [])
      .filter(Boolean)
      .forEach(code => commandCodes.add(String(code)));
  });

  const otherArrivals = commandCodes.size
    ? await db.collectionItem.findMany({
      where: { collection: 'arrivages', code: { notIn: codes } },
      select: { data: true },
    })
    : [];
  const commandsLinkedElsewhere = new Set();
  otherArrivals.forEach(arrival => {
    (Array.isArray(arrival.data?.commandes) ? arrival.data.commandes : [])
      .filter(Boolean)
      .forEach(code => commandsLinkedElsewhere.add(String(code)));
  });

  const commands = commandCodes.size
    ? await db.collectionItem.findMany({
      where: { collection: 'commandes', code: { in: [...commandCodes] } },
      orderBy: { code: 'asc' },
    })
    : [];
  const commandsToReset = commands.filter(command => (
    command.data?.statut === 'En arrivage' && !commandsLinkedElsewhere.has(String(command.code))
  ));

  const notifications = await db.notificationItem.findMany({
    select: { id: true, code: true, texte: true },
  });
  const notificationsToDelete = notifications.filter(notification => (
    codes.some(code => String(notification.texte || '').includes(code))
  ));
  const auditCount = await db.auditLog.count({ where: { dossier: { in: codes } } });
  const counters = await db.sequenceCounter.findMany({
    where: { key: { in: [`ARR${parseArrivalCode(FROM_CODE).year}`, `ARR-${parseArrivalCode(FROM_CODE).year}`] } },
    orderBy: { key: 'asc' },
  });

  const existingCodes = new Set(arrivals.map(item => item.code));
  return {
    arrivals,
    missingCodes: codes.filter(code => !existingCodes.has(code)),
    ownedRows,
    documentsToDelete,
    documentsToDetach,
    rowsToDetach,
    commandsToReset,
    notificationsToDelete,
    auditCount,
    counters,
    targets,
  };
}

function summary(plan) {
  const byCollection = rows => rows.reduce((result, row) => {
    result[row.collection] = (result[row.collection] || 0) + 1;
    return result;
  }, {});
  return {
    range: `${FROM_CODE} -> ${TO_CODE}`,
    arrivalsFound: plan.arrivals.length,
    missingCount: plan.missingCodes.length,
    missingCodes: plan.missingCodes,
    ownedRecordsDeleted: byCollection(plan.ownedRows),
    arrivalOnlyDocumentsDeleted: plan.documentsToDelete.length,
    sharedDocumentsDetached: plan.documentsToDetach.length,
    otherRecordsDetached: byCollection(plan.rowsToDetach),
    commandsResetToProcessing: plan.commandsToReset.map(row => row.code),
    notificationsDeleted: plan.notificationsToDelete.length,
    auditRowsDeleted: plan.auditCount,
    sequenceCountersPreserved: plan.counters.map(row => ({ key: row.key, value: row.val })),
    physicalUploadsDeleted: 0,
  };
}

async function applyPlan(tx, plan, codes) {
  const ids = rows => rows.map(row => row.id);
  const deleteRows = async rows => {
    if (!rows.length) return 0;
    return (await tx.collectionItem.deleteMany({ where: { id: { in: ids(rows) } } })).count;
  };
  const detachRows = async rows => {
    for (const row of rows) {
      const patch = removeArrivalReference(row, plan.targets);
      await tx.collectionItem.update({
        where: { collection_id: { collection: row.collection, id: row.id } },
        data: patch,
      });
    }
    return rows.length;
  };

  const ownedDeleted = await deleteRows(plan.ownedRows);
  const documentsDeleted = await deleteRows(plan.documentsToDelete);
  const detached = await detachRows([...plan.documentsToDetach, ...plan.rowsToDetach]);

  for (const command of plan.commandsToReset) {
    await tx.collectionItem.update({
      where: { collection_id: { collection: 'commandes', id: command.id } },
      data: { data: { ...(command.data || {}), statut: 'En traitement' } },
    });
  }

  const arrivalsDeleted = (await tx.collectionItem.deleteMany({
    where: { collection: 'arrivages', code: { in: codes } },
  })).count;
  const auditDeleted = (await tx.auditLog.deleteMany({ where: { dossier: { in: codes } } })).count;
  const notificationDeleted = plan.notificationsToDelete.length
    ? (await tx.notificationItem.deleteMany({
      where: { id: { in: plan.notificationsToDelete.map(row => row.id) } },
    })).count
    : 0;

  return {
    arrivalsDeleted,
    ownedDeleted,
    documentsDeleted,
    recordsDetached: detached,
    commandsReset: plan.commandsToReset.length,
    auditDeleted,
    notificationDeleted,
  };
}

async function main() {
  const codes = targetCodes();
  const preview = await inspect(prisma, codes);
  console.info(JSON.stringify({ mode: APPLY ? 'APPLY' : 'PREVIEW', ...summary(preview) }, null, 2));

  if (!APPLY) {
    console.info(`Aucune écriture. Pour appliquer: node scripts/delete_arrivages_range.js --apply --confirm ${REQUIRED_CONFIRMATION}`);
    return;
  }
  if (CONFIRMATION !== REQUIRED_CONFIRMATION) {
    throw new Error(`Confirmation requise: --confirm ${REQUIRED_CONFIRMATION}`);
  }

  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026, 246)`;
    const current = await inspect(tx, codes);
    return applyPlan(tx, current, codes);
  }, { maxWait: 10_000, timeout: 120_000 });

  console.info(JSON.stringify({ status: 'done', range: `${FROM_CODE} -> ${TO_CODE}`, ...result }, null, 2));
  console.info('Les fichiers physiques uploadés ont été conservés pour permettre une récupération.');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
