import { getUtilisateurParNom, estTacheOuverte, genererTacheAuto, tachesDeUtilisateur, STATUTS_TERMINES } from './tachesPilotage';
import { clientsDeAgent } from './dataPipeline';

export const STATUTS_FERMES_CLOSING = ['Avance reçue', 'Perdu / Abandonné', 'Clôturé'];

/** Ouvert = pas dans un statut terminal, pas archivé. Les archivés n'apparaissent plus nulle part par défaut (§5) — seule la fiche + une vue Direction peuvent les restaurer. */
export function estSuiviOuvert(suivi) {
  return !suivi.archive && !STATUTS_FERMES_CLOSING.includes(suivi.statutPipeline);
}

/** Les anciennes données non encore qualifiées (§24-25) vivent hors des compteurs/alertes normaux — c'est le bug corrigé : un "Nouveau" jamais qualifié n'est plus compté comme une vraie action à faire. */
export function estQualifie(suivi) {
  return suivi.statutPipeline !== 'À qualifier';
}

/** Suivis coordonnés par cet utilisateur (elle ne les perd jamais, §10). */
export function suivisDeCoordinateur(db, user) {
  const nom = user?.nomComplet || user?.identifiant;
  return (db.suivisClosing || []).filter(s => s.coordinateur === nom);
}

/** Affichage "8477" si dossier unique, "8477 / 8477-D02" sinon (§15) — un seul endroit pour ce libellé. */
export function libelleCode(suivi) {
  if (!suivi) return '';
  if (!suivi.codeDossier || suivi.codeDossier === suivi.codeClient) return suivi.codeClient || suivi.codeSuivi || '';
  return `${suivi.codeClient} / ${suivi.codeDossier}`;
}

/**
 * Normalisation de code (§3) : espaces retirés, majuscules, préfixe "L"
 * isolé retiré si le reste est numérique — L6242 / l6242 / L 6242 → 6242.
 */
export function normaliserCodeClient(code) {
  if (!code) return '';
  let c = String(code).replace(/\s+/g, '').toUpperCase();
  if (/^L\d+$/.test(c)) c = c.slice(1);
  return c;
}

/**
 * Détection de doublon (§3/§4) — cherche sur TOUS les suivis (pas seulement
 * ceux du coordinateur courant : un doublon peut avoir été créé par
 * n'importe qui) par codeClient normalisé, puis par téléphone si le suivi
 * est déjà rattaché à un vrai client UBOS. Ignore les suivis archivés.
 */
export function trouverClientExistant(db, codeSaisi, ignorerCode) {
  const cible = normaliserCodeClient(codeSaisi);
  if (!cible) return null;
  return (db.suivisClosing || []).find(s =>
    !s.archive && s.code !== ignorerCode && normaliserCodeClient(s.codeClient || s.codeSuivi) === cible
  ) || null;
}

/** Prochain identifiant de dossier pour un client donné (§16) — 8477-D02, -D03… */
export function genererCodeDossierSuivant(db, codeClient) {
  const existants = (db.suivisClosing || []).filter(s => normaliserCodeClient(s.codeClient) === normaliserCodeClient(codeClient));
  const n = existants.length + 1;
  return `${codeClient}-D${String(n).padStart(2, '0')}`;
}

/** Tous les dossiers d'un même client, triés du plus récent au plus ancien. */
export function dossiersDuClient(db, codeClient) {
  const cible = normaliserCodeClient(codeClient);
  return (db.suivisClosing || []).filter(s => normaliserCodeClient(s.codeClient) === cible).sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

/**
 * Recherche (§7-8) : match partiel sur codeClient/codeDossier normalisés,
 * sur le produit, et sur nom/téléphone du client UBOS si rattaché. Jamais
 * de "aucun résultat" quand le code existe réellement — recherche large,
 * filtrage à l'affichage.
 */
export function rechercherSuivis(db, user, texte) {
  const suivis = suivisDeCoordinateur(db, user);
  const q = normaliserCodeClient(texte);
  if (!q) return suivis;
  return suivis.filter(s => {
    if (normaliserCodeClient(s.codeClient || s.codeSuivi).includes(q)) return true;
    if (normaliserCodeClient(s.codeDossier).includes(q)) return true;
    if (s.produit && normaliserCodeClient(s.produit).includes(q)) return true;
    if (s.client) {
      const client = (db.clients || []).find(c => c.code === s.client);
      if (client && ((client.nom && client.nom.toUpperCase().includes(texte.toUpperCase())) || (client.telephone && client.telephone.replace(/\s+/g, '').includes(texte.replace(/\s+/g, ''))))) return true;
    }
    return false;
  });
}

/**
 * Fusion (§6) — retourne le patch à appliquer à la cible ; rien n'est
 * jamais perdu : la mémoire des deux est concaténée (dédoublonnée), les
 * champs vides de la cible sont complétés par la source. L'appelant se
 * charge de réassigner les tâches liées et d'archiver la source.
 */
export function fusionnerSuivis(source, cible) {
  const memoireFusionnee = [...(cible.memoire || []), ...(source.memoire || [])]
    .filter((m, i, arr) => arr.findIndex(x => x.texte === m.texte && x.date === m.date) === i);
  const patch = { memoire: memoireFusionnee };
  ['situationActuelle', 'actionRecommandee', 'dernierContact', 'echeanceActionSuivante', 'produit', 'client', 'dossier'].forEach(k => {
    if (!cible[k] && source[k]) patch[k] = source[k];
  });
  return patch;
}

const AUJOURD_HUI = () => new Date(new Date().toDateString());
const AJD_ISO = () => new Date().toISOString().slice(0, 10);

/** Transparent, signal-based priority — même logique que calculerPrioriteClient. */
export function calculerPrioriteSuivi(suivi) {
  const auj = AUJOURD_HUI();
  const echeance = suivi.echeanceActionSuivante ? new Date(suivi.echeanceActionSuivante) : null;
  if (echeance && echeance < auj) return { tag: 'Retard', pill: 'p-rouge' };
  if (echeance && echeance.getTime() === auj.getTime()) return { tag: 'Aujourd\'hui', pill: 'p-rouge' };
  if (!suivi.dernierContact) return { tag: 'Nouveau', pill: 'p-ambre' };
  if (suivi.statutPipeline === 'Devis envoyé' || suivi.statutPipeline === 'Négociation') return { tag: 'Chaud', pill: 'p-ambre' };
  return { tag: 'Normal', pill: 'p-gris' };
}

/** Liste "Codes à traiter aujourd'hui" (§2) — suivis ouverts dus/en retard/jamais contactés. */
export function genererProgrammeClosing(db, user) {
  const auj = AUJOURD_HUI();
  const items = suivisDeCoordinateur(db, user)
    .filter(estSuiviOuvert)
    .filter(estQualifie)
    .filter(s => {
      const echeance = s.echeanceActionSuivante ? new Date(s.echeanceActionSuivante) : null;
      const due = echeance && echeance <= auj;
      return due || !s.dernierContact;
    })
    .map(s => {
      const p = calculerPrioriteSuivi(s);
      return {
        code: s.code, codeSuivi: libelleCode(s),
        situation: s.situationActuelle || s.statutPipeline || 'Nouveau',
        actionAujourdhui: s.actionRecommandee || (s.dernierContact ? 'Relancer' : 'Premier contact'),
        dernierContact: s.dernierContact || '—',
        echeance: s.echeanceActionSuivante || '—',
        priorite: p.tag, pill: p.pill,
        lien: `#ficheSuiviClosing:${s.code}`
      };
    });
  return items.sort((a, b) => (a.priorite === 'Retard' ? 0 : a.priorite === "Aujourd'hui" ? 1 : 2) - (b.priorite === 'Retard' ? 0 : b.priorite === "Aujourd'hui" ? 1 : 2));
}

const SEUIL_JOURS_SANS_ACTION = 3;

/** Les 5 alertes du §13 — uniquement dérivées de champs réels, jamais fabriquées. */
export function genererAlertesClosing(db, user) {
  const auj = AUJOURD_HUI();
  const suivis = suivisDeCoordinateur(db, user).filter(estSuiviOuvert).filter(estQualifie);
  const alertes = [];
  const push = (titre, liste) => { if (liste.length) alertes.push({ titre, suivis: liste }); };

  push('Aucune action depuis 3 jours ou plus', suivis.filter(s =>
    s.dernierContact && Math.floor((auj - new Date(s.dernierContact)) / 864e5) >= SEUIL_JOURS_SANS_ACTION
  ));

  push('Devis envoyé sans relance programmée', suivis.filter(s =>
    s.statutPipeline === 'Devis envoyé' && (!s.echeanceActionSuivante || new Date(s.echeanceActionSuivante) < auj)
  ));

  push('Client intéressé sans prochaine action', suivis.filter(s =>
    s.statutPipeline === 'Client intéressé' && !s.echeanceActionSuivante
  ));

  const retourMansouriManquant = suivis.filter(s => {
    if (s.responsableActionActuelle !== 'Mansouri') return false;
    return (db.taches || []).some(t => t.objetType === 'suivisClosing' && t.objetCode === s.code && estTacheOuverte(t) && t.echeance && new Date(t.echeance) < auj);
  });
  push("Retour Mansouri attendu (tâche en retard)", retourMansouriManquant);

  push('Devis à contrôler', suivis.filter(s => s.statutDevis === 'À contrôler'));

  push('Dossier actif sans prochaine action', suivis.filter(s => !s.echeanceActionSuivante));

  push('Confirmation obtenue, avance non enregistrée', suivis.filter(s => s.statutPipeline === 'Confirmation' && !s.montantAvance));

  return alertes;
}

/** Suivis "chez Mansouri" dont la tâche liée est en retard (§7 catégorie 4). */
export function suivisRetourMansouriEnRetard(db, user) {
  const auj = AUJOURD_HUI();
  return suivisDeCoordinateur(db, user).filter(estSuiviOuvert).filter(s => {
    if (s.responsableActionActuelle !== 'Mansouri') return false;
    return (db.taches || []).some(t => t.objetType === 'suivisClosing' && t.objetCode === s.code && estTacheOuverte(t) && t.echeance && new Date(t.echeance) < auj);
  });
}

/** Suivis dont Mansouri vient de rendre la main — dernière note mémoire = un retour non encore traité (§7 catégorie 3). */
export function suivisRetourMansouriRecu(db, user) {
  return suivisDeCoordinateur(db, user).filter(estSuiviOuvert).filter(s => {
    if (s.responsableActionActuelle === 'Mansouri') return false;
    const derniere = (s.memoire || [])[(s.memoire || []).length - 1];
    return derniere && derniere.texte && derniere.texte.startsWith('Retour Mansouri');
  });
}

const ETAPES_CANDIDATES_MANSOURI = ['Devis envoyé', 'Client intéressé', 'Attente client', 'Négociation'];

/** Suivis prêts à être confiés à Mansouri mais pas encore transmis (§7 catégorie 1) — suggestion, pas une obligation. */
export function suivisATransmettreMansouri(db, user) {
  return suivisDeCoordinateur(db, user).filter(estSuiviOuvert)
    .filter(s => ETAPES_CANDIDATES_MANSOURI.includes(s.statutPipeline) && s.responsableActionActuelle !== 'Mansouri');
}

const DELAI_JOURS = { "Aujourd'hui": 0, 'Demain': 1, '2 jours': 2, '3 jours': 3, '7 jours': 7 };
export const OPTIONS_DELAI_RELANCE = Object.keys(DELAI_JOURS);

export function calculerEcheanceRelance(delaiLabel, dateChoisie) {
  if (dateChoisie) return dateChoisie;
  const jours = delaiLabel in DELAI_JOURS ? DELAI_JOURS[delaiLabel] : 2;
  const d = new Date();
  d.setDate(d.getDate() + jours);
  return d.toISOString().slice(0, 10);
}

const STATUT_SUGGERE_PAR_RESULTAT = {
  'Intéressé': 'Client intéressé',
  'Pas intéressé': 'Perdu / Abandonné'
};

/** Patch pour le bloc "3 clics max" du §6 — résultat + prochaine échéance. */
export function enregistrerResultatContact(suivi, resultat, echeanceSuivante) {
  const patch = {
    dernierContact: AJD_ISO(),
    dernierContactHeure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    resultatDernierContact: resultat,
    echeanceActionSuivante: echeanceSuivante || suivi.echeanceActionSuivante
  };
  const statutSuggere = STATUT_SUGGERE_PAR_RESULTAT[resultat];
  const etapesAvancees = ['Négociation', 'Accord', 'Confirmation', 'Avance reçue'];
  if (statutSuggere && !etapesAvancees.includes(suivi.statutPipeline)) {
    patch.statutPipeline = statutSuggere;
  }
  return patch;
}

/**
 * Statuts suivants pertinents selon l'état actuel (§11/§12) — jamais les 33
 * valeurs en même temps, seulement un sous-ensemble contextuel.
 */
export const PROCHAINS_STATUTS = {
  'À qualifier': ['Nouveau', 'Perdu / Abandonné'],
  'Nouveau': ['Premier contact', 'Contacté', 'Perdu / Abandonné'],
  'Premier contact': ['Contacté', 'Pas intéressé'],
  'Contacté': ['Calcul à demander', 'Client intéressé', 'Attente client', 'Informations manquantes'],
  'Informations manquantes': ['Contacté', 'Bloqué'],
  'Calcul à demander': ['Calcul demandé'],
  'Calcul demandé': ['Calcul en cours', 'Devis à contrôler'],
  'Calcul en cours': ['Devis à contrôler'],
  'Devis en cours': ['Devis à contrôler'],
  'Devis à contrôler': ['Devis validé', 'Devis retourné'],
  'Devis retourné': ['Calcul en cours'],
  'Devis validé': ['Devis envoyé'],
  'Devis envoyé': ['Attente retour client', 'Client intéressé', 'Négociation', 'Pas intéressé'],
  'Attente retour client': ['Relance prévue', 'Client intéressé'],
  'Relance prévue': ['Relance effectuée'],
  'Relance effectuée': ['Client intéressé', 'Attente client', 'Négociation'],
  'Client intéressé': ['Négociation', 'Attente décision'],
  'Attente client': ['Relance prévue', 'Négociation'],
  'Négociation': ['Attente décision', 'Confirmation probable', 'Accord'],
  'Modification demandée': ['Calcul en cours'],
  'Attente Mansouri': ['Chez Mansouri'],
  'Chez Mansouri': ['Retour Mansouri reçu'],
  'Retour Mansouri reçu': ['Client intéressé', 'Négociation', 'Attente décision'],
  'Attente décision': ['Confirmation probable', 'Accord', 'Pas intéressé'],
  'Confirmation probable': ['Accord', 'Confirmation'],
  'Accord': ['Confirmation'],
  'Confirmation': ['Avance attendue', 'Avance reçue'],
  'Avance attendue': ['Avance reçue'],
  'Avance reçue': ['Clôturé'],
  'Bloqué': ['Contacté', 'Perdu / Abandonné'],
  'Pas intéressé': ['Perdu / Abandonné'],
  'Perdu / Abandonné': [],
  'Clôturé': []
};

/**
 * Les 8 boutons "Que s'est-il passé ?" du flux TRAITER unifié (§17). Deux
 * d'entre eux (calcul/Mansouri) ont un vrai effet de bord (création de
 * tâche) et sont traités à part par la page — les six autres sont de purs
 * changements de statut/contact.
 */
export const ACTIONS_TRAITER = [
  { label: 'Client contacté', type: 'patch', statut: 'Contacté' },
  { label: 'Pas de réponse', type: 'patch', resultat: 'Pas répondu' },
  { label: 'Informations reçues', type: 'patch', statut: 'Contacté', resultat: 'Répondu' },
  { label: 'Demander calcul', type: 'calcul' },
  { label: 'Programmer relance', type: 'patch', statut: 'Relance prévue' },
  { label: 'Client intéressé', type: 'patch', statut: 'Client intéressé', resultat: 'Intéressé' },
  { label: 'Transmettre Mansouri', type: 'mansouri' },
  { label: 'Bloqué', type: 'patch', statut: 'Bloqué' }
];

/** Construit le patch d'un bouton "patch" du flux TRAITER — un seul updateDB côté page. */
export function construirePatchTraiter(suivi, actionDef, echeance, note) {
  const patch = {
    dernierContact: AJD_ISO(),
    dernierContactHeure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  };
  if (actionDef.statut) patch.statutPipeline = actionDef.statut;
  if (actionDef.resultat) patch.resultatDernierContact = actionDef.resultat;
  if (echeance) patch.echeanceActionSuivante = echeance;
  if (note && note.trim()) patch.memoire = [...(suivi.memoire || []), { texte: note.trim(), date: AJD_ISO(), auteur: suivi.coordinateur }];
  return patch;
}

/**
 * Retour Mansouri (§7/§11) : rend la main au coordinateur, capitalise la
 * note, et propose immédiatement une prochaine échéance (aujourd'hui, sauf
 * si "Fait" — rien à reprendre) plutôt que de laisser le code sans date et
 * invisible du programme du jour.
 */
export function enregistrerRetourMansouri(suivi, label) {
  const patch = {
    dernierContact: AJD_ISO(),
    responsableActionActuelle: suivi.coordinateur,
    memoire: [...(suivi.memoire || []), { texte: `Retour Mansouri : ${label}`, date: AJD_ISO(), auteur: 'Mansouri' }]
  };
  if (label !== 'Fait') patch.echeanceActionSuivante = AJD_ISO();
  return patch;
}

/** Patch de transmission à Mansouri — un seul endroit pour dater "transmis depuis" (§7 colonne dédiée), réutilisé par toutes les pages qui confient un code. */
export function confierAMansouri() {
  return { responsableActionActuelle: 'Mansouri', dateConfieAMansouri: AJD_ISO() };
}

/** Capture automatique de l'heure de fin de calcul — Zoubida n'a rien à saisir (§16). */
export function enregistrerCalculTermine() {
  return { statutDevis: 'À contrôler', calculTermineHeure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) };
}

/** Tâche Mansouri construite une seule fois, réutilisée par toutes les pages qui transmettent un code (§16 — un seul moteur). */
export function construireTachePourMansouri(suivi, genCode, par) {
  return {
    code: genCode('T'), ts: Date.now(), par, titre: `Coordination Closing — Code ${suivi.codeSuivi}`,
    assigne: 'Mansouri', priorite: 'Normale', type: 'Action commerciale', statut: 'À faire', nbReports: 0,
    objetType: 'suivisClosing', objetCode: suivi.code, resultatAttendu: 'Client traité', origine: 'Coordination Closing',
    remarque: [
      `Situation client : ${suivi.situationActuelle || suivi.statutPipeline || '—'}`,
      `Dernière action : ${suivi.resultatDernierContact || '—'}`,
      `Dernier contact : ${suivi.dernierContact || '—'}`
    ].join('\n')
  };
}

/** Compte par étape pour l'entonnoir (§15/§20). */
export function calculerPipelineClosing(db, user) {
  const suivis = user ? suivisDeCoordinateur(db, user) : (db.suivisClosing || []);
  const parEtape = {};
  suivis.forEach(s => { parEtape[s.statutPipeline || 'Nouveau'] = (parEtape[s.statutPipeline || 'Nouveau'] || 0) + 1; });
  return { total: suivis.length, parEtape };
}

/** Compteurs du jour/semaine (§15/§19) — dérivés de champs réels et de l'audit, jamais estimés. */
export function calculerObjectifsClosingJour(db, user) {
  const nom = user?.nomComplet || user?.identifiant;
  const ajd = AJD_ISO();
  const dateAuditAjd = new Date().toLocaleDateString('fr-FR');
  const auj = AUJOURD_HUI();
  const septJoursAvant = new Date(auj); septJoursAvant.setDate(septJoursAvant.getDate() - 7);

  const suivis = suivisDeCoordinateur(db, user);
  const auditAujourdhui = (db.audit || []).filter(a => a.utilisateur === nom && a.date === dateAuditAjd && a.module === 'Suivi Closing');

  return {
    codesSuivis: suivis.filter(estSuiviOuvert).length,
    clientsContactes: suivis.filter(s => s.dernierContact === ajd).length,
    relancesRealisees: auditAujourdhui.filter(a => a.action === 'Contact enregistré').length,
    devisValides: auditAujourdhui.filter(a => a.action === 'Devis validé').length,
    retoursCorrection: auditAujourdhui.filter(a => a.action === 'Devis à revoir').length,
    codesTraitesMansouri: auditAujourdhui.filter(a => a.action === 'Confié à Mansouri' || a.action === 'Retour Mansouri').length,
    confirmationsSemaine: suivis.filter(s => s.dateConfirmation && new Date(s.dateConfirmation) >= septJoursAvant).length,
    avancesSemaine: suivis.filter(s => s.dateAvance && new Date(s.dateAvance) >= septJoursAvant).length
  };
}

const ETAPES_DEVIS_ENVOYE_OU_PLUS = ['Devis envoyé', 'Client intéressé', 'Attente client', 'Négociation', 'Accord', 'Confirmation', 'Avance reçue'];

/** KPI hebdo/mensuel du §11 — uniquement des agrégats de champs réels (dateConfirmation/dateAvance/montantAvance/ts). */
export function calculerKpisClosingPeriode(db, user, jours = 7) {
  const suivis = suivisDeCoordinateur(db, user);
  const depuis = AUJOURD_HUI(); depuis.setDate(depuis.getDate() - jours);

  const confirmes = suivis.filter(s => s.dateConfirmation && new Date(s.dateConfirmation) >= depuis);
  const avances = suivis.filter(s => s.dateAvance && new Date(s.dateAvance) >= depuis);
  const montantAvances = avances.reduce((sum, s) => sum + (Number(s.montantAvance) || 0), 0);
  const perdus = suivis.filter(s => s.statutPipeline === 'Perdu / Abandonné' && s.ts && s.ts >= depuis.getTime());
  const devisEnvoyesOuPlus = suivis.filter(s => ETAPES_DEVIS_ENVOYE_OU_PLUS.includes(s.statutPipeline));
  const delais = suivis.filter(s => s.dateConfirmation && s.ts).map(s => Math.floor((new Date(s.dateConfirmation) - s.ts) / 864e5));
  const auj = AUJOURD_HUI();

  return {
    confirmations: confirmes.length,
    avancesObtenues: avances.length,
    montantAvances,
    tauxConversionPct: devisEnvoyesOuPlus.length ? Math.round((confirmes.length / devisEnvoyesOuPlus.length) * 100) : 0,
    delaiMoyenJours: delais.length ? Math.round(delais.reduce((a, b) => a + b, 0) / delais.length) : null,
    dossiersPerdus: perdus.length,
    dossiersActifs: suivis.filter(estSuiviOuvert).length,
    dossiersSansActionDepuis5j: suivis.filter(estSuiviOuvert).filter(s =>
      !s.dernierContact || Math.floor((auj - new Date(s.dernierContact)) / 864e5) >= 5
    ).length
  };
}

/** Même gabarit que construireMessageTache — toujours terminé par un lien direct exploitable. */
export function construireMessageSuiviClosing(suivi, { titre, extra } = {}) {
  return [
    titre || `Suivi Closing ${suivi.codeSuivi}`,
    `Statut : ${suivi.statutPipeline || 'Nouveau'}`,
    `Coordinateur : ${suivi.coordinateur || '—'}`,
    extra || null,
    `Lien : #ficheSuiviClosing:${suivi.code}`
  ].filter(Boolean).join('\n');
}

/**
 * §13/§14 — un seul déclencheur net pour le MVP : devis envoyé + échéance de
 * relance dépassée. Dédupliqué par tâche ouverte déjà liée (idempotent).
 */
export function verifierTachesAutoClosing(db, genCode) {
  const auj = AUJOURD_HUI();
  const nouvelles = [];
  const dejaLiee = (code) => (db.taches || []).some(t => t.objetType === 'suivisClosing' && t.objetCode === code && estTacheOuverte(t));

  (db.suivisClosing || []).filter(estSuiviOuvert).forEach(s => {
    if (s.statutPipeline !== 'Devis envoyé') return;
    if (!s.echeanceActionSuivante || new Date(s.echeanceActionSuivante) >= auj) return;
    if (dejaLiee(s.code)) return;
    nouvelles.push({
      code: genCode('T'), ts: Date.now(), par: 'UBOS',
      ...genererTacheAuto({
        titre: `Relancer client ${s.codeSuivi}`, assigne: s.coordinateur, priorite: 'Urgente',
        type: 'Action commerciale', objetType: 'suivisClosing', objetCode: s.code,
        resultatAttendu: 'Client relancé', echeance: new Date().toISOString().slice(0, 10),
        remarque: `Devis envoyé le ${s.dernierContact || '—'}, relance prévue le ${s.echeanceActionSuivante} non faite.`
      })
    });
  });
  return nouvelles;
}

/**
 * Rapport journalier auto-rempli — extrait de MonRapportJournalier.jsx pour
 * être réutilisé aussi par la génération silencieuse (§ simplification
 * Zoubida : la page disparaît de sa navigation mais les données continuent
 * d'être calculées et enregistrées en arrière-plan, cf. Layout.jsx).
 */
export function construireRapportAutoJour(db, user) {
  const nom = user?.nomComplet || user?.identifiant;
  const ajd = AJD_ISO();
  const mesTaches = tachesDeUtilisateur(db, user);
  const prevues = mesTaches.filter(t => t.datePrevue === ajd || t.echeance === ajd);
  const terminees = prevues.filter(t => STATUTS_TERMINES.includes(t.statut) && t.statut !== 'Annulée');
  const nonTerminees = prevues.filter(t => !STATUTS_TERMINES.includes(t.statut));
  const reportees = mesTaches.filter(t => t.statut === 'Reportée');
  const clientsContactes = clientsDeAgent(db, user).filter(c => c.dernierContact === ajd).length;
  const dateAuditAjd = new Date().toLocaleDateString('fr-FR');
  const auditAujourdhui = (db.audit || []).filter(a => a.utilisateur === nom && a.date === dateAuditAjd);
  const demandesTraitees = auditAujourdhui.filter(a => a.module === 'Demandes' || a.module === 'Lignes de demande').length;
  const documentsCrees = auditAujourdhui.filter(a => a.module === 'Documents' && a.action === 'Création').length;
  const dossiers = [...new Set(mesTaches.filter(t => t.dossier).map(t => t.dossier))];
  const base = {
    tachesPrevues: prevues.length, tachesTerminees: terminees.length,
    tachesNonTerminees: nonTerminees.length, tachesReportees: reportees.length,
    clientsContactes, demandesTraitees, documentsCrees,
    dossiersTravailles: dossiers.join(', ')
  };
  if (suivisDeCoordinateur(db, user).length) {
    const c = calculerObjectifsClosingJour(db, user);
    base.closingCodesSuivis = c.codesSuivis;
    base.closingClientsContactes = c.clientsContactes;
    base.closingDevisValides = c.devisValides;
    base.closingRetoursCorrection = c.retoursCorrection;
    base.closingCodesMansouri = c.codesTraitesMansouri;
    base.closingConfirmationsSemaine = c.confirmationsSemaine;
    base.closingAvancesSemaine = c.avancesSemaine;
    base.aReprendreDemain = suivisDeCoordinateur(db, user).filter(estSuiviOuvert)
      .filter(s => s.echeanceActionSuivante && s.echeanceActionSuivante <= ajd)
      .map(s => `${s.codeSuivi} — ${s.resultatDernierContact || s.statutPipeline || 'à traiter'}`).join('\n');
  }
  return base;
}

export { getUtilisateurParNom };
