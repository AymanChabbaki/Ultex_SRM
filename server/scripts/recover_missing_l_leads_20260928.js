/**
 * Recover three missing Google Sheets leads with their authoritative L codes.
 *
 * Preview (default):
 *   node scripts/recover_missing_l_leads_20260928.js
 * Apply:
 *   node scripts/recover_missing_l_leads_20260928.js --apply --confirm recover-L6964-L6969-L6970
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const confirmationIndex = process.argv.indexOf('--confirm');
const CONFIRMATION = confirmationIndex >= 0 ? String(process.argv[confirmationIndex + 1] || '') : '';
const REQUIRED_CONFIRMATION = 'recover-L6964-L6969-L6970';

const LEADS = [
  {
    row: 346,
    code: 'L6964',
    date: '2026-09-27',
    nom: 'Mouad',
    societe: 'Mom',
    email: 'mouadalami18@gmail.com',
    telephone: '212693387179',
    volumeImportation: "C'est ma première importation",
    fournisseurFiable: "Non, j'ai besoin que vous trouviez le bon produit/usine pour moi (Sourcing).",
    frustrationActuelle: "Les frais imprévus à l'arrivée (taxes, pénalités).",
    produit: 'Freeze dryer',
  },
  {
    row: 352,
    code: 'L6969',
    date: '2026-09-28',
    nom: 'Said bery',
    societe: 'Sos wood',
    email: 'soswood520@gmail.com',
    telephone: '212677317625',
    volumeImportation: "C'est ma première importation",
    fournisseurFiable: "Non, j'ai besoin que vous trouviez le bon produit/usine pour moi (Sourcing).",
    frustrationActuelle: "Les frais imprévus à l'arrivée (taxes, pénalités).",
    produit: 'اكسسوارات الالومنيوم',
  },
  {
    row: 353,
    code: 'L6970',
    date: '2026-09-28',
    nom: 'Good Manufacter lab',
    societe: 'Good manufacter lab',
    email: 'gmlab.mp@gmail.com',
    telephone: '212661484493',
    volumeImportation: "C'est ma première importation",
    fournisseurFiable: "Non, j'ai besoin que vous trouviez le bon produit/usine pour moi (Sourcing).",
    frustrationActuelle: 'Le manque de communication et les retards.',
    produit: 'Machine rotative automatique fait le remplissage la soudure des tubes produits cosmétiques de 5ml à 300ml',
  },
].map(lead => ({
  ...lead,
  sheetLeadId: `recovery:data-sheet:${lead.row}:${lead.date}`,
  createdAt: new Date(`${lead.date}T12:00:00.000Z`),
}));

function normalizePhone(value) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (/^0[67]\d{8}$/.test(phone)) phone = `212${phone.slice(1)}`;
  if (/^[67]\d{8}$/.test(phone)) phone = `212${phone}`;
  return phone;
}

async function nextCode(tx, prefix) {
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const sequence = await tx.sequenceCounter.upsert({
      where: { key: prefix },
      create: { key: prefix, val: 1 },
      update: { val: { increment: 1 } },
    });
    const code = `${prefix}${String(sequence.val).padStart(6, '0')}`;
    const used = await tx.collectionItem.findUnique({ where: { id: code }, select: { id: true } });
    if (!used) return code;
  }
  throw new Error(`Impossible de générer un code ${prefix} libre.`);
}

async function createItem(tx, collection, prefix, values, createdAt) {
  const code = await nextCode(tx, prefix);
  return tx.collectionItem.create({
    data: { collection, id: code, code, data: { ...values, id: code, code }, createdAt },
  });
}

async function inspectLead(db, lead) {
  const [clientByCode, clients, demande, line] = await Promise.all([
    db.collectionItem.findFirst({
      where: {
        collection: 'clients',
        OR: [
          { id: lead.code },
          { code: lead.code },
          { data: { path: ['codeClientUltex'], equals: lead.code } },
        ],
      },
    }),
    db.collectionItem.findMany({ where: { collection: 'clients' } }),
    db.collectionItem.findFirst({
      where: { collection: 'demandes', data: { path: ['sheetLeadId'], equals: lead.sheetLeadId } },
    }),
    db.collectionItem.findFirst({
      where: { collection: 'demandeLignes', data: { path: ['sheetLeadId'], equals: lead.sheetLeadId } },
    }),
  ]);
  const phoneOwner = clients.find(client => normalizePhone(client.data?.telephone) === lead.telephone);
  if (clientByCode) {
    const samePhone = normalizePhone(clientByCode.data?.telephone) === lead.telephone;
    if (!samePhone) {
      throw new Error(`Sécurité: ${lead.code} appartient déjà à ${clientByCode.data?.nom || 'un autre client'} (${clientByCode.data?.telephone || 'sans téléphone'}).`);
    }
  }
  if (phoneOwner && phoneOwner.code !== lead.code) {
    throw new Error(`Sécurité: le téléphone ${lead.telephone} appartient déjà à ${phoneOwner.code} (${phoneOwner.data?.nom || 'client sans nom'}).`);
  }
  if (demande && String(demande.data?.client || '') !== lead.code) {
    throw new Error(`Sécurité: la demande de récupération ${lead.sheetLeadId} appartient déjà à ${demande.data?.client || 'un autre client'}.`);
  }
  return {
    code: lead.code,
    client: clientByCode ? 'exists' : 'create',
    contact: clientByCode ? 'ensure' : 'create',
    demande: demande ? `exists:${demande.code}` : 'create',
    ligne: line ? `exists:${line.code}` : 'create',
  };
}

async function applyLead(tx, lead) {
  const plan = await inspectLead(tx, lead);
  let client = await tx.collectionItem.findFirst({
    where: {
      collection: 'clients',
      OR: [
        { id: lead.code },
        { code: lead.code },
        { data: { path: ['codeClientUltex'], equals: lead.code } },
      ],
    },
  });
  if (!client) {
    const notes = [
      `Volume d’importation : ${lead.volumeImportation}`,
      `Fournisseur fiable : ${lead.fournisseurFiable}`,
      `Frustration actuelle : ${lead.frustrationActuelle}`,
    ].join('\n');
    client = await tx.collectionItem.create({
      data: {
        collection: 'clients', id: lead.code, code: lead.code, createdAt: lead.createdAt,
        data: {
          id: lead.code, code: lead.code, codeClientUltex: lead.code,
          nom: lead.nom, societe: lead.societe, email: lead.email,
          telephone: lead.telephone, whatsapp: lead.telephone,
          segment: 'Prospect', sourceDonnees: 'Google Sheets', sourcePremierContact: 'Google Sheets',
          datePremierContact: lead.date, dateDerniereDemande: lead.date, dateEntreeData: lead.date,
          nbRelances: 0, dataTag: '', sheetLeadId: lead.sheetLeadId,
          remarque: notes, importSourceRow: lead.row,
        },
      },
    });
  }

  let contact = await tx.collectionItem.findFirst({
    where: { collection: 'contacts', data: { path: ['codeClientAssocie'], equals: lead.code } },
  });
  if (!contact) {
    contact = await createItem(tx, 'contacts', 'CT', {
      nom: lead.nom, telephone: lead.telephone, whatsapp: lead.telephone,
      email: lead.email, typeContact: 'Client', codeClientAssocie: lead.code,
      sourceDonnees: 'Google Sheets', sheetLeadId: lead.sheetLeadId,
    }, lead.createdAt);
  }

  let demande = await tx.collectionItem.findFirst({
    where: { collection: 'demandes', data: { path: ['sheetLeadId'], equals: lead.sheetLeadId } },
  });
  if (!demande) {
    const notes = [
      `Société : ${lead.societe}`,
      `Volume d’importation : ${lead.volumeImportation}`,
      `Fournisseur fiable : ${lead.fournisseurFiable}`,
      `Frustration actuelle : ${lead.frustrationActuelle}`,
    ].join('\n');
    demande = await createItem(tx, 'demandes', 'DMD', {
      sheetLeadId: lead.sheetLeadId, client: lead.code, codeClientUltex: lead.code,
      dateDemande: lead.date, dateHeureReception: lead.createdAt.toISOString(),
      source: 'Google', canalReception: 'Google Sheets', sourceSynchronisation: 'Google Sheets',
      createdManually: false, responsableData: 'Data', objectifGeneral: lead.produit,
      statut: 'Nouvelle', urgence: 'Normale', remarqueGenerale: notes,
      sheetSourceData: {
        nom: lead.nom, societe: lead.societe, email: lead.email,
        telephone: lead.telephone, produit: lead.produit,
        volumeImportation: lead.volumeImportation, fournisseurFiable: lead.fournisseurFiable,
        frustrationActuelle: lead.frustrationActuelle,
      },
      importSourceRow: lead.row,
    }, lead.createdAt);
  }

  let line = await tx.collectionItem.findFirst({
    where: { collection: 'demandeLignes', data: { path: ['sheetLeadId'], equals: lead.sheetLeadId } },
  });
  if (!line) {
    line = await createItem(tx, 'demandeLignes', 'DL', {
      sheetLeadId: lead.sheetLeadId, demande: demande.code,
      referenceMetier: `P1-${lead.code}`, nomProduit: lead.produit,
      designationTechnique: lead.produit, statutFournisseur: 'À rechercher',
      statut: 'Brouillon', sourceSynchronisation: 'Google Sheets', ts: lead.createdAt.getTime(),
    }, lead.createdAt);
  }
  return { ...plan, contact: contact.code, demande: demande.code, ligne: line.code };
}

async function main() {
  const preview = [];
  for (const lead of LEADS) preview.push(await inspectLead(prisma, lead));
  console.info(JSON.stringify({ mode: APPLY ? 'APPLY' : 'PREVIEW', leads: preview }, null, 2));
  if (!APPLY) {
    console.info(`Aucune écriture. Pour appliquer: node scripts/recover_missing_l_leads_20260928.js --apply --confirm ${REQUIRED_CONFIRMATION}`);
    return;
  }
  if (CONFIRMATION !== REQUIRED_CONFIRMATION) {
    throw new Error(`Confirmation requise: --confirm ${REQUIRED_CONFIRMATION}`);
  }

  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(6912, 2026)`;
    const inserted = [];
    for (const lead of LEADS) inserted.push(await applyLead(tx, lead));
    const highest = Math.max(...LEADS.map(lead => Number(lead.code.slice(1))));
    const counter = await tx.sequenceCounter.findUnique({ where: { key: 'L' } });
    if (!counter) await tx.sequenceCounter.create({ data: { key: 'L', val: highest } });
    else if (counter.val < highest) await tx.sequenceCounter.update({ where: { key: 'L' }, data: { val: highest } });
    return inserted;
  }, { maxWait: 30000, timeout: 120000 });
  console.info(JSON.stringify({ status: 'done', leads: result }, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
