/**
 * purge_old_client_junk.js — removes CRM records created by past runs of
 * ULTEX's backfill_crm_sync.py before it excluded is_old_client legacy
 * stubs (seeded from the historical CRM spreadsheet by
 * scripts/seed_old_clients.py in ultex_workflow). build_crm_snapshot() now
 * refuses to sync those, so this is only needed once to clean up what
 * already landed here.
 *
 * Identifying them by name ("Client 3911") does NOT work: a stub's name is
 * overwritten with the client's real one as soon as they reply to the
 * reactivation campaign, so plenty of stubs look like "Mohamed Chairi".
 * Their codes are the old CRM's own (4100, 1320, L4326, R1114...), not a
 * recognisable format either. So ULTEX itself is the source of truth.
 *
 * A CRM client is deleted only when BOTH hold:
 *   1. It was created by the sync (its data carries ultexDossierId) --
 *      never touch a client someone entered in the CRM by hand.
 *   2. Its phone, in ULTEX, has ONLY is_old_client stub dossiers and no
 *      real dossier at all.
 *
 * Rule 2 is the important one: a reactivated old client keeps their legacy
 * code (see _legacy_code_for_phone in reference_code.py) but gains real
 * dossiers, and they are a genuine active client who must be kept. Phones
 * ULTEX has never heard of are left alone too.
 *
 * Deletes, for each purged client: the client, its contacts (linked via
 * codeClientAssocie) and its demandes/dossiers/documents (linked via the
 * code-based `client` field).
 *
 * Requires ULTEX_DATABASE_URL in .env (same value cleanup_client_dupes.js
 * uses).
 *
 * Usage:
 *   node scripts/purge_old_client_junk.js            # dry run (default)
 *   node scripts/purge_old_client_junk.js --apply     # actually delete
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

// phone -> { hasStub, hasReal } straight from ULTEX's dossiers table.
async function loadUltexPhoneFacts() {
  const url = process.env.ULTEX_DATABASE_URL;
  if (!url) {
    throw new Error('ULTEX_DATABASE_URL not set in .env -- see the script header.');
  }
  const client = new PgClient({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT phone,
             BOOL_OR(is_old_client) AS has_stub,
             BOOL_OR(NOT is_old_client) AS has_real
      FROM dossiers
      WHERE phone IS NOT NULL
      GROUP BY phone
    `);
    const map = new Map();
    for (const row of rows) {
      const d = digits(row.phone);
      if (!d) continue;
      // Same phone can appear under several raw formats -- merge them.
      const prev = map.get(d) || { hasStub: false, hasReal: false };
      map.set(d, {
        hasStub: prev.hasStub || row.has_stub === true,
        hasReal: prev.hasReal || row.has_real === true,
      });
    }
    return map;
  } finally {
    await client.end();
  }
}

// ULTEX dossier id -> { isOldClient }, so an orphaned CRM row can be judged
// on what it actually came from rather than on its looks.
async function loadUltexDossiers() {
  const url = process.env.ULTEX_DATABASE_URL;
  if (!url) return new Map();
  const client = new PgClient({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query(`SELECT id, is_old_client FROM dossiers`);
    return new Map(rows.map((r) => [r.id, { isOldClient: r.is_old_client === true }]));
  } finally {
    await client.end();
  }
}

// demandes/dossiers whose `client` code matches no client at all. They show
// a dead code in the lists and can never appear on a client fiche. This
// happens where the client was purged as junk while these rows still stored
// the client's NAME (the name -> code fix came later), so the purge's
// code-based match never caught them.
//
// Only rows the sync created (they carry an ultexDossierId) are considered,
// and only when their ULTEX dossier is an old-client stub or is gone
// entirely. A row still backed by a REAL ULTEX dossier is never deleted --
// its client simply needs recreating, which the next sync of that dossier
// does on its own.
async function collecterOrphelins(codeSet, ultexDossiers) {
  const aSupprimer = [];
  const aResyncer = [];
  for (const collection of ['demandes', 'dossiers']) {
    const rows = await prisma.collectionItem.findMany({ where: { collection } });
    for (const r of rows) {
      const code = r.data.client;
      if (!code || codeSet.has(code)) continue;
      const uid = r.data.ultexDossierId;
      if (!uid) continue; // not ours -- leave manual CRM rows alone
      const ultex = ultexDossiers.get(uid);
      if (!ultex) {
        aSupprimer.push({ collection, record: r, motif: 'dossier supprimé dans ULTEX' });
      } else if (ultex.isOldClient) {
        aSupprimer.push({ collection, record: r, motif: 'stub old-client' });
      } else {
        aResyncer.push({ collection, record: r });
      }
    }
  }
  return { aSupprimer, aResyncer };
}

async function main() {
  const facts = await loadUltexPhoneFacts();
  console.log(`Loaded ULTEX dossier facts for ${facts.size} phone number(s).\n`);

  const clients = await prisma.collectionItem.findMany({ where: { collection: 'clients' } });

  const junk = [];
  let keptActive = 0;
  let keptUnknown = 0;
  let keptManual = 0;

  for (const c of clients) {
    if (!c.data.ultexDossierId) { keptManual += 1; continue; }
    const phone = digits(c.data.telephone);
    const fact = phone ? facts.get(phone) : null;
    if (!fact) { keptUnknown += 1; continue; }
    if (fact.hasReal) { keptActive += 1; continue; }
    if (fact.hasStub) junk.push(c);
  }

  console.log(`Kept: ${keptActive} with real ULTEX dossiers, ${keptUnknown} not found in ULTEX, ${keptManual} created manually in the CRM.`);

  // Rows left behind by an earlier purge, pointing at a client code that no
  // longer exists.
  const codeSetActuel = new Set(clients.map((c) => c.code));
  const ultexDossiers = await loadUltexDossiers();
  const { aSupprimer, aResyncer } = await collecterOrphelins(codeSetActuel, ultexDossiers);

  if (aResyncer.length) {
    console.log(`\n${aResyncer.length} orphan row(s) are still backed by a REAL ULTEX dossier -- NOT deleted.`);
    console.log('Their client just needs recreating: re-sync those dossiers (backfill_crm_sync.py) and they repair themselves.');
    for (const o of aResyncer.slice(0, 10)) {
      console.log(`  ${o.collection} ${o.record.code}  ->  "${o.record.data.client}"`);
    }
  }

  if (aSupprimer.length) {
    console.log(`\n=== Orphan demandes/dossiers to delete (${aSupprimer.length}) ===\n`);
    for (const o of aSupprimer) {
      const libelle = o.record.data.produit || o.record.data.objectifGeneral || '—';
      console.log(`  ${o.collection} ${o.record.code}  ->  "${o.record.data.client}"  (${libelle})  [${o.motif}]`);
    }
    if (APPLY) {
      for (const o of aSupprimer) {
        await prisma.collectionItem.delete({
          where: { collection_id: { collection: o.collection, id: o.record.id } }
        });
      }
      console.log(`\nDeleted ${aSupprimer.length} orphan row(s).`);
    } else {
      console.log('\nDry run -- re-run with --apply to delete these.');
    }
  }

  if (!junk.length) {
    console.log('\nNo legacy-only clients found.');
    return;
  }

  const junkCodes = new Set(junk.map((c) => c.code));
  const [contacts, demandes, dossiers, documents] = await Promise.all([
    prisma.collectionItem.findMany({ where: { collection: 'contacts' } }),
    prisma.collectionItem.findMany({ where: { collection: 'demandes' } }),
    prisma.collectionItem.findMany({ where: { collection: 'dossiers' } }),
    prisma.collectionItem.findMany({ where: { collection: 'documents' } }),
  ]);
  const junkContacts = contacts.filter((r) => junkCodes.has(r.data.codeClientAssocie));
  const junkDemandes = demandes.filter((r) => junkCodes.has(r.data.client));
  const junkDossiers = dossiers.filter((r) => junkCodes.has(r.data.client));
  const junkDocuments = documents.filter((r) => junkCodes.has(r.data.client));

  console.log(`\nTo delete: ${junk.length} client(s), ${junkContacts.length} contact(s), ${junkDemandes.length} demande(s), ${junkDossiers.length} dossier(s), ${junkDocuments.length} document(s).\n`);
  for (const c of junk.slice(0, 30)) {
    console.log(`  ${c.code}   "${c.data.nom}"   ${c.data.telephone || '—'}`);
  }
  if (junk.length > 30) console.log(`  ... and ${junk.length - 30} more`);
  console.log('');

  if (!APPLY) {
    console.log('Dry run only -- no changes made. Re-run with --apply to delete these records.');
    return;
  }

  for (const [collection, rows] of [
    ['documents', junkDocuments],
    ['dossiers', junkDossiers],
    ['demandes', junkDemandes],
    ['contacts', junkContacts],
    ['clients', junk],
  ]) {
    for (const row of rows) {
      await prisma.collectionItem.delete({
        where: { collection_id: { collection, id: row.id } }
      });
    }
    console.log(`Deleted ${rows.length} ${collection} record(s).`);
  }

  console.log('\nDone.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
