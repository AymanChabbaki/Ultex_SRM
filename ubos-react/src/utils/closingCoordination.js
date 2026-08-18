import { getUtilisateurParNom, estTacheOuverte, genererTacheAuto } from './tachesPilotage';

export const STATUTS_FERMES_CLOSING = ['Avance reçue', 'Perdu / Abandonné'];

export function estSuiviOuvert(suivi) {
  return !STATUTS_FERMES_CLOSING.includes(suivi.statutPipeline);
}

/** Suivis coordonnés par cet utilisateur (elle ne les perd jamais, §10). */
export function suivisDeCoordinateur(db, user) {
  const nom = user?.nomComplet || user?.identifiant;
  return (db.suivisClosing || []).filter(s => s.coordinateur === nom);
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
    .filter(s => {
      const echeance = s.echeanceActionSuivante ? new Date(s.echeanceActionSuivante) : null;
      const due = echeance && echeance <= auj;
      return due || !s.dernierContact;
    })
    .map(s => {
      const p = calculerPrioriteSuivi(s);
      return {
        code: s.code, codeSuivi: s.codeSuivi,
        situation: s.situationActuelle || s.statutPipeline || 'Nouveau',
        actionAujourdhui: s.actionRecommandee || (s.dernierContact ? 'Relancer' : 'Premier contact'),
        dernierContact: s.dernierContact || '—',
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
  const suivis = suivisDeCoordinateur(db, user).filter(estSuiviOuvert);
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

  return alertes;
}

const DELAI_JOURS = { 'Demain': 1, '2 jours': 2, '3 jours': 3, '7 jours': 7 };
export const OPTIONS_DELAI_RELANCE = Object.keys(DELAI_JOURS);

export function calculerEcheanceRelance(delaiLabel, dateChoisie) {
  if (dateChoisie) return dateChoisie;
  const jours = DELAI_JOURS[delaiLabel] || 2;
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

export { getUtilisateurParNom };
