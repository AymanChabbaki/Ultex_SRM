import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import KVDisplay from '../common/KVDisplay';
import DataTable from '../common/DataTable';
import Pill from '../common/Pill';
import ModuleForm from '../modules/ModuleForm';
import { MODS } from '../../data/modules';
import Modal from '../common/Modal';
import LigneModal from '../common/LigneModal';

const CHAMPS_LIGNE_COMMANDE = [
  {k:'nomProduit',l:'Produit',t:'text',req:1}, {k:'designationTechnique',l:'Désignation',t:'textarea'},
  {k:'quantite',l:'Quantité confirmée',t:'number',req:1}, {k:'unite',l:'Unité',t:'text'},
  {k:'prixUnitaire',l:'Prix unitaire',t:'number'}, {k:'devise',l:'Devise',t:'text'},
  {k:'poidsBrutTotal',l:'Poids brut total (kg)',t:'number'}, {k:'cbmTotal',l:'Volume total (CBM)',t:'number'},
  {k:'fournisseur',l:'Fournisseur',t:'ref',coll:'fournisseurs',cle:'nom'}
];

const FicheCommande = ({ codeProp, code: codeFromProp }) => {
  const { db, updateDB, audit } = useDB();
  const { peut } = useAuth();
  const { toast } = useToast();
  const initialCode = codeProp || codeFromProp || '';
  const [code, setCode] = useState(initialCode);
  const [showEdit, setShowEdit] = useState(false);
  const [ligneEdit, setLigneEdit] = useState(null);
  const [showAjouterArrivage, setShowAjouterArrivage] = useState(false);
  const [arrivageChoisi, setArrivageChoisi] = useState('');

  useEffect(() => {
    const c = codeProp || codeFromProp;
    if (c) {
      setCode(c);
    } else {
      const hash = window.location.hash;
      if (hash.startsWith('#ficheCommande:')) {
        setCode(hash.split(':')[1]);
      }
    }
  }, [codeProp, codeFromProp, window.location.hash]);

  const commande = (db?.commandes || []).find(c => c.code === code);
  
  if (!commande) {
    return (
      <div>
        <Topbar titre="Fiche Commande" />
        <div className="panneau">
          <div className="vide"><b>Commande introuvable</b> {code ? `(${code})` : ''} n'existe pas.</div>
        </div>
      </div>
    );
  }

  const client = db.clients?.find(c => c.code === commande.client) || {};

  const mainFields = [
    {k: 'client', l: 'Client', render: () => <a href={`#ficheClient:${commande.client}`}>{client.nom || commande.client}</a>},
    {k: 'demande', l: 'Demande', render: () => commande.demande ? <a href={`#ficheDemande:${commande.demande}`}>{commande.demande}</a> : '—'},
    {k: 'condition', l: 'Condition'},
    {k: 'formuleUltex', l: 'Formule'},
    {k: 'devisAccepte', l: 'Devis', render: (v) => v ? (
      v.startsWith('data:') || v.startsWith('http')
        ? <a href={v} target="_blank" rel="noreferrer">Voir la pièce jointe</a>
        : v
    ) : '—'},
    {k: 'statut', l: 'Statut', render: (s) => <Pill type={s} texte={s} />}
  ];

  const lignes = commande.lignes || [];
  const arrivages = (db.arrivages || []).filter(a => (a.commandes || []).includes(code));
  const arrivagesDisponibles = (db.arrivages || []).filter(a => !(a.commandes || []).includes(code));

  const sauverLigne = (ligne) => {
    const nextCommande = { ...commande, lignes: lignes.map(l => l.code === ligneEdit.code ? { ...ligneEdit, ...ligne } : l) };
    updateDB({ ...db, commandes: (db.commandes || []).map(c => c.code === code ? nextCommande : c) });
    audit('Commandes', 'Ligne modifiée', code, ligneEdit.code, 'Demande historique inchangée', JSON.stringify(ligne));
    setLigneEdit(null);
    toast('Ligne de commande mise à jour. La demande originale est conservée.');
  };

  const ajouterArrivage = () => {
    if (!arrivageChoisi) return;
    const nextArrivages = (db.arrivages || []).map(a => a.code === arrivageChoisi
      ? { ...a, commandes: [...new Set([...(a.commandes || []), code])] }
      : a);
    updateDB({ ...db, arrivages: nextArrivages, commandes: (db.commandes || []).map(c => c.code === code ? { ...c, statut: 'En arrivage' } : c) });
    audit('Arrivages', 'Commande ajoutée', arrivageChoisi, 'commandes', '—', commande.referenceMetier || code);
    setShowAjouterArrivage(false); setArrivageChoisi('');
    toast('Commande ajoutée à l’arrivage.');
  };

  return (
    <div>
      <Topbar titre={`Commande : ${commande.referenceMetier || code}`} />
      <div className="panneau">
        
        <div className="outils">
          <b className="titre-fiche">{commande.referenceMetier || code}</b>
          <span className="spacer"></span>
          <button className="btn" onClick={() => setShowEdit(true)}>Modifier</button>
        </div>
        {showEdit && (
          <ModuleForm 
            moduleId="commandes" 
            MODS={MODS}
            recordCode={code} 
            onClose={() => setShowEdit(false)} 
          />
        )}

        <div className="bloc-fiche large">
          <h4>Informations Principales</h4>
          <KVDisplay data={commande} fields={mainFields} />
        </div>

        <div className="bloc-fiche large">
          <h4>Produits confirmés</h4>
          <DataTable 
            columns={[
              {key:'code',label:'Produit'}, {key:'nomProduit',label:'Désignation'},
              {key:'quantite',label:'Quantité',render:(v,o)=>`${v || '—'} ${o.unite || ''}`},
              {key:'prixUnitaire',label:'Prix',render:(v,o)=>v?`${v} ${o.devise || ''}`:'—'},
              {key:'poidsBrutTotal',label:'Poids (kg)'}, {key:'cbmTotal',label:'CBM'},
              {key:'actions',label:'Actions',render:(v,row)=>peut('modifier')?<button className="btn mini doux" onClick={()=>setLigneEdit(row)}>Modifier</button>:null}
            ]}
            data={lignes}
          />
        </div>

        <div className="bloc-fiche large">
          <h4>Arrivages <button className="btn mini vert" style={{float:'right'}} onClick={()=>setShowAjouterArrivage(true)}>+ Ajouter à un arrivage</button></h4>
          <DataTable columns={[
            {key:'code',label:'Arrivage',render:v=><a href={`#ficheArrivage:${v}`}>{v}</a>},
            {key:'nomInterne',label:'Nom'}, {key:'statut',label:'Statut',render:s=><Pill type={s} texte={s}/>}]} data={arrivages}/>
        </div>

        {ligneEdit && <LigneModal title={`Modifier ${ligneEdit.code}`} champs={CHAMPS_LIGNE_COMMANDE} initialData={ligneEdit} onSave={sauverLigne} onClose={()=>setLigneEdit(null)}/>}
        {showAjouterArrivage && <Modal title="Ajouter la commande à un arrivage" onClose={()=>setShowAjouterArrivage(false)} footer={<><button className="btn doux" onClick={()=>setShowAjouterArrivage(false)}>Annuler</button><button className="btn" onClick={ajouterArrivage}>Ajouter</button></>}><div className="corps"><div className="champ large"><label>Arrivage</label><select value={arrivageChoisi} onChange={e=>setArrivageChoisi(e.target.value)}><option value="">—</option>{arrivagesDisponibles.map(a=><option key={a.code} value={a.code}>{a.code} · {a.nomInterne || a.statut || '—'}</option>)}</select></div></div></Modal>}

      </div>
    </div>
  );
};

export default FicheCommande;
