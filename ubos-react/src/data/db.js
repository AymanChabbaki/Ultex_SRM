import { PFX_ANNEE, COLLS } from './constants';
import { saveDBSync } from '../services/api';

export const CLE = 'ubos_mvp_v1';

export function baseVide() {
  return {
    seq: {}, clients: [], leads: [], fournisseurs: [], produits: [],
    dossiers: [], sourcings: [], etudes: [], offres: [], paiements: [],
    analyses: [], transports: [], transits: [], documents: [], taches: [],
    rapports: [], reclamations: [], stockage: [], certifs: [],
    transportsNat: [], pmtIntl: [], erreurs: [], utilisateurs: [],
    facturesFinales: [], avoirsFF: [], abandons: [], impayes: [],
    remboursements: [], contacts: [], demandes: [], commandes: [],
    arrivages: [], analysesLimex: [], bonsLancement: [], stocks: [],
    mouvementsStock: [], livraisons: [], transfertsServices: [],
    communicationsDossier: [], partenaires: [], notifs: [], audit: [],
    importJobs: [], importFiles: [], importModels: [], importMappings: [],
    importRows: [], importErrors: [], importHistory: [], importDetectedTypes: [],
    importExtractedData: [], importAttachments: [], importRollbacks: [],
    controlesLimex: [], dossierControlesLimex: [], limexDiagnosticOumaima: [],
    limexPortesValidation: [], limexImportHistory: [],
    demandeLignes: [], demandeRoutages: []
  };
}

export function charger() {
  try {
    const d = JSON.parse(localStorage.getItem(CLE));
    if (d && d.seq) return Object.assign(baseVide(), d);
  } catch (e) { }
  return baseVide();
}

let _dernierAvertStockage = 0;
export function sauver(DB) {
  try {
    const donnees = JSON.stringify(DB);
    localStorage.setItem(CLE, donnees);
    const tailleMo = donnees.length / 1024 / 1024;
    if (tailleMo > 4 && Date.now() - _dernierAvertStockage > 300000) {
      _dernierAvertStockage = Date.now();
      console.warn("⚠ Stockage local à " + tailleMo.toFixed(1) + " Mo — synchronisé avec PostgreSQL.");
    }
  } catch (e) {
    console.error("⚠ Stockage local plein.");
  }
  // Async background sync to PostgreSQL backend
  saveDBSync(DB).catch(err => console.error("Synchro PostgreSQL background warning:", err));
}

export function codeExiste(code, DB) {
  return COLLS.some(c => (DB[c] || []).some(x => x.code === code));
}

export function genCode(pfx, DB) {
  const annee = new Date().getFullYear();
  const avecAnnee = PFX_ANNEE.includes(pfx);
  const cle = avecAnnee ? pfx + annee : pfx;
  let code;
  do {
    DB.seq[cle] = (DB.seq[cle] || 0) + 1;
    const n = String(DB.seq[cle]).padStart(6, "0");
    code = avecAnnee ? `${pfx}${annee}-${n}` : pfx + n;
  } while (codeExiste(code, DB));
  return code;
}

export function changerCode(ancien, nouveau, DB, auditFn) {
  const refs = ["dossier", "client", "fournisseur"];
  const MODS_PAR_COLL = {}; // Could be imported if needed, keeping simple
  for (const c of COLLS) {
    for (const o of (DB[c] || [])) {
      for (const r of refs) {
        if (o[r] === ancien) {
          o[r] = nouveau;
          if (auditFn) {
            auditFn(MODS_PAR_COLL[c] || c, "Modification (propagation code)", o.code, r, ancien, nouveau, o.dossier);
          }
        }
      }
    }
  }
}

export function audit(DB, module, action, objet, champ, avant, apres, dossier, userCourant) {
  const t = new Date();
  if (!dossier && /^DOS\d{4}-/.test(String(objet || ""))) dossier = objet;
  if (!DB.audit) DB.audit = [];
  DB.audit.unshift({
    date: t.toLocaleDateString("fr-FR"), heure: t.toLocaleTimeString("fr-FR"),
    utilisateur: userCourant || "—", module, action, objet: objet || "—",
    champ: champ || "—", avant: (avant === undefined || avant === "") ? "—" : String(avant),
    apres: (apres === undefined || apres === "") ? "—" : String(apres),
    dossier: dossier || "—", ts: t.getTime()
  });
  if (DB.audit.length > 20000) DB.audit.length = 20000;
}

export function notifier(DB, dest, texte, module, userCourant, genCodeFn) {
  if (!DB.notifs) DB.notifs = [];
  DB.notifs.unshift({
    code: genCodeFn("NTF", DB), dest, de: userCourant || "—", texte, module, lu: false, ts: Date.now(),
    date: new Date().toLocaleDateString("fr-FR") + " " + new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  });
  if (DB.notifs.length > 500) DB.notifs.length = 500;
}

export function nbNonLues(DB, destinataireEstMoiFn) {
  if (!DB.notifs) return 0;
  return DB.notifs.filter(n => !n.lu && destinataireEstMoiFn(n)).length;
}

export function detecterMentions(texte, contexte, DB, userCourant, USERS, notifierFn) {
  if (!texte || !texte.includes("@")) return;
  const cibles = new Set();
  for (const u of (DB.utilisateurs || [])) {
    if (u.nomComplet !== userCourant && (texte.includes("@" + u.nomComplet) || texte.includes("@" + u.identifiant))) cibles.add(u.nomComplet);
  }
  for (const s of USERS) {
    if (texte.includes("@" + s)) cibles.add(s);
  }
  cibles.forEach(c => notifierFn(c, `${userCourant} vous a mentionné${contexte ? " sur " + contexte : ""} : « ${texte.slice(0, 140)} »`, "Mention"));
}
