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
