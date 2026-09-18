/**
 * Clients "belonging" to an agent: assigned via responsableCommercial (name)
 * or via their service (e.g. "Data" for any team-wide fallback assignment).
 */
export function clientsDeAgent(db, user) {
  const nom = user?.nomComplet || user?.identifiant;
  const estData = (user?.services || []).includes('Data');
  return (db.clients || []).filter(c =>
    c.responsableCommercial === nom ||
    (user?.services || []).includes(c.responsableCommercial) ||
    (estData && !c.responsableCommercial && (c.sourceDonnees === 'Workflow' || c.sourceDonnees === 'Google Sheets' || c.ultexDossierId))
  );
}

export function demandesDeAgent(db, user) {
  const nom = user?.nomComplet || user?.identifiant;
  const services = user?.services || [];
  const estData = services.includes('Data');
  return (db.demandes || []).filter(d =>
    d.responsableData === nom || services.includes(d.responsableData) || (estData && !d.responsableData)
  );
}

function jourIso(value) {
  if (!value) return '';
  const texte = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(texte)) return texte.slice(0, 10);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function leadsDuJour(db, user, date = new Date()) {
  const jour = date.toISOString().slice(0, 10);
  return demandesDeAgent(db, user)
    .filter(d => (d.dateDemande || String(d.dateHeureReception || '').slice(0, 10)) === jour)
    .sort((a, b) => String(b.dateHeureReception || b.ts || '').localeCompare(String(a.dateHeureReception || a.ts || '')));
}

function dateSuiviClient(client) {
  return client.dernierSuiviData || client.dernierContact || client.dateDerniereDemande || client.datePremierContact || null;
}

export function codesSansSuiviDepuis(db, user, jours = 30, date = new Date()) {
  const debutJour = new Date(date.toDateString());
  return clientsDeAgent(db, user).filter(client => {
    if (client.segment === 'Inactif') return false;
    const valeur = dateSuiviClient(client);
    if (!valeur) return true;
    const suivi = new Date(valeur);
    return !Number.isNaN(suivi.getTime()) && Math.floor((debutJour - suivi) / 864e5) >= jours;
  });
}

const ACTION_PAR_DATA_TAG = {
  'En cours de traitement': 'Continuer le traitement du code',
  'Pas réponse': 'Relancer le client',
  'Réclamation': 'Traiter la réclamation',
  'Double codage': 'Vérifier et fusionner le double codage',
  'Num ironné': 'Corriger ou confirmer le numéro du client',
  'Autre': 'Vérifier le code et définir la prochaine action',
};

const SEQUENCE_RELANCE_JOURS = [3, 7, 15, 30, 60];

/** J+3 / J+7 / J+15 / J+30 (dormant) / J+60 (réactivation) follow-up schedule. */
export function calculerRelanceSuivante(nbRelances) {
  const idx = Math.min(nbRelances || 0, SEQUENCE_RELANCE_JOURS.length - 1);
  const jours = SEQUENCE_RELANCE_JOURS[idx];
  const d = new Date();
  d.setDate(d.getDate() + jours);
  return d.toISOString().slice(0, 10);
}

/**
 * Transparent, signal-based priority — not a ML score. A client never
 * contacted yet is ranked above a "Chaud" one on purpose: fresh prospects
 * convert best when acted on quickly.
 */
export function calculerPrioriteClient(client) {
  if (client.segment === 'Client VIP') return { tag: 'VIP', score: 100 };

  const auj = new Date(new Date().toDateString());
  const aujourdHui = new Date().toISOString().slice(0, 10);
  if (client.echeanceActionSuivante && jourIso(client.echeanceActionSuivante) < aujourdHui) return { tag: 'Urgent', score: 90 };
  if (client.urgence === 'Urgente') return { tag: 'Urgent', score: 85 };
  if (!client.dernierContact) return { tag: 'Très chaud', score: 80 };

  const joursDepuis = Math.floor((auj - new Date(client.dernierContact)) / 864e5);
  if (joursDepuis <= 3) return { tag: 'Chaud', score: 60 };
  if (joursDepuis <= 15) return { tag: 'Normal', score: 40 };
  if (joursDepuis <= 30) return { tag: 'Froid', score: 20 };
  return { tag: 'Dormant', score: 5 };
}

/**
 * Ranked daily work queue: clients due/overdue for follow-up or never
 * contacted, plus the agent's own tasks due today/overdue — same
 * tache-filtering convention as PersonalDashboard.jsx.
 */
export function genererFileDeTravail(db, user) {
  const nom = user?.nomComplet || user?.identifiant;
  const auj = new Date(new Date().toDateString());
  const ajd = new Date().toISOString().slice(0, 10);
  const items = [];
  const cles = new Set();
  const ajouter = item => {
    const cle = `${item.type}:${item.code}:${item.motif || item.sousLibelle || ''}`;
    if (!cles.has(cle)) { cles.add(cle); items.push(item); }
  };

  clientsDeAgent(db, user).forEach(c => {
    const echeanceJour = jourIso(c.echeanceActionSuivante);
    const due = echeanceJour && echeanceJour <= ajd;
    const jamaisContacte = !c.dernierContact;
    if (due || jamaisContacte) {
      const { tag, score } = calculerPrioriteClient(c);
      ajouter({
        type: 'client', code: c.code, libelle: c.nom,
        sousLibelle: c.actionSuivante || (jamaisContacte ? 'Premier contact à effectuer' : 'Relance à effectuer'),
        lien: `#ficheClient:${c.code}`,
        retard: !!(echeanceJour && echeanceJour < ajd),
        tag, score, motif: 'relance'
      });
    }

    const echeanceCode = jourIso(c.echeanceCode);
    if (echeanceCode && echeanceCode <= ajd) {
      ajouter({
        type: 'client', code: c.code, libelle: `${c.code} — ${c.nom}`,
        sousLibelle: c.actionSuivante || 'Traiter le code à la date promise au client',
        lien: `#ficheClient:${c.code}`, retard: echeanceCode < ajd,
        tag: echeanceCode < ajd ? 'Urgent' : "Aujourd'hui", score: echeanceCode < ajd ? 98 : 88,
        motif: 'echeance-code',
      });
    }
  });

  codesSansSuiviDepuis(db, user, 30, auj).forEach(c => ajouter({
    type: 'client', code: c.code, libelle: `${c.code} — ${c.nom}`,
    sousLibelle: 'Aucun suivi Data depuis au moins un mois',
    lien: `#ficheClient:${c.code}`, retard: true, tag: 'Dormant', score: 82,
    motif: 'sans-suivi-30j',
  }));

  const demandesAgent = demandesDeAgent(db, user);
  leadsDuJour(db, user, auj).forEach(d => ajouter({
    type: 'demande', code: d.code, libelle: `${d.codeClientUltex || d.client || d.code} — ${d.objectifGeneral || 'Nouvelle demande'}`,
    sousLibelle: `Nouveau lead du jour · ${d.sourceSynchronisation || d.source || 'Source non précisée'}`,
    lien: `#ficheDemande:${d.code}`, retard: false, tag: 'Nouveau', score: 78,
    motif: 'lead-du-jour',
  }));

  demandesAgent.forEach(d => {
    const echeance = jourIso(d.echeanceActionSuivante);
    if (echeance && echeance <= ajd) {
      ajouter({
        type: 'demande', code: d.code, libelle: `${d.codeClientUltex || d.client || d.code} — ${d.objectifGeneral || 'Demande'}`,
        sousLibelle: d.actionSuivante || 'Traiter l’échéance de la demande',
        lien: `#ficheDemande:${d.code}`, retard: echeance < ajd,
        tag: echeance < ajd ? 'Urgent' : "Aujourd'hui", score: echeance < ajd ? 96 : 86,
        motif: 'echeance-demande',
      });
    }
    const actionTag = ACTION_PAR_DATA_TAG[d.dataTag];
    if (actionTag && !(echeance && echeance <= ajd)) {
      ajouter({
        type: 'demande', code: d.code, libelle: `${d.codeClientUltex || d.client || d.code} — ${d.objectifGeneral || 'Demande'}`,
        sousLibelle: `${actionTag} · Data Tag : ${d.dataTag}`,
        lien: `#ficheDemande:${d.code}`, retard: false,
        tag: ['Réclamation', 'Double codage', 'Num ironné'].includes(d.dataTag) ? 'Urgent' : 'Chaud',
        score: ['Réclamation', 'Double codage', 'Num ironné'].includes(d.dataTag) ? 92 : 68,
        motif: `tag-${d.dataTag}`,
      });
    }
  });

  (db.taches || []).filter(t => t.statut !== 'Terminée' && ((user?.services || []).includes(t.assigne) || t.assigne === nom))
    .forEach(t => {
      const enRetard = !!(t.echeance && new Date(t.echeance) < auj);
      const duJour = t.echeance === ajd;
      if (!enRetard && !duJour) return;
      ajouter({
        type: 'tache', code: t.code, libelle: t.titre,
        sousLibelle: t.dossier ? `Dossier ${t.dossier}` : '',
        lien: t.dossier ? `#ficheDossier:${t.dossier}` : '#taches',
        retard: enRetard,
        tag: t.priorite === 'Critique' ? 'Urgent' : t.priorite === 'Haute' ? 'Chaud' : 'Normal',
        score: t.priorite === 'Critique' ? 95 : t.priorite === 'Haute' ? 70 : 45,
        motif: 'tache'
      });
    });

  return items.sort((a, b) => (b.retard - a.retard) || (b.score - a.score));
}

const SEUIL_JOURS_SANS_RELANCE = 30;

/** The 7 alerts that are actually derivable from real fields — no fabricated "blocked" state. */
export function genererAlertesData(db, user) {
  const auj = new Date(new Date().toDateString());
  const clientsAgent = clientsDeAgent(db, user);
  const alertes = [];

  const push = (titre, clients) => { if (clients.length) alertes.push({ titre, clients }); };

  push('Codes sans suivi Data depuis 1 mois ou plus', codesSansSuiviDepuis(db, user, SEUIL_JOURS_SANS_RELANCE, auj));

  push('Échéances de traitement des codes arrivées', clientsAgent.filter(c =>
    c.echeanceCode && jourIso(c.echeanceCode) <= new Date().toISOString().slice(0, 10) && c.segment !== 'Inactif'
  ));

  push('Clients sans prochaine action définie', clientsAgent.filter(c => !c.echeanceActionSuivante && c.segment !== 'Inactif'));

  push("Clients en attente d'informations", clientsAgent.filter(c =>
    ['Attente photos', 'Attente fournisseur', 'Attente HS Code', 'Attente quantité'].includes(c.etapePipeline)
  ));

  push('Clients prêts à devenir une Demande', clientsAgent.filter(c => c.etapePipeline === 'Prêt pour Demande'));

  push('Relances dépassées', clientsAgent.filter(c => c.echeanceActionSuivante && jourIso(c.echeanceActionSuivante) < new Date().toISOString().slice(0, 10)));

  push('Clients jamais contactés', clientsAgent.filter(c => !c.dernierContact && c.segment !== 'Inactif'));

  const nom = user?.nomComplet || user?.identifiant;
  const lignesIncompletes = (db.demandeLignes || []).filter(l => {
    const dem = (db.demandes || []).find(d => d.code === l.demande);
    return dem && dem.responsableData === nom && ['Brouillon', 'À compléter'].includes(l.statut);
  });
  if (lignesIncompletes.length) alertes.push({ titre: 'Lignes de demande incomplètes', lignes: lignesIncompletes });

  return alertes;
}

const OBJECTIF_PAR_DEFAUT = {
  label: 'Objectif par défaut (aucun objectif configuré par la Direction)', parDefaut: true,
  demandesParJour: 5, clientsContactesParJour: 25, relancesParJour: 15, nouveauxClientsParJour: 6,
  codesTraitesParJour: 10, devisControlesParJour: 5, retoursMansouriParJour: 5
};

/**
 * The objective whose [dateDebut, dateFin] window contains today. A
 * nominative objective for `user` takes priority over the Data-wide one
 * (`utilisateur` blank) covering the same date, else a clearly-labeled
 * default.
 */
export function calculerObjectifActif(db, user) {
  const ajd = new Date().toISOString().slice(0, 10);
  const actifs = (db.objectifsData || []).filter(o => o.dateDebut <= ajd && ajd <= o.dateFin);
  const nom = user?.nomComplet || user?.identifiant;
  const nominatif = nom && actifs.find(o => o.utilisateur === nom);
  const global = actifs.find(o => !o.utilisateur);
  return nominatif || global || OBJECTIF_PAR_DEFAUT;
}

/** Real counters only — nothing here is estimated or simulated. */
export function calculerProgressionJour(db, user) {
  const nom = user?.nomComplet || user?.identifiant;
  const ajd = new Date().toISOString().slice(0, 10);
  const dateAuditAjd = new Date().toLocaleDateString('fr-FR');
  const auditAujourdhui = (db.audit || []).filter(a => a.utilisateur === nom && a.date === dateAuditAjd);
  const clientsAgent = clientsDeAgent(db, user);

  return {
    demandesCreees: auditAujourdhui.filter(a => a.module === 'Demandes' && a.action === 'Création').length,
    nouveauxClients: auditAujourdhui.filter(a => a.module === 'Clients' && a.action === 'Création').length,
    clientsContactes: clientsAgent.filter(c => c.dernierContact === ajd).length,
    relancesEffectuees: clientsAgent.filter(c => c.dernierContact === ajd && (c.nbRelances || 0) > 0).length
  };
}

const STATUTS_SOURCING_OBTENU = ['Fournisseur trouvé', 'Prête pour offre', 'Offre envoyée', 'Confirmée'];

/** Renamed honestly from the spec's "Sourcing payants obtenus" — no paid/free distinction exists in the data model. */
export function calculerSourcingsObtenus(db, user) {
  const nom = user?.nomComplet || user?.identifiant;
  return (db.demandeLignes || []).filter(l => {
    const dem = (db.demandes || []).find(d => d.code === l.demande);
    return dem && dem.responsableData === nom && STATUTS_SOURCING_OBTENU.includes(l.statut);
  }).length;
}

/** Deterministic template built from the same real data — explicitly not an LLM call. */
export function genererResumeJournalier(user, file, alertes, progression, objectif) {
  const prenom = (user?.nomComplet || user?.identifiant || '').split(' ')[0] || 'Agent';
  const lignes = [`Bonjour ${prenom}.`, '', "Aujourd'hui tu dois :"];

  if (file.length) {
    file.slice(0, 5).forEach((item, i) => {
      lignes.push(`${i + 1}. ${item.libelle}${item.sousLibelle ? ' — ' + item.sousLibelle : ''}`);
    });
  } else {
    lignes.push('Aucune action prioritaire pour le moment — file de travail vide.');
  }

  if (alertes.length) {
    lignes.push('', `Attention : ${alertes.length} alerte(s) à traiter (voir la zone Alertes).`);
  }

  const resteDemandes = Math.max(0, (objectif.demandesParJour || 0) - progression.demandesCreees);
  const resteContacts = Math.max(0, (objectif.clientsContactesParJour || 0) - progression.clientsContactes);
  lignes.push('', `Objectif restant : encore ${resteDemandes} demande(s) et ${resteContacts} client(s) à contacter pour terminer ta journée.`);

  return lignes.join('\n');
}
