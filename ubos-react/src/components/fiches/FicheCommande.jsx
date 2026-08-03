import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import KVDisplay from '../common/KVDisplay';
import DataTable from '../common/DataTable';
import Pill from '../common/Pill';

const FicheCommande = ({ codeProp }) => {
  const { db } = useDB();
  const [code, setCode] = useState(codeProp || '');

  useEffect(() => {
    if (codeProp) return;
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#ficheCommande:')) {
        setCode(hash.split(':')[1]);
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [codeProp]);

  const commande = db?.commandes?.find(c => c.code === code);
  
  if (!commande) {
    return (
      <div>
        <Topbar titre="Fiche Commande" />
        <div className="panneau">
          <div className="vide"><b>Commande introuvable</b> {code} n'existe pas.</div>
        </div>
      </div>
    );
  }

  const client = db.clients?.find(c => c.code === commande.client) || {};

  const mainFields = [
    {k: 'client', l: 'Client', render: () => <a href={`#ficheClient:${commande.client}`}>{client.nom || commande.client}</a>},
    {k: 'demande', l: 'Demande', render: () => <a href={`#ficheDemande:${commande.demande}`}>{commande.demande}</a>},
    {k: 'condition', l: 'Condition'},
    {k: 'formule', l: 'Formule'},
    {k: 'devis', l: 'Devis'},
    {k: 'statut', l: 'Statut', render: (s) => <Pill type={s} texte={s} />}
  ];

  const dossiers = db.dossiers?.filter(d => d.commande === code) || [];

  return (
    <div>
      <Topbar titre={`Commande : ${code}`} />
      <div className="panneau">
        
        <div className="outils">
          <b style={{fontSize:'16px', color:'var(--vert)'}}>{code}</b>
          <span style={{flex:1}}></span>
          <button className="btn">Modifier</button>
        </div>

        <div className="bloc-fiche large">
          <h4>Informations Principales</h4>
          <KVDisplay data={commande} fields={mainFields} />
        </div>

        <div className="bloc-fiche large">
          <h4>Dossiers Liés <button className="btn mini vert" style={{float:'right'}}>+ Créer Dossier depuis Commande</button></h4>
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
