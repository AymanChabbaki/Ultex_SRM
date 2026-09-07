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
    // Secondary index on the last 9 digits (the national number), because
    // the same person can be stored as 0661146626 here and 212661146626 in
    // the CRM -- stripping non-digits alone still leaves those unequal.
    // Only kept where those 9 digits identify exactly ONE ULTEX client, so
    // an ambiguous suffix never silently renames the wrong record.
    const parSuffixe = new Map();
    const suffixesAmbigus = new Set();
    for (const row of rows) {
      const d = digits(row.phone);
      if (!d) continue;
      map.set(d, row.code);
      if (d.length >= 9) {
        const suffixe = d.slice(-9);
        const connu = parSuffixe.get(suffixe);
        if (connu && connu !== row.code) suffixesAmbigus.add(suffixe);
        parSuffixe.set(suffixe, row.code);
      }
    }
    for (const s of suffixesAmbigus) parSuffixe.delete(s);
    return { map, parSuffixe };
  } finally {
    await pg.end();
  }
}

// Exact digit match first, then the unambiguous last-9 fallback.
function chercherCodeUltex(ultex, phoneDigits) {
  if (!phoneDigits) return null;
  const exact = ultex.map.get(phoneDigits);
  if (exact) return exact;
  if (phoneDigits.length >= 9) {
    return ultex.parSuffixe.get(phoneDigits.slice(-9)) || null;
  }
  return null;
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
  const ultex = await loadUltexPhoneCodeMap();
  console.log(`Loaded ${ultex.map.size} ULTEX phone->code pairs (${ultex.parSuffixe.size} usable by national number).\n`);

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
    const ultexCode = chercherCodeUltex(ultex, phone);

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

  // Any client still carrying a CRM-generated placeholder ("C000663") that
  // this run is NOT going to rename is worth explaining -- silently leaving
  // it looks like the script did nothing, when the real cause is upstream.
  const placeholders = clients.filter((c) => /^C\d{6}$/.test(c.code || ''));
  const aRenommer = new Set(plan.filter((p) => p.type === 'rename').map((p) => p.record.id));
  const inexpliques = placeholders.filter((c) => !aRenommer.has(c.id));
  if (inexpliques.length) {
    console.log('=== Codes provisoires non résolus ===\n');
    for (const c of inexpliques) {
      const d = digits(c.data.telephone);
      let raison;
      if (!d) raison = 'aucun téléphone sur la fiche CRM';
      else if (chercherCodeUltex(ultex, d)) raison = 'code trouvé mais fusion en cours';
      else if (d.length >= 9 && ultex.parSuffixe.has(d.slice(-9))) raison = 'numéro ambigu dans ULTEX';
      else raison = "aucun client ULTEX avec ce numéro n'a de code (Client.code est vide)";
      console.log(`  ${c.code}  "${c.data.nom}"  ${c.data.telephone || '—'}  ->  ${raison}`);
    }
    console.log('');
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

  // --- demandes/dossiers client refs: fix name -> code ---------------------
  // demandes.client / dossiers.client are {t:"ref", coll:"clients", cle:"nom"}
  // fields -- `cle` is only the DISPLAY key (see refLabel()/SearchableSelect
  // .jsx's onChange(o.code)); the stored value must be the client's CODE.
  // The sync route stored the client's NAME there until this was caught
  // (see index.js's /api/sync/ultex/dossier), which silently broke
  // FicheClient's "Dossiers Import"/"Demandes & Consultations" tabs (they
  // filter by d.client === code) for every dossier/demande synced before
  // the fix. This re-fetches clients fresh (after any renames/merges above)
  // and repairs any record still holding a name instead of a code.
  console.log('\n=== Demandes/Dossiers client refs (name -> code) ===\n');
  const freshClients = await prisma.collectionItem.findMany({ where: { collection: 'clients' } });
  const codeSet = new Set(freshClients.map((c) => c.code));
  const byNom = new Map(freshClients.map((c) => [c.data.nom, c.code]));

  for (const coll of ['demandes', 'dossiers']) {
    const records = await prisma.collectionItem.findMany({ where: { collection: coll } });
    const refPlan = [];
    for (const r of records) {
      const current = r.data.client;
      if (!current || codeSet.has(current)) continue; // already a valid code, or unset
      const targetCode = r.data.codeClientUltex || byNom.get(current) || null;
      if (targetCode && codeSet.has(targetCode)) {
        refPlan.push({ record: r, oldVal: current, newVal: targetCode });
      }
    }
    if (!refPlan.length) {
      console.log(`${coll}: nothing to fix.`);
      continue;
    }
    console.log(`${coll}: ${refPlan.length} record(s) to fix:`);
    for (const item of refPlan) {
      console.log(`  ${item.record.code}   "${item.oldVal}"  ->  ${item.newVal}`);
    }
    if (APPLY) {
      for (const item of refPlan) {
        await prisma.collectionItem.update({
          where: { collection_id: { collection: coll, id: item.record.id } },
          data: { data: { ...item.record.data, client: item.newVal } },
        });
      }
      console.log(`Applied ${refPlan.length} fix(es) in ${coll}.`);
    }
  }
  if (!APPLY) {
    console.log('\nDry run only for this section too -- re-run with --apply to execute.');
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
