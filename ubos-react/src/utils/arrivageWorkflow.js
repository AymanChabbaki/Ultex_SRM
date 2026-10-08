export const ETATS_REVUE_ARRIVAGE = Object.freeze({
  NON_DEMARRE: 'Non démarré',
  IMANE: 'À examiner par Imane',
  DIRECTION: 'À analyser par Direction',
  YASSER: 'À traiter par Yasser',
  VALIDE: 'Validé par Imane',
});

export const ACTIONS_REVUE_ARRIVAGE = Object.freeze({
  DEMARRER: 'demarrer',
  ENVOYER_DIRECTION: 'envoyer_direction',
  ENVOYER_YASSER: 'envoyer_yasser',
  RETOUR_IMANE: 'retour_imane',
  VALIDER: 'valider',
});

const TRANSITIONS = {
  [ACTIONS_REVUE_ARRIVAGE.DEMARRER]: {
    etat: ETATS_REVUE_ARRIVAGE.IMANE,
    cible: 'Imane',
    label: 'Arrivage envoyé à Imane pour examen',
  },
  [ACTIONS_REVUE_ARRIVAGE.ENVOYER_DIRECTION]: {
    etat: ETATS_REVUE_ARRIVAGE.DIRECTION,
    cible: 'Direction',
    label: 'Arrivage envoyé à la Direction pour analyse',
  },
  [ACTIONS_REVUE_ARRIVAGE.ENVOYER_YASSER]: {
    etat: ETATS_REVUE_ARRIVAGE.YASSER,
    cible: 'Yasser',
    label: 'Arrivage retourné à Yasser pour analyse, suivi ou modification des documents',
  },
  [ACTIONS_REVUE_ARRIVAGE.RETOUR_IMANE]: {
    etat: ETATS_REVUE_ARRIVAGE.IMANE,
    cible: 'Imane',
    label: 'Travail terminé et retourné à Imane',
  },
  [ACTIONS_REVUE_ARRIVAGE.VALIDER]: {
    etat: ETATS_REVUE_ARRIVAGE.VALIDE,
    cible: '',
    label: 'Arrivage validé par Imane',
  },
};

function normaliserIdentite(value) {
  return String(value || '').trim().toLocaleLowerCase('fr');
}

export function destinataireCollaborateur(db, aliases, fallback) {
  const recherches = aliases.map(normaliserIdentite);
  const user = (db?.utilisateurs || []).find(item => {
    if (item.actif === false) return false;
    const texte = normaliserIdentite(`${item.identifiant || ''} ${item.nomComplet || ''}`);
    return recherches.some(alias => texte.includes(alias));
  });
  return user?.nomComplet || user?.identifiant || fallback;
}

export function destinataireImane(db) {
  return destinataireCollaborateur(db, ['imane'], 'Imane');
}

export function destinataireYasser(db) {
  return destinataireCollaborateur(db, ['yasser', 'yassir'], 'Sourcing');
}

export function notificationsNouvelleCommande(db, commande) {
  const reference = commande.referenceMetier || commande.code;
  const message = `Nouvelle commande ${reference} insérée dans le CRM. Préparez son suivi LIMEX et son rattachement à un arrivage.\nLien : #ficheCommande:${commande.code}`;
  return [...new Set(['Direction', destinataireImane(db), destinataireYasser(db)])]
    .map(dest => ({ dest, message, module: 'Commandes / LIMEX' }));
}

const valeursUniques = values => [...new Set(values
  .flatMap(value => Array.isArray(value) ? value : [value])
  .map(value => String(value ?? '').trim())
  .filter(Boolean))];

const joindre = (values, separator = ' · ') => valeursUniques(values).join(separator);

const premiereValeur = (...values) => values.find(value => String(value ?? '').trim()) ?? '';

const dateISO = value => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value).slice(0, 10);
  return parsed.toISOString().slice(0, 10);
};

const premiereDate = values => valeursUniques(values).map(dateISO).filter(Boolean).sort()[0] || '';
const derniereDate = values => valeursUniques(values).map(dateISO).filter(Boolean).sort().at(-1) || '';

const nombre = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatNombre = value => Number(value || 0).toLocaleString('fr-FR', {
  minimumFractionDigits: Number(value || 0) % 1 ? 2 : 0,
  maximumFractionDigits: 2,
});

export function lignesArrivageDepuisCommandes(db, commandes) {
  return commandes.flatMap(commande => {
    const demandeCode = commande.demande || commande.source_demande_id;
    const lignesDemande = (db?.demandeLignes || []).filter(ligne => ligne.demande === demandeCode);
    const lignesCommande = Array.isArray(commande.lignes) ? commande.lignes : [];
    if (!lignesCommande.length) return lignesDemande.map(ligne => ({ ...ligne, commandeCode: commande.code }));

    return lignesCommande.map((ligne, index) => {
      const identifiants = [ligne.code, ligne.id, ligne.idTechniqueSource, ligne.referenceMetier, ligne.reference]
        .map(normaliserIdentite).filter(Boolean);
      const ligneDemande = lignesDemande.find(candidate => {
        const candidats = [candidate.code, candidate.id, candidate.idTechniqueSource, candidate.referenceMetier, candidate.reference]
          .map(normaliserIdentite).filter(Boolean);
        return candidats.some(value => identifiants.includes(value));
      }) || lignesDemande[index] || {};
      // La commande est prioritaire pour les valeurs commerciales finales,
      // tandis que la demande complète les données techniques/logistiques.
      return { ...ligneDemande, ...ligne, commandeCode: commande.code };
    });
  });
}

/**
 * Agrège les données déjà connues par UBOS quand une ou plusieurs commandes
 * sont rattachées à un arrivage. Les champs purement logistiques (ETA, BL,
 * conteneur, compagnie réelle...) restent volontairement à compléter.
 */
export function prefillArrivageDepuisCommandes(db, commandeCodes = [], courant = {}) {
  const codes = new Set(Array.isArray(commandeCodes) ? commandeCodes : []);
  const commandes = (db?.commandes || []).filter(commande => codes.has(commande.code));
  if (!commandes.length) return {};

  const demandes = valeursUniques(commandes.map(commande => commande.demande || commande.source_demande_id))
    .map(code => (db?.demandes || []).find(demande => demande.code === code))
    .filter(Boolean);
  const referencesClients = valeursUniques([
    ...commandes.map(commande => commande.client),
    ...demandes.map(demande => demande.client || demande.codeClientUltex),
  ]);
  const clients = referencesClients
    .map(reference => (db?.clients || []).find(client => (
      normaliserIdentite(client.code) === normaliserIdentite(reference)
      || normaliserIdentite(client.codeClientUltex) === normaliserIdentite(reference)
    )))
    .filter(Boolean);
  const lignes = lignesArrivageDepuisCommandes(db, commandes);
  const paiements = (db?.paiements || []).filter(paiement => {
    if (codes.has(paiement.commande)) return true;
    if (commandes.some(commande => commande.paiement === paiement.code || (commande.paiementCodes || []).includes(paiement.code))) return true;
    return demandes.some(demande => paiement.demande === demande.code);
  });
  const documents = (db?.documents || []).filter(document => {
    if (codes.has(document.commande)) return true;
    if (demandes.some(demande => document.demande === demande.code)) return true;
    return lignes.some(ligne => document.ligneDemande === ligne.code);
  });
  const fournisseurs = valeursUniques(lignes.map(ligne => ligne.fournisseur))
    .map(code => (db?.fournisseurs || []).find(fournisseur => fournisseur.code === code) || { code, nom: code });

  const totalPoids = lignes.reduce((somme, ligne) => somme + nombre(ligne.poidsBrutTotal || ligne.poids), 0);
  const totalCbm = lignes.reduce((somme, ligne) => somme + nombre(ligne.cbmTotal || ligne.cbm), 0);
  const montantDevis = commandes.reduce((somme, commande) => somme + nombre(
    commande.calculValideMontantMad || commande.closingValidatedDevisTotalMad || commande.montantDevisValideMad,
  ), 0);
  const produits = joindre(lignes.map(ligne => premiereValeur(
    ligne.nomProduit, ligne.produit, ligne.designationTechnique, ligne.description,
  )), ' ; ') || joindre(demandes.map(demande => demande.objectifGeneral), ' ; ');
  const modes = valeursUniques([
    ...commandes.map(commande => commande.modeTransport),
    ...lignes.map(ligne => ligne.modeTransportSouhaite || ligne.modeTransport),
  ]);
  const incoterms = valeursUniques([
    ...commandes.map(commande => commande.incoterm),
    ...lignes.map(ligne => ligne.incoterm),
  ]);
  const packages = valeursUniques(commandes.map(commande => commande.formuleUltex));
  const paysOrigine = valeursUniques(lignes.map(ligne => ligne.paysOrigine || ligne.paysFournisseur));
  const villesEnlevement = valeursUniques(lignes.map(ligne => ligne.adresseEnlevement || ligne.villeFournisseur));
  const portsDepart = valeursUniques(lignes.map(ligne => ligne.portProbable));
  const proformas = valeursUniques([
    ...commandes.map(commande => commande.numeroProforma || commande.referenceProforma),
    ...documents.filter(document => /proforma|invoice|facture fournisseur/i.test(`${document.type || ''} ${document.nom || ''}`))
      .map(document => document.nom || document.code),
  ]);
  const modesPaiement = valeursUniques(paiements.map(paiement => paiement.modePaiement || paiement.mode));
  const sens = valeursUniques(demandes.map(demande => demande.sensOperation));
  const references = commandes.map(commande => commande.referenceMetier || commande.code);

  const volumePoids = [
    totalCbm > 0 ? `${formatNombre(totalCbm)} CBM` : '',
    totalPoids > 0 ? `${formatNombre(totalPoids)} kg` : '',
  ].filter(Boolean).join(' · ');

  return {
    nomInterne: courant.nomInterne || [
      joindre(references, ' + '),
      joindre(clients.map(client => client.nom || client.raisonSociale), ' / '),
    ].filter(Boolean).join(' — '),
    codeClientSource: joindre(
      clients.length ? clients.map(client => client.codeClientUltex || client.code) : referencesClients,
      ' / ',
    ),
    nomClientSource: joindre([
      ...clients.map(client => client.nom || client.raisonSociale),
      ...commandes.map(commande => commande.nomClient || commande.clientNom),
      ...demandes.map(demande => demande.nomClient || demande.clientNom),
    ], ' / '),
    produitSource: produits,
    incotermSource: joindre(incoterms, ' / '),
    serviceSource: joindre(packages.length ? packages : demandes.map(demande => demande.typeDemande), ' / '),
    dateConfirmationSource: premiereDate(commandes.map(commande => commande.dateConfirmation || commande.dateCommande)),
    totalImporteSource: montantDevis > 0 ? `${formatNombre(montantDevis)} MAD` : '',
    dateEngagementSource: premiereDate(commandes.map(commande => commande.dateEngagement || commande.dateConversionWorkflow || commande.dateConfirmation)),
    datePaiementSource: derniereDate(paiements.map(paiement => paiement.datePaiementEffectif || paiement.date || paiement.ts)),
    modePaiementSource: joindre(modesPaiement, ' / '),
    numeroProformaSource: joindre(proformas, ' / '),
    volumePoidsSource: volumePoids,
    type: sens.length === 1 ? sens[0] : (courant.type || 'Import'),
    formuleDominante: packages.length === 1 ? packages[0] : joindre(packages, ' / '),
    modeTransport: modes.length === 1 ? modes[0] : joindre(modes, ' / '),
    paysOrigine: joindre(paysOrigine, ' / '),
    villeEnlevement: joindre(villesEnlevement, ' / '),
    portDepart: joindre(portsDepart, ' / '),
    portArrivee: courant.portArrivee || joindre(demandes.map(demande => demande.villeDestination), ' / '),
    typeConteneur: courant.typeConteneur || joindre(lignes.map(ligne => ligne.typeConteneur || ligne.conteneur), ' / '),
    _prefill: {
      commandes: commandes.length,
      clients: clients.length,
      produits: lignes.length,
      fournisseurs: fournisseurs.length,
      documents: documents.length,
      paiements: paiements.length,
    },
  };
}

export function roleRevueArrivage(session) {
  if (!session) return '';
  if (session.departement === 'Direction' || (session.services || []).includes('Direction')) return 'Direction';
  const identite = normaliserIdentite(`${session.identifiant || ''} ${session.nomComplet || ''}`);
  if (identite.includes('imane')) return 'Imane';
  if (identite.includes('yasser') || identite.includes('yassir')) return 'Yasser';
  if ((session.services || []).includes('LIMEX')) return 'Imane';
  if ((session.services || []).includes('Sourcing')) return 'Yasser';
  return '';
}

export function actionsRevueArrivage(arrivage, role) {
  const etat = arrivage?.circuitValidation || ETATS_REVUE_ARRIVAGE.NON_DEMARRE;
  if (etat === ETATS_REVUE_ARRIVAGE.NON_DEMARRE && ['Yasser', 'Direction'].includes(role)) {
    return [ACTIONS_REVUE_ARRIVAGE.DEMARRER];
  }
  if (etat === ETATS_REVUE_ARRIVAGE.IMANE && role === 'Imane') {
    return [
      ACTIONS_REVUE_ARRIVAGE.ENVOYER_DIRECTION,
      ACTIONS_REVUE_ARRIVAGE.ENVOYER_YASSER,
      ACTIONS_REVUE_ARRIVAGE.VALIDER,
    ];
  }
  if (etat === ETATS_REVUE_ARRIVAGE.DIRECTION && role === 'Direction') {
    return [ACTIONS_REVUE_ARRIVAGE.RETOUR_IMANE];
  }
  if (etat === ETATS_REVUE_ARRIVAGE.YASSER && role === 'Yasser') {
    return [ACTIONS_REVUE_ARRIVAGE.RETOUR_IMANE];
  }
  return [];
}

export function transitionRevueArrivage(arrivage, action, { role, auteur, note, date = new Date().toISOString() }) {
  const autorisees = actionsRevueArrivage(arrivage, role);
  if (!autorisees.includes(action)) throw new Error("Cette action n'est pas autorisée à cette étape.");
  const propre = String(note || '').trim();
  if (action !== ACTIONS_REVUE_ARRIVAGE.VALIDER && !propre) {
    throw new Error('Ajoutez une note avant cet envoi.');
  }
  const actionsNecessitantCommande = [
    ACTIONS_REVUE_ARRIVAGE.DEMARRER,
    ACTIONS_REVUE_ARRIVAGE.ENVOYER_DIRECTION,
    ACTIONS_REVUE_ARRIVAGE.ENVOYER_YASSER,
    ACTIONS_REVUE_ARRIVAGE.VALIDER,
  ];
  if (actionsNecessitantCommande.includes(action) && !(arrivage.commandes || []).length) {
    throw new Error("Ajoutez au moins une commande à l'arrivage avant de l'envoyer à Imane.");
  }

  const transition = TRANSITIONS[action];
  const avant = arrivage.circuitValidation || ETATS_REVUE_ARRIVAGE.NON_DEMARRE;
  const entree = {
    id: `REV-${Date.parse(date) || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date,
    auteur: auteur || role,
    role,
    action,
    libelle: transition.label,
    note: propre,
    avant,
    apres: transition.etat,
    destinataire: transition.cible,
  };

  return {
    arrivage: {
      ...arrivage,
      circuitValidation: transition.etat,
      circuitDestinataire: transition.cible,
      circuitDerniereNote: propre,
      circuitDerniereActionLe: date,
      circuitDerniereActionPar: auteur || role,
      circuitHistorique: [entree, ...(arrivage.circuitHistorique || [])],
    },
    entree,
    cible: transition.cible,
  };
}

export function initialiserRevueArrivage(arrivage, auteur, date = new Date().toISOString()) {
  if (arrivage.circuitValidation) return arrivage;
  const entree = {
    id: `REV-${Date.parse(date) || Date.now()}-creation`,
    date,
    auteur: auteur || 'Yasser',
    role: 'Yasser',
    action: 'creation',
    libelle: 'Arrivage créé et transmis à Imane',
    note: '',
    avant: ETATS_REVUE_ARRIVAGE.NON_DEMARRE,
    apres: ETATS_REVUE_ARRIVAGE.IMANE,
    destinataire: 'Imane',
  };
  return {
    ...arrivage,
    circuitValidation: ETATS_REVUE_ARRIVAGE.IMANE,
    circuitDestinataire: 'Imane',
    circuitDerniereActionLe: date,
    circuitDerniereActionPar: auteur || 'Yasser',
    circuitHistorique: [entree, ...(arrivage.circuitHistorique || [])],
  };
}
