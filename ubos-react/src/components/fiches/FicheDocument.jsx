import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import KVDisplay from '../common/KVDisplay';
import DataTable from '../common/DataTable';
import Pill from '../common/Pill';

const FicheDocument = ({ codeProp }) => {
  const { db } = useDB();
  const [code, setCode] = useState(codeProp || '');

  useEffect(() => {
    if (codeProp) return;
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#ficheDocument:')) {
        setCode(hash.split(':')[1]);
      }
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [codeProp]);

  const document = db?.documents?.find(d => d.code === code);
  
  if (!document) {
    return (
      <div>
        <Topbar titre="Fiche Document" />
        <div className="panneau">
          <div className="vide"><b>Document introuvable</b> {code} n'existe pas.</div>
        </div>
      </div>
    );
  }

  const mainFields = [
    {k: 'nom', l: 'Nom du fichier'},
    {k: 'categorie', l: 'Catégorie'},
    {k: 'dossier', l: 'Dossier lié', render: (val) => val ? <a href={`#ficheDossier:${val}`}>{val}</a> : '—'},
    {k: 'type', l: 'Format'},
    {k: 'url', l: 'URL / Lien'},
    {k: 'statut', l: 'Statut', render: (s) => <Pill type={s} texte={s} />},
    {k: 'confidentialite', l: 'Confidentialité'}
  ];

  return (
    <div>
      <Topbar titre={`Document : ${code}`} />
      <div className="panneau">
        
        <div className="outils">
          <b style={{fontSize:'16px', color:'var(--vert)'}}>{code}</b>
          <span style={{flex:1}}></span>
          <button className="btn">Modifier</button>
          <a href={document.url || '#'} target="_blank" rel="noreferrer" className="btn bleu">Aperçu / Télécharger</a>
        </div>

        <div className="bloc-fiche large">
          <h4>Informations du Document</h4>
          <KVDisplay data={document} fields={mainFields} />
        </div>

        <div className="bloc-fiche large">
          <h4>Historique des versions <button className="btn mini" style={{float:'right'}}>+ Nouvelle Version</button></h4>
          <DataTable 
            columns={[
              {key: 'version', label: 'Version'},
              {key: 'date', label: 'Date', render: (d) => d ? new Date(d).toLocaleDateString() : ''},
              {key: 'auteur', label: 'Auteur'},
              {key: 'url', label: 'Lien', render: (val) => <a href={val} target="_blank" rel="noreferrer">Ouvrir</a>}
            ]}
            data={document.versions || []}
          />
        </div>

      </div>
    </div>
  );
};

export default FicheDocument;
