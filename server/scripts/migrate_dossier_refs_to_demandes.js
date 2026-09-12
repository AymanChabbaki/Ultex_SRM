/**
 * Replaces legacy CRM `data.dossier = "DOS..."` relations with the CRM
 * demande synchronized from the same Workflow dossier.
 *
 * Usage:
 *   node scripts/migrate_dossier_refs_to_demandes.js
 *   node scripts/migrate_dossier_refs_to_demandes.js --apply
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const [dossiers, demandes, linkedItems] = await Promise.all([
    prisma.collectionItem.findMany({ where: { collection: 'dossiers' } }),
    prisma.collectionItem.findMany({ where: { collection: 'demandes' } }),
    prisma.collectionItem.findMany()
  ]);

  const demandeByUltexId = new Map(
    demandes
      .filter(item => item.data?.ultexDossierId)
      .map(item => [String(item.data.ultexDossierId), item.code])
  );
  const demandeByLegacyDossier = new Map();
  for (const dossier of dossiers) {
    const ultexId = dossier.data?.ultexDossierId;
    const demandeCode = ultexId ? demandeByUltexId.get(String(ultexId)) : null;
    if (demandeCode) demandeByLegacyDossier.set(dossier.code, demandeCode);
  }

  const changes = [];
  const unresolved = [];
  for (const item of linkedItems) {
    const legacyCode = item.data?.dossier;
    if (!legacyCode) continue;
    const demandeCode = demandeByLegacyDossier.get(legacyCode);
    if (!demandeCode) {
      unresolved.push({ collection: item.collection, code: item.code, dossier: legacyCode });
      continue;
    }
    changes.push({ item, legacyCode, demandeCode });
  }

  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${changes.length} relation(s) à migrer, ${unresolved.length} non résolue(s).`);
  for (const { item, legacyCode, demandeCode } of changes) {
    console.log(`${item.collection}/${item.code}: ${legacyCode} -> ${demandeCode}`);
    if (!apply) continue;
    const { dossier: _legacyDossier, ...data } = item.data || {};
    await prisma.collectionItem.update({
      where: { collection_id: { collection: item.collection, id: item.id } },
      data: { data: { ...data, demande: data.demande || demandeCode } }
    });
  }

  if (unresolved.length) {
    console.log('Relations non résolues (aucune demande synchronisée correspondante):');
    for (const row of unresolved) console.log(`${row.collection}/${row.code}: ${row.dossier}`);
  }
  if (!apply && changes.length) console.log('Relancez avec --apply pour enregistrer ces changements.');
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
