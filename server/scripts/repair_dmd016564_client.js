/**
 * Repair the Thermostat Google Sheets demande that was linked to L6947 even
 * though its submitted phone belongs to the established client L1635.
 *
 * L6947 is a legitimate, unrelated client and is never edited or deleted.
 * Preview:
 *   node scripts/repair_dmd016564_client.js
 * Apply:
 *   node scripts/repair_dmd016564_client.js --apply --confirm move-DMD016564-to-L1635
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const confirmationIndex = process.argv.indexOf('--confirm');
const CONFIRMATION = confirmationIndex >= 0 ? String(process.argv[confirmationIndex + 1] || '') : '';
const REQUIRED_CONFIRMATION = 'move-DMD016564-to-L1635';
const MARKER_KEY = 'REPAIR_DMD016564_CLIENT_20260926';
const DEMANDE_CODE = 'DMD016564';
const SHEET_LEAD_ID = 'gs:1q3Q3V7XdrbFEv7GN_Ek30kI_iQIBKkBksa_Zhsx1NT0:0:5290da31-b832-4f0b-ac74-9588c6a9c5a0';
const WRONG_CLIENT = 'L6947';
const CORRECT_CLIENT = 'L1635';

function normalizePhone(value) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (/^0[67]\d{8}$/.test(phone)) phone = `212${phone.slice(1)}`;
  if (/^[67]\d{8}$/.test(phone)) phone = `212${phone}`;
  return phone;
}

async function clientByCode(db, code) {
  return db.collectionItem.findFirst({
    where: { collection: 'clients', OR: [{ id: code }, { code }] },
  });
}

async function demandeByCode(db) {
  return db.collectionItem.findFirst({
    where: { collection: 'demandes', OR: [{ id: DEMANDE_CODE }, { code: DEMANDE_CODE }] },
  });
}

async function collectPlan(db, { checkMarker = true } = {}) {
  if (checkMarker) {
    const marker = await db.sequenceCounter.findUnique({ where: { key: MARKER_KEY } });
    if (marker) return { alreadyApplied: true, marker: MARKER_KEY };
  }

  const [demande, correctClient, occupiedClient] = await Promise.all([
    demandeByCode(db), clientByCode(db, CORRECT_CLIENT), clientByCode(db, WRONG_CLIENT),
  ]);
  if (!demande) throw new Error(`Demande introuvable: ${DEMANDE_CODE}`);
  if (!correctClient) throw new Error(`Client cible introuvable: ${CORRECT_CLIENT}`);
  if (!occupiedClient) throw new Error(`Client à préserver introuvable: ${WRONG_CLIENT}`);

  const actualSheetLeadId = String(demande.data?.sheetLeadId || '');
  if (actualSheetLeadId !== SHEET_LEAD_ID) {
    throw new Error(`Sécurité: ${DEMANDE_CODE} ne correspond pas à la ligne Google Sheets attendue.`);
  }
  const demandeClient = String(demande.data?.client || '');
  if (![WRONG_CLIENT, CORRECT_CLIENT].includes(demandeClient)) {
    throw new Error(`Sécurité: client actuel inattendu pour ${DEMANDE_CODE}: ${demandeClient || '—'}`);
  }

  const submittedPhone = normalizePhone(
    demande.data?.sheetSourceData?.telephone || demande.data?.telephone || ''
  );
  const correctPhone = normalizePhone(correctClient.data?.telephone);
  const occupiedPhone = normalizePhone(occupiedClient.data?.telephone);
  if (!submittedPhone || submittedPhone !== correctPhone) {
    throw new Error(
      `Sécurité: téléphone soumis ${submittedPhone || '—'} différent de ${CORRECT_CLIENT} (${correctPhone || '—'}).`
    );
  }
  if (submittedPhone === occupiedPhone) {
    throw new Error(`Sécurité: ${WRONG_CLIENT} partage aussi le téléphone soumis; intervention manuelle requise.`);
  }

  const lines = await db.collectionItem.findMany({
    where: {
      collection: 'demandeLignes',
      OR: [
        { data: { path: ['demande'], equals: DEMANDE_CODE } },
        { data: { path: ['sheetLeadId'], equals: SHEET_LEAD_ID } },
      ],
    },
  });
  const wrongContacts = await db.collectionItem.findMany({
    where: {
      collection: 'contacts',
      data: { path: ['codeClientAssocie'], equals: WRONG_CLIENT },
    },
  });
  const matchingContacts = wrongContacts.filter(item => normalizePhone(item.data?.telephone) === submittedPhone);

  return {
    alreadyApplied: demandeClient === CORRECT_CLIENT,
    demande: { code: demande.code, produit: demande.data?.objectifGeneral || '', sheetLeadId: actualSheetLeadId },
    move: `${WRONG_CLIENT} -> ${CORRECT_CLIENT}`,
    proof: {
      submittedPhone,
      correctClient: { code: correctClient.code, name: correctClient.data?.nom || '', phone: correctPhone },
      preservedClient: { code: occupiedClient.code, name: occupiedClient.data?.nom || '', phone: occupiedPhone },
    },
    lineIds: lines.map(item => item.id),
    matchingContactIds: matchingContacts.map(item => item.id),
  };
}

async function main() {
  const plan = await collectPlan(prisma);
  console.info(JSON.stringify({ mode: APPLY ? 'APPLY' : 'PREVIEW', ...plan }, null, 2));
  if (plan.alreadyApplied) {
    console.info('Demande déjà rattachée à L1635; aucune modification.');
    return;
  }
  if (!APPLY) {
    console.info(`Aucune écriture. Pour appliquer: node scripts/repair_dmd016564_client.js --apply --confirm ${REQUIRED_CONFIRMATION}`);
    return;
  }
  if (CONFIRMATION !== REQUIRED_CONFIRMATION) {
    throw new Error(`Confirmation requise: --confirm ${REQUIRED_CONFIRMATION}`);
  }

  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1654, 16564)`;
    const marker = await tx.sequenceCounter.findUnique({ where: { key: MARKER_KEY } });
    if (marker) return { alreadyApplied: true };
    const current = await collectPlan(tx, { checkMarker: false });
    if (current.alreadyApplied) {
      await tx.sequenceCounter.create({ data: { key: MARKER_KEY, val: 1 } });
      return { alreadyApplied: true };
    }

    const demande = await demandeByCode(tx);
    await tx.collectionItem.update({
      where: { collection_id: { collection: 'demandes', id: demande.id } },
      data: { data: { ...demande.data, client: CORRECT_CLIENT, codeClientUltex: CORRECT_CLIENT } },
    });

    for (const id of current.lineIds) {
      const line = await tx.collectionItem.findUnique({ where: { collection_id: { collection: 'demandeLignes', id } } });
      if (!line) continue;
      const data = { ...line.data };
      if (data.referenceMetier?.endsWith(`-${WRONG_CLIENT}`)) {
        data.referenceMetier = `${data.referenceMetier.slice(0, -WRONG_CLIENT.length)}${CORRECT_CLIENT}`;
      }
      if (data.client === WRONG_CLIENT) data.client = CORRECT_CLIENT;
      if (data.codeClientUltex === WRONG_CLIENT) data.codeClientUltex = CORRECT_CLIENT;
      await tx.collectionItem.update({
        where: { collection_id: { collection: 'demandeLignes', id } }, data: { data },
      });
    }

    for (const id of current.matchingContactIds) {
      const contact = await tx.collectionItem.findUnique({ where: { collection_id: { collection: 'contacts', id } } });
      if (!contact) continue;
      await tx.collectionItem.update({
        where: { collection_id: { collection: 'contacts', id } },
        data: { data: { ...contact.data, codeClientAssocie: CORRECT_CLIENT } },
      });
    }

    const correctClient = await clientByCode(tx, CORRECT_CLIENT);
    const requestDate = String(demande.data?.dateDemande || demande.data?.dateHeureReception || '').slice(0, 10);
    const latestDate = [correctClient.data?.dateDerniereDemande || '', requestDate].sort().at(-1);
    await tx.collectionItem.update({
      where: { collection_id: { collection: 'clients', id: correctClient.id } },
      data: { data: { ...correctClient.data, id: CORRECT_CLIENT, code: CORRECT_CLIENT, codeClientUltex: CORRECT_CLIENT, dateDerniereDemande: latestDate } },
    });
    await tx.sequenceCounter.create({ data: { key: MARKER_KEY, val: 1 } });
    return { alreadyApplied: false, demande: DEMANDE_CODE, client: CORRECT_CLIENT, lines: current.lineIds.length, contacts: current.matchingContactIds.length };
  }, { maxWait: 30000, timeout: 120000 });

  console.info(JSON.stringify({ status: 'done', ...result }, null, 2));
  console.info(`Client ${WRONG_CLIENT} préservé. Aucun client et aucune demande supprimés; aucun code L renuméroté.`);
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
