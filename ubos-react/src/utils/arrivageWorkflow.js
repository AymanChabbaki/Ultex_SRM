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
