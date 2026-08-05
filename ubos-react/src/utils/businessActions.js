import { ETAPES, SERVICE_ETAPE } from '../data/constants';

function normTel(t) { return String(t||"").replace(/\D/g,"").replace(/^00/,"+").replace(/^0/,"+212"); }

export function calculFF(f, db) {
  const lignes = f.lignes || [];
  const actives = lignes.filter(l => l.statut !== "Annulée");
  const totalHT = actives.reduce((s, l) => s + (+l.montantHT || 0), 0);
  const totalTVA = actives.reduce((s, l) => s + (+l.montantTVA || 0), 0);
  const totalTTC = actives.reduce((s, l) => s + (+l.montantTTC || 0), 0);

  const reducValidees = (f.reductions || []).filter(r => r.statut === "Validée").reduce((s, r) => s + (+r.montant || 0), 0);
  const reducAttente = (f.reductions || []).filter(r => r.statut === "En attente").reduce((s, r) => s + (+r.montant || 0), 0);

  const avoirs = (db.avoirsFF || []).filter(a => a.facture === f.code).reduce((s, a) => s + (+a.montant || 0), 0);

  const paiementsUBOS = (db.paiements || []).filter(p => p.dossier === f.dossier && p.statut === "Payé" && ["Acompte","Solde","Reliquat"].includes(p.nature)).reduce((s, p) => s + (+p.montant || 0), 0);
  const paiementsHorsSysteme = +f.paiementsHorsSysteme || 0;
  const paiementsRecus = paiementsUBOS + paiementsHorsSysteme;

  const remboursements = (db.remboursements || []).filter(r => r.facture === f.code && r.statut === "Effectué").reduce((s, r) => s + (+r.montant || 0), 0);

  const soldeDu = totalTTC - reducValidees - avoirs - paiementsRecus + remboursements;

  const joursRetard = (f.echeance && soldeDu > 0) ? Math.floor((Date.now() - new Date(f.echeance).getTime()) / 864e5) : 0;
  const devis = +f.devisInitial || 0;
  const ecartDevis = devis ? totalTTC - devis : null;
  const ecartDevisPct = devis ? Math.round((totalTTC - devis) / devis * 1000) / 10 : null;

  return { lignes, actives, totalHT, totalTVA, totalTTC, reducValidees, reducAttente, avoirs, paiementsUBOS, paiementsHorsSysteme, paiementsRecus, remboursements, soldeDu, joursRetard, ecartDevis, ecartDevisPct };
}

export const qualifierLead = (code, db, genCode, audit, userCourant, sauver, toast, peut) => {
  if (!peut) { toast("Permission refusée."); return; }
  const l = db.leads?.find(x => x.code === code); if (!l) return;
  if (l.statut === "Qualifié") { toast("Ce lead a déjà été converti."); return; }
  
  l.statut = "Qualifié";
  let ct = db.contacts?.find(c => c.telephone && l.telephone && normTel(c.telephone) === normTel(l.telephone));
  
  if (!ct) {
    ct = {
      code: genCode("CT"), nom: l.nom || l.telephone || "Contact", telephone: l.telephone, source: l.source || "Leads / Data",
      statut: "Nouveau", remarque: "Converti depuis l'archive Leads / Data (" + l.code + ")", ancienCodeLead: l.code, par: userCourant, ts: Date.now()
    };
    if (!db.contacts) db.contacts = [];
    db.contacts.push(ct);
    audit("Contacts", "Création", ct.code, "-", "-", l.nom);
  }
  
  let cl = db.clients?.find(c => c.telephone && l.telephone && normTel(c.telephone) === normTel(l.telephone));
  if (!cl) {
    cl = { code: genCode("C"), nom: l.nom, telephone: l.telephone, segment: "Prospect", remarque: "Converti depuis le contact " + ct.code, ts: Date.now() };
    if (!db.clients) db.clients = [];
    db.clients.push(cl);
    ct.codeClientAssocie = cl.code;
    audit("Clients", "Création", cl.code, "-", "-", l.nom + " (via lead " + l.code + ")");
  }
  
  sauver(db); 
  toast("Lead qualifié avec succès.");
};

export const convertirContactEnClient = (code, db, genCode, audit, userCourant, sauver, toast, peut) => {
  if (!peut) { toast("Permission refusée."); return; }
  const ct = db.contacts?.find(x => x.code === code); if (!ct || ct.codeClientAssocie) return;
  
  const nc = {
    code: genCode("C"), nom: ct.nom, telephone: ct.telephone, email: ct.email, segment: "Prospect",
    remarque: "Converti depuis le Contact " + code + " (source : " + (ct.source || "-") + ").",
    par: userCourant, ts: Date.now()
  };
  
  if (!db.clients) db.clients = [];
  db.clients.push(nc);
  ct.codeClientAssocie = nc.code; 
  ct.statut = "Converti en client";
  
  audit("Contacts", "Converti en client", code, "codeClientAssocie", "-", nc.code);
  audit("Clients", "Création", nc.code, "-", "-", ct.nom + " (converti depuis contact " + code + ")");
  
  sauver(db); 
  toast(ct.nom + " devient client : " + nc.code);
};

export const avancerDossier = (code, db, genCode, audit, userCourant, sauver, toast, peut, notifier) => {
  if (!peut) { toast("Permission refusée."); return; }
  const d = db.dossiers?.find(x => x.code === code); if (!d) return;
  
  const i = ETAPES.indexOf(d.etape);
  if (i >= ETAPES.length - 1) { toast("Le dossier est déjà à la dernière étape."); return; }
  
  const av = d.etape; 
  d.etape = ETAPES[i + 1];
  if (d.etape === "Clôturé") d.statut = d.statut === "Actif" ? "Livré" : d.statut;
  
  audit("Dossiers", "Transfert d'étape", d.code, "etape", av, d.etape);
  
  const avAction = d.actionSuivante;
  d.actionSuivante = "À définir - étape " + d.etape;
  d.respActionSuivante = d.responsable || SERVICE_ETAPE[d.etape] || "";
  d.echeanceActionSuivante = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  
  audit("Dossiers", "Modification", d.code, "actionSuivante", avAction || "-", d.actionSuivante);
  
  const svc = SERVICE_ETAPE[d.etape];
  if (svc && notifier) notifier(svc, `Dossier ${d.code} transféré à l'étape « ${d.etape} ».`, "Dossiers");
  
  sauver(db);
  toast(`Dossier avancé à l'étape: ${d.etape}`);
};

export const calculerLigne = (l) => {
  l.quantite = l.quantite === "" || l.quantite === undefined ? 1 : +l.quantite;
  l.prixUnitaire = +l.prixUnitaire || 0;
  l.tauxTVA = l.tauxTVA === "" || l.tauxTVA === undefined ? 0 : +l.tauxTVA;
  l.montantHT = Math.round((l.quantite * l.prixUnitaire) * 100) / 100;
  l.montantTVA = Math.round(l.montantHT * (l.tauxTVA / 100) * 100) / 100;
  l.montantTTC = Math.round((l.montantHT + l.montantTVA) * 100) / 100;
  return l;
};

export const creerFactureDepuisDossier = (codeDossier, db, genCode, audit, userCourant, sauver, toast, peut) => {
  if (!peut) { toast("Permission refusée."); return; }

  const exist = db.facturesFinales?.find(f => f.dossier === codeDossier);
  if (exist) { 
    window.location.hash = "#ficheFF:" + exist.code; 
    return; 
  }
  
  const d = db.dossiers?.find(x => x.code === codeDossier); if (!d) return;
  const e = db.etudes?.filter(s => s.dossier === codeDossier).sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
  const off = db.offres?.filter(o => o.dossier === codeDossier).sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
  
  const fob = e ? +e.fob || 0 : 0;
  const fret = e ? +e.fret || 0 : 0;
  const droitsPct = e ? +e.droitsPct || 0 : 0;
  const tvaPct = e ? +e.tvaPct || 0 : 0;
  const droitsMnt = Math.round((fob + fret) * (droitsPct / 100));
  const tvaImportMnt = Math.round((fob + fret + droitsMnt) * (tvaPct / 100));
  const transNatCout = db.transportsNat?.filter(t => t.dossier === codeDossier).reduce((s, t) => s + (+t.cout || 0), 0) || 0;
  const fo = db.fournisseurs?.find(x => x.code === d.fournisseur);
  
  const lignes = [];
  let seq = 0;
  
  const ajoute = (designation, categorie, montant, tauxTVA, fournisseur) => {
    if (!montant) return;
    seq++;
    lignes.push(calculerLigne({
      id: "l" + seq, designation, categorie, quantite: 1, prixUnitaire: montant, 
      tauxTVA: tauxTVA || 0, fournisseur: fournisseur || "", reference: "", commentaire: "", statut: "Estimée"
    }));
  };
  
  ajoute("Valeur marchandise", "Valeur marchandise", fob || (+d.montantAchat || 0), 0, fo ? fo.nom : "");
  ajoute("Transport international", "Transport international", fret, 0, "");
  ajoute("Droits de douane", "Droits de douane", droitsMnt, 0, "");
  ajoute("TVA à l'importation (douane)", "Droits de douane", tvaImportMnt, 0, "");
  ajoute("Transit / frais portuaires", "Transit", e ? +e.fraisPort || 0 : 0, 0, "");
  ajoute("Transport national", "Transport national", transNatCout, 20, "");
  
  const f = {
    code: genCode("FF"), dossier: codeDossier, client: d.client,
    devisInitial: off ? +off.montant || 0 : +d.montantVente || 0,
    lignes, _seqLigne: seq,
    paiementsHorsSysteme: 0, statutMarchandise: "Livrée", statutFinal: "Solde dû",
    echeance: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    reductions: [], reliquats: [], validee: false, par: userCourant, ts: Date.now()
  };
  
  if (!db.facturesFinales) db.facturesFinales = [];
  db.facturesFinales.push(f);
  audit("Facturation finale", "Création", f.code, "dossier", "-", codeDossier, codeDossier);
  
  sauver(db); 
  window.location.hash = "#ficheFF:" + f.code; 
  toast(f.code + " créée depuis " + codeDossier + " (" + lignes.length + " lignes pré-remplies à vérifier)");
};

export const creerDossierDepuisCommande = (codeCommande, db, genCode, audit, userCourant, sauver, toast, peut) => {
  if (!peut) { toast("Permission refusée."); return; }

  const cmd = db.commandes?.find(x => x.code === codeCommande); if (!cmd) return;
  
  const d = {
    code: genCode("DOS"),
    client: cmd.client,
    commande: cmd.code,
    demande: cmd.demande,
    formuleUltex: cmd.formuleUltex,
    etape: ETAPES[0],
    statut: "Actif",
    actionSuivante: "Compléter création dossier",
    responsable: userCourant,
    respActionSuivante: userCourant,
    echeanceActionSuivante: new Date(Date.now() + 864e5).toISOString().slice(0, 10),
    ts: Date.now()
  };
  
  if (!db.dossiers) db.dossiers = [];
  db.dossiers.push(d);
  
  cmd.statut = "Dossier créé";
  
  audit("Dossiers", "Création", d.code, "-", "-", "Depuis commande " + codeCommande);
  
  sauver(db);
  window.location.hash = "#ficheDossier:" + d.code;
  toast(`Dossier ${d.code} créé depuis la commande. Veuillez compléter les informations.`);
};
