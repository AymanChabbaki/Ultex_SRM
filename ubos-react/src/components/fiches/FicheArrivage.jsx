import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import KVDisplay from '../common/KVDisplay';
import DataTable from '../common/DataTable';
import ModuleForm from '../modules/ModuleForm';
import { MODS } from '../../data/modules';

const FicheArrivage = ({ codeProp, code: codeFromProp }) => {
  const { db } = useDB();
  const initialCode = codeProp || codeFromProp || '';
  const [code, setCode] = useState(initialCode);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    const c = codeProp || codeFromProp;
    if (c) {
      setCode(c);
    } else {
      const hash = window.location.hash;
      if (hash.startsWith('#ficheArrivage:')) {
        setCode(hash.split(':')[1]);
      }
    }
  }, [codeProp, codeFromProp, window.location.hash]);

  const arrivage = (db?.arrivages || []).find(a => a.code === code);
  
  if (!arrivage) {
    return (
      <div>
        <Topbar titre="Fiche Arrivage" />
        <div className="panneau">
          <div className="vide"><b>Arrivage introuvable</b> {code ? `(${code})` : ''} n'existe pas.</div>
        </div>
      </div>
    );
  }

  const mainFields = [
    {k: 'transporteur', l: 'Transporteur'},
    {k: 'moyenTransport', l: 'Moyen de Transport'},
    {k: 'numVoyage', l: 'N° Voyage / Vol / Immatriculation'},
    {k: 'dateDepartPrev', l: 'Départ Prévu'},
    {k: 'dateArriveePrev', l: 'Arrivée Prévue'},
    {k: 'portDepart', l: 'Port de Départ'},
    {k: 'portArrivee', l: 'Port d\'Arrivée'},
    {k: 'statut', l: 'Statut Logistique'}
  ];

  const dossiers = db.dossiers?.filter(d => arrivage.dossiers?.includes(d.code)) || [];
  const documents = db.documents?.filter(d => d.arrivage === code) || [];

  return (
    <div>
      <Topbar titre={`Arrivage : ${code}`} />
      <div className="panneau">
        
        <div className="outils">
          <b style={{fontSize:'16px', color:'var(--vert)'}}>{code}</b>
          <span style={{flex:1}}></span>
          <button className="btn" onClick={() => setShowEdit(true)}>Modifier</button>
        </div>
        {showEdit && (
          <ModuleForm 
            moduleId="arrivages" 
            MODS={MODS}
            recordCode={code} 
            onClose={() => setShowEdit(false)} 
          />
        )}

        <div className="bloc-fiche large">
          <h4>Détails Logistiques</h4>
          <KVDisplay data={arrivage} fields={mainFields} />
        </div>

        <div className="bloc-fiche large" style={{background:'var(--fond-jaune)'}}>
          <h4>Action suivante</h4>
          <p>{arrivage.actionSuivante || 'Aucune action définie'}</p>
        </div>

        <div className="bloc-fiche large">
          <h4>Dossiers de l'arrivage (Groupage) <button className="btn mini vert" style={{float:'right'}}>+ Ajouter Dossier</button></h4>
          <DataTable 
            columns={[
              {key: 'code', label: 'Code Dossier', render: (val) => <a href={`#ficheDossier:${val}`}>{val}</a>},
              {key: 'client', label: 'Client'},
              {key: 'produit', label: 'Produit'},
              {key: 'actions', label: 'Actions', render: () => <button className="btn mini rouge">Retirer</button>}
            ]}
            data={dossiers}
          />
        </div>

        <div className="bloc-fiche large">
          <h4>Frais de l'arrivage <button className="btn mini" style={{float:'right'}}>+ Ajouter Frais</button></h4>
          <DataTable 
            columns={[
              {key: 'typeFrais', label: 'Type de frais'},
              {key: 'montant', label: 'Montant (MAD)'},
              {key: 'fournisseur', label: 'Prestataire'},
              {key: 'repartition', label: 'Répartition (Dossiers)'}
            ]}
            data={arrivage.frais || []}
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
            data={documents}
          />
        </div>

      </div>
    </div>
  );
};

export default FicheArrivage;
