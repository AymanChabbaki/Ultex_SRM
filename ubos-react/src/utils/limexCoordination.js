import { estTacheOuverte, genererTacheAuto, tachesDeUtilisateur, STATUTS_TERMINES } from './tachesPilotage';

// Même discipline que utils/closingCoordination.js (moteur Zoubida) — même
// forme, domaine différent. Un dossier LIMEX n'est jamais simplement "en
// cours" : c'est la liste de ses `actionsLimex` (granularité §6) qui
// détermine ce qui reste réellement à faire, pas un statut global unique.

export const ETATS_FERMES_LIMEX = ['Clôturé'];

export function estSuiviLimexOuvert(suivi) {
  return !suivi.archive && !ETATS_FERMES_LIMEX.includes(suivi.etatGlobal);
}

/** Suivis LIMEX coordonnés par cet utilisateur — elle ne les perd jamais (même principe que Zoubida §10). */
export function suivisLimexDeCoordinateur(db, user) {
  const nom = user?.nomComplet || user?.identifiant;
  return (db.suivisLimex || []).filter(s => s.coordinateur === nom);
}

const AUJOURD_HUI = () => new Date(new Date().toDateString());
const AJD_ISO = () => new Date().toISOString().slice(0, 10);

export function normaliserCodeLimex(code) {
  if (!code) return '';
  let c = String(code).replace(/\s+/g, '').toUpperCase();
  if (/^L\d+$/.test(c)) c = c.slice(1);
  return c;
}

/** Détection de doublon (§5) — sur tous les suivis, pas seulement ceux du coordinateur courant. */
export function trouverSuiviLimexExistant(db, codeSaisi, ignorerCode) {
  const cible = normaliserCodeLimex(codeSaisi);
  if (!cible) return null;
  return (db.suivisLimex || []).find(s =>
    !s.archive && s.code !== ignorerCode && normaliserCodeLimex(s.codeReference) === cible
  ) || null;
}

export function actionsDuSuivi(db, suiviCode) {
  return (db.actionsLimex || []).filter(a => a.suivi === suiviCode).sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

/** Priorité transparente dérivée de l'échéance — même logique que calculerPrioriteSuivi côté Closing. */
export function calculerPrioriteAction(action) {
  const auj = AUJOURD_HUI();
  const echeance = action.echeance ? new Date(action.echeance) : null;
  if (echeance && echeance < auj) return { tag: 'Retard', pill: 'p-rouge' };
  if (echeance && echeance.getTime() === auj.getTime()) return { tag: "Aujourd'hui", pill: 'p-rouge' };
  if (action.priorite === 'Critique' || action.priorite === 'Urgente') return { tag: action.priorite, pill: 'p-rouge' };
  return { tag: action.priorite || 'Normale', pill: 'p-gris' };
}

const STATUTS_ACTION_TERMINES = ['Fait', 'Annulée'];
export function estActionOuverte(action) {
  return !STATUTS_ACTION_TERMINES.includes(action.statut);
}

/**
 * État global dérivé pour l'affichage (§6/§18) — jamais réécrit sur le
 * suivi lui-même pour éviter deux sources de vérité : recalculé à chaque
 * lecture depuis les actions réelles du dossier.
 */
export function calculerEtatGlobal(actions) {
  const ouvertes = actions.filter(estActionOuverte);
  if (!actions.length) return 'Nouveau';
  if (ouvertes.some(a => a.statut === 'Bloqué')) return 'Bloqué';
  if (!ouvertes.length) return 'Prêt pour validation';
  if (ouvertes.some(a => calculerPrioriteAction(a).tag === 'Retard')) return 'Attente retour';
  return 'En traitement';
}

const PILL_ETAT_GLOBAL = { 'Bloqué': 'p-rouge', 'Attente retour': 'p-ambre', 'En traitement': 'p-ambre', 'Prêt pour validation': 'p-vert', 'Nouveau': 'p-gris', 'Clôturé': 'p-gris' };
export function pillEtatGlobal(etat) { return PILL_ETAT_GLOBAL[etat] || 'p-gris'; }

/** "Ma journée" (§3/§4) — actions ouvertes des dossiers coordonnés, dues/en retard/sans échéance. */
export function genererProgrammeImane(db, user) {
  const suivis = suivisLimexDeCoordinateur(db, user).filter(estSuiviLimexOuvert);
  const auj = AUJOURD_HUI();
  const items = [];
  suivis.forEach(s => {
    actionsDuSuivi(db, s.code).filter(estActionOuverte).forEach(a => {
      const echeance = a.echeance ? new Date(a.echeance) : null;
      const due = echeance && echeance <= auj;
      if (!due && echeance) return;
      const p = calculerPrioriteAction(a);
      items.push({
        code: a.code, suiviCode: s.code, codeReference: s.codeReference,
        libelle: a.libelle, responsable: a.responsable, echeance: a.echeance || '—',
        priorite: p.tag, pill: p.pill, lien: `#ficheSuiviLimex:${s.code}`
      });
    });
  });
  return items.sort((x, y) => (x.priorite === 'Retard' ? 0 : x.priorite === "Aujourd'hui" ? 1 : 2) - (y.priorite === 'Retard' ? 0 : y.priorite === "Aujourd'hui" ? 1 : 2));
}

const SEUIL_JOURS_SANS_ACTUALITE = 3;

/** Alertes §15 — dérivées de champs réels uniquement. */
export function genererAlertesLimex(db, user) {
  const suivis = suivisLimexDeCoordinateur(db, user).filter(estSuiviLimexOuvert);
  const auj = AUJOURD_HUI();
  const alertes = [];
  const push = (titre, liste) => { if (liste.length) alertes.push({ titre, suivis: liste }); };

  const sansActualite = suivis.filter(s => {
    const actions = actionsDuSuivi(db, s.code).filter(estActionOuverte);
    return actions.some(a => a.dernierContact && Math.floor((auj - new Date(a.dernierContact)) / 864e5) >= SEUIL_JOURS_SANS_ACTUALITE);
  });
  push('Sans actualité depuis 3 jours ou plus', sansActualite);

  const bloques = suivis.filter(s => (s.blocages || []).some(b => b.actif));
  push('Blocage actif', bloques);

  const sansProchaine = suivis.filter(s => {
    const actions = actionsDuSuivi(db, s.code).filter(estActionOuverte);
    return actions.length === 0;
  });
  push('Dossier actif sans action ouverte', sansProchaine);

  return alertes;
}

/** Compteur "Calculs à valider" de Ma journée (§3) — tâches Calcul & Chiffrage terminées en attente de contrôle Imane. */
export function compterCalculsAValider(db, user) {
  const nom = user?.nomComplet || user?.identifiant;
  return (db.taches || []).filter(t =>
    t.type === 'Calcul & Chiffrage' && t.statut === 'Terminée — En attente de validation' && (t.validateur === nom || !t.validateur)
  ).length;
}

/** Compteur "Paiements proches" (§31) — échéance dans les 2 jours, pas encore payé. */
export function compterPaiementsProches(db, user) {
  const nom = user?.nomComplet || user?.identifiant;
  const auj = AUJOURD_HUI();
  const dansDeuxJours = new Date(auj); dansDeuxJours.setDate(dansDeuxJours.getDate() + 2);
  return (db.paiements || []).filter(p =>
    p.responsablePreparation === nom && p.echeance && new Date(p.echeance) <= dansDeuxJours &&
    !['Payé', 'Annulé'].includes(p.statut)
  ).length;
}

/** Patch d'action rapide (§4) — un seul updateDB, toujours daté/horodaté. */
const STATUT_ACTION_PAR_LABEL = {
  'Fait': 'Fait', 'Relancé': 'En cours', 'Réponse reçue': 'En cours', 'En cours': 'En cours',
  'Attente fournisseur': 'Attente fournisseur', 'Attente collègue': 'Attente collègue', 'Bloqué': 'Bloqué'
};
export function enregistrerActionRapide(action, label, note) {
  const patch = {
    dernierContact: AJD_ISO(),
    dernierContactHeure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  };
  if (STATUT_ACTION_PAR_LABEL[label]) patch.statut = STATUT_ACTION_PAR_LABEL[label];
  if (label === 'Réponse reçue') patch.resultat = note || 'Réponse reçue';
  if (note && note.trim()) patch.resultat = note.trim();
  return patch;
}

/** Retour exécutant (§12) — miroir de enregistrerRetourMansouri côté Closing. */
export function enregistrerRetourExecutant(label) {
  const patch = {
    statut: STATUT_ACTION_PAR_LABEL[label] || label,
    dernierContact: AJD_ISO(),
    dernierContactHeure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  };
  return patch;
}

/** Tâche exécutant construite une seule fois — réutilisée par la création d'action et par l'instruction LIMEX. */
export function construireTacheExecutant(action, suivi, genCode, par) {
  return {
    code: genCode('T'), ts: Date.now(), par, titre: `LIMEX ${suivi.codeReference} — ${action.libelle}`,
    assigne: action.responsable, priorite: action.priorite || 'Normale', type: 'Réglementation & LIMEX',
    statut: 'À faire', nbReports: 0, objetType: 'actionsLimex', objetCode: action.code,
    resultatAttendu: action.libelle, echeance: action.echeance, origine: 'Coordination LIMEX'
  };
}

/**
 * Découpage naïf assisté (§9/§45 — pas d'IA dans cette passe) : une
 * proposition par ligne ou par élément séparé par virgule/point-virgule,
 * puces/numéros/tirets retirés. Imane corrige avant envoi.
 */
export function decouperInstructionEnActions(texte) {
  if (!texte) return [];
  const lignes = texte.split(/\n|;|,(?=\s*[A-ZÀ-Ü])/).map(l => l.trim()).filter(Boolean);
  return lignes
    .map(l => l.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(l => l.length > 2)
    .map(l => l.charAt(0).toUpperCase() + l.slice(1));
}

/** Échéances de suivi production (§30) — un seul déclencheur net, daté. */
export function calculerEcheancesProduction(datePaiement, delaiJours) {
  const jours = Number(delaiJours) || 0;
  const fin = new Date(datePaiement);
  fin.setDate(fin.getDate() + jours);
  const miParcours = new Date(datePaiement);
  miParcours.setDate(miParcours.getDate() + Math.round(jours / 2));
  return { miParcours: miParcours.toISOString().slice(0, 10), finTheorique: fin.toISOString().slice(0, 10) };
}

/** Même gabarit que construireMessageSuiviClosing. */
export function construireMessageSuiviLimex(suivi, { titre, extra } = {}) {
  return [
    titre || `Suivi LIMEX ${suivi.codeReference}`,
    `État : ${suivi.etatGlobal || 'Nouveau'}`,
    `Coordinateur : ${suivi.coordinateur || '—'}`,
    extra || null,
    `Lien : #ficheSuiviLimex:${suivi.code}`
  ].filter(Boolean).join('\n');
}

/**
 * §14/§15 — un seul déclencheur net : action ouverte sans actualité depuis
 * 3 jours → tâche automatique de relance pour le coordinateur. Dédupliquée
 * par tâche ouverte déjà liée (idempotent).
 */
export function verifierActionsAutoLimex(db, genCode) {
  const auj = AUJOURD_HUI();
  const nouvelles = [];
  const dejaLiee = (codeAction) => (db.taches || []).some(t => t.objetType === 'actionsLimex' && t.objetCode === codeAction && t.origine === 'Tâche automatique' && estTacheOuverte(t));

  (db.suivisLimex || []).filter(estSuiviLimexOuvert).forEach(s => {
    actionsDuSuivi(db, s.code).filter(estActionOuverte).forEach(a => {
      if (!a.dernierContact || Math.floor((auj - new Date(a.dernierContact)) / 864e5) < SEUIL_JOURS_SANS_ACTUALITE) return;
      if (dejaLiee(a.code)) return;
      nouvelles.push({
        code: genCode('T'), ts: Date.now(), par: 'UBOS',
        ...genererTacheAuto({
          titre: `Relancer ${a.responsable} — ${a.libelle} (${s.codeReference})`, assigne: s.coordinateur, priorite: 'Urgente',
          type: 'Réglementation & LIMEX', objetType: 'actionsLimex', objetCode: a.code,
          resultatAttendu: 'Relance effectuée', echeance: new Date().toISOString().slice(0, 10),
          remarque: `Aucune actualité depuis le ${a.dernierContact} sur « ${a.libelle} » (${s.codeReference}).`
        })
      });
    });
  });
  return nouvelles;
}

/**
 * §30 — un paiement passé à "Payé" avec un délai de production programme
 * automatiquement les 2 échéances de contrôle. Dédupliqué par tâche déjà
 * liée à ce paiement.
 */
export function verifierEcheancesProduction(db, genCode) {
  const nouvelles = [];
  const dejaLiee = (codePaiement) => (db.taches || []).some(t => t.objetType === 'paiements' && t.objetCode === codePaiement && t.origine === 'Tâche automatique');

  (db.paiements || []).forEach(p => {
    if (p.statut !== 'Payé' || !p.delaiProductionJours || !p.datePaiementEffectif) return;
    if (dejaLiee(p.code)) return;
    const { miParcours, finTheorique } = calculerEcheancesProduction(p.datePaiementEffectif, p.delaiProductionJours);
    nouvelles.push({
      code: genCode('T'), ts: Date.now(), par: 'UBOS',
      ...genererTacheAuto({
        titre: `Demander état production — ${p.dossier || p.codeReference || p.code}`, assigne: p.responsablePreparation || p.par, priorite: 'Normale',
        type: 'Réglementation & LIMEX', objetType: 'paiements', objetCode: p.code,
        resultatAttendu: 'État production confirmé', echeance: miParcours,
        remarque: `Paiement effectué le ${p.datePaiementEffectif}, délai annoncé ${p.delaiProductionJours} jours.`
      })
    });
    nouvelles.push({
      code: genCode('T'), ts: Date.now(), par: 'UBOS',
      ...genererTacheAuto({
        titre: `Production théoriquement terminée — ${p.dossier || p.codeReference || p.code}`, assigne: p.responsablePreparation || p.par, priorite: 'Haute',
        type: 'Réglementation & LIMEX', objetType: 'paiements', objetCode: p.code,
        resultatAttendu: 'Confirmation de fin de production', echeance: finTheorique,
        remarque: `Fin de production théorique — vérifier le retour fournisseur.`
      })
    });
  });
  return nouvelles;
}

/** Rapport journalier auto (§36) — miroir de construireRapportAutoJour côté Closing, compteurs LIMEX ajoutés en plus. */
export function construireRapportAutoJourImane(db, user) {
  const nom = user?.nomComplet || user?.identifiant;
  const ajd = AJD_ISO();
  const mesTaches = tachesDeUtilisateur(db, user);
  const prevues = mesTaches.filter(t => t.datePrevue === ajd || t.echeance === ajd);
  const terminees = prevues.filter(t => STATUTS_TERMINES.includes(t.statut) && t.statut !== 'Annulée');
  const nonTerminees = prevues.filter(t => !STATUTS_TERMINES.includes(t.statut));
  const base = { tachesPrevues: prevues.length, tachesTerminees: terminees.length, tachesNonTerminees: nonTerminees.length };

  const suivis = suivisLimexDeCoordinateur(db, user);
  if (suivis.length) {
    const dateAuditAjd = new Date().toLocaleDateString('fr-FR');
    const auditAujourdhui = (db.audit || []).filter(a => a.utilisateur === nom && a.date === dateAuditAjd);
    base.limexDossiersSuivis = suivis.filter(estSuiviLimexOuvert).length;
    base.limexActionsTerminees = auditAujourdhui.filter(a => a.module === 'Suivi LIMEX' && a.action === 'Action rapide (Fait)').length;
    base.limexActionsOuvertes = suivis.reduce((sum, s) => sum + actionsDuSuivi(db, s.code).filter(estActionOuverte).length, 0);
    base.limexActionsRetard = suivis.reduce((sum, s) => sum + actionsDuSuivi(db, s.code).filter(a => estActionOuverte(a) && calculerPrioriteAction(a).tag === 'Retard').length, 0);
    base.limexRelances = auditAujourdhui.filter(a => a.module === 'Suivi LIMEX' && a.action.startsWith('Relance')).length;
    base.limexCalculsValides = auditAujourdhui.filter(a => a.module === 'Études & Calcul' && a.action === 'Validé').length;
    base.limexCalculsRetournes = auditAujourdhui.filter(a => a.module === 'Études & Calcul' && a.action === 'Retourné').length;
    base.limexPaiementsPrepares = auditAujourdhui.filter(a => a.module === 'Paiements' && a.action === 'Préparation').length;
    base.limexDocumentsClasses = auditAujourdhui.filter(a => a.module === 'Documents comptables Casa' && a.action === 'Classé').length;
    base.aReprendreDemain = suivis.filter(estSuiviLimexOuvert)
      .flatMap(s => actionsDuSuivi(db, s.code).filter(estActionOuverte).map(a => `${s.codeReference} — ${a.libelle}`))
      .join('\n');
  }
  return base;
}
