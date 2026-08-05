import { PORTES_VALIDATION_LIMEX } from '../data/constants';

const STATUTS_VALIDES = ["Validé par Imane", "Validé définitivement"];

const COLONNES_CHECKLIST_MAITRE = [
  "id", "phase", "domaine", "controle", "conditionApplication", "_applicableColonneVide",
  "risqueEvite", "actionYasser", "preuveObligatoire", "critereAcceptation", "priorite",
  "dateLimite", "_statutColonneVide", "_commentaireColonneVide", "_controleImaneColonneVide",
  "_dateControleColonneVide", "_validationOumaimaColonneVide", "blocage"
];

/**
 * Parses the raw AOA rows of the "3_Checklist_Maitre" sheet (as returned by
 * XLSX.utils.sheet_to_json(ws, {header:1})) into control referential objects.
 * The sheet is a blank master template — the "Applicable/N-A", "Statut", etc.
 * columns are meant to be filled in per-dossier, not read as referential data.
 */
export function parserChecklistMaitre(rows) {
  if (!rows || rows.length < 2) return [];
  const dataRows = rows.slice(1); // skip header
  return dataRows
    .filter(r => r && r[0])
    .map(r => {
      const o = {};
      COLONNES_CHECKLIST_MAITRE.forEach((key, i) => {
        if (!key.startsWith('_')) o[key] = String(r[i] ?? '').trim();
      });
      return o;
    });
}

/**
 * Diffs a freshly parsed referential against the existing controlesLimex
 * collection: new IDs are added, existing IDs with changed content are
 * updated (version bumped), IDs no longer present are deactivated (never
 * deleted — history is preserved) per the Excel's own integration notes.
 */
export function diffReferentielLimex(existants, parses, userCourant) {
  const parIdExistant = new Map((existants || []).map(c => [c.id, c]));
  const idsVus = new Set();
  const resultat = [];
  let ajoutes = 0, misAJour = 0, inchanges = 0;

  parses.forEach(p => {
    idsVus.add(p.id);
    const ancien = parIdExistant.get(p.id);
    if (!ancien) {
      resultat.push({ ...p, actif: true, version: 1, ts: Date.now(), par: userCourant });
      ajoutes++;
    } else {
      const champsControle = ["phase", "domaine", "controle", "conditionApplication", "risqueEvite", "actionYasser", "preuveObligatoire", "critereAcceptation", "priorite", "blocage"];
      const modifie = champsControle.some(k => String(ancien[k] || '') !== String(p[k] || ''));
      if (modifie) {
        resultat.push({ ...ancien, ...p, actif: true, version: (ancien.version || 1) + 1, ts: Date.now(), par: userCourant });
        misAJour++;
      } else {
        resultat.push({ ...ancien, actif: true });
        inchanges++;
      }
    }
  });

  let desactives = 0;
  (existants || []).forEach(c => {
    if (!idsVus.has(c.id)) {
      resultat.push({ ...c, actif: false });
      desactives++;
    }
  });

  return { controlesFinal: resultat, ajoutes, misAJour, inchanges, desactives };
}

/**
 * Generates one dossierControlesLimex row per active referential control for
 * a newly created dossier — full exhaustivity without ever re-typing the
 * control text (which stays in controlesLimex), avoiding both "recreate the
 * whole checklist manually" and "one giant repeated checklist per dossier".
 */
export function genererControlesDossier(db, dossierCode) {
  const actifs = (db.controlesLimex || []).filter(c => c.actif !== false);
  return actifs.map(c => ({
    code: `${dossierCode}__${c.id}`,
    dossier: dossierCode,
    controleId: c.id,
    applicable: null,
    statut: "Non commencé",
    commentaireYasser: '',
    controleImane: '',
    dateControle: '',
    validationOumaima: false,
    preuve: '',
    dateLimite: '',
    ts: Date.now()
  }));
}

export function calculerDashboardLimex(db, dossierCode) {
  const lignes = (db.dossierControlesLimex || []).filter(l => l.dossier === dossierCode);
  const parId = new Map((db.controlesLimex || []).map(c => [c.id, c]));

  const applicables = lignes.filter(l => l.applicable === true);
  const na = lignes.filter(l => l.applicable === false);
  const valides = lignes.filter(l => STATUTS_VALIDES.includes(l.statut));
  const enAttente = lignes.filter(l => ["Demandé", "En attente", "Reçu à contrôler", "A demander"].includes(l.statut));
  const nonConformes = lignes.filter(l => l.statut === "Non conforme");
  const bloques = lignes.filter(l => l.statut === "Bloqué");
  const validationOumaimaAttente = lignes.filter(l => l.statut === "Validation Oumaima requise");

  const ouvertsParPriorite = (p) => lignes.filter(l => {
    const c = parId.get(l.controleId);
    return c && c.priorite === p && l.applicable === true && !STATUTS_VALIDES.includes(l.statut);
  }).length;

  const tauxAvancement = applicables.length ? Math.round((valides.length / applicables.length) * 100) : 0;

  return {
    total: lignes.length,
    applicables: applicables.length,
    na: na.length,
    valides: valides.length,
    enAttente: enAttente.length,
    nonConformes: nonConformes.length,
    bloques: bloques.length,
    validationOumaimaAttente: validationOumaimaAttente.length,
    p0Ouverts: ouvertsParPriorite('P0'),
    p1Ouverts: ouvertsParPriorite('P1'),
    tauxAvancement
  };
}

/**
 * For a given gate (porte), returns the still-open blocking (P0) controls
 * tied to its phase(s) — a GO decision must be refused while this is non-empty.
 */
export function controlesBloquantsPorte(db, dossierCode, porte) {
  const lignes = (db.dossierControlesLimex || []).filter(l => l.dossier === dossierCode);
  const parId = new Map((db.controlesLimex || []).map(c => [c.id, c]));
  return lignes.filter(l => {
    const c = parId.get(l.controleId);
    if (!c || !porte.phases.includes(c.phase)) return false;
    if (l.applicable !== true) return false;
    if (STATUTS_VALIDES.includes(l.statut)) return false;
    return c.priorite === 'P0';
  }).map(l => l.controleId);
}

export { PORTES_VALIDATION_LIMEX };
