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
import { pillStatut } from '../../utils/format';

const LIGNE_CHAMPS = [
  {k: 'produitService', l: 'Produit / Service', t: 'text', req: 1, large: 1},
  {k: 'statut', l: 'Statut de la ligne', t: 'select', opts: ['Nouvelle', 'En consultation', 'Confirmée', 'Annulée']},
  {k: 'fournisseurConnu', l: 'Fournisseur connu', t: 'select', opts: ['Oui', 'Non']},
  {k: 'proformaDisponible', l: 'Proforma disponible', t: 'select', opts: ['Oui', 'Non']},
  {k: 'statutConfirmation', l: 'Confirmation client', t: 'select', opts: ['Non confirmée', 'Confirmée']}
];

const FicheDemande = ({ codeProp, code: codeFromProp }) => {
  const { db, updateDB, genCode, audit } = useDB();
  const { peut } = useAuth();
  const { toast } = useToast();
  const initialCode = codeProp || codeFromProp || '';
  const [code, setCode] = useState(initialCode);
  const [showEdit, setShowEdit] = useState(false);
  const [ligneEnCours, setLigneEnCours] = useState(null);
  const [showLierDocument, setShowLierDocument] = useState(false);

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
    {k: 'client', l: 'Client', render: () => demande.client ? <a href={`#ficheClient:${demande.client}`}>{client.nom || demande.client}</a> : '—'},
    {k: 'date', l: 'Date', render: (d) => d ? new Date(d).toLocaleDateString() : ''},
    {k: 'responsable', l: 'Responsable'},
    {k: 'source', l: 'Source'},
    {k: 'budget', l: 'Budget'},
    {k: 'urgence', l: 'Urgence'},
    {k: 'statut', l: 'Statut', render: (s) => <Pill type={s} texte={s} />},
    {k: 'remarques', l: 'Remarques'}
  ];

  const sauverDemande = (lignes, message) => {
    const nextDemande = { ...demande, lignes };
    updateDB({ ...db, demandes: (db.demandes || []).map(x => x.code === code ? nextDemande : x) });
    if (message) toast(message);
  };

  const handleSaveLigne = (data) => {
    const isEdit = !!ligneEnCours?.code;
    let lignes;
    if (isEdit) {
      lignes = (demande.lignes || []).map(l => l.code === ligneEnCours.code ? { ...l, ...data } : l);
    } else {
      const ligneCode = genCode('DL');
      lignes = [...(demande.lignes || []), { id: 'dl_' + ligneCode, code: ligneCode, ...data }];
    }
    sauverDemande(lignes, isEdit ? 'Ligne mise à jour.' : 'Ligne ajoutée.');
    audit('Demandes', isEdit ? 'Ligne modifiée' : 'Ligne ajoutée', code, 'lignes', '—', data.produitService);
    setLigneEnCours(null);
  };

  const handleSupprimerLigne = (ligneCode) => {
    if (!window.confirm(`Supprimer la ligne ${ligneCode} ?`)) return;
    const lignes = (demande.lignes || []).filter(l => l.code !== ligneCode);
    sauverDemande(lignes, 'Ligne supprimée.');
    audit('Demandes', 'Ligne supprimée', code, 'lignes', ligneCode, '—');
  };

  return (
    <div>
      <Topbar titre={`Demande : ${code}`} />
      <div className="panneau">

        <div className="outils">
          <b className="titre-fiche">{code}</b>
          <span className="spacer"></span>
          <button className="btn" onClick={() => setShowEdit(true)}>Modifier</button>
        </div>
        {showEdit && (
          <ModuleForm
            moduleId="demandes"
            MODS={MODS}
            recordCode={code}
            onClose={() => setShowEdit(false)}
          />
        )}

        <div className="bloc-fiche large">
          <h4>Informations Principales</h4>
          <KVDisplay data={demande} fields={mainFields} />
        </div>

        <div className="bloc-fiche large" style={{background:'var(--fond-jaune)'}}>
          <h4>Action suivante</h4>
          <p>{demande.actionSuivante || 'Aucune action définie'}</p>
        </div>

        <div className="bloc-fiche large">
          <h4>
            Lignes de la demande
            {peut('ajouter') && (
              <button className="btn mini" style={{float:'right'}} onClick={() => setLigneEnCours({})}>+ Ajouter Ligne</button>
            )}
          </h4>
          <DataTable
            columns={[
              {key: 'code', label: 'Code'},
              {key: 'produitService', label: 'Produit/Service'},
              {key: 'fournisseurConnu', label: 'Fournisseur connu'},
              {key: 'statut', label: 'Statut', render: (s) => pillStatut(s)},
              {key: 'actions', label: 'Actions', render: (v, row) => (
                <>
                  {peut('modifier') && <button className="btn mini" onClick={() => setLigneEnCours(row)}>Éditer</button>}
                  {peut('supprimer') && <button className="btn mini rouge" onClick={() => handleSupprimerLigne(row.code)}>Supprimer</button>}
                </>
              )}
            ]}
            data={demande.lignes || []}
          />
        </div>

        {ligneEnCours && (
          <LigneModal
            title={ligneEnCours.code ? `Modifier la ligne ${ligneEnCours.code}` : 'Ajouter une ligne'}
            champs={LIGNE_CHAMPS}
            initialData={ligneEnCours}
            onSave={handleSaveLigne}
            onClose={() => setLigneEnCours(null)}
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
            data={db.documents?.filter(d => d.demande === code) || []}
          />
        </div>

        {showLierDocument && (
          <ModuleForm
            moduleId="documents"
            MODS={MODS}
            initialData={{ demande: code }}
            onClose={() => setShowLierDocument(false)}
          />
        )}

      </div>
    </div>
  );
};

export default FicheDemande;
