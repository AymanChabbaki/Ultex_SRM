import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import KVDisplay from '../common/KVDisplay';
import DataTable from '../common/DataTable';
import Modal from '../common/Modal';
import LigneModal from '../common/LigneModal';
import ModuleForm from '../modules/ModuleForm';
import { MODS } from '../../data/modules';

const FRAIS_CHAMPS = [
  {k: 'typeFrais', l: 'Type de frais', t: 'select', opts: ['Transit portuaire', 'Magasinage', 'Manutention', 'Douane / Liquidation', 'Transport', 'Assurance', 'Documentation', 'Autre'], req: 1},
  {k: 'montant', l: 'Montant (MAD)', t: 'number', req: 1},
  {k: 'fournisseur', l: 'Prestataire', t: 'ref', coll: 'partenaires', cle: 'nom'},
  {k: 'repartition', l: 'Répartition (dossiers)', t: 'text'}
];

const FicheArrivage = ({ codeProp, code: codeFromProp }) => {
  const { db, updateDB, audit } = useDB();
  const { peut } = useAuth();
  const { toast } = useToast();
  const initialCode = codeProp || codeFromProp || '';
  const [code, setCode] = useState(initialCode);
  const [showEdit, setShowEdit] = useState(false);
  const [showAjouterDossier, setShowAjouterDossier] = useState(false);
  const [dossierChoisi, setDossierChoisi] = useState('');
  const [showAjouterFrais, setShowAjouterFrais] = useState(false);
  const [showLierDocument, setShowLierDocument] = useState(false);

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
  const dossiersDisponibles = db.dossiers?.filter(d => !arrivage.dossiers?.includes(d.code)) || [];
  const documents = db.documents?.filter(d => d.arrivage === code) || [];

  const sauverArrivage = (patch, message) => {
    const nextArrivage = { ...arrivage, ...patch };
    const nextDb = { ...db, arrivages: (db.arrivages || []).map(a => a.code === code ? nextArrivage : a) };
    updateDB(nextDb);
    if (message) toast(message);
  };

  const handleAjouterDossier = () => {
    if (!dossierChoisi) { toast('Sélectionnez un dossier.'); return; }
    const avant = arrivage.dossiers || [];
    sauverArrivage({ dossiers: [...avant, dossierChoisi] }, `Dossier ${dossierChoisi} ajouté au groupage.`);
    audit('Arrivages', 'Dossier ajouté au groupage', code, 'dossiers', avant.join(','), [...avant, dossierChoisi].join(','));
    setShowAjouterDossier(false);
    setDossierChoisi('');
  };

  const handleRetirerDossier = (dCode) => {
    if (!window.confirm(`Retirer ${dCode} du groupage de cet arrivage ?`)) return;
    const avant = arrivage.dossiers || [];
    const apres = avant.filter(c => c !== dCode);
    sauverArrivage({ dossiers: apres }, `Dossier ${dCode} retiré du groupage.`);
    audit('Arrivages', 'Dossier retiré du groupage', code, 'dossiers', avant.join(','), apres.join(','));
  };

  const handleAjouterFrais = (ligne) => {
    const frais = [...(arrivage.frais || []), ligne];
    sauverArrivage({ frais }, 'Frais ajouté.');
    audit('Arrivages', 'Frais ajouté', code, 'frais', '—', `${ligne.typeFrais} : ${ligne.montant} MAD`);
    setShowAjouterFrais(false);
  };

  return (
    <div>
      <Topbar titre={`Arrivage : ${code}`} />
      <div className="panneau">

        <div className="outils">
          <b className="titre-fiche">{code}</b>
          <span className="spacer"></span>
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
          <h4>
            Dossiers de l'arrivage (Groupage)
            {peut('modifier') && (
              <button className="btn mini vert" style={{float:'right'}} onClick={() => setShowAjouterDossier(true)}>+ Ajouter Dossier</button>
            )}
          </h4>
          <DataTable
            columns={[
              {key: 'code', label: 'Code Dossier', render: (val) => <a href={`#ficheDossier:${val}`}>{val}</a>},
              {key: 'client', label: 'Client'},
              {key: 'produit', label: 'Produit'},
              {key: 'actions', label: 'Actions', render: (val, row) => (
                <button className="btn mini rouge" onClick={() => handleRetirerDossier(row.code)}>Retirer</button>
              )}
            ]}
            data={dossiers}
          />
        </div>

        {showAjouterDossier && (
          <Modal
            title="Ajouter un dossier au groupage"
            onClose={() => setShowAjouterDossier(false)}
            footer={
              <>
                <button className="btn doux" onClick={() => setShowAjouterDossier(false)}>Annuler</button>
                <button className="btn" onClick={handleAjouterDossier}>Ajouter</button>
              </>
            }
          >
            <div className="corps">
              <div className="champ large">
                <label>Dossier</label>
                <select value={dossierChoisi} onChange={e => setDossierChoisi(e.target.value)}>
                  <option value="">—</option>
                  {dossiersDisponibles.map(d => (
                    <option key={d.code} value={d.code}>{d.code} · {d.produit || '—'}</option>
                  ))}
                </select>
              </div>
            </div>
          </Modal>
        )}

        <div className="bloc-fiche large">
          <h4>
            Frais de l'arrivage
            {peut('modifier') && (
              <button className="btn mini" style={{float:'right'}} onClick={() => setShowAjouterFrais(true)}>+ Ajouter Frais</button>
            )}
          </h4>
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

        {showAjouterFrais && (
          <LigneModal
            title="Ajouter un frais"
            champs={FRAIS_CHAMPS}
            onSave={handleAjouterFrais}
            onClose={() => setShowAjouterFrais(false)}
          />
        )}

        <div className="bloc-fiche large">
          <h4>
            Documents liés
            {peut('ajouter') && (
              <button className="btn mini" style={{float:'right'}} onClick={() => setShowLierDocument(true)}>+ Lier Document</button>
            )}
          </h4>
          <DataTable
            columns={[
              {key: 'code', label: 'Code', render: (val) => <a href={`#ficheDocument:${val}`}>{val}</a>},
              {key: 'nom', label: 'Nom'},
              {key: 'categorie', label: 'Catégorie'}
            ]}
            data={documents}
          />
        </div>

        {showLierDocument && (
          <ModuleForm
            moduleId="documents"
            MODS={MODS}
            initialData={{ arrivage: code }}
            onClose={() => setShowLierDocument(false)}
          />
        )}

      </div>
    </div>
  );
};

export default FicheArrivage;
