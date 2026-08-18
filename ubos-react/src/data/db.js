import { PFX_ANNEE, COLLS } from './constants';

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
    demandeLignes: [], demandeRoutages: [], objectifsData: [],
    tacheEtapes: [], rapportsJournaliers: [], journalSecurite: []
  };
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

/**
 * Cascade-renames a person across every live business collection (any
 * field whose value equals the old name — assigne, responsable,
 * validateur, responsableCommercial, etc.) so nothing silently stops
 * matching them after a self-service rename. Deliberately excludes
 * `notifs` and `audit` (not in COLLS) — those are a historical record of
 * what happened under the name at the time, not a live assignment, so
 * they're left as-is. Immutable: returns a new DB object, doesn't mutate.
 */
export function renommerUtilisateur(DB, ancienNom, nouveauNom) {
  if (!ancienNom || !nouveauNom || ancienNom === nouveauNom) return { db: DB, count: 0 };
  let count = 0;
  const next = { ...DB };
  for (const c of COLLS) {
    if (!DB[c] || !DB[c].length) continue;
    let collChanged = false;
    const nextColl = DB[c].map(o => {
      let recordChanged = false;
      const nextRecord = { ...o };
      for (const k of Object.keys(o)) {
        if (o[k] === ancienNom) {
          nextRecord[k] = nouveauNom;
          recordChanged = true;
          count++;
        }
      }
      if (recordChanged) collChanged = true;
      return recordChanged ? nextRecord : o;
    });
    if (collChanged) next[c] = nextColl;
  }
  return { db: next, count };
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

// Separate from audit() by design: a security-relevant event (login,
// OTP request/failure, role change...), not a business-data change. Only
// ever pass metadata here — never the password or the OTP code itself.
export function journaliserSecurite(DB, action, utilisateur, module, resultat, ip) {
  const t = new Date();
  if (!DB.journalSecurite) DB.journalSecurite = [];
  DB.journalSecurite.unshift({
    code: `SEC${Date.now()}${Math.floor(Math.random() * 1000)}`,
    date: t.toLocaleDateString("fr-FR"), heure: t.toLocaleTimeString("fr-FR"),
    utilisateur: utilisateur || "—", action, module: module || "—",
    resultat: resultat || "—", ip: ip || "—", ts: t.getTime()
  });
  if (DB.journalSecurite.length > 20000) DB.journalSecurite.length = 20000;
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
