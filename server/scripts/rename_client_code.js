import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const valueAfter = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? String(args[index + 1] || '').trim().toUpperCase() : '';
};

const oldCode = valueAfter('--old');
const newCode = valueAfter('--new');
const apply = args.includes('--apply');

if (!oldCode || !newCode || oldCode === newCode) {
  console.error('Usage: node scripts/rename_client_code.js --old C000667 --new 9593 [--apply]');
  process.exitCode = 1;
} else {
  try {
    const client = await prisma.collectionItem.findFirst({
      where: { collection: 'clients', OR: [{ id: oldCode }, { code: oldCode }] }
    });
    if (!client) throw new Error(`Client ${oldCode} introuvable.`);

    const conflict = await prisma.collectionItem.findFirst({
      where: {
        OR: [
          { id: newCode },
          { collection: 'clients', code: newCode },
          { collection: 'clients', data: { path: ['codeClientUltex'], equals: newCode } }
        ],
        NOT: { id: client.id }
      }
    });
    if (conflict) throw new Error(`Le code ${newCode} est déjà utilisé (${conflict.collection}/${conflict.id}).`);

    console.info(`${apply ? 'APPLY' : 'PREVIEW'}: ${oldCode} -> ${newCode} (${client.data?.nom || 'client'})`);
    if (!apply) {
      console.info('Relancez avec --apply pour effectuer la correction.');
    } else {
      const counts = await prisma.$transaction(async tx => {
        const updatedClient = await tx.$executeRaw(Prisma.sql`
          UPDATE collection_items
          SET id = ${newCode}, code = ${newCode},
              data = jsonb_set(jsonb_set(data, '{code}', to_jsonb(${newCode}::text), true), '{codeClientUltex}', to_jsonb(${newCode}::text), true)
          WHERE id = ${client.id} AND collection = 'clients'
        `);
        const references = {};
        for (const key of ['client', 'codeClientAssocie', 'codeClient', 'clientCode']) {
          references[key] = await tx.$executeRawUnsafe(
            `UPDATE collection_items SET data = jsonb_set(data, '{${key}}', to_jsonb($1::text), false) WHERE data->>$2 = $3`,
            newCode, key, oldCode
          );
        }
        const auditObjects = await tx.auditLog.updateMany({ where: { objet: oldCode }, data: { objet: newCode } });
        return { updatedClient, references, auditObjects: auditObjects.count };
      });
      console.info(JSON.stringify({ status: 'renamed', oldCode, newCode, counts }, null, 2));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
