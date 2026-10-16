/**
 * Import the numeric Data leads 9630..9684 supplied on 2026-10-16.
 *
 * Preview (default):
 *   node scripts/import_numeric_clients_9630_9684.js
 * Apply:
 *   node scripts/import_numeric_clients_9630_9684.js --apply --confirm import-9630-9684
 *
 * Identity rules requested by Data:
 * - phone identity wins over the requested numeric code;
 * - an existing L-code with the same phone is kept and the row is skipped;
 * - an exact numeric code + phone match is kept and the row is skipped;
 * - an existing non-L client with the same phone is moved to the supplied code;
 * - if the supplied code is occupied by another phone, that occupant is moved
 *   losslessly (to its supplied code when known, otherwise to the next free
 *   numeric code) before the new client is inserted.
 *
 * No client, demande, contact, document or audit entry is deleted. Every code
 * move and all structured references are updated in one transaction.
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');
const confirmationIndex = process.argv.indexOf('--confirm');
const CONFIRMATION = confirmationIndex >= 0 ? String(process.argv[confirmationIndex + 1] || '') : '';
const REQUIRED_CONFIRMATION = 'import-9630-9684';
const IMPORT_BATCH = 'numeric-data-2026-10-16';
const REFERENCE_FIELDS = ['client', 'codeClientAssocie', 'codeClient', 'clientCode', 'codeClientUltex'];

const row = (code, name, source, phone, product, notes, date, state, request = '') =>
  ({ code, name, source, phone, product, notes, date, state, request });

const RAW_LEADS = [
  row('9630', 'youness mabour', 'wtsp confirmation', '212 606-760337', 'papier A4', 'kelaa, personne physique, 1er import, conteneur 20, marque : oumnia, copy star, khda demande de sourcing', '05/10/26', 'En cours'),
  row('9631', 'Nicole Z', 'site (email', '353 871761079', '', 'Dublin / ght3awd tsoni wra 1h', '05/10/26', 'En cours', 'Hello we would like to import from China to Marrakech. May i know your service and quote? / Import from China to Marrakech'),
  row('9632', '', 'wtsp confirmation', '212 775-092798', '', '', '05/10/26', 'Pas de réponse'),
  row('9633', '', 'wtsp confirmation', '33 6 05 64 16 37', 'flacon', '', '05/10/26', 'Pas de réponse'),
  row('9634', 'yassine', 'wtsp confirmation', '212 655-193539', 'machines de salle de sport bon occasion', 'conteneur 20, deja syd chari materil d la france, pas de ste, bghaw ydkhlo had materiel vers taounate / etito proposition d\'etude hta yfker oyrj3 endna', '05/10/26', 'En cours'),
  row('9635', 'mohamed', 'Clics', '86 186 0717 1403', '', 'demande de collaboration', '05/10/26', 'Autre'),
  row('9636', 'Mohamed Larbi El Yousfi', 'email', '212 652-196912', '', 'ste HAYTOU, importateur, kayl9a pblm que transit ghi kaydwz engagement, kaydir declaration ctt, bghana ste fhalna t9dr dir accompagnement f tt les etapes, kayimpoti mn espagne wakhd exclusivité mn end brand espagnol f cosmetique / bgha ykhdm ela les relx des bebes depuis la chine, chaf f 1688 kaynin des bonnes prix je sourcing, ghysift les infos bach nbdaw / état initial : En cours', '05/10/26', 'Traité'),
  row('9637', '', 'Clics', '212 700-627005', 'vetements', 'ghy3awd ysoni li wra l3aser, syd li meah hit makayfhmch darija mzn', '05/10/26', 'En cours'),
  row('9638', '', '-', '212 601-249246', '', 'traité (L4017)', '05/10/26', 'Traité'),
  row('9639', 'salama', 'wtsp confirmation', '212 675-230754', '', 'ghysift proforma, 4 pcs usage perso', '05/10/26', 'En cours'),
  row('9640', 'yaser', 'fixe casa', '212 705-321366', 'machine', '', '07/10/26', 'Traité'),
  row('9641', 'abdelilah', 'fb', '212 655-967229', '', '', '07/10/26', 'Pas de réponse'),
  row('9642', 'yassine', 'fb', '212 618-055760', 'accessoires des chiens', 'commerce, ghysift proforma', '07/10/26', 'En cours'),
  row('9643', 'KHALID', 'EMAIL', '212 667-375009', '', 'bgha sourcing, kayn f maysour', '07/10/26', 'En cours'),
  row('9644', 'SALAH', 'Clics', '212 703-638662', 'sac', 'e-commerce / khda proposition de sourcing, ghyfker oyrje elina', '07/10/26', 'Pas Prêt'),
  row('9645', 'faycal', 'Clics', '212 613-218927', '', 'BGHA YJI LCASA, katbi3 f tanger, 1er import, mab9ach ykhdm mea smasriya, bgha sourcing (catalogue)', '07/10/26', 'En cours'),
  row('9646', 'mohamed', 'clics', '212 773-152941', '', '', '08/10/26', 'Pas de réponse'),
  row('9647', '', 'wtsp confirmation', '212 681-732278', '', 'ghda ghysift proforma', '08/10/26', 'En cours'),
  row('9648', '', 'clics', '212 700-971482', '', 'mzl majawb appel', '08/10/26', 'En cours'),
  row('9649', 'ibrahim', 'clics', '212 604-036312', '', '1er import, bgha sel3a hna, mbghach ykhls oytsna hta tji sdel3a', '09/10/26', 'Faible Qualité'),
  row('9650', 'mehdi', 'site (email', '212 655-634313', '', 'ghymchi le 14/10 lchina, bach ykhtar produit, oysift proforma, bgha accompagnement, ste sur tanger, endu portnet et mkhls l\'abonnement, 1er import, debutant', '09/10/26', 'En cours'),
  row('9651', 'said', 'appel', '212 668-832231', '', '9te3 eliya', '09/10/26', 'Pas de réponse'),
  row('9652', 'HAJAR', 'wtsp confirmation', '212 694-928622', 'GANTS', 'CHINA, e-comm, izdihar marrakech, 200 pcs, ghatsift proforma, machrht liha ela sourcing', '09/10/26', 'En cours'),
  row('9653', '', 'wtsp confirmation', '212 645-944351', '', 'boite vocale', '09/10/26', 'Pas de réponse'),
  row('9654', 'francois', 'clics', '212 632-807583', 'matriel medical', 'dr militaire, sur kech, bgha yjib had materiel, ghysift proforma', '09/10/26', 'En cours'),
  row('9655', 'MUSTAPHA', 'Clics', '212 668-569777', '', '', '10/10/26', ''),
  row('9656', 'omar', 'wtsp confirmation', '212 688-411736', 'des chaussures', 'aydwz sourcing bch nbdaw dossier bgha aerien hit 25 jours bgha tkon 3ndo sal3a / par nisrine', '10/10/26', 'En cours'),
  row('9657', '', 'Clics', '212 714-388857', '', 'export', '12/10/26', 'Autre'),
  row('9658', '', 'appel', '08085-82495', '', '', '12/10/26', ''),
  row('9659', 'simo', 'Clics', '212 771-769143', '', '', '12/10/26', 'Pas de réponse'),
  row('9660', '', 'Clics', '212 615-272458', '', '', '12/10/26', 'Pas de réponse'),
  row('9661', 'faycal', 'Clics', '212 669-323960', '', 'maerfnach', '12/10/26', 'Pas intréssé'),
  row('9662', 'sarmad atic', 'Clics', '971 54 329 6432', '', 'frs bgha ysift les pc mn imarate', '12/10/26', 'En cours'),
  row('9663', '', 'wtsp confirmation', '212 716-632516', '', 'bgha importer le sparfums chrht lih aysft lia pi eala hsab embalage dialhom bohdhom', '12/10/26', 'En cours'),
  row('9664', 'MOUAD BAKHALA', 'email', '212 672-643593', 'les chaussures', 'mzl f la phase d\'etude, ghywjd dossier oysifto par email', '12/10/26', 'En cours'),
  row('9665', '', 'wtsp confirmation', '212 623-975207', '', 'export bgha ysadar zitoun', '12/10/26', 'En cours'),
  row('9666', 'fati', 'fixe casa', '212 668-106044', '', 'bghat importer drone', '12/10/26', 'Traité'),
  row('9667', 'adil', 'wtsp confirmation', '641426747', '', 'bgha importer machine chrht lih ela sourcing', '12/10/26', 'En cours'),
  row('9668', '', 'clics', '212 611-933932', '', 'mamsalich', '13/10/26', 'En cours'),
  row('9669', 'amine chakroune', 'clics', '212 616-149209', '', 'frs galig nzid 3% bach takhd proforma, ghybdl frs oysift lina', '13/10/26', 'En cours'),
  row('9670', 'HANAE', 'clics', '49 1522 5390807', '', '', '14/10/26', ''),
  row('9671', 'abderahim', 'clics', '212 602-330800', '', 'commerce, 1er import, maenduch produit, ghi chaf annonce, khda num', '14/10/26', 'Pas Prêt'),
  row('9672', 'AYA', 'clics', '212 617-733888', '', 'ville : tetouane, endha colya mn china (kayn tema bghatna njiboha liha ghtsift les infos)', '14/10/26', 'En cours'),
  row('9673', '', 'FB', '212 684-464074', '', 'jawb ghi b salam', '14/10/26', 'En cours'),
  row('9674', 'ABDELAH', 'FB', '212 617-590073', '', 'TRANSPORTEUR', '14/10/26', 'Autre'),
  row('9675', '', 'FB', '212 620-707523', '', '', '14/10/26', ''),
  row('9676', '', 'FB', '212 614-078204', '', '', '14/10/26', ''),
  row('9677', 'abderhmane', 'clics', '212 621-141149', 'panini', 'meknes, e-com, pas de ste, 5000 pcs*8 usd exw, ghysift volume', '14/10/26', 'En cours'),
  row('9678', 'mohamed', 'wtsp confirmation', '212 671-381909', '', 'bgha yjib pieces de rechange moto', '14/10/26', 'En cours'),
  row('9679', '', 'Clics', '212 675-035976', '', '', '16/10/26', 'Pas de réponse'),
  row('9680', '', 'Clics', '212 663-693110', 'underwear', 'mzl khas volume', '16/10/26', 'En cours'),
  row('9681', '', 'Clics', '212 661-343332', '', '', '16/10/26', ''),
  row('9682', 'lobna', 'Clics', '212 625-729622', '', 'pghtsift proforma', '16/10/26', 'En cours'),
  row('9683', '', 'Clics', '212 689-898504', '', 'sift oms7 msg', '16/10/26', 'Pas de réponse'),
  row('9684', '', 'wtsp des fournisseurs', '212 661-800486', '', '', '16/10/26', ''),
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

function countryFromPhone(phone) {
  if (phone.startsWith('212')) return 'Maroc';
  if (phone.startsWith('353')) return 'Irlande';
  if (phone.startsWith('33')) return 'France';
  if (phone.startsWith('86')) return 'Chine';
  if (phone.startsWith('971')) return 'Émirats arabes unis';
  if (phone.startsWith('49')) return 'Allemagne';
  return '';
}

function normalizeDataTag(value) {
  const key = clean(value).toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (key === 'pas de reponse' || key === 'pas reponse') return 'Pas réponse';
  if (key === 'en cours') return 'En cours de traitement';
  if (key === 'faible qualite') return 'Faible qualité';
  if (key === 'pas pret') return 'Pas prêt';
  if (key === 'pas interesse') return 'Pas intéressé';
  if (key === 'traite') return 'Traité';
  return clean(value);
}

function parseFrenchDate(value) {
  const match = clean(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  return new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[1]), 12));
}

function canalFromSource(source) {
  const value = clean(source).toLocaleLowerCase('fr');
  if (value.includes('wtsp') || value.includes('whatsapp')) return 'WhatsApp';
  if (value.includes('email') || value.includes('site')) return 'Email';
  if (value.includes('appel') || value.includes('fixe')) return 'Appel téléphonique';
  if (value.includes('fb') || value.includes('clic')) return 'Réseaux sociaux';
  return 'Autre';
}

export const LEADS = RAW_LEADS.map(raw => {
  const firstAt = parseFrenchDate(raw.date);
  const phone = normalizePhone(raw.phone);
  if (!/^\d{4}$/.test(raw.code) || !phone || !firstAt) throw new Error(`Ligne invalide: ${raw.code}`);
  return {
    ...raw,
    name: clean(raw.name),
    phone,
    product: clean(raw.product),
    notes: clean(raw.notes),
    request: clean(raw.request),
    currentTag: normalizeDataTag(raw.state),
    firstAt,
    country: countryFromPhone(phone),
    importSourceId: `${IMPORT_BATCH}:${raw.code}`,
  };
});

function clientCode(client) {
  return clean(client?.code || client?.id || client?.data?.codeClientUltex).toUpperCase();
}

function clientPhone(client) {
  return normalizePhone(client?.data?.telephone || client?.data?.whatsapp || '');
}

function isLCode(code) {
  return /^L\d+$/i.test(code);
}

function isNumericCode(code) {
  return /^\d+$/.test(code);
}

function assertInput(leads) {
  const codes = new Set();
  const phones = new Set();
  for (const lead of leads) {
    if (codes.has(lead.code)) throw new Error(`Code fourni en double: ${lead.code}`);
    if (phones.has(lead.phone)) throw new Error(`Téléphone fourni en double: ${lead.phone}`);
    codes.add(lead.code);
    phones.add(lead.phone);
  }
}

/** Pure planner, exported for regression tests. */
export function planImport(leads, clients) {
  assertInput(leads);
  const byCode = new Map(clients.map(client => [clientCode(client), client]));
  const byPhone = new Map();
  for (const client of clients) {
    const phone = clientPhone(client);
    if (!phone) continue;
    if (!byPhone.has(phone)) byPhone.set(phone, []);
    byPhone.get(phone).push(client);
  }

  const leadByPhone = new Map(leads.map(lead => [lead.phone, lead]));
  const actions = [];
  const conflicts = [];
  const movesByClientId = new Map();

  for (const lead of leads) {
    const matches = byPhone.get(lead.phone) || [];
    const lMatches = matches.filter(client => isLCode(clientCode(client)));
    if (lMatches.length) {
      actions.push({ type: 'skip_l_code', lead, existingCode: clientCode(lMatches[0]) });
      continue;
    }
    if (matches.length > 1) {
      conflicts.push({ code: lead.code, phone: lead.phone, reason: `Plusieurs clients non-L ont ce téléphone: ${matches.map(clientCode).join(', ')}` });
      continue;
    }
    const phoneOwner = matches[0] || null;
    const occupant = byCode.get(lead.code) || null;
    if (phoneOwner && clientCode(phoneOwner) === lead.code) {
      actions.push({ type: 'skip_exact', lead, existingCode: lead.code });
      continue;
    }
    if (phoneOwner) {
      const move = { client: phoneOwner, from: clientCode(phoneOwner), to: lead.code, reason: `téléphone ${lead.phone} fourni pour ${lead.code}` };
      movesByClientId.set(phoneOwner.id, move);
      actions.push({ type: 'move_existing_phone', lead, existingCode: move.from, targetCode: lead.code });
      continue;
    }
    actions.push({ type: 'create', lead, targetCode: lead.code });
    if (occupant) {
      // Occupant displacement is resolved below after all phone-owned moves are known.
      actions[actions.length - 1].occupiedBy = clientCode(occupant);
    }
  }

  const reservedTargets = new Set(leads.map(lead => lead.code));
  const actionableTargets = new Set(actions.filter(item => item.type === 'create' || item.type === 'move_existing_phone').map(item => item.lead.code));
  const existingNumeric = clients.map(clientCode).filter(isNumericCode).map(Number);
  let nextFree = Math.max(9684, ...existingNumeric, ...leads.map(lead => Number(lead.code)));
  const allocated = new Set([...byCode.keys(), ...reservedTargets]);
  const allocateFree = () => {
    do nextFree += 1; while (allocated.has(String(nextFree)));
    allocated.add(String(nextFree));
    return String(nextFree);
  };

  for (const action of actions.filter(item => item.type === 'create' || item.type === 'move_existing_phone')) {
    const occupant = byCode.get(action.lead.code);
    if (!occupant || (action.type === 'move_existing_phone' && occupant.id === (byPhone.get(action.lead.phone) || [])[0]?.id)) continue;
    if (movesByClientId.has(occupant.id)) continue;

    const occupantPhone = clientPhone(occupant);
    const suppliedOwner = leadByPhone.get(occupantPhone);
    let target = suppliedOwner && actionableTargets.has(suppliedOwner.code) ? suppliedOwner.code : '';
    if (!target || target === action.lead.code) {
      const storedCandidate = clean(occupant.data?.codeClientUltex).toUpperCase();
      target = isNumericCode(storedCandidate) && !allocated.has(storedCandidate) ? storedCandidate : allocateFree();
    }
    movesByClientId.set(occupant.id, {
      client: occupant,
      from: clientCode(occupant),
      to: target,
      reason: `libérer ${action.lead.code} pour le téléphone ${action.lead.phone}`,
    });
  }

  // Every target must be unique, and skipped rows must not be overwritten.
  const finalTargets = new Map();
  for (const move of movesByClientId.values()) {
    if (finalTargets.has(move.to) && finalTargets.get(move.to) !== move.client.id) {
      conflicts.push({ code: move.to, reason: `Deux clients seraient déplacés vers ${move.to}` });
    }
    finalTargets.set(move.to, move.client.id);
  }
  return { actions, moves: [...movesByClientId.values()], conflicts, nextNumericFloor: nextFree };
}

async function repointReferences(tx, oldCode, newCode) {
  const counts = {};
  for (const field of REFERENCE_FIELDS) {
    counts[field] = await tx.$executeRawUnsafe(
      `UPDATE collection_items
       SET data = jsonb_set(data, ARRAY[$1]::text[], to_jsonb($2::text), false)
       WHERE data->>$1 = $3`,
      field, newCode, oldCode,
    );
  }
  counts.referenceMetier = await tx.$executeRaw`
    UPDATE collection_items
    SET data = jsonb_set(data, '{referenceMetier}', to_jsonb(regexp_replace(data->>'referenceMetier', ${`-${oldCode}$`}, ${`-${newCode}`})), false)
    WHERE COALESCE(data->>'referenceMetier', '') ~ ${`-${oldCode}$`}
  `;
  const audit = await tx.auditLog.updateMany({ where: { objet: oldCode }, data: { objet: newCode } });
  counts.audit = audit.count;
  return counts;
}

async function renameClient(tx, clientId, oldCode, newCode) {
  const renamed = await tx.$executeRaw(Prisma.sql`
    UPDATE collection_items
    SET id = ${newCode}, code = ${newCode},
        data = data || jsonb_build_object('id', ${newCode}, 'code', ${newCode}, 'codeClientUltex', ${newCode})
    WHERE collection = 'clients' AND id = ${clientId}
  `);
  if (renamed !== 1) throw new Error(`Renommage impossible: ${oldCode} -> ${newCode}`);
  return repointReferences(tx, oldCode, newCode);
}

async function nextCode(tx, prefix) {
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const sequence = await tx.sequenceCounter.upsert({
      where: { key: prefix },
      create: { key: prefix, val: 1 },
      update: { val: { increment: 1 } },
    });
    const code = `${prefix}${String(sequence.val).padStart(6, '0')}`;
    if (!await tx.collectionItem.findUnique({ where: { id: code }, select: { id: true } })) return code;
  }
  throw new Error(`Impossible de générer un code ${prefix} libre.`);
}

async function createItem(tx, collection, prefix, values, createdAt) {
  const code = await nextCode(tx, prefix);
  return tx.collectionItem.create({ data: { collection, id: code, code, data: { ...values, id: code, code }, createdAt } });
}

async function createLead(tx, lead) {
  const history = [{
    id: `${lead.importSourceId}-v1`, ts: lead.firstAt.getTime(), date: lead.firstAt.toISOString(), version: 1,
    utilisateur: 'Import historique Data', action: 'État importé', avant: '', etat: lead.currentTag, notes: lead.notes,
  }];
  const client = await tx.collectionItem.create({
    data: {
      collection: 'clients', id: lead.code, code: lead.code, createdAt: lead.firstAt,
      data: {
        id: lead.code, code: lead.code, codeClientUltex: lead.code, nom: lead.name,
        telephone: lead.phone, whatsapp: lead.phone, pays: lead.country, segment: 'Prospect',
        sourceDonnees: 'Import historique Data', sourcePremierContact: lead.source,
        canalPremierContact: canalFromSource(lead.source), datePremierContact: lead.firstAt.toISOString().slice(0, 10),
        dateEntreeData: lead.firstAt.toISOString(), dateDernierChangementEtat: lead.firstAt.toISOString(),
        dataTag: lead.currentTag, etatVersion: 1, historiqueSuivi: history,
        dernierContact: lead.firstAt.toISOString().slice(0, 10), remarque: lead.notes,
        importBatch: IMPORT_BATCH, importSourceId: lead.importSourceId,
      },
    },
  });
  const contact = await createItem(tx, 'contacts', 'CT', {
    nom: lead.name, telephone: lead.phone, whatsapp: lead.phone, pays: lead.country,
    typeContact: 'Client', source: canalFromSource(lead.source), sourceDetail: lead.source,
    statut: 'En échange', codeClientAssocie: lead.code, sourceDonnees: 'Import historique Data',
    importBatch: IMPORT_BATCH, importSourceId: lead.importSourceId,
  }, lead.firstAt);
  const demande = await createItem(tx, 'demandes', 'DMD', {
    client: lead.code, codeClientUltex: lead.code, dateDemande: lead.firstAt.toISOString().slice(0, 10),
    dateHeureReception: lead.firstAt.toISOString(), source: canalFromSource(lead.source),
    canalReception: canalFromSource(lead.source), sourceDetail: lead.source,
    sourceSynchronisation: 'Import historique Data', createdManually: false, responsableData: 'Data',
    objectifGeneral: lead.product || lead.request || 'Demande à compléter', statut: 'Nouvelle', urgence: 'Normale',
    dataTag: lead.currentTag, etatVersion: 1, historiqueSuivi: history,
    remarqueGenerale: [lead.request, lead.notes].filter(Boolean).join('\n'),
    importBatch: IMPORT_BATCH, importSourceId: lead.importSourceId,
    sourceRecord: { code: lead.code, nom: lead.name, telephone: lead.phone, pays: lead.country, source: lead.source, produit: lead.product, demande: lead.request, notes: lead.notes },
  }, lead.firstAt);
  let line = null;
  if (lead.product) {
    line = await createItem(tx, 'demandeLignes', 'DL', {
      demande: demande.code, referenceMetier: `P1-${lead.code}`, nomProduit: lead.product,
      designationTechnique: lead.request || lead.product, statutFournisseur: 'À rechercher', statut: 'Nouvelle',
      sourceSynchronisation: 'Import historique Data', importBatch: IMPORT_BATCH,
      importSourceId: lead.importSourceId, ts: lead.firstAt.getTime(),
    }, lead.firstAt);
  }
  return { code: client.code, contact: contact.code, demande: demande.code, line: line?.code || null };
}

function publicPlan(plan) {
  return {
    totals: {
      supplied: plan.actions.length,
      create: plan.actions.filter(action => action.type === 'create').length,
      skipLCode: plan.actions.filter(action => action.type === 'skip_l_code').length,
      skipExact: plan.actions.filter(action => action.type === 'skip_exact').length,
      moveExistingPhone: plan.actions.filter(action => action.type === 'move_existing_phone').length,
      codeMoves: plan.moves.length,
      conflicts: plan.conflicts.length,
    },
    actions: plan.actions.map(action => ({ type: action.type, suppliedCode: action.lead.code, phone: action.lead.phone, name: action.lead.name, existingCode: action.existingCode, targetCode: action.targetCode, occupiedBy: action.occupiedBy })),
    moves: plan.moves.map(move => ({ from: move.from, to: move.to, client: move.client.data?.nom || '', phone: clientPhone(move.client), reason: move.reason })),
    conflicts: plan.conflicts,
  };
}

async function loadClients(db) {
  return db.collectionItem.findMany({ where: { collection: 'clients' }, select: { id: true, code: true, data: true } });
}

async function main() {
  const previewPlan = planImport(LEADS, await loadClients(prisma));
  console.info(JSON.stringify({ mode: APPLY ? 'APPLY' : 'PREVIEW', ...publicPlan(previewPlan) }, null, 2));
  if (previewPlan.conflicts.length) throw new Error(`${previewPlan.conflicts.length} conflit(s) bloquant(s). Aucune écriture.`);
  if (!APPLY) {
    console.info(`Aucune écriture. Pour appliquer: node scripts/import_numeric_clients_9630_9684.js --apply --confirm ${REQUIRED_CONFIRMATION}`);
    return;
  }
  if (CONFIRMATION !== REQUIRED_CONFIRMATION) throw new Error(`Confirmation requise: --confirm ${REQUIRED_CONFIRMATION}`);

  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(9630, 9684)`;
    const plan = planImport(LEADS, await loadClients(tx));
    if (plan.conflicts.length) throw new Error('Les données ont changé depuis le preview; conflits détectés. Transaction annulée.');

    const staged = [];
    for (let index = 0; index < plan.moves.length; index += 1) {
      const move = plan.moves[index];
      const temporary = `__NUMERIC_IMPORT_${Date.now()}_${index}__`;
      await renameClient(tx, move.client.id, move.from, temporary);
      staged.push({ ...move, temporary });
    }
    const moves = [];
    for (const move of staged) {
      moves.push({ from: move.from, to: move.to, references: await renameClient(tx, move.temporary, move.temporary, move.to) });
    }

    const inserted = [];
    for (const action of plan.actions.filter(item => item.type === 'create')) inserted.push(await createLead(tx, action.lead));
    const maxNumeric = Math.max(9684, ...plan.moves.map(move => Number(move.to)).filter(Number.isFinite));
    const counter = await tx.sequenceCounter.findUnique({ where: { key: 'CLIENT_NUMERIC' } });
    await tx.sequenceCounter.upsert({
      where: { key: 'CLIENT_NUMERIC' },
      create: { key: 'CLIENT_NUMERIC', val: maxNumeric },
      update: { val: Math.max(maxNumeric, counter?.val || 0) },
    });
    return { moves, inserted, skipped: plan.actions.filter(item => item.type.startsWith('skip_')).map(item => ({ code: item.lead.code, phone: item.lead.phone, reason: item.type, existingCode: item.existingCode })) };
  }, { maxWait: 30000, timeout: 180000 });

  console.info(JSON.stringify({ status: 'done', ...result }, null, 2));
  console.info('Import terminé sans suppression. Tous les rattachements des clients déplacés ont été conservés.');
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
