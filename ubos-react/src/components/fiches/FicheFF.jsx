import React, { useState, useEffect, useMemo } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import Topbar from '../layout/Topbar';
import KVDisplay from '../common/KVDisplay';
import DataTable from '../common/DataTable';
import Pill from '../common/Pill';
import { PrinterIcon, SearchIcon, CheckIcon } from '../common/Icons';

const SEUIL_ECART_DEVIS_PCT = 15;

const fmtMAD = (v) => new Intl.NumberFormat('fr-MA', { style: 'currency', currency: 'MAD' }).format(v||0);

function calculFF(f, db) {
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

const FicheFF = ({ codeProp, code: codeFromProp }) => {
  const { db } = useDB();
  const { peut, estDirection } = useAuth();
  const initialCode = codeProp || codeFromProp || '';
  const [code, setCode] = useState(initialCode);

  useEffect(() => {
    const c = codeProp || codeFromProp;
    if (c) {
      setCode(c);
    } else {
      const hash = window.location.hash;
      if (hash.startsWith('#ficheFF:')) {
        setCode(hash.split(':')[1]);
      }
    }
  }, [codeProp, codeFromProp, window.location.hash]);

  const f = (db?.facturesFinales || []).find(x => x.code === code);
  
  if (!f) {
    return (
      <div>
        <Topbar titre="Facture Finale" />
        <div className="panneau">
          <div className="vide"><b>Facture introuvable</b> {code ? `(${code})` : ''} n'existe pas.</div>
        </div>
      </div>
    );
  }

  const c = calculFF(f, db);
  const d = (db.dossiers || []).find(x => x.code === f.dossier);
  const cl = (db.clients || []).find(x => x.code === f.client);
  const ct = (db.documents || []).find(x => x.dossier === f.dossier && x.type === "Contrat");

  const lienDossierFields = [
    { k: 'client', l: 'Code client', render: () => cl ? <a href={`#ficheClient:${cl.code}`}>{cl.nom} ({cl.code})</a> : '—' },
    { k: 'dossier', l: 'Code dossier', render: () => d ? <a href={`#ficheDossier:${d.code}`}>{d.code}</a> : <Pill type="p-rouge" texte="MANQUANT" /> },
    { k: 'devis', l: 'Devis initial (informatif)', render: () => (
      <span>
        {fmtMAD(f.devisInitial)}
        {c.ecartDevisPct !== null && (
          <small style={{ color: Math.abs(c.ecartDevisPct) > SEUIL_ECART_DEVIS_PCT ? "var(--rouge)" : "var(--gris)", marginLeft: '8px' }}>
            Écart {c.ecartDevisPct > 0 ? "+" : ""}{c.ecartDevisPct}%
          </small>
        )}
      </span>
    )},
    { k: 'contrat', l: 'Contrat', render: () => ct ? `${ct.nom} à ${ct.code}` : '—' },
    { k: 'statutMarchandise', l: 'Statut marchandise', render: () => <Pill type={["Abandonnée par le client","Reprise par ULTEx","En contentieux"].includes(f.statutMarchandise) ? "p-rouge" : "p-gris"} texte={f.statutMarchandise || "-"} /> },
    { k: 'statutFinal', l: 'Statut financier', render: () => <Pill type={f.statutFinal === "Solde payé" ? "p-vert" : f.statutFinal === "Impayé" ? "p-rouge" : "p-ambre"} texte={f.statutFinal || "-"} /> },
    { k: 'echeance', l: 'Échéance du solde', render: () => (
      <span>
        {f.echeance || "-"}
        {c.joursRetard > 0 && <span style={{marginLeft:'8px'}}><Pill type="p-rouge" texte={`J+${c.joursRetard}`} /></span>}
      </span>
    )}
  ];

  const syntheseFields = [
    { k: 'totalHT', l: 'Total HT', render: () => fmtMAD(c.totalHT) },
    { k: 'totalTVA', l: 'Total TVA', render: () => fmtMAD(c.totalTVA) },
    { k: 'totalTTC', l: <b>TOTAL TTC FACTURÉ</b>, render: () => <b>{fmtMAD(c.totalTTC)}</b> },
    { k: 'lignes', l: 'Lignes actives / justifiées', render: () => `${c.actives.length} active(s), dont ${c.actives.filter(l=>l.statut==="Justifiée").length} justifiée(s)` }
  ];

  const etatCompteFields = [
    { k: 'totalTTC', l: 'Total facturé (TTC)', render: () => fmtMAD(c.totalTTC) },
    { k: 'reduc', l: '- Réductions validées', render: () => (
      <span>
        {fmtMAD(c.reducValidees)}
        {c.reducAttente > 0 && <span className="pill p-ambre" style={{marginLeft:'8px'}}>+ {fmtMAD(c.reducAttente)} en attente</span>}
      </span>
    )},
    { k: 'avoirs', l: '- Avoirs émis', render: () => fmtMAD(c.avoirs) },
    { k: 'paiements', l: '- Paiements reçus', render: () => (
      <span>
        {fmtMAD(c.paiementsRecus)}
        <small style={{color:'var(--gris)', marginLeft:'8px'}}>({fmtMAD(c.paiementsUBOS)} UBOS + {fmtMAD(c.paiementsHorsSysteme)} hors système)</small>
      </span>
    )},
    { k: 'remboursements', l: '+ Remboursements', render: () => fmtMAD(c.remboursements) },
    { k: 'solde', l: <b>= SOLDE DÛ PAR LE CLIENT</b>, render: () => <b style={{fontSize:'17px', color: c.soldeDu > 0.01 ? 'var(--rouge)' : 'var(--ok)'}}>{fmtMAD(Math.round(c.soldeDu))}</b> }
  ];

  return (
    <div>
      <Topbar titre={`Facture finale : ${f.code}`} />
      <div className="panneau">
        
        <div className="outils">
          <span className="pill p-or" style={{fontSize:'14px', padding:'6px 14px'}}>{f.code}</span>
          {f.validee ? <Pill type="p-vert" texte={`Validée le ${f.valideeLe}`} /> : <Pill type="p-gris" texte="Brouillon" />}
          <span className="spacer"></span>
          {peut("modifier") && <button className="btn doux">Modifier l'entête</button>}
          <button className="btn doux"><SearchIcon size={14} /> Vérifier la cohérence</button>
          {!f.validee && peut("valider") && <button className="btn"><CheckIcon size={14} /> Valider</button>}
          <button className="btn or" onClick={() => window.print()}><PrinterIcon size={14} /> Imprimer</button>
        </div>

        <div className="fiche-grille">
          <div className="bloc-fiche">
            <h4>Liens du dossier</h4>
            <KVDisplay data={{}} fields={lienDossierFields} />
          </div>

          <div className="bloc-fiche">
            <h4>A. Facture finale - synthèse</h4>
            <KVDisplay data={{}} fields={syntheseFields} />
          </div>
        </div>

        <div className="bloc-fiche large">
          <h4>Lignes de facture <button className="btn mini" style={{float:'right'}}>+ Ajouter une ligne</button></h4>
          <DataTable 
            columns={[
              {key: 'designation', label: 'Désignation'},
              {key: 'categorie', label: 'Catégorie'},
              {key: 'quantite', label: 'Qté'},
              {key: 'prixUnitaire', label: 'PU', render: (v) => fmtMAD(v)},
              {key: 'montantHT', label: 'Montant HT', render: (v) => fmtMAD(v)},
              {key: 'tauxTVA', label: 'TVA %'},
              {key: 'montantTVA', label: 'Montant TVA', render: (v) => fmtMAD(v)},
              {key: 'montantTTC', label: 'Montant TTC', render: (v) => <b>{fmtMAD(v)}</b>},
              {key: 'statut', label: 'Statut', render: (s) => <Pill type={s==="Justifiée"?"p-vert":s==="Estimée"?"p-ambre":"p-gris"} texte={s} />},
              {key: 'actions', label: 'Actions', render: () => <button className="btn mini">Modifier</button>}
            ]}
            data={c.lignes}
          />
        </div>

        <div className="bloc-fiche large" style={{background: 'var(--fond-jaune)'}}>
          <h4>B. État de compte / Reliquat</h4>
          <KVDisplay data={{}} fields={etatCompteFields} />
        </div>

      </div>
    </div>
  );
};

export default FicheFF;
