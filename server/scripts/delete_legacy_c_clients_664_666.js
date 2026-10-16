/**
 * Remove the two confirmed legacy C clients shown in the numeric-code page.
 * Preview is the default. The script refuses to delete either client if a
 * demande, commande, document, payment or another business record references
 * it. Only contact rows linked exclusively to that client may be removed with
 * the client.
 *
 * Preview:
 *   node scripts/delete_legacy_c_clients_664_666.js
 * Apply:
 *   node scripts/delete_legacy_c_clients_664_666.js --apply --confirm delete-C000664-C000666
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const confirmationIndex = process.argv.indexOf('--confirm');
const CONFIRMATION = confirmationIndex >= 0 ? String(process.argv[confirmationIndex + 1] || '') : '';
const REQUIRED_CONFIRMATION = 'delete-C000664-C000666';
const REFERENCE_FIELDS = ['client', 'codeClientAssocie', 'codeClient', 'clientCode', 'codeClientUltex'];
const TARGETS = [
  { code: 'C000664', name: 'ouiam elh', phone: '212668744810' },
  { code: 'C000666', name: 'FELIX GERL', phone: '212661042699' },
];

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('fr');
}

function normalizePhone(value) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (/^0[67]\d{8}$/.test(phone)) phone = `212${phone.slice(1)}`;
  if (/^[67]\d{8}$/.test(phone)) phone = `212${phone}`;
  return phone;
}

async function inspect(db) {
  const rows = [];
  for (const target of TARGETS) {
    const client = await db.collectionItem.findFirst({
      where: { collection: 'clients', OR: [{ id: target.code }, { code: target.code }] },
    });
    if (!client) {
      rows.push({ target: target.code, status: 'already_absent', removable: false, references: [] });
      continue;
    }
    const actualName = String(client.data?.nom || '');
    const actualPhone = normalizePhone(client.data?.telephone || client.data?.whatsapp);
    if (normalize(actualName) !== normalize(target.name) || actualPhone !== target.phone) {
      throw new Error(`Sécurité: ${target.code} ne correspond plus au client attendu (${actualName}, ${actualPhone}).`);
    }
    const references = await db.$queryRaw(Prisma.sql`
      SELECT id, code, collection,
             ARRAY_REMOVE(ARRAY[
               CASE WHEN data->>'client' = ${target.code} THEN 'client' END,
               CASE WHEN data->>'codeClientAssocie' = ${target.code} THEN 'codeClientAssocie' END,
               CASE WHEN data->>'codeClient' = ${target.code} THEN 'codeClient' END,
               CASE WHEN data->>'clientCode' = ${target.code} THEN 'clientCode' END,
               CASE WHEN data->>'codeClientUltex' = ${target.code} THEN 'codeClientUltex' END
             ], NULL) AS fields
      FROM collection_items
      WHERE id <> ${client.id}
        AND (${Prisma.join(REFERENCE_FIELDS.map(field => Prisma.sql`data->>${field} = ${target.code}`), ' OR ')})
      ORDER BY collection, code
    `);
    const blocking = references.filter(item => item.collection !== 'contacts');
    rows.push({
      target: target.code,
      name: actualName,
      phone: actualPhone,
      status: blocking.length ? 'blocked_by_business_records' : 'ready',
      removable: blocking.length === 0,
      contactsToDelete: references.filter(item => item.collection === 'contacts').map(item => item.code),
      references,
    });
  }
  return rows;
}

async function main() {
  const preview = await inspect(prisma);
  console.info(JSON.stringify({ mode: APPLY ? 'APPLY' : 'PREVIEW', clients: preview }, null, 2));
  const blocked = preview.filter(item => item.status === 'blocked_by_business_records');
  if (blocked.length) throw new Error(`Suppression bloquée: ${blocked.map(item => item.target).join(', ')} possède encore des enregistrements métier liés.`);
  if (!APPLY) {
    console.info(`Aucune écriture. Pour appliquer: node scripts/delete_legacy_c_clients_664_666.js --apply --confirm ${REQUIRED_CONFIRMATION}`);
    return;
  }
  if (CONFIRMATION !== REQUIRED_CONFIRMATION) throw new Error(`Confirmation requise: --confirm ${REQUIRED_CONFIRMATION}`);

  const deleted = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(664, 666)`;
    const current = await inspect(tx);
    if (current.some(item => item.status === 'blocked_by_business_records')) throw new Error('Les rattachements ont changé depuis le preview; transaction annulée.');
    const result = [];
    for (const item of current.filter(entry => entry.removable)) {
      const contacts = await tx.collectionItem.deleteMany({
        where: {
          collection: 'contacts',
          OR: REFERENCE_FIELDS.map(field => ({ data: { path: [field], equals: item.target } })),
        },
      });
      const client = await tx.collectionItem.deleteMany({
        where: { collection: 'clients', OR: [{ id: item.target }, { code: item.target }] },
      });
      result.push({ code: item.target, clientsDeleted: client.count, contactsDeleted: contacts.count });
    }
    return result;
  });
  console.info(JSON.stringify({ status: 'done', deleted }, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
