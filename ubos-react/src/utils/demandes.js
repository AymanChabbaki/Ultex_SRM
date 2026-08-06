/**
 * Auto-computes packaging totals (cartons / poids / CBM) from the per-carton
 * detail fields, but only fills in a total that's still empty — manual
 * entry always wins when the underlying detail isn't complete yet.
 */
export function calculerConditionnementLigne(ligne) {
  const patch = {};
  const quantite = +ligne.quantite || 0;
  const piecesParCarton = +ligne.piecesParCarton || 0;
  const poidsBrutCarton = +ligne.poidsBrutCarton || 0;
  const cbmCarton = +ligne.cbmCarton || 0;

  let nbCartons = +ligne.nbCartons || 0;
  if (!nbCartons && quantite && piecesParCarton) {
    nbCartons = Math.ceil(quantite / piecesParCarton);
    patch.nbCartons = nbCartons;
  }

  if (!ligne.poidsBrutTotal && nbCartons && poidsBrutCarton) {
    patch.poidsBrutTotal = Math.round(nbCartons * poidsBrutCarton * 100) / 100;
  }
  if (!ligne.cbmTotal && nbCartons && cbmCarton) {
    patch.cbmTotal = Math.round(nbCartons * cbmCarton * 1000) / 1000;
  }
  if (!ligne.montantMarchandise && +ligne.prixUnitaire && quantite) {
    patch.montantMarchandise = Math.round((+ligne.prixUnitaire) * quantite * 100) / 100;
  }
  return patch;
}

/**
 * Non-destructive migration from the old nested demande.lignes[] array to
 * the new top-level demandeLignes collection — never deletes the old data,
 * only creates the new records if none exist yet for this demande.
 */
export function migrerLignesDemande(db, demande) {
  const dejaMigre = (db.demandeLignes || []).some(l => l.demande === demande.code);
  if (dejaMigre || !demande.lignes || !demande.lignes.length) return [];

  const statutMap = {
    'Nouvelle': 'Nouvelle', 'En consultation': 'En sourcing',
    'Confirmée': 'Confirmée', 'Annulée': 'Non confirmée'
  };

  return demande.lignes.map((l, i) => ({
    code: l.code || `${demande.code}-L${String(i + 1).padStart(2, '0')}`,
    demande: demande.code,
    nomProduit: l.produitService || 'Produit non précisé',
    statut: statutMap[l.statut] || 'Nouvelle',
    statutFournisseur: l.fournisseurConnu === 'Oui' ? 'Fournisseur connu' : 'À rechercher',
    statutHsCode: 'À analyser',
    ts: l.ts || demande.ts || Date.now(),
    migreDepuisAncienFormat: true
  }));
}

const CHAMPS_MINIMUM_CALCUL = [
  { champ: 'nomProduit', label: 'produit' },
  { champ: 'quantite', label: 'quantité' }
];

/**
 * Checks the minimum fields needed before sending a line to Études &
 * Chiffrage. Never blocks the send — only reports what's missing so the
 * responsible person can authorize sending "sous réserve".
 */
export function verifierMinimumCalcul(ligne) {
  const manquants = [];
  CHAMPS_MINIMUM_CALCUL.forEach(({ champ, label }) => {
    if (!ligne[champ]) manquants.push(label);
  });
  if (!ligne.prixUnitaire && ligne.statutFournisseur !== 'À rechercher') manquants.push('prix fournisseur (ou statut "à rechercher")');
  if (ligne.prixUnitaire && !ligne.devise) manquants.push('devise');
  if (!ligne.paysOrigine) manquants.push("pays d'origine");
  if (!ligne.poidsBrutTotal && !ligne.cbmTotal) manquants.push('poids ou volume (CBM)');
  if (!ligne.fournisseur && ligne.statutFournisseur !== 'À rechercher') manquants.push('fournisseur (ou statut "à sourcer")');
  return { ok: manquants.length === 0, manquants };
}

export function calculerIndicateursDemande(lignes) {
  return {
    nbProduits: lignes.length,
    aCompleter: lignes.filter(l => ['Brouillon', 'À compléter'].includes(l.statut)).length,
    enSourcing: lignes.filter(l => l.statut === 'En sourcing').length,
    enCalcul: lignes.filter(l => ['En calcul', 'Calcul terminé'].includes(l.statut)).length,
    pretes: lignes.filter(l => l.statut === 'Prête pour offre').length,
    confirmees: lignes.filter(l => l.statut === 'Confirmée').length
  };
}

/**
 * Suggests which of the 9 TYPES_TRAITEMENT_LIGNE circuits a line should
 * follow, based on the fournisseur/proforma/prix already on record — never
 * authoritative, the user always confirms or overrides in the UI.
 */
export function suggererTypeTraitement(ligne) {
  if (!ligne.nomProduit || !ligne.quantite || !ligne.usage) return 'Informations client manquantes';

  const aFournisseur = !!ligne.fournisseur && ligne.statutFournisseur !== 'À rechercher';
  const aProforma = !!ligne.proforma;
  const aPrix = !!ligne.prixUnitaire;

  if (!aFournisseur && !aProforma && !aPrix) return 'Sourcing nécessaire';

  if (aFournisseur && (aProforma || aPrix)) {
    return verifierMinimumCalcul(ligne).ok ? 'Calcul direct possible' : 'Fournisseur connu, Proforma disponible';
  }

  if (aFournisseur && !aProforma && !aPrix) return 'Fournisseur connu, offre incomplète';

  return 'Sourcing nécessaire';
}

const FOOD_KEYWORDS = ['aliment', 'alimentaire', 'food', 'thé', 'the vert', 'café', 'epice', 'épice', 'boisson', 'conserve', 'snack', 'biscuit', 'sauce', 'sucre', 'farine'];
const CHEMICAL_KEYWORDS = ['peinture', 'solvant', 'aérosol', 'aerosol', 'chimique', 'vernis', 'colle', 'adhésif', 'adhesif', 'détergent', 'detergent', 'acide', 'inflammable'];
const ELECTRICAL_KEYWORDS = ['électrique', 'electrique', 'électronique', 'electronique', 'radio', 'télécom', 'telecom', 'wifi', 'bluetooth', 'antenne', 'chargeur', 'batterie', 'led', 'voltage'];
const MACHINE_KEYWORDS = ['machine', 'équipement', 'equipement', 'moteur', 'générateur', 'generateur', 'compresseur', 'pompe'];

function texteDetectionLigne(ligne) {
  return [ligne.nomProduit, ligne.famille, ligne.sousFamille, ligne.description, ligne.secteurUtilisation, ligne.matiere]
    .filter(Boolean).join(' ').toLowerCase();
}
const matchKeywords = (texte, liste) => liste.some(k => texte.includes(k));

/**
 * Suggests additional services a line should ALSO be routed to in parallel
 * (regulatory/transport checks), on top of its primary typeTraitement —
 * simple keyword rules, not NLP, per the spec's examples (peinture solvant,
 * thé vert, machine électrique).
 */
export function suggererRoutesComplementaires(ligne) {
  const texte = texteDetectionLigne(ligne);
  const candidats = [];
  if (matchKeywords(texte, FOOD_KEYWORDS)) candidats.push({ service: 'Analyse Dossiers', motif: 'Produit alimentaire — vérification ONSSA' });
  if (matchKeywords(texte, ELECTRICAL_KEYWORDS) || ligne.puissanceVoltage) candidats.push({ service: 'Analyse Dossiers', motif: 'Produit électrique/électronique — conformité ANRT' });
  if (matchKeywords(texte, CHEMICAL_KEYWORDS) || ligne.marchandiseDangereuse === 'Oui') {
    candidats.push({ service: 'Analyse Dossiers', motif: 'Produit chimique/dangereux — MSDS et réglementation' });
    candidats.push({ service: 'Transport', motif: 'Marchandise dangereuse — cotation transport spécifique' });
  }
  if (matchKeywords(texte, MACHINE_KEYWORDS)) candidats.push({ service: 'Études & Chiffrage', motif: 'Machine/équipement — étude technique' });

  const parService = {};
  candidats.forEach(r => {
    if (!parService[r.service]) parService[r.service] = { service: r.service, motif: r.motif };
    else parService[r.service].motif += ' ; ' + r.motif;
  });
  return Object.values(parService);
}

/**
 * Checks the minimum fields needed before sending a line to Sourcing. Never
 * blocks — only reports what's missing.
 */
export function verifierMinimumSourcing(ligne) {
  const manquants = [];
  if (!ligne.nomProduit) manquants.push('nom du produit');
  if (!ligne.description) manquants.push('description');
  if (!ligne.usage) manquants.push('usage');
  if (!ligne.quantite) manquants.push('quantité');
  if (!ligne.unite) manquants.push('unité');
  if (!ligne.niveauQualite) manquants.push('qualité recherchée');
  if (!ligne.paysOrigine) manquants.push('pays souhaité (ou "Ouvert")');
  if (!ligne.delaiSouhaite) manquants.push('délai souhaité');
  return { ok: manquants.length === 0, manquants };
}

const CHECKLIST_ENVOI_CALCUL_CHAMPS = [
  { champ: 'fournisseur', label: 'Fournisseur identifié' },
  { champ: 'proforma', label: 'Proforma jointe' },
  { champ: 'nomProduit', label: 'Produit identifié' },
  { champ: 'quantite', label: 'Quantité' },
  { champ: 'prixUnitaire', label: 'Prix' },
  { champ: 'devise', label: 'Devise' },
  { champ: 'incoterm', label: 'Incoterm' },
  { champ: 'paysOrigine', label: "Pays d'origine" },
  { champ: 'adresseEnlevement', label: "Adresse d'enlèvement (EXW)", nonApplicableSi: (l) => !!l.incoterm && l.incoterm !== 'EXW' },
  { champ: 'poidsBrutTotal', label: 'Poids' },
  { champ: 'cbmTotal', label: 'Volume (CBM)' },
  { champ: 'typeEmballage', label: 'Conditionnement' },
  { champ: 'delaiProduction', label: 'Délai de production' },
  { champ: 'ficheTechniqueFournisseur', label: 'Documents techniques' },
  { champ: 'photo', label: 'Photos' }
];

/**
 * Pre-send checklist for the Proforma/Calcul circuit. Statuses are computed
 * automatically (Disponible/Manquante/Non applicable) — a manual "À
 * confirmer" override is left for a future pass.
 */
export function checklistEnvoiCalcul(ligne) {
  return CHECKLIST_ENVOI_CALCUL_CHAMPS.map(r => ({
    champ: r.champ,
    label: r.label,
    statut: (r.nonApplicableSi && r.nonApplicableSi(ligne)) ? 'Non applicable' : (ligne[r.champ] ? 'Disponible' : 'Manquante')
  }));
}

const DELAIS_ROUTAGE_JOURS = { 'Sourcing': 2, 'Études & Chiffrage': 1, 'Analyse Dossiers': 3, 'Transport': 2 };

/** Flat per-service due-date offset (calendar days) — no working-calendar exists elsewhere in the app. */
export function calculerEcheanceRoutage(service) {
  const jours = DELAIS_ROUTAGE_JOURS[service] ?? 2;
  const d = new Date();
  d.setDate(d.getDate() + jours);
  return d.toISOString().slice(0, 10);
}

const CHAMPS_FICHIER_LIGNE = ['photo', 'proforma', 'ficheTechniqueFournisseur', 'manuel', 'ficheTechnique', 'msds'];

/**
 * Single structured notification template reused for every routing target
 * (Sourcing/Calcul/Réglementation/Transport). The notif system is plain
 * text (no binary attachments), so this summarizes what's attached and
 * links directly to the line instead of forwarding files.
 */
export function construireMessageRoutage({ titre, ligne, demande, echeance, extra }) {
  const nbDocuments = CHAMPS_FICHIER_LIGNE.filter(c => !!ligne[c]).length;
  return [
    titre,
    `Demande : ${demande?.code || '—'} · Client : ${demande?.client || '—'}`,
    `Produit : ${ligne.nomProduit || '—'}`,
    ligne.usage ? `Usage : ${ligne.usage}` : null,
    `Quantité : ${ligne.quantite || '—'} ${ligne.unite || ''}`.trim(),
    ligne.description ? `Spécifications : ${ligne.description}` : null,
    `Pays souhaité : ${ligne.paysOrigine || 'Ouvert'}`,
    demande?.budgetGlobalEstime ? `Budget : ${demande.budgetGlobalEstime} MAD` : null,
    `Documents joints : ${nbDocuments}`,
    echeance ? `Date limite : ${echeance}` : null,
    extra || null,
    `Lien : #ficheDemandeLigne:${ligne.code}`
  ].filter(Boolean).join('\n');
}
