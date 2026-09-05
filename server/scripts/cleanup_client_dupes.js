/**
 * cleanup_client_dupes.js — one-off fix for existing `clients` records
 * created before /api/sync/ultex/dossier matched clients by identity
 * (codeClientUltex / phone) instead of by ultexDossierId. That bug made
 * every returning client's 2nd/3rd dossier create a brand-new duplicate
 * "C000xxx" client instead of updating the one that already existed.
 *
 * This script does NOT touch the sync route itself (already fixed in
 * server/src/index.js) -- it only cleans up data that already exists:
 *
 *   1. For each real ULTEX client (looked up by phone, via a direct
 *      connection to ULTEX's own Postgres database), find the matching CRM
 *      client record(s) by the same phone number.
 *   2. If there's exactly one CRM record for that phone: rename its code to
 *      the real ULTEX code (e.g. "C000614" -> "A201"), if it doesn't
 *      already match.
 *   3. If there's more than one CRM record for that phone (an actual
 *      duplicate pair/group): merge them into a single record. The keeper
 *      gets the real ULTEX code (or, if ULTEX has no code for that phone
 *      yet, keeps its own existing code); the other record(s) are deleted;
 *      any `contacts` record pointing at a deleted client's code via
 *      codeClientAssocie is repointed to the keeper's new code.
 *
 * demandes/dossiers reference their client by NAME (client.data.nom), not
 * by code -- see the comment in index.js's /api/sync/ultex/dossier route --
 * so they need no repointing here.
 *
 * A client's `id` is its real Prisma primary key (not just the `code`
 * column), so "renaming" a code means delete + recreate with the new id,
 * preserving createdAt and merging in any data from records being deleted.
 *
 * Usage:
 *   node scripts/cleanup_client_dupes.js            # dry run (default) --
 *                                                    # prints the plan, no writes
 *   node scripts/cleanup_client_dupes.js --apply     # actually executes it
 *
 * Requires ULTEX_DATABASE_URL in .env (ULTEX's own backend/.env
 * DATABASE_URL value -- both apps' Postgres instances are commonly on the
 * same local server during dev, so this just opens a second, read-only
 * connection to ULTEX's own `clients` table for phone->code lookups).
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import pg from 'pg';
const { Client: PgClient } = pg;

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

function digits(phone) {
  if (!phone) return null;
  const d = String(phone).replace(/\D/g, '');
  return d || null;
}

async function loadUltexPhoneCodeMap() {
  const url = process.env.ULTEX_DATABASE_URL;
  if (!url) {
    throw new Error('ULTEX_DATABASE_URL not set in .env -- see script header comment.');
  }
  const pg = new PgClient({ connectionString: url });
  await pg.connect();
  try {
    const { rows } = await pg.query(
      `SELECT phone, code FROM clients WHERE code IS NOT NULL AND phone IS NOT NULL`
    );
    const map = new Map();
    for (const row of rows) {
      const d = digits(row.phone);
      if (d) map.set(d, row.code);
    }
    return map;
  } finally {
    await pg.end();
  }
}

function mergeData(records, target) {
  // target = the keeper's own data, mutated in place with any blanks
  // filled from the other records (keeper's own non-empty values always win).
  const merged = { ...target };
  for (const r of records) {
    for (const [k, v] of Object.entries(r.data)) {
      if ((merged[k] === undefined || merged[k] === null || merged[k] === '') && v) {
        merged[k] = v;
      }
    }
  }
  return merged;
}

async function main() {
  const ultexMap = await loadUltexPhoneCodeMap();
  console.log(`Loaded ${ultexMap.size} ULTEX phone->code pairs.\n`);

  const clients = await prisma.collectionItem.findMany({
    where: { collection: 'clients' },
    orderBy: { createdAt: 'asc' },
  });

  const groups = new Map(); // normalized phone -> [records]
  const noPhone = [];
  for (const c of clients) {
    const d = digits(c.data && c.data.telephone);
    if (!d) { noPhone.push(c); continue; }
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(c);
  }

  const plan = []; // { type: 'rename'|'merge', ... }

  for (const [phone, records] of groups) {
    const ultexCode = ultexMap.get(phone) || null;

    if (records.length === 1) {
      const r = records[0];
      if (ultexCode && r.code !== ultexCode) {
        plan.push({ type: 'rename', record: r, newCode: ultexCode });
      }
      continue;
    }

    // Duplicate group. Prefer, as keeper: a record whose code already
    // equals the ULTEX code; else the earliest created (records is already
    // sorted ascending by createdAt from the query above).
    let keeper = records.find((r) => ultexCode && r.code === ultexCode) || records[0];
    const others = records.filter((r) => r.id !== keeper.id);
    const targetCode = ultexCode || keeper.code;

    plan.push({
      type: 'merge',
      keeper,
      others,
      targetCode,
      mergedData: mergeData(others, keeper.data),
    });
  }

  if (noPhone.length) {
    console.log(`${noPhone.length} client record(s) have no phone number -- skipped (can't match to ULTEX or detect duplicates): ${noPhone.map((r) => r.code).join(', ')}\n`);
  }

  console.log('=== Clients ===\n');
  if (!plan.length) {
    console.log('Nothing to do -- no renames or merges needed.\n');
  } else {
    console.log(`Plan (${plan.length} action(s)):\n`);
    for (const item of plan) {
      if (item.type === 'rename') {
        console.log(`  RENAME  ${item.record.code}  ->  ${item.newCode}   (${item.record.data.nom || '—'})`);
      } else {
        const oldCodes = item.others.map((r) => r.code).join(', ');
        console.log(`  MERGE   [${item.keeper.code}, ${oldCodes}]  ->  ${item.targetCode}   (${item.keeper.data.nom || '—'})`);
      }
    }
    console.log('');

    if (APPLY) {
      for (const item of plan) {
        await prisma.$transaction(async (tx) => {
          if (item.type === 'rename') {
            const r = item.record;
            await tx.collectionItem.delete({ where: { collection_id: { collection: 'clients', id: r.id } } });
            await tx.collectionItem.create({
              data: {
                collection: 'clients', id: item.newCode, code: item.newCode,
                data: { ...r.data, id: item.newCode, code: item.newCode, codeClientUltex: item.newCode },
                createdAt: r.createdAt,
              },
            });
            await repointContacts(tx, [r.code], item.newCode);
          } else {
            const { keeper, others, targetCode, mergedData } = item;
            for (const o of others) {
              await tx.collectionItem.delete({ where: { collection_id: { collection: 'clients', id: o.id } } });
            }
            if (keeper.code === targetCode) {
              await tx.collectionItem.update({
                where: { collection_id: { collection: 'clients', id: keeper.id } },
                data: { data: { ...mergedData, id: targetCode, code: targetCode, codeClientUltex: targetCode } },
              });
            } else {
              await tx.collectionItem.delete({ where: { collection_id: { collection: 'clients', id: keeper.id } } });
              await tx.collectionItem.create({
                data: {
                  collection: 'clients', id: targetCode, code: targetCode,
                  data: { ...mergedData, id: targetCode, code: targetCode, codeClientUltex: targetCode },
                  createdAt: keeper.createdAt,
                },
              });
            }
            const oldCodes = [keeper.code, ...others.map((r) => r.code)].filter((c) => c !== targetCode);
            await repointContacts(tx, oldCodes, targetCode);
          }
        });
        console.log(`Applied: ${item.type === 'rename' ? `${item.record.code} -> ${item.newCode}` : `merge -> ${item.targetCode}`}`);
      }
    } else {
      console.log('Dry run only -- no changes made.');
    }
  }

  // --- Contacts: same duplication bug (one per dossier instead of one per
  // client), already fixed going forward in index.js's sync route -- this
  // merges the pre-existing duplicates the same way the clients above were
  // merged, but keyed by codeClientAssocie (falling back to phone), since
  // no other collection references a contact by code (checked modules.js --
  // nothing has {t:"ref", coll:"contacts"}), so no repointing is needed.
  console.log('\n=== Contacts ===\n');
  const contacts = await prisma.collectionItem.findMany({
    where: { collection: 'contacts' },
    orderBy: { createdAt: 'asc' },
  });
  const contactGroups = new Map();
  const contactNoKey = [];
  for (const c of contacts) {
    const key = c.data.codeClientAssocie || digits(c.data.telephone);
    if (!key) { contactNoKey.push(c); continue; }
    if (!contactGroups.has(key)) contactGroups.set(key, []);
    contactGroups.get(key).push(c);
  }
  const contactPlan = [];
  for (const records of contactGroups.values()) {
    if (records.length < 2) continue;
    const keeper = records[0];
    const others = records.slice(1);
    contactPlan.push({ keeper, others, mergedData: mergeData(others, keeper.data) });
  }

  if (contactNoKey.length) {
    console.log(`${contactNoKey.length} contact record(s) have neither codeClientAssocie nor phone -- skipped: ${contactNoKey.map((r) => r.code).join(', ')}\n`);
  }

  if (!contactPlan.length) {
    console.log('Nothing to do -- no duplicate contacts found.');
  } else {
    console.log(`Plan (${contactPlan.length} merge(s)):\n`);
    for (const item of contactPlan) {
      const oldCodes = item.others.map((r) => r.code).join(', ');
      console.log(`  MERGE   [${item.keeper.code}, ${oldCodes}]  ->  ${item.keeper.code}   (${item.keeper.data.nom || '—'})`);
    }
    console.log('');

    if (APPLY) {
      for (const item of contactPlan) {
        await prisma.$transaction(async (tx) => {
          for (const o of item.others) {
            await tx.collectionItem.delete({ where: { collection_id: { collection: 'contacts', id: o.id } } });
          }
          await tx.collectionItem.update({
            where: { collection_id: { collection: 'contacts', id: item.keeper.id } },
            data: { data: item.mergedData },
          });
        });
        console.log(`Applied: merge -> ${item.keeper.code}`);
      }
    } else {
      console.log('Dry run only -- no changes made.');
    }
  }

  console.log(`\n${APPLY ? 'Done.' : 'Re-run with --apply to execute the plan(s) above.'}`);
}

async function repointContacts(tx, oldCodes, newCode) {
  if (!oldCodes.length) return;
  const contacts = await tx.collectionItem.findMany({
    where: { collection: 'contacts', data: { path: ['codeClientAssocie'], not: null } },
  });
  for (const c of contacts) {
    if (oldCodes.includes(c.data.codeClientAssocie)) {
      await tx.collectionItem.update({
        where: { collection_id: { collection: 'contacts', id: c.id } },
        data: { data: { ...c.data, codeClientAssocie: newCode } },
      });
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
