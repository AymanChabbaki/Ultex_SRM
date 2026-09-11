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
  const [showAjouterCommande, setShowAjouterCommande] = useState(false);
  const [commandeChoisie, setCommandeChoisie] = useState('');
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

  const commandes = db.commandes?.filter(c => arrivage.commandes?.includes(c.code)) || [];
  const commandesDisponibles = db.commandes?.filter(c => !arrivage.commandes?.includes(c.code) && c.statut !== 'Annulée') || [];
  const documents = db.documents?.filter(d => d.arrivage === code) || [];

  const sauverArrivage = (patch, message) => {
    const nextArrivage = { ...arrivage, ...patch };
    const nextDb = { ...db, arrivages: (db.arrivages || []).map(a => a.code === code ? nextArrivage : a) };
    updateDB(nextDb);
    if (message) toast(message);
  };

  const handleAjouterCommande = () => {
    if (!commandeChoisie) { toast('Sélectionnez une commande.'); return; }
    const avant = arrivage.commandes || [];
    updateDB({
      ...db,
      arrivages: (db.arrivages || []).map(a => a.code === code ? { ...a, commandes: [...avant, commandeChoisie] } : a),
      commandes: (db.commandes || []).map(c => c.code === commandeChoisie ? { ...c, statut: 'En arrivage' } : c)
    });
    audit('Arrivages', 'Commande ajoutée', code, 'commandes', avant.join(','), [...avant, commandeChoisie].join(','));
    setShowAjouterCommande(false);
    setCommandeChoisie('');
  };

  const handleRetirerCommande = (commandeCode) => {
    if (!window.confirm(`Retirer ${commandeCode} de cet arrivage ?`)) return;
    const avant = arrivage.commandes || [];
    const apres = avant.filter(c => c !== commandeCode);
    updateDB({
      ...db,
      arrivages: (db.arrivages || []).map(a => a.code === code ? { ...a, commandes: apres } : a),
      commandes: (db.commandes || []).map(c => c.code === commandeCode ? { ...c, statut: 'En traitement' } : c)
    });
    audit('Arrivages', 'Commande retirée', code, 'commandes', avant.join(','), apres.join(','));
    toast(`Commande ${commandeCode} retirée de l'arrivage.`);
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
            Commandes de l'arrivage
            {peut('modifier') && (
              <button className="btn mini vert" style={{float:'right'}} onClick={() => setShowAjouterCommande(true)}>+ Ajouter Commande</button>
            )}
          </h4>
          <DataTable
            columns={[
              {key: 'referenceMetier', label: 'Commande', render: (val,row) => <a href={`#ficheCommande:${row.code}`}>{val || row.code}</a>},
              {key: 'client', label: 'Client', render: v => { const c=(db.clients||[]).find(x=>x.code===v); return c?.nom || v || '—'; }},
              {key: 'lignes', label: 'Produits', render: lignes => (lignes||[]).map(l=>l.nomProduit).filter(Boolean).join(', ') || '—'},
              {key: 'lignes', label: 'Quantités', render: lignes => (lignes||[]).map(l=>`${l.quantite||0} ${l.unite||''}`).join(', ') || '—'},
              {key: 'lignes', label: 'Poids / volume', render: lignes => { const poids=(lignes||[]).reduce((s,l)=>s+(+l.poidsBrutTotal||0),0); const cbm=(lignes||[]).reduce((s,l)=>s+(+l.cbmTotal||0),0); return `${poids} kg · ${cbm} CBM`; }},
              {key: 'lignes', label: 'Fournisseurs', render: lignes => [...new Set((lignes||[]).map(l=>{const f=(db.fournisseurs||[]).find(x=>x.code===l.fournisseur);return f?.nom||l.fournisseur;}).filter(Boolean))].join(', ') || '—'},
              {key: 'code', label: 'Documents', render: commandeCode => (db.documents||[]).filter(d=>d.commande===commandeCode).length},
              {key: 'code', label: 'Paiements', render: commandeCode => (db.paiements||[]).filter(p=>p.commande===commandeCode).length},
              {key: 'lignes', label: 'Certifications', render: lignes => [...new Set((lignes||[]).map(l=>l.organismesConcernes).filter(Boolean))].join(', ') || '—'},
              {key: 'actions', label: 'Actions', render: (val, row) => (
                <button className="btn mini rouge" onClick={() => handleRetirerCommande(row.code)}>Retirer</button>
              )}
            ]}
            data={commandes}
          />
        </div>

        {showAjouterCommande && (
          <Modal
            title="Ajouter une commande à l'arrivage"
            onClose={() => setShowAjouterCommande(false)}
            footer={
              <>
                <button className="btn doux" onClick={() => setShowAjouterCommande(false)}>Annuler</button>
                <button className="btn" onClick={handleAjouterCommande}>Ajouter</button>
              </>
            }
          >
            <div className="corps">
              <div className="champ large">
                <label>Commande</label>
                <select value={commandeChoisie} onChange={e => setCommandeChoisie(e.target.value)}>
                  <option value="">—</option>
                  {commandesDisponibles.map(c => (
                    <option key={c.code} value={c.code}>{c.referenceMetier || c.code} · {(db.clients||[]).find(x=>x.code===c.client)?.nom || c.client || '—'}</option>
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
              {key: 'repartition', label: 'Répartition (Commandes)'}
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
