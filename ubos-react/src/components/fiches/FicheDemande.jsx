import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import KVDisplay from '../common/KVDisplay';
import DataTable from '../common/DataTable';
import Pill from '../common/Pill';

const FicheDemande = ({ codeProp, code: codeFromProp }) => {
  const { db } = useDB();
  const initialCode = codeProp || codeFromProp || '';
  const [code, setCode] = useState(initialCode);

  useEffect(() => {
    const c = codeProp || codeFromProp;
    if (c) {
      setCode(c);
    } else {
      const hash = window.location.hash;
      if (hash.startsWith('#ficheDemande:')) {
        setCode(hash.split(':')[1]);
      }
    }
  }, [codeProp, codeFromProp, window.location.hash]);

  const demande = (db?.demandes || []).find(d => d.code === code);
  
  if (!demande) {
    return (
      <div>
        <Topbar titre="Fiche Demande" />
        <div className="panneau">
          <div className="vide"><b>Demande introuvable</b> {code ? `(${code})` : ''} n'existe pas.</div>
        </div>
      </div>
    );
  }

  const client = db.clients?.find(c => c.code === demande.client) || {};

  const mainFields = [
    {k: 'client', l: 'Client', render: () => <a href={`#ficheClient:${demande.client}`}>{client.nom || demande.client}</a>},
    {k: 'date', l: 'Date', render: (d) => d ? new Date(d).toLocaleDateString() : ''},
    {k: 'responsable', l: 'Responsable'},
    {k: 'source', l: 'Source'},
    {k: 'budget', l: 'Budget'},
    {k: 'urgence', l: 'Urgence'},
    {k: 'statut', l: 'Statut', render: (s) => <Pill type={s} texte={s} />},
    {k: 'remarques', l: 'Remarques'}
  ];

  return (
    <div>
      <Topbar titre={`Demande : ${code}`} />
      <div className="panneau">
        
        <div className="outils">
          <b style={{fontSize:'16px', color:'var(--vert)'}}>{code}</b>
          <span style={{flex:1}}></span>
          <button className="btn">Modifier</button>
        </div>

        <div className="bloc-fiche large">
          <h4>Informations Principales</h4>
          <KVDisplay data={demande} fields={mainFields} />
        </div>

        <div className="bloc-fiche large" style={{background:'var(--fond-jaune)'}}>
          <h4>Action suivante</h4>
          <p>{demande.actionSuivante || 'Aucune action définie'}</p>
        </div>

        <div className="bloc-fiche large">
          <h4>Lignes de la demande <button className="btn mini" style={{float:'right'}}>+ Ajouter Ligne</button></h4>
          <DataTable 
            columns={[
              {key: 'idLigne', label: 'ID'},
              {key: 'produit', label: 'Produit/Service'},
              {key: 'route', label: 'Route'},
              {key: 'statut', label: 'Statut'},
              {key: 'actions', label: 'Actions', render: () => (
                <>
                  <button className="btn mini">Éditer</button>
                  <button className="btn mini rouge">Supprimer</button>
                </>
              )}
            ]}
            data={demande.lignes || []}
          />
        </div>

        <div className="bloc-fiche large">
          <h4>Documents liés <button className="btn mini" style={{float:'right'}}>+ Lier Document</button></h4>
          <DataTable 
            columns={[
              {key: 'code', label: 'Code', render: (val) => <a href={`#ficheDocument:${val}`}>{val}</a>},
              {key: 'nom', label: 'Nom'},
              {key: 'categorie', label: 'Catégorie'}
            ]}
            data={db.documents?.filter(d => d.demande === code) || []}
          />
        </div>

      </div>
    </div>
  );
};

export default FicheDemande;
