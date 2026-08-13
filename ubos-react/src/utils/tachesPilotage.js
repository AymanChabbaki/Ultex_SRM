import { clientsDeAgent, calculerPrioriteClient } from './dataPipeline';

export function getUtilisateurParNom(db, nom) {
  return (db.utilisateurs || []).find(u => u.nomComplet === nom || u.identifiant === nom);
}

export const STATUTS_TERMINES = ['Terminée', 'Terminée avec réserve', 'Terminée — En attente de validation', 'Annulée'];

export function estTacheOuverte(t) {
  return !STATUTS_TERMINES.includes(t.statut);
}

export function tachesDeUtilisateur(db, user) {
  const nom = user?.nomComplet || user?.identifiant;
  return (db.taches || []).filter(t => (user?.services || []).includes(t.assigne) || t.assigne === nom);
}

/** Échéance-based suggestion only — always editable, never authoritative. */
export function suggererPrioriteTache(tache) {
  if (!tache.echeance) return tache.priorite || 'Normale';
  const heuresRestantes = (new Date(tache.echeance + 'T18:00') - new Date()) / 36e5;
  if (heuresRestantes < 0) return 'Critique';
  if (heuresRestantes <= 2) return 'Très urgente';
  if (heuresRestantes <= 24) return 'Urgente';
  if (heuresRestantes <= 72) return 'Haute';
  return tache.priorite || 'Normale';
}

const POIDS_PRIORITE = { 'Critique': 5, 'Très urgente': 4, 'Urgente': 3, 'Haute': 2, 'Normale': 1, 'Basse': 0.5 };

/** Heuristic load tag from open tasks (priority-weighted) + active dossiers — not a precision metric. */
export function calculerChargeUtilisateur(db, user) {
  const mesTaches = tachesDeUtilisateur(db, user).filter(estTacheOuverte);
  const poids = mesTaches.reduce((s, t) => s + (POIDS_PRIORITE[t.priorite] || 1), 0);
  const nom = user?.nomComplet || user?.identifiant;
  const dossiersActifs = (db.dossiers || []).filter(d =>
    d.statut === 'Actif' && d.etape !== 'Clôturé' &&
    (d.responsable === nom || d.respActionSuivante === nom || (user?.services || []).includes(d.responsable))
  ).length;
  const score = poids + dossiersActifs * 1.5;

  let tag = 'Charge normale';
  if (score === 0) tag = 'Sous-chargé';
  else if (score > 25) tag = 'Surchargé';
  else if (score > 12) tag = 'Chargé';

  return { tag, nbTaches: mesTaches.length, dossiersActifs, score: Math.round(score * 10) / 10 };
}

export function calculerSyntheseJour(db, user) {
  const ajd = new Date().toISOString().slice(0, 10);
  const auj = new Date(new Date().toDateString());
  const mesTaches = tachesDeUtilisateur(db, user);
  const prevues = mesTaches.filter(t => t.datePrevue === ajd || t.echeance === ajd);
  const terminees = prevues.filter(t => STATUTS_TERMINES.includes(t.statut) && t.statut !== 'Annulée');
  const enCours = prevues.filter(t => t.statut === 'En cours');
  const enRetard = mesTaches.filter(t => estTacheOuverte(t) && t.echeance && new Date(t.echeance) < auj);
  const bloquees = mesTaches.filter(t => t.statut === 'Bloquée');
  const total = prevues.length || 1;

  return {
    prevues: prevues.length, terminees: terminees.length, enCours: enCours.length,
    enRetard: enRetard.length, bloquees: bloquees.length,
    progressionPct: Math.round((terminees.length / total) * 100)
  };
}

/** Time-ordered daily program: today's/overdue open tasks + due client follow-ups, sorted by heure then priority/retard. */
export function genererProgrammeDuJour(db, user) {
  const ajd = new Date().toISOString().slice(0, 10);
  const auj = new Date(new Date().toDateString());
  const items = [];

  tachesDeUtilisateur(db, user).forEach(t => {
    if (!estTacheOuverte(t)) return;
    const concerne = t.datePrevue === ajd || t.echeance === ajd || (t.echeance && new Date(t.echeance) < auj);
    if (!concerne) return;
    items.push({
      code: t.code, heure: t.heure || '', titre: t.titre,
      sousLibelle: t.objetCode ? `${t.objetType || ''} ${t.objetCode}`.trim() : (t.dossier || ''),
      lien: `#ficheTache:${t.code}`,
      priorite: t.priorite || 'Normale',
      retard: !!(t.echeance && new Date(t.echeance) < auj)
    });
  });

  clientsDeAgent(db, user).forEach(c => {
    const echeance = c.echeanceActionSuivante ? new Date(c.echeanceActionSuivante) : null;
    const due = echeance && echeance <= auj;
    const jamaisContacte = !c.dernierContact;
    if (!due && !jamaisContacte) return;
    const { tag } = calculerPrioriteClient(c);
    items.push({
      code: c.code, heure: '', titre: c.nom,
      sousLibelle: c.actionSuivante || (jamaisContacte ? 'Premier contact à effectuer' : 'Relance à effectuer'),
      lien: `#ficheClient:${c.code}`,
      priorite: tag === 'Urgent' ? 'Critique' : tag === 'VIP' ? 'Haute' : 'Normale',
      retard: !!(echeance && echeance < auj)
    });
  });

  return items.sort((a, b) => {
    if (a.heure && b.heure) return a.heure < b.heure ? -1 : 1;
    if (a.heure) return -1;
    if (b.heure) return 1;
    return (b.retard - a.retard) || ((POIDS_PRIORITE[b.priorite] || 1) - (POIDS_PRIORITE[a.priorite] || 1));
  });
}

export function estAjouteParDirection(db, tache) {
  return getUtilisateurParNom(db, tache.par)?.departement === 'Direction';
}

/**
 * Single structured notification template reused for every task lifecycle
 * event (création/terminée/reportée/bloquée/réaffectée…) — same principle
 * as `construireMessageRoutage` in utils/demandes.js. Always ends with a
 * direct link line so Notifications.jsx can render a real "Ouvrir" button.
 */
export function construireMessageTache(tache, { titre, extra } = {}) {
  const objetLie = tache.dossier ? `Dossier ${tache.dossier}` : (tache.objetType && tache.objetCode ? `${tache.objetType} ${tache.objetCode}` : null);
  return [
    titre || tache.titre,
    objetLie ? `Lié à : ${objetLie}` : null,
    `Créé par : ${tache.par || '—'}`,
    `Responsable : ${tache.assigne || '—'}`,
    `Priorité : ${tache.priorite || 'Normale'}`,
    `Échéance : ${tache.echeance || '—'}${tache.heure ? ' ' + tache.heure : ''}`,
    extra || null,
    `Lien : #ficheTache:${tache.code}`
  ].filter(Boolean).join('\n');
}

/** Per-task alert flags, §11 — only what's derivable from real fields. */
export function calculerAlertesTache(tache, opts = {}) {
  const alertes = [];
  if (!estTacheOuverte(tache)) {
    if (tache.statut !== 'Annulée' && !tache.resultatObtenu) alertes.push('Terminée sans résultat renseigné');
    if (tache.statut !== 'Annulée' && !tache.prochaineAction) alertes.push('Terminée sans prochaine action');
    if (tache.statut !== 'Annulée' && tache.preuveObligatoire === 'Oui' && !tache.preuveFichier) alertes.push('Terminée sans la preuve obligatoire');
    return alertes;
  }

  const ajd = new Date().toISOString().slice(0, 10);
  const auj = new Date(new Date().toDateString());
  if (tache.datePrevue === ajd) alertes.push('Commence aujourd\'hui');
  if (tache.echeance === ajd) {
    const heuresRestantes = (new Date(ajd + 'T18:00') - new Date()) / 36e5;
    if (heuresRestantes > 0 && heuresRestantes <= 2) alertes.push('Échéance dans moins de 2 heures');
  }
  if (tache.echeance && new Date(tache.echeance) < auj) alertes.push('En retard');
  if (tache.priorite === 'Critique' && tache.statut === 'À faire') alertes.push('Critique non commencée');
  if (tache.statut === 'Bloquée' && tache.ts && (Date.now() - tache.ts) > 24 * 36e5) alertes.push('Bloquée depuis plus de 24h');
  if ((tache.nbReports || 0) >= 3) alertes.push('Trop de reports successifs');
  if (opts.ajouteParDirection && tache.statut === 'À faire') alertes.push('Tâche Direction non traitée');

  return alertes;
}

/** Pure builder for automatically-generated tasks — caller assigns code (genCode) and ts. */
export function genererTacheAuto({ titre, assigne, priorite, type, objetType, objetCode, dossier, resultatAttendu, echeance, datePrevue, remarque }) {
  return {
    titre, assigne, priorite: priorite || 'Normale', type: type || 'Autre',
    dossier, objetType, objetCode, resultatAttendu, echeance, datePrevue, remarque,
    origine: 'Tâche automatique', statut: 'À faire', nbReports: 0
  };
}

const DELAI_ETA_HEURES = 48;
const DELAI_FRANCHISE_HEURES = 48;

/**
 * §8 — only the two cleanest, well-dated triggers (ETA proche, fin de
 * franchise proche). Returns ready-to-insert task objects (codes already
 * assigned via genCode); dedup is by existing-open-task check, so calling
 * this again the same day is harmless.
 */
export function verifierTachesAutomatiques(db, genCode) {
  const maintenant = Date.now();
  const nouvelles = [];

  const dejaLieObjet = (objetType, objetCode) =>
    (db.taches || []).some(t => t.objetType === objetType && t.objetCode === objetCode && estTacheOuverte(t));
  const dejaLieeFranchise = (dossier) =>
    (db.taches || []).some(t => t.dossier === dossier && t.titre?.startsWith('Fin de franchise proche') && estTacheOuverte(t));

  (db.arrivages || []).forEach(a => {
    if (!a.eta || dejaLieObjet('arrivages', a.code)) return;
    const heures = (new Date(a.eta) - maintenant) / 36e5;
    if (heures > 0 && heures <= DELAI_ETA_HEURES) {
      nouvelles.push({
        code: genCode('T'), ts: Date.now(), par: 'UBOS',
        ...genererTacheAuto({
          titre: `Préparer le transit — Arrivage ${a.code}`, assigne: 'Transport', priorite: 'Urgente',
          type: 'Transport & Logistique', objetType: 'arrivages', objetCode: a.code,
          resultatAttendu: 'Transit préparé', echeance: a.eta,
          remarque: `ETA proche (${a.eta}) — préparer le transit pour l'arrivage ${a.code}.`
        })
      });
    }
  });

  (db.transits || []).forEach(t => {
    if (!t.franchiseFin || t.etapeDum === 'Sorti du port' || !t.dossier || dejaLieeFranchise(t.dossier)) return;
    const heures = (new Date(t.franchiseFin) - maintenant) / 36e5;
    if (heures > 0 && heures <= DELAI_FRANCHISE_HEURES) {
      nouvelles.push({
        code: genCode('T'), ts: Date.now(), par: 'UBOS',
        ...genererTacheAuto({
          titre: `Fin de franchise proche — ${t.code}`, assigne: 'Analyse Dossiers', priorite: 'Critique',
          type: 'Réglementation & LIMEX', dossier: t.dossier,
          resultatAttendu: 'Sortie du port confirmée', echeance: t.franchiseFin,
          remarque: `Fin de franchise proche (${t.franchiseFin}) pour ${t.code}.`
        })
      });
    }
  });

  return nouvelles;
}

/**
 * Recurring-task occurrences due today — deterministic child codes
 * (`${modele.code}__${ajd}`) make this idempotent by construction: calling
 * it again the same day never produces a duplicate.
 */
export function calculerOccurrencesRecurrentesDues(taches, ajd) {
  const tousLesCodes = new Set((taches || []).map(t => t.code));
  return (taches || []).filter(t => {
    if (!t.recurrence || t.recurrence === 'Aucune') return false;
    if (t.recurrenceJusquau && ajd > t.recurrenceJusquau) return false;
    if (tousLesCodes.has(`${t.code}__${ajd}`)) return false;
    if (t.recurrence === 'Quotidienne') return true;
    if (t.recurrence === 'Hebdomadaire') return new Date(ajd).getDay() === new Date(t.ts || Date.now()).getDay();
    if (t.recurrence === 'Mensuelle') return new Date(ajd).getDate() === new Date(t.ts || Date.now()).getDate();
    return false;
  }).map(t => ({
    ...t, code: `${t.code}__${ajd}`, statut: 'À faire', datePrevue: ajd, echeance: ajd,
    ts: Date.now(), recurrence: 'Aucune', parentRecurrence: t.code, nbReports: 0
  }));
}
