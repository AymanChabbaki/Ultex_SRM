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

  if (!junk.length) {
    console.log('\nNothing to do -- no legacy-only clients found.');
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
