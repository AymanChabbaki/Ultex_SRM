import React, { useState, useMemo, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import Modal from '../common/Modal';
import { exporterExcel } from '../../utils/export';
import { MODS } from '../../data/modules';
import { PFX_ANNEE, COLLS } from '../../data/constants';
import * as XLSX from 'xlsx';
import { esc, pill, normTel } from '../../utils/format';

function normCol(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

const MAP_COLONNES = [
  [["codeclient", "code"], "code"],
  [["service"], "service"],
  [["nomduclient", "nomclient", "nom"], "nom"],
  [["contactclient", "contact", "telephone", "tel"], "contact"],
  [["steville", "ste", "ville", "societe"], "ville"],
  [["produit", "informationdeproduit", "nomduproduit"], "produit"],
  [["experience"], "experience"],
  [["fournisseurorigin", "fournisseur", "origin", "origine"], "fournisseur"],
  [["quantite", "qte"], "quantite"],
  [["liendelimage", "lienimage", "lien", "image"], "lien"],
  [["observation", "observations", "obs", "remarque"], "obs"]
];

function fmtDateCell(v) {
  if (v instanceof Date && !isNaN(v)) return v.toLocaleDateString("fr-FR");
  const s = String(v ?? "").trim();
  return s.replace(" 00:00:00", "");
}

function analyserFeuilleImport(wb, nomFeuille, db) {
  const ws = wb.Sheets[nomFeuille];
  if (!ws) return { erreurEntete: true, lignes: [], nouveaux: [], doublons: [], erreurs: [], score: 0 };

  const grille = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false, dateNF: "dd/mm/yyyy" });
  const plage = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : { s: { r: 0, c: 0 } };
  const celluleBrute = (r, c) => ws[XLSX.utils.encode_cell({ r: plage.s.r + r, c: plage.s.c + c })];

  let idxEntete = -1, mapping = null, meilleurScore = 0;
  for (let r = 0; r < Math.min(6, grille.length); r++) {
    const m = { etats: [] };
    let score = 0;
    (grille[r] || []).forEach((cell, ci) => {
      const n = normCol(cell);
      if (!n) return;
      const me = n.match(/^etat(\d)/) || n.match(/^(\d)(?:er|eme)etat/);
      if (me) { m.etats.push({ n: +me[1], col: ci }); score++; return; }
      for (const [alias, cle] of MAP_COLONNES) {
        if (alias.includes(n) && m[cle] === undefined) { m[cle] = ci; score++; break; }
      }
    });
    if (score > meilleurScore) { meilleurScore = score; idxEntete = r; mapping = m; }
  }

  if (!mapping || meilleurScore < 3) return { erreurEntete: true, lignes: [], nouveaux: [], doublons: [], erreurs: [], score: meilleurScore };

  const parCode = {}; (db.clients || []).forEach(c => parCode[c.code] = c);
  const parTel = {}; (db.clients || []).forEach(c => { const t = normTel(c.telephone); if (t) parTel[t] = c; });

  const lignes = [];
  const nouveaux = [];
  const doublons = [];
  const erreurs = [];

  for (let r = idxEntete + 1; r < grille.length; r++) {
    const row = grille[r] || [];
    const get = k => mapping[k] === undefined ? "" : String(row[mapping[k]] ?? "").trim();
    const code = get("code");
    const nom = get("nom");
    const contact = get("contact").replace(/\.0$/, "");
    if (!code && !nom && !contact) continue;

    const etats = [];
    mapping.etats.sort((a, b) => a.n - b.n).forEach(e => {
      const brute = celluleBrute(r, e.col);
      const dte = brute && brute.v instanceof Date ? brute.v.toLocaleDateString("fr-FR") : fmtDateCell(row[e.col]);
      const lib = String(row[e.col + 1] ?? "").trim();
      if (dte || lib) etats.push({ n: e.n, date: dte, etat: lib });
    });

    const item = {
      code, nom, contact, ville: get("ville"), service: get("service"), produit: get("produit"),
      experience: get("experience"), fournisseur: get("fournisseur"), quantite: get("quantite").replace(/\.0$/, ""),
      lien: get("lien"), obs: get("obs"), etats, ligne: r + 1
    };

    if (!nom && !contact) {
      item._motif = "erreur";
      erreurs.push(item);
    } else {
      const t = normTel(contact);
      if (code && parCode[code]) {
        item._cible = parCode[code];
        item._motif = "code";
        doublons.push(item);
      } else if (t && parTel[t]) {
        item._cible = parTel[t];
        item._motif = "téléphone";
        doublons.push(item);
      } else {
        nouveaux.push(item);
      }
    }
    lignes.push(item);
  }

  return { lignes, nouveaux, doublons, erreurs, mapping, idxEntete, erreurEntete: false, score: meilleurScore };
}

function scoreFeuille(wb, nom, db) {
  try {
    return analyserFeuilleImport(wb, nom, db).score || 0;
  } catch (e) {
    return 0;
  }
}

export default function ImportCentre() {
  const { db, updateDB, audit } = useDB();
  const { estDirection, userCourant } = useAuth();
  const { toast } = useToast();

  const [importState, setImportState] = useState(null);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [politique, setPolitique] = useState('ignorer');
  const [dernierImport, setDernierImport] = useState(null);

  if (!estDirection()) {
    return (
      <>
        <Topbar titre="Centre d'importation" />
        <div className="panneau">
          <div className="note-verrou">
            <b>Réservé à la Direction</b><br />
            L'importation en masse est une opération sensible réservée à la Direction.
          </div>
        </div>
      </>
    );
  }

  const handleExportAll = () => {
    exporterExcel("all", db, MODS);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetNames = wb.SheetNames;
        
        let meilleure = sheetNames[0];
        let bestScore = -1;
        sheetNames.forEach(n => {
          const s = scoreFeuille(wb, n, db);
          if (s > bestScore) {
            bestScore = s;
            meilleure = n;
          }
        });

        setImportState({
          wb,
          fileName: file.name,
          sheetNames
        });
        setSelectedSheet(meilleure);
        setPolitique('ignorer');
      } catch (err) {
        toast("Fichier illisible : format Excel attendu (.xlsx).");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const resAnalyse = useMemo(() => {
    if (!importState || !selectedSheet) return null;
    return analyserFeuilleImport(importState.wb, selectedSheet, db);
  }, [importState, selectedSheet, db]);

  const executeImport = () => {
    if (!resAnalyse || !importState || resAnalyse.erreurEntete) return;
    const { nouveaux, doublons, erreurs } = resAnalyse;

    const nextDb = JSON.parse(JSON.stringify(db));
    const codesPris = new Set();
    COLLS.forEach(c => (nextDb[c] || []).forEach(o => codesPris.add(o.code)));

    const seq = nextDb.seq || {};
    const annee = new Date().getFullYear();

    function genRapide(pfx) {
      const avecAnnee = PFX_ANNEE.includes(pfx);
      const cle = avecAnnee ? pfx + annee : pfx;
      let code;
      do {
        seq[cle] = (seq[cle] || 0) + 1;
        const n = String(seq[cle]).padStart(6, "0");
        code = avecAnnee ? (pfx + annee + "-" + n) : (pfx + n);
      } while (codesPris.has(code));
      codesPris.add(code);
      return code;
    }

    nextDb.seq = seq;

    const prodParNom = {}; (nextDb.produits || []).forEach(p => prodParNom[normCol(p.designation)] = p);
    const fourParNom = {}; (nextDb.fournisseurs || []).forEach(f => fourParNom[normCol(f.nom)] = f);
    const demandesClient = {}; 
    (nextDb.demandes || []).forEach(dm => {
      if (dm.client) (demandesClient[dm.client] = demandesClient[dm.client] || new Set()).add(normCol((dm.lignes && dm.lignes[0] && dm.lignes[0].produitService) || "").slice(0, 40));
    });

    const inutile = v => { const n = normCol(v); return !n || ["oui", "non", "", "-", "na"].includes(n); };

    let crees = 0, maj = 0, ignores = 0;

    const noteDe = l => {
      const parts = [];
      if (l.obs) parts.push("Observation : " + l.obs);
      if (l.service) parts.push("Service : " + l.service);
      if (l.experience) parts.push("Expérience import : " + l.experience);
      if (l.lien) parts.push("Image : " + l.lien);
      return parts.join(" · ");
    };

    const creerRefs = l => {
      if (!inutile(l.produit) && l.produit.length > 2 && !prodParNom[normCol(l.produit)]) {
        const p = { code: genRapide("P"), designation: l.produit, remarque: "Créé par import Excel (" + importState.fileName + ")", par: userCourant, ts: Date.now() };
        (nextDb.produits = nextDb.produits || []).push(p);
        prodParNom[normCol(l.produit)] = p;
      }
      if (!inutile(l.fournisseur) && l.fournisseur.length > 2 && !fourParNom[normCol(l.fournisseur)]) {
        const f = { code: genRapide("F"), nom: l.fournisseur, statut: "En test", remarque: "Créé par import Excel (" + importState.fileName + ")", par: userCourant, ts: Date.now() };
        (nextDb.fournisseurs = nextDb.fournisseurs || []).push(f);
        fourParNom[normCol(l.fournisseur)] = f;
      }
    };

    const creerDemandeDepuisImport = (l, clientCode) => {
      if (inutile(l.produit) && !l.obs) return;
      const cle = normCol(l.produit).slice(0, 40);
      if (l.produit && demandesClient[clientCode] && demandesClient[clientCode].has(cle)) return;
      const dm = {
        code: genRapide("DMD"), client: clientCode, dateDemande: new Date().toISOString().slice(0, 10), responsableData: userCourant,
        source: l.service || "Import Excel", objectifGeneral: "Demande importée depuis " + importState.fileName, urgence: "Normale",
        statut: l.etats.length ? "Non confirmée" : "En cours d'étude", remarqueGenerale: l.obs || "", lignes: [], _seqLigne: 0, par: userCourant, ts: Date.now()
      };
      let besoin = l.produit || "Demande importée";
      if (l.experience) { const e = normCol(l.experience); besoin += e === "oui" ? " (a déjà importé)" : e === "non" ? " (première importation)" : ""; }
      dm.lignes.push({
        id: "dl1_" + Date.now() + Math.random().toString(36).slice(2, 5), code: dm.code + "-01", produitService: besoin.slice(0, 200),
        quantite: l.quantite || "", statut: "Nouvelle", route: [], fournisseurConnu: inutile(l.fournisseur) ? "Non" : "Oui", proformaDisponible: "Non",
        consultationsFournisseurs: [], selection: null, statutConfirmation: "Non confirmée", ts: Date.now()
      });
      (nextDb.demandes = nextDb.demandes || []).push(dm);
      (demandesClient[clientCode] = demandesClient[clientCode] || new Set()).add(cle);
    };

    const creerClient = (l, forcerNouveau) => {
      let code = l.code;
      if (forcerNouveau || !code || codesPris.has(code)) {
        if (code && (forcerNouveau || codesPris.has(code))) { l.obs = (l.obs ? l.obs + " · " : "") + "Code d'origine Excel : " + code; }
        code = genRapide("C");
      } else { codesPris.add(code); }
      const c = {
        code, nom: l.nom || ("Client " + code), telephone: l.contact, ville: l.ville, segment: "Client",
        remarque: noteDe(l), historiqueEtats: l.etats, par: userCourant, ts: Date.now()
      };
      (nextDb.clients = nextDb.clients || []).push(c);
      crees++;
      creerRefs(l);
      creerDemandeDepuisImport(l, code);
    };

    nouveaux.forEach(l => creerClient(l, false));

    doublons.forEach((l) => {
      if (politique === "creer") {
        creerClient(l, true);
        return;
      }
      if (politique === "maj") {
        const c = (nextDb.clients || []).find(x => x.code === l._cible.code);
        if (c) {
          if (l.nom && c.nom !== l.nom) c.nom = l.nom;
          if (l.contact) c.telephone = l.contact;
          if (l.ville) c.ville = l.ville;
          maj++;
          creerRefs(l);
          creerDemandeDepuisImport(l, c.code);
        }
      } else {
        ignores++;
      }
    });

    updateDB(nextDb);
    audit("ImportCentre", "Import Excel", importState.fileName, selectedSheet, "—", `${crees} créé(s), ${maj} mis à jour`);

    setDernierImport({
      fichier: importState.fileName,
      feuille: selectedSheet,
      quand: new Date().toLocaleString('fr-FR'),
      crees,
      maj
    });

    setImportState(null);
    toast(`Import réussi : ${crees} client(s) créés, ${maj} mis à jour.`);
  };

  const nbImport = resAnalyse ? (resAnalyse.nouveaux.length + (politique === 'ignorer' ? 0 : resAnalyse.doublons.length)) : 0;

  return (
    <>
      <Topbar titre="Centre d'importation" />
      <div className="deux-col">
        <div className="bloc-fiche">
          <h4>📥 Importer Excel</h4>
          <div style={{ padding: "16px" }}>
            <p style={{ marginBottom: "12px" }}>
              Importez vos anciens fichiers Excel (modèle DATA.xlsx) : des milliers de clients en quelques secondes, sans saisie manuelle.
            </p>
            <p style={{ marginBottom: "12px", color: "var(--gris)", fontSize: "12.5px" }}>
              Colonnes reconnues automatiquement : Code client · Service · Nom du client · Contact client · Ste/Ville · Produit · Expérience · Fournisseur/Origin · Quantité · Lien de l'image · Observation · État 1 à 5 (avec dates).
            </p>
            <button className="btn" style={{ width: "100%" }} onClick={() => document.getElementById('fexcel').click()}>
              📥 Importer Excel
            </button>
            <input 
              type="file" 
              id="fexcel" 
              accept=".xlsx,.xls" 
              style={{ display: "none" }} 
              onChange={handleFileChange} 
            />
          </div>
        </div>

        <div className="bloc-fiche">
          <h4>📤 Exporter Excel</h4>
          <div style={{ padding: "16px" }}>
            <p style={{ marginBottom: "12px" }}>
              Récupérez toutes les données UBOS dans un classeur Excel : une feuille par module (clients, dossiers, paiements, documents…).
            </p>
            <p style={{ marginBottom: "12px", color: "var(--gris)", fontSize: "12.5px" }}>
              Utile pour les sauvegardes, le cabinet comptable, ou l'analyse dans Excel.
            </p>
            <button className="btn or" style={{ width: "100%" }} onClick={handleExportAll}>
              📤 Exporter Excel (toutes les données)
            </button>
          </div>
        </div>
      </div>

      {dernierImport && (
        <div style={{ marginTop: "18px" }}>
          <h3 className="titre-sec">
            Dernier import — {esc(dernierImport.fichier)} (feuille « {esc(dernierImport.feuille)} ») · {esc(dernierImport.quand)}
          </h3>
          <div className="stats">
            <div className="stat"><b>{dernierImport.crees}</b><span>Clients créés</span></div>
            <div className="stat"><b>{dernierImport.maj}</b><span>Mis à jour</span></div>
          </div>
        </div>
      )}

      <p style={{ color: "var(--gris)", fontSize: "12px", marginTop: "14px" }}>
        Chaque import est enregistré dans le Journal d'audit (fichier, feuille, résultat, et une ligne par client créé ou modifié).
      </p>

      {importState && (
        <Modal 
          large={true} 
          title={`📥 Importer Excel — ${importState.fileName}`} 
          onClose={() => setImportState(null)}
          footer={
            <>
              <button className="btn doux" onClick={() => setImportState(null)}>Annuler</button>
              <button className="btn or" onClick={executeImport}>Confirmer l'importation ({nbImport} lignes)</button>
            </>
          }
        >
          <div className="corps">
            <div className="champ">
              <label>FEUILLE À IMPORTER</label>
              <select value={selectedSheet} onChange={e => setSelectedSheet(e.target.value)}>
                {importState.sheetNames.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="champ">
              <label>SI LE CODE CLIENT EXISTE DÉJÀ</label>
              <select value={politique} onChange={e => setPolitique(e.target.value)}>
                <option value="ignorer">Ignorer</option>
                <option value="maj">Mettre à jour</option>
                <option value="creer">Créer nouveau (nouveau code)</option>
              </select>
            </div>

            {resAnalyse && resAnalyse.erreurEntete ? (
              <div className="champ large" style={{ color: "var(--gris)", padding: "12px 0" }}>
                <b style={{ color: "var(--rouge)" }}>Colonnes non reconnues sur « {esc(selectedSheet)} »</b> — cette feuille ne suit pas le modèle (Code client, Nom du client, Contact client…). Choisissez une autre feuille.
              </div>
            ) : resAnalyse ? (
              <div className="champ large">
                <b style={{ display: "block", marginBottom: "8px" }}>
                  Prévisualisation — 10 premières lignes de « {selectedSheet} »
                </b>
                <div className="defile" style={{ border: "1px solid var(--bord)", borderRadius: "9px", margin: "8px 0" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Nom</th>
                        <th>Téléphone</th>
                        <th>Ville/Sté</th>
                        <th>Produit demandé</th>
                        <th>Qté</th>
                        <th>Exp.</th>
                        <th>Fournisseur</th>
                        <th>Dernier état</th>
                        <th>Sort</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resAnalyse.lignes.slice(0, 10).map((l, i) => {
                        const dernier = l.etats.length ? l.etats[l.etats.length - 1] : null;
                        const sort = (!l.nom && !l.contact) ? pill("Erreur", "p-rouge") : (l._cible ? pill("Doublon (" + l._motif + ")", "p-ambre") : pill("Nouveau", "p-vert"));
                        return (
                          <tr key={i}>
                            <td className="code">{esc(l.code || "auto")}</td>
                            <td>{esc(String(l.nom || "").slice(0, 20))}</td>
                            <td>{esc(l.contact)}</td>
                            <td>{esc(String(l.ville || "").slice(0, 14))}</td>
                            <td>{esc(String(l.produit || "").slice(0, 22))}</td>
                            <td>{esc(l.quantite)}</td>
                            <td>{esc(l.experience)}</td>
                            <td>{esc(String(l.fournisseur || "").slice(0, 12))}</td>
                            <td>{dernier ? esc(dernier.date + " " + dernier.etat).slice(0, 24) : "—"}</td>
                            <td>{sort}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
                  {pill(`${resAnalyse.lignes.length} lignes lues`, "p-gris")}
                  {pill(`${resAnalyse.nouveaux.length} nouveaux clients`, "p-vert")}
                  {pill(`${resAnalyse.doublons.length} doublons (code ou téléphone)`, "p-ambre")}
                  {pill(`${resAnalyse.erreurs.length} erreurs (sans nom ni contact)`, "p-rouge")}
                </div>

                <div style={{ marginTop: "10px", color: "var(--gris)", fontSize: "12px", lineHeight: "1.4" }}>
                  Pour chaque ligne appliquée : fiche <b>Client</b> (code manuel conservé, états 1-5 en historique) + <b>Lead / demande</b> (produit, quantité, expérience, source, observation). Produits et fournisseurs inexistants créés automatiquement. Tout est journalisé dans l'audit.
                </div>
              </div>
            ) : null}
          </div>
        </Modal>
      )}
    </>
  );
}
