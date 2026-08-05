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
import * as Actions from '../../utils/businessActions';

const FicheCommande = ({ codeProp, code: codeFromProp }) => {
  const { db, updateDB, genCode, audit, userCourant } = useDB();
  const { peut } = useAuth();
  const { toast } = useToast();
  const initialCode = codeProp || codeFromProp || '';
  const [code, setCode] = useState(initialCode);
  const [showEdit, setShowEdit] = useState(false);

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
    {k: 'devisAccepte', l: 'Devis'},
    {k: 'statut', l: 'Statut', render: (s) => <Pill type={s} texte={s} />}
  ];

  const dossiers = db.dossiers?.filter(d => d.commande === code) || [];

  return (
    <div>
      <Topbar titre={`Commande : ${code}`} />
      <div className="panneau">
        
        <div className="outils">
          <b className="titre-fiche">{code}</b>
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
          <h4>Dossiers Liés <button className="btn mini vert" style={{float:'right'}} onClick={() => {
              Actions.creerDossierDepuisCommande(code, db, genCode, audit, userCourant, updateDB, toast, peut('ajouter'));
          }}>+ Créer Dossier depuis Commande</button></h4>
          <DataTable 
            columns={[
              {key: 'code', label: 'Code', render: (val) => <a href={`#ficheDossier:${val}`}>{val}</a>},
              {key: 'produit', label: 'Produit'},
              {key: 'etape', label: 'Étape', render: (s) => <Pill type={s} texte={s} />}
            ]}
            data={dossiers}
          />
        </div>

      </div>
    </div>
  );
};

export default FicheCommande;
