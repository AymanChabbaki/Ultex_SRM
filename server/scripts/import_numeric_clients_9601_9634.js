/**
 * Import the historical Data leads 9601..9634 supplied on 2026-10-05.
 *
 * Preview (default):
 *   node scripts/import_numeric_clients_9601_9634.js
 * Apply:
 *   node scripts/import_numeric_clients_9601_9634.js --apply --confirm import-9601-9634
 *
 * The import is idempotent by importSourceId. It creates a client, a linked
 * contact and a demande for every row. A demande line is created only when a
 * product was supplied, so blank products do not pollute the incomplete-line
 * alert. Existing codes/phones with a different identity are reported as
 * conflicts and are never overwritten.
 */
import 'dotenv/config';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const confirmationIndex = process.argv.indexOf('--confirm');
const CONFIRMATION = confirmationIndex >= 0 ? String(process.argv[confirmationIndex + 1] || '') : '';
const REQUIRED_CONFIRMATION = 'import-9601-9634';
const IMPORT_BATCH = 'numeric-data-2026-10-05';

const RAW_LEADS = [
  ['9601', '', 'wtsp imane', '212 603-142175', '', '', 'active mn fixe', '25/09/26', 'Pas de réponse', '30/09/26', 'Activé'],
  ['9602', 'jerome simiot', 'site (email', '33615172255', 'Électricité', 'La Tremblade / Bonjour, Nous devons importer du matériel de France en urgence. Pouvez vous me contacter au 0033615172255 svp. Bonne journée', 'hta yactivi le dossier oy3awd ycontactina', '25/09/26', 'Pas de réponse', '30/09/26', 'Pas Prêt'],
  ['9603', 'AMINA', 'FIXE CASA', '212 667-299067', 'PRËT A PÖRTER', '', 'casa à 11h', '25/09/26', 'En cours', '02/10/26', 'Activé'],
  ['9604', 'aymane tazi', 'wtsp confirmation', '212 665-808302', '', '', 'chine - cote devoir', '25/09/26', 'Faible Qualité', '02/10/26', 'Faible Qualité'],
  ['9605', 'tahir', 'appel', '212 629-059266', '', '', '9613', '26/09/26', 'Pas de réponse', '02/10/26', 'Traité'],
  ['9606', 'achraf dennaoui', 'clics', '212 601-728350', '', '', 'MANA3ESCH ,hta lghda (samedi oysoni lina', '29/09/26', 'Pas de réponse', '30/09/26', 'En cours'],
  ['9607', 'abdellah', 'clics', '212 636-878117', 'mizan / plaque enzo', '', 'yiwu ,170/200PCS   300/100PCS    5000/15 PCS / déja mkhls sel3a', '29/09/26', 'En cours', '30/09/26', 'Activé'],
  ['9608', 'mbarek', 'clics', '212 666-768684', '', '', 'ghysift proforma,machrht lih ela sourcing/ atelier ,agadir', '29/09/26', 'Pas de réponse', '30/09/26', 'Activé'],
  ['9609', '', 'clics', '212 601-262465', '', '', 'MACHI DISPO ,gali nsift lih les infos f audio hta y3awd ysoni', '29/09/26', 'En cours', '30/09/26', 'Activé'],
  ['9610', 'KIFANE Houssam', 'clics', '212 777-371603', "Coussin d'allaitement ergonomique Fronte Home Soft", '', 'active eala sourcing', '28/09/26', 'En cours', '29/09/26', 'Activé'],
  ['9611', 'aziz', 'clics', '212 626-288219', '', '', 'meknes , 1er import , ste construction , ghysift packing list', '29/09/26', 'En cours', '02/10/26', 'Traité'],
  ['9612', '', 'clics', '216 55 270 592', '', '', 'tunsie kayn fmaroc / mzl majawb appel / KHDA NOS ADD', '29/09/26', 'En cours', '02/10/26', 'En cours'],
  ['9613', 'TAHIR', '-', '212 657-059044', '', '', 'COMPTABLE du client L6939 / PROFORMA', '29/09/26', 'Traité', '02/10/26', 'Traité'],
  ['9614', 'Regina', 'SITE (EMAIL', '212 663-698509', 'Textile', 'Order fabric', 'endha deja frs f la turquie , chrht liha ela sourcing et b9at katswl elih ,galt hta tfker otred elina', '30/09/26', 'Faible Qualité', '02/10/26', 'Faible Qualité'],
  ['9615', 'jaafar', 'clics', '212 681-359151', '', '', 'fes , khda numero dylna mn end chi wahd f casa, bgha ybda b 20-30 rass , 3jola charoli , belgiqui endhom 6-8mois , pas de frs ,activité : jazar /mabghach ykhls sourcing', '30/09/26', 'En cours', '05/10/26', 'Faible Qualité'],
  ['9616', 'DRISS', 'wtsp confirmation', '1 613 252 7652', 'Vetêment', '', "agadir , khda demande d'etude / ETUDE", '30/09/26', 'Traité', '05/10/26', 'Traité'],
  ['9617', 'toufik', 'clics', '212 615-724437', 'nail machine', '', 'chichawa , endu frs,ghaydemandi proforam', '01/10/26', 'Pas de réponse', '05/10/26', 'En cours'],
  ['9618', 'mohammed', 'clics', '212 611-758061', '', '', 'TANGER , particulier / proforma', '01/10/26', 'En cours', '05/10/26', 'Traité'],
  ['9619', 'salah', 'site (email', '212 717-626967', "Balayeuse 111 Robotique de nettoyage à l'extérieur", '1000 pieces Balayeuse 111 Robotique de nettoyage / casablanca', 'machi dispo', '02/10/26', 'Pas de réponse', '05/10/26', 'En cours'],
  ['9620', '', 'visite bureau casa', '212 661-092803', '', '', 'visite bureau casa', '02/10/26', 'Traité', '', ''],
  ['9621', 'hicham', 'clics', '212 668-926525', 'talkie walkie', '', 'ste SECUFORMATION / Swl ela kifach ghy9ad portnet ,ste mzl f etape de creation,je propose accompagnement , alors ghykml process oyrj3 endna', '02/10/26', 'Pas Prêt', '', ''],
  ['9622', 'HAMZA', 'clics', '212 690-082010', '', '', 'Traité par nesrine / MACHI DISPO', '02/10/26', 'En cours', '', ''],
  ['9623', '', 'clics', '212 645-564035', 'MACHINE', '', 'PROFORMA', '02/10/26', 'Traité', '', ''],
  ['9624', '', 'clics', '212 693-608509', '', '', '80 usd de m/ses', '02/10/26', 'En cours', '', ''],
  ['9625', 'ABDO SENHAJI', 'clics', '212 666-534171', '', '', '', '03/10/26', 'Pas de réponse', '', ''],
  ['9626', '', 'APPEL', '212 661-458114', '', '', 'L6998', '03/10/26', 'En cours', '', ''],
  ['9627', 'mohamed', 'wtsp confirmation', '212 772-600034', '', '', 'rv casa lundi inchalah', '03/10/26', 'En cours', '', ''],
  ['9628', 'HICHAM', 'Clics', '212 660-370242', 'des boits en plastique', '', 'GHYSWLU ECHANTILLON hta ychuf qualité ,apres ghysift lina pour la quantité', '05/10/26', 'Pas Prêt', '', ''],
  ['9629', '', 'Clics', '212 653-786490', '', '', '', '05/10/26', 'Pas de réponse', '', ''],
  ['9630', 'youness mabour', 'wtsp confirmation', '212 606-760337', 'papier A4', '', 'kelaa , personne physique ,1er import , conteneur 20 , marque : oumnia , copy star , khda demande de sourcing', '05/10/26', 'En cours', '', ''],
  ['9631', 'Nicole Z', 'site (email', '353 871761079', '', 'Hello we would like to import from China to Marrakech. May i know your service and quote?/Import from China to Marrakech', 'Dublin / ght3awd tsoni wra 1h', '05/10/26', 'En cours', '', ''],
  ['9632', '', 'wtsp confirmation', '212 775-092798', '', '', '', '05/10/26', 'Pas de réponse', '', ''],
  ['9633', '', 'wtsp confirmation', '33 6 05 64 16 37', '', '', '', '05/10/26', 'Pas de réponse', '', ''],
  ['9634', 'yassine', 'wtsp confirmation', '212 655-193539', 'machines de salle de sport bon occasion', '', 'conteneur 20 , deja syd chari materil d la france,pas de ste , bghaw ydkhlo had materiel vers taounate', '05/10/26', 'En cours', '', ''],
];

function clean(value) {
  return String(value || '').trim();
}

export function normalizePhone(value) {
  let phone = clean(value).replace(/\D/g, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (/^0[67]\d{8}$/.test(phone)) phone = `212${phone.slice(1)}`;
  if (/^[67]\d{8}$/.test(phone)) phone = `212${phone}`;
  return phone;
}

export function countryFromPhone(phone) {
  if (phone.startsWith('212')) return 'Maroc';
  if (phone.startsWith('216')) return 'Tunisie';
  if (phone.startsWith('353')) return 'Irlande';
  if (phone.startsWith('33')) return 'France';
  if (phone.startsWith('1')) return 'Canada';
  return '';
}

export function normalizeDataTag(value) {
  const key = clean(value).toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (key === 'pas de reponse' || key === 'pas reponse') return 'Pas réponse';
  if (key === 'en cours' || key === 'active' || key === 'activee') return 'En cours de traitement';
  if (key === 'faible qualite') return 'Faible qualité';
  if (key === 'pas pret') return 'Pas prêt';
  if (key === 'traite') return 'Traité';
  return clean(value) || '';
}

export function parseFrenchDate(value) {
  const match = clean(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  const date = new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[1]), 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[1])) return null;
  return date;
}

function canalFromSource(source) {
  const value = clean(source).toLocaleLowerCase('fr');
  if (value.includes('wtsp') || value.includes('whatsapp')) return 'WhatsApp';
  if (value.includes('email') || value.includes('site')) return 'Email';
  if (value.includes('visite')) return 'Visite bureau';
  if (value.includes('appel') || value.includes('fixe')) return 'Appel téléphonique';
  if (value.includes('clic')) return 'Réseaux sociaux';
  return 'Autre';
}

function isoDay(date) {
  return date ? date.toISOString().slice(0, 10) : '';
}

function historyEntry(lead, version, date, before, state, sourceState) {
  return {
    id: `${lead.importSourceId}-v${version}`,
    ts: date.getTime(),
    date: date.toISOString(),
    version,
    utilisateur: 'Import historique Data',
    action: 'État importé',
    avant: before,
    etat: state,
    notes: sourceState === state ? lead.notes : `État source : ${sourceState}${lead.notes ? ` — ${lead.notes}` : ''}`,
  };
}

export const LEADS = RAW_LEADS.map(([code, name, source, phone, product, request, notes, firstDate, firstState, secondDate, secondState]) => {
  const normalizedPhone = normalizePhone(phone);
  const firstAt = parseFrenchDate(firstDate);
  const secondAt = parseFrenchDate(secondDate);
  if (!/^\d{4}$/.test(code) || !firstAt) throw new Error(`Ligne import invalide: ${code || '(sans code)'}`);
  const firstTag = normalizeDataTag(firstState);
  const secondTag = normalizeDataTag(secondState);
  const history = [historyEntry({ importSourceId: `${IMPORT_BATCH}:${code}`, notes }, 1, firstAt, '', firstTag, firstState)];
  if (secondAt && secondTag) history.push(historyEntry({ importSourceId: `${IMPORT_BATCH}:${code}`, notes }, 2, secondAt, firstTag, secondTag, secondState));
  return {
    code,
    name: clean(name),
    source: clean(source),
    phone: normalizedPhone,
    country: countryFromPhone(normalizedPhone),
    product: clean(product),
    request: clean(request),
    notes: clean(notes),
    firstAt,
    secondAt,
    currentTag: secondTag || firstTag,
    history,
    importSourceId: `${IMPORT_BATCH}:${code}`,
  };
});

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

function samePhone(item, lead) {
  return normalizePhone(item?.data?.telephone || item?.data?.whatsapp) === lead.phone;
}

async function inspectLead(db, lead) {
  const [clientByCode, phoneMatches, demande, contact] = await Promise.all([
    db.collectionItem.findFirst({
      where: {
        collection: 'clients',
        OR: [{ id: lead.code }, { code: lead.code }, { data: { path: ['codeClientUltex'], equals: lead.code } }],
      },
    }),
    db.collectionItem.findMany({ where: { collection: 'clients' }, select: { id: true, code: true, data: true } }),
    db.collectionItem.findFirst({ where: { collection: 'demandes', data: { path: ['importSourceId'], equals: lead.importSourceId } } }),
    db.collectionItem.findFirst({ where: { collection: 'contacts', data: { path: ['importSourceId'], equals: lead.importSourceId } } }),
  ]);
  const phoneOwner = phoneMatches.find(item => samePhone(item, lead));
  const conflicts = [];
  if (clientByCode && !samePhone(clientByCode, lead)) {
    conflicts.push(`le code ${lead.code} appartient à ${clientByCode.data?.nom || clientByCode.code} (${clientByCode.data?.telephone || 'sans téléphone'})`);
  }
  if (phoneOwner && phoneOwner.code !== lead.code) {
    conflicts.push(`le téléphone ${lead.phone} appartient déjà au code ${phoneOwner.code}`);
  }
  return {
    code: lead.code,
    phone: lead.phone,
    client: clientByCode ? 'exists' : 'create',
    contact: contact ? `exists:${contact.code}` : 'create',
    demande: demande ? `exists:${demande.code}` : 'create',
    line: lead.product ? 'ensure' : 'not-required',
    conflicts,
  };
}

async function applyLead(tx, lead) {
  const plan = await inspectLead(tx, lead);
  if (plan.conflicts.length) throw new Error(`Conflit ${lead.code}: ${plan.conflicts.join('; ')}`);

  let client = await tx.collectionItem.findFirst({
    where: {
      collection: 'clients',
      OR: [{ id: lead.code }, { code: lead.code }, { data: { path: ['codeClientUltex'], equals: lead.code } }],
    },
  });
  const latestAt = lead.secondAt || lead.firstAt;
  const clientValues = {
    id: lead.code,
    code: lead.code,
    codeClientUltex: lead.code,
    nom: lead.name,
    telephone: lead.phone,
    whatsapp: lead.phone,
    pays: lead.country,
    segment: 'Prospect',
    sourceDonnees: 'Import historique Data',
    sourcePremierContact: lead.source,
    canalPremierContact: canalFromSource(lead.source),
    datePremierContact: isoDay(lead.firstAt),
    dateDerniereDemande: isoDay(lead.firstAt),
    dateEntreeData: lead.firstAt.toISOString(),
    dateDernierChangementEtat: latestAt.toISOString(),
    dataTag: lead.currentTag,
    etatVersion: lead.history.length,
    historiqueSuivi: lead.history,
    dernierContact: isoDay(latestAt),
    echeanceCode: lead.secondAt ? lead.secondAt.toISOString() : '',
    nbRelances: Math.max(0, lead.history.length - 1),
    remarque: lead.notes,
    importBatch: IMPORT_BATCH,
    importSourceId: lead.importSourceId,
  };
  if (!client) {
    client = await tx.collectionItem.create({
      data: { collection: 'clients', id: lead.code, code: lead.code, data: clientValues, createdAt: lead.firstAt },
    });
  } else if (client.data?.importSourceId === lead.importSourceId) {
    client = await tx.collectionItem.update({
      where: { id: client.id },
      data: { data: { ...client.data, ...clientValues } },
    });
  }

  let contact = await tx.collectionItem.findFirst({
    where: {
      collection: 'contacts',
      OR: [
        { data: { path: ['importSourceId'], equals: lead.importSourceId } },
        { data: { path: ['codeClientAssocie'], equals: lead.code } },
      ],
    },
  });
  if (!contact) {
    contact = await createItem(tx, 'contacts', 'CT', {
      nom: lead.name,
      telephone: lead.phone,
      whatsapp: lead.phone,
      pays: lead.country,
      typeContact: 'Client',
      source: canalFromSource(lead.source),
      sourceDetail: lead.source,
      statut: 'En échange',
      codeClientAssocie: lead.code,
      sourceDonnees: 'Import historique Data',
      importBatch: IMPORT_BATCH,
      importSourceId: lead.importSourceId,
    }, lead.firstAt);
  }

  let demande = await tx.collectionItem.findFirst({
    where: { collection: 'demandes', data: { path: ['importSourceId'], equals: lead.importSourceId } },
  });
  const objective = lead.product || lead.request || 'Demande à compléter';
  if (!demande) {
    demande = await createItem(tx, 'demandes', 'DMD', {
      client: lead.code,
      codeClientUltex: lead.code,
      dateDemande: isoDay(lead.firstAt),
      dateHeureReception: lead.firstAt.toISOString(),
      source: canalFromSource(lead.source),
      canalReception: canalFromSource(lead.source),
      sourceDetail: lead.source,
      sourceSynchronisation: 'Import historique Data',
      createdManually: false,
      responsableData: 'Data',
      objectifGeneral: objective,
      statut: 'Nouvelle',
      urgence: 'Normale',
      dataTag: lead.currentTag,
      etatVersion: lead.history.length,
      historiqueSuivi: lead.history,
      remarqueGenerale: [lead.request, lead.notes].filter(Boolean).join('\n'),
      importBatch: IMPORT_BATCH,
      importSourceId: lead.importSourceId,
      sourceRecord: {
        code: lead.code,
        nom: lead.name,
        telephone: lead.phone,
        pays: lead.country,
        source: lead.source,
        produit: lead.product,
        demande: lead.request,
        notes: lead.notes,
      },
    }, lead.firstAt);
  }

  let line = null;
  if (lead.product) {
    line = await tx.collectionItem.findFirst({
      where: { collection: 'demandeLignes', data: { path: ['importSourceId'], equals: lead.importSourceId } },
    });
    if (!line) {
      line = await createItem(tx, 'demandeLignes', 'DL', {
        demande: demande.code,
        referenceMetier: `P1-${lead.code}`,
        nomProduit: lead.product,
        designationTechnique: lead.request || lead.product,
        statutFournisseur: 'À rechercher',
        statut: 'Nouvelle',
        sourceSynchronisation: 'Import historique Data',
        importBatch: IMPORT_BATCH,
        importSourceId: lead.importSourceId,
        ts: lead.firstAt.getTime(),
      }, lead.firstAt);
    }
  }

  return { code: lead.code, client: client.code, contact: contact.code, demande: demande.code, line: line?.code || null };
}

async function main() {
  const preview = [];
  for (const lead of LEADS) preview.push(await inspectLead(prisma, lead));
  const conflicts = preview.flatMap(item => item.conflicts.map(message => ({ code: item.code, message })));
  console.info(JSON.stringify({ mode: APPLY ? 'APPLY' : 'PREVIEW', total: LEADS.length, conflicts, leads: preview }, null, 2));
  if (conflicts.length) throw new Error(`${conflicts.length} conflit(s) détecté(s). Aucun enregistrement n'a été modifié.`);
  if (!APPLY) {
    console.info(`Aucune écriture. Pour appliquer: node scripts/import_numeric_clients_9601_9634.js --apply --confirm ${REQUIRED_CONFIRMATION}`);
    return;
  }
  if (CONFIRMATION !== REQUIRED_CONFIRMATION) throw new Error(`Confirmation requise: --confirm ${REQUIRED_CONFIRMATION}`);

  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9600, 2026)`;
    const inserted = [];
    for (const lead of LEADS) inserted.push(await applyLead(tx, lead));
    const highest = Math.max(...LEADS.map(lead => Number(lead.code)));
    const counter = await tx.sequenceCounter.findUnique({ where: { key: 'CLIENT_NUMERIC' } });
    if (!counter) await tx.sequenceCounter.create({ data: { key: 'CLIENT_NUMERIC', val: highest } });
    else if (counter.val < highest) await tx.sequenceCounter.update({ where: { key: 'CLIENT_NUMERIC' }, data: { val: highest } });
    return inserted;
  }, { maxWait: 30000, timeout: 120000 });
  console.info(JSON.stringify({ status: 'done', imported: result.length, nextAutomaticNumericCode: '9635', records: result }, null, 2));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    await main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
