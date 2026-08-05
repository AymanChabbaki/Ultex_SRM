import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import KVDisplay from '../common/KVDisplay';
import DataTable from '../common/DataTable';
import Pill from '../common/Pill';
import LigneModal from '../common/LigneModal';
import ModuleForm from '../modules/ModuleForm';
import { MODS } from '../../data/modules';

const VERSION_CHAMPS = [
  {k: 'version', l: 'Numéro de version', t: 'number', req: 1},
  {k: 'date', l: 'Date', t: 'date', req: 1},
  {k: 'auteur', l: 'Auteur', t: 'text', req: 1},
  {k: 'url', l: 'URL / Lien du fichier', t: 'text'}
];

const FicheDocument = ({ codeProp, code: codeFromProp }) => {
  const { db, updateDB, audit } = useDB();
  const { userCourant } = useAuth();
  const { toast } = useToast();
  const initialCode = codeProp || codeFromProp || '';
  const [code, setCode] = useState(initialCode);
  const [showEdit, setShowEdit] = useState(false);
  const [showNouvelleVersion, setShowNouvelleVersion] = useState(false);

  useEffect(() => {
    const c = codeProp || codeFromProp;
    if (c) {
      setCode(c);
    } else {
      const hash = window.location.hash;
      if (hash.startsWith('#ficheDocument:')) {
        setCode(hash.split(':')[1]);
      }
    }
  }, [codeProp, codeFromProp, window.location.hash]);

  const document = (db?.documents || []).find(d => d.code === code);
  
  if (!document) {
    return (
      <div>
        <Topbar titre="Fiche Document" />
        <div className="panneau">
          <div className="vide"><b>Document introuvable</b> {code ? `(${code})` : ''} n'existe pas.</div>
        </div>
      </div>
    );
  }

  const mainFields = [
    {k: 'nom', l: 'Nom du fichier'},
    {k: 'type', l: 'Catégorie'},
    {k: 'dossier', l: 'Dossier lié', render: (val) => val ? <a href={`#ficheDossier:${val}`}>{val}</a> : '—'},
    {k: 'typeFichier', l: 'Format'},
    {k: 'url', l: 'URL / Lien'},
    {k: 'statut', l: 'Statut', render: (s) => <Pill type={s} texte={s} />},
    {k: 'confidentialite', l: 'Confidentialité'}
  ];

  const handleAjouterVersion = (data) => {
    const versions = [...(document.versions || []), data];
    const nextDb = { ...db, documents: (db.documents || []).map(x => x.code === code ? { ...x, versions, version: data.version } : x) };
    updateDB(nextDb);
    audit('Documents', 'Nouvelle version', code, 'versions', '—', `v${data.version} par ${data.auteur}`);
    toast(`Version ${data.version} ajoutée.`);
    setShowNouvelleVersion(false);
  };

  return (
    <div>
      <Topbar titre={`Document : ${code}`} />
      <div className="panneau">
        
        <div className="outils">
          <b className="titre-fiche">{code}</b>
          <span className="spacer"></span>
          <button className="btn" onClick={() => setShowEdit(true)}>Modifier</button>
          {document.url ? (
            <a href={document.url} target="_blank" rel="noreferrer" className="btn bleu">Aperçu / Télécharger</a>
          ) : (
            <button className="btn bleu" disabled title="Aucun fichier ni lien attaché — cliquez sur « Modifier » pour en ajouter un">
              Aperçu / Télécharger
            </button>
          )}
        </div>
        {showEdit && (
          <ModuleForm 
            moduleId="documents" 
            MODS={MODS}
            recordCode={code} 
            onClose={() => setShowEdit(false)} 
          />
        )}

        <div className="bloc-fiche large">
          <h4>Informations du Document</h4>
          <KVDisplay data={document} fields={mainFields} />
        </div>

        <div className="bloc-fiche large">
          <h4>Aperçu</h4>
          <div style={{ padding: '14px' }}>
            {document.url && /\.(pdf|jpg|jpeg|png|webp|gif)(\?|$)/i.test(document.url) ? (
              /\.pdf(\?|$)/i.test(document.url) ? (
                <iframe 
                  src={document.url} 
                  title="Aperçu PDF"
                  style={{ width: '100%', height: '420px', border: '1px solid var(--bord)', borderRadius: '9px' }} 
                />
              ) : (
                <img 
                  src={document.url} 
                  alt="Aperçu du document" 
                  style={{ maxWidth: '100%', maxHeight: '420px', borderRadius: '9px' }} 
                />
              )
            ) : (
              <div className="vide">
                Aucun aperçu - ce document est enregistré comme référence (métadonnées) sans fichier ni lien attaché. Ajoutez une URL pour activer l'aperçu.
              </div>
            )}
          </div>
        </div>

        <div className="bloc-fiche large">
          <h4>Historique des versions <button className="btn mini" style={{float:'right'}} onClick={() => setShowNouvelleVersion(true)}>+ Nouvelle Version</button></h4>
          <DataTable
            columns={[
              {key: 'version', label: 'Version'},
              {key: 'date', label: 'Date', render: (d) => d ? new Date(d).toLocaleDateString() : ''},
              {key: 'auteur', label: 'Auteur'},
              {key: 'url', label: 'Lien', render: (val) => val ? <a href={val} target="_blank" rel="noreferrer">Ouvrir</a> : '—'}
            ]}
            data={document.versions || []}
          />
        </div>

        {showNouvelleVersion && (
          <LigneModal
            title="Ajouter une nouvelle version"
            champs={VERSION_CHAMPS}
            initialData={{ version: (document.versions?.length || 0) + 1, date: new Date().toISOString().slice(0, 10), auteur: userCourant }}
            onSave={handleAjouterVersion}
            onClose={() => setShowNouvelleVersion(false)}
          />
        )}

      </div>
    </div>
  );
};

export default FicheDocument;
