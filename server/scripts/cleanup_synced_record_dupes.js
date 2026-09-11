/**
 * Merge duplicate CRM rows representing the exact same synchronized ULTEX
 * object. CRM-only: no connection to the Workflow database is required.
 *
 * Usage:
 *   node scripts/cleanup_synced_record_dupes.js
 *   node scripts/cleanup_synced_record_dupes.js --apply
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

function mergeData(records, target) {
  const merged = { ...target };
  for (const record of records) {
    for (const [key, value] of Object.entries(record.data || {})) {
      if ((merged[key] === undefined || merged[key] === null || merged[key] === '') && value) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

async function repointReferences(tx, oldCodes, newCode, fields) {
  const allRecords = await tx.collectionItem.findMany();
  for (const record of allRecords) {
    const data = { ...(record.data || {}) };
    let changed = false;
    for (const field of fields) {
      if (oldCodes.includes(data[field])) {
        data[field] = newCode;
        changed = true;
      } else if (Array.isArray(data[field])) {
        const replaced = [...new Set(data[field].map(v => oldCodes.includes(v) ? newCode : v))];
        if (JSON.stringify(replaced) !== JSON.stringify(data[field])) {
          data[field] = replaced;
          changed = true;
        }
      }
    }
    if (changed) {
      await tx.collectionItem.update({
        where: { collection_id: { collection: record.collection, id: record.id } },
        data: { data },
      });
    }
  }
}

async function mergeCollection(collection, identityField, referenceFields) {
  const records = await prisma.collectionItem.findMany({
    where: { collection },
    orderBy: { createdAt: 'asc' },
  });
  const groups = new Map();
  for (const record of records) {
    const identity = record.data?.[identityField];
    if (!identity) continue;
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity).push(record);
  }
  const duplicateGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1);
  console.log(`\n${collection}: ${duplicateGroups.length} duplicate group(s)`);
  for (const [identity, rows] of duplicateGroups) {
    const keeper = rows[0];
    const duplicates = rows.slice(1);
    console.log(`  MERGE [${rows.map(r => r.code).join(', ')}] -> ${keeper.code} (${identity})`);
    if (!APPLY) continue;
    await prisma.$transaction(async tx => {
      await tx.collectionItem.update({
        where: { collection_id: { collection, id: keeper.id } },
        data: { data: { ...mergeData(duplicates, keeper.data), id: keeper.code, code: keeper.code } },
      });
      await repointReferences(tx, duplicates.map(r => r.code), keeper.code, referenceFields);
      for (const duplicate of duplicates) {
        await tx.collectionItem.delete({
          where: { collection_id: { collection, id: duplicate.id } },
        });
      }
    });
  }
}

async function main() {
  await mergeCollection('demandes', 'ultexDossierId', ['demande', 'source_demande_id']);
  await mergeCollection('dossiers', 'ultexDossierId', ['dossier', 'dossiers']);
  await mergeCollection('documents', 'ultexDocumentId', ['document', 'documents']);
  console.log(APPLY ? '\nDone.' : '\nDry run only. Re-run with --apply after checking every merge.');
}

main()
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
