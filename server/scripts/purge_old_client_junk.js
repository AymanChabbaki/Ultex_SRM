/**
 * purge_old_client_junk.js — removes CRM records created by past runs of
 * ULTEX's backfill_crm_sync.py before it excluded is_old_client legacy
 * stubs (see scripts/seed_old_clients.py in ultex_workflow -- those rows
 * have a fabricated placeholder name like "Client 3912" and no real ULTEX
 * client code). build_crm_snapshot() now refuses to sync them at all, so
 * this is only needed once to clean up what already landed in the CRM.
 *
 * Junk signature: a client whose nom matches /^Client / AND has no
 * codeClientUltex set. Real synced clients always have codeClientUltex;
 * a real client is extremely unlikely to be named "Client <anything>".
 *
 * Deletes, for each junk client: the client itself, any contacts linked
 * via codeClientAssocie, and any demandes/dossiers whose client field
 * matches (both are code-based -- see the client-ref fix in
 * /api/sync/ultex/dossier). Documents aren't touched: they require a
 * resolved codeClientUltex to sync at all (see build_document_snapshot in
 * crm_sync.py), so none should exist for these.
 *
 * Usage:
 *   node scripts/purge_old_client_junk.js            # dry run (default)
 *   node scripts/purge_old_client_junk.js --apply     # actually delete
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

function isJunk(client) {
  const nom = client.data.nom || '';
  return /^Client\s/.test(nom) && !client.data.codeClientUltex;
}

async function main() {
  const clients = await prisma.collectionItem.findMany({ where: { collection: 'clients' } });
  const junkClients = clients.filter(isJunk);

  if (!junkClients.length) {
    console.log('Nothing to do -- no junk clients found.');
    return;
  }

  const junkCodes = new Set(junkClients.map((c) => c.code));

  const [contacts, demandes, dossiers] = await Promise.all([
    prisma.collectionItem.findMany({ where: { collection: 'contacts' } }),
    prisma.collectionItem.findMany({ where: { collection: 'demandes' } }),
    prisma.collectionItem.findMany({ where: { collection: 'dossiers' } }),
  ]);
  const junkContacts = contacts.filter((c) => junkCodes.has(c.data.codeClientAssocie));
  const junkDemandes = demandes.filter((d) => junkCodes.has(d.data.client));
  const junkDossiers = dossiers.filter((d) => junkCodes.has(d.data.client));

  console.log(`Found ${junkClients.length} junk client(s), ${junkContacts.length} linked contact(s), ${junkDemandes.length} linked demande(s), ${junkDossiers.length} linked dossier(s).\n`);
  for (const c of junkClients.slice(0, 20)) {
    console.log(`  ${c.code}   "${c.data.nom}"   ${c.data.telephone || '—'}`);
  }
  if (junkClients.length > 20) console.log(`  ... and ${junkClients.length - 20} more`);
  console.log('');

  if (!APPLY) {
    console.log('Dry run only -- no changes made. Re-run with --apply to delete these records.');
    return;
  }

  for (const d of junkDossiers) {
    await prisma.collectionItem.delete({ where: { collection_id: { collection: 'dossiers', id: d.id } } });
  }
  for (const d of junkDemandes) {
    await prisma.collectionItem.delete({ where: { collection_id: { collection: 'demandes', id: d.id } } });
  }
  for (const c of junkContacts) {
    await prisma.collectionItem.delete({ where: { collection_id: { collection: 'contacts', id: c.id } } });
  }
  for (const c of junkClients) {
    await prisma.collectionItem.delete({ where: { collection_id: { collection: 'clients', id: c.id } } });
  }

  console.log(`Deleted ${junkClients.length} client(s), ${junkContacts.length} contact(s), ${junkDemandes.length} demande(s), ${junkDossiers.length} dossier(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
