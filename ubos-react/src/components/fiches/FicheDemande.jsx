import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import Topbar from '../layout/Topbar';
import KVDisplay from '../common/KVDisplay';
import DataTable from '../common/DataTable';
import Pill from '../common/Pill';
import ModuleForm from '../modules/ModuleForm';
import { MODS } from '../../data/modules';
import { pillStatut } from '../../utils/format';
import { migrerLignesDemande, calculerIndicateursDemande } from '../../utils/demandes';
import { STATUTS_LIGNE_DEMANDE } from '../../data/constants';

const FicheDemande = ({ codeProp, code: codeFromProp }) => {
  const { db, updateDB, genCode, audit } = useDB();
  const { peut } = useAuth();
  const initialCode = codeProp || codeFromProp || '';
  const [code, setCode] = useState(initialCode);
  const [showEdit, setShowEdit] = useState(false);
  const [showLierDocument, setShowLierDocument] = useState(false);
  const [onglet, setOnglet] = useState('lignes');

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
  const lignes = (db?.demandeLignes || []).filter(l => l.demande === code);

  useEffect(() => {
    if (!demande) return;
    const migrees = migrerLignesDemande(db, demande);
    if (migrees.length) {
      updateDB({ ...db, demandeLignes: [...(db.demandeLignes || []), ...migrees] });
      audit('Demandes', 'Migration des lignes (ancien format)', code, 'demandeLignes', '—', `${migrees.length} ligne(s) migrée(s)`, code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, demande?.code]);

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
    { k: 'client', l: 'Client', render: () => demande.client ? <a href={`#ficheClient:${demande.client}`}>{client.nom || demande.client}</a> : '—' },
    { k: 'codeClientUltex', l: 'Code client ULTEX' },
    { k: 'typeDemande', l: 'Type de demande (ULTEX)' },
    { k: 'sensOperation', l: "Sens de l'opération" },
    { k: 'dateDemande', l: 'Date', render: (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—' },
    { k: 'canalReception', l: 'Canal de réception' },
    { k: 'typeProjet', l: 'Type de projet' },
    { k: 'responsableData', l: 'Responsable Data' },
    { k: 'source', l: 'Source' },
    { k: 'budgetGlobalEstime', l: 'Budget global estimé', render: (v) => v ? `${v} MAD` : '—' },
    { k: 'villeDestination', l: 'Ville / destination' },
    { k: 'typeUsage', l: 'Importation pour' },
    { k: 'urgence', l: 'Urgence' },
    { k: 'statut', l: 'Statut', render: (s) => <Pill type={s} texte={s} /> },
    { k: 'remarqueGenerale', l: 'Remarques générales' }
  ];

  const ind = calculerIndicateursDemande(lignes);

  const historique = (db.audit || []).filter(a => a.objet === code || a.dossier === code)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const handleAjouterProduit = () => {
    const newCode = genCode('DL');
    const brouillon = { code: newCode, demande: code, statut: STATUTS_LIGNE_DEMANDE[0], ts: Date.now() };
    updateDB({ ...db, demandeLignes: [brouillon, ...(db.demandeLignes || [])] });
    audit('Demandes', 'Ajout produit', newCode, '—', '—', 'Nouvelle ligne', code);
    window.location.hash = `ficheDemandeLigne:${newCode}`;
  };

  const routagesDemande = (db.demandeRoutages || []).filter(r => r.demande === code).sort((a, b) => (b.dateEnvoi || 0) - (a.dateEnvoi || 0));
  const lignesParCode = Object.fromEntries(lignes.map(l => [l.code, l]));

  return (
    <div>
      <Topbar titre={`Demande : ${code}`} />
      <div className="panneau">

        <div className="outils">
          <b className="titre-fiche">{code}</b>
          <span className="spacer"></span>
          {peut('modifier') && <button className="btn" onClick={() => setShowEdit(true)}>Modifier</button>}
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

        <div className="bloc-fiche" style={{ background: 'var(--vert-pale)' }}>
          <h4>Client</h4>
          {demande.client ? (
            <p>
              <a href={`#ficheClient:${demande.client}`}><b>{client.nom || demande.client}</b></a><br/>
              {client.societe && <>{client.societe}<br/></>}
              {client.telephone && <>Tél. {client.telephone}<br/></>}
              {client.ville && <>{client.ville}</>}
            </p>
          ) : <p className="vide">Aucun client lié</p>}
        </div>

        <div className="bloc-fiche" style={{ background: 'var(--fond-jaune)' }}>
          <h4>Action suivante</h4>
          <p>{demande.actionSuivante || 'Aucune action définie'}</p>
        </div>

        <div className="stats">
          <div className="stat"><b>{ind.nbProduits}</b><small>Produits</small></div>
          <div className="stat"><b>{ind.aCompleter}</b><small>À compléter</small></div>
          <div className="stat"><b>{ind.enSourcing}</b><small>En sourcing</small></div>
          <div className="stat"><b>{ind.enCalcul}</b><small>En calcul</small></div>
          <div className="stat"><b>{ind.pretes}</b><small>Prêtes pour offre</small></div>
          <div className="stat"><b>{ind.confirmees}</b><small>Confirmées</small></div>
        </div>

        <div className="onglets">
          <button className={`onglet ${onglet === 'lignes' ? 'actif' : ''}`} onClick={() => setOnglet('lignes')}>Produits</button>
          <button className={`onglet ${onglet === 'routage' ? 'actif' : ''}`} onClick={() => setOnglet('routage')}>Routage</button>
          <button className={`onglet ${onglet === 'documents' ? 'actif' : ''}`} onClick={() => setOnglet('documents')}>Documents</button>
          <button className={`onglet ${onglet === 'historique' ? 'actif' : ''}`} onClick={() => setOnglet('historique')}>Historique</button>
        </div>

        {onglet === 'lignes' && (
          <div className="bloc-fiche large">
            <h4>
              Produits de la demande
              {peut('ajouter') && (
                <button className="btn mini" style={{ float: 'right' }} onClick={handleAjouterProduit}>+ Ajouter un produit</button>
              )}
            </h4>
            <DataTable
              columns={[
                { key: 'code', label: 'Ligne', render: (v) => <a href={`#ficheDemandeLigne:${v}`}>{v}</a> },
                { key: 'nomProduit', label: 'Produit' },
                { key: 'typeTraitement', label: 'Circuit', render: (v) => v ? <span className="pill p-bleu">{v}</span> : <span className="pill p-gris">À définir</span> },
                { key: 'quantite', label: 'Quantité', render: (v, o) => v ? `${v} ${o.unite || ''}` : '—' },
                { key: 'prixUnitaire', label: 'Prix', render: (v, o) => v ? `${v} ${o.devise || ''}` : '—' },
                { key: 'fournisseur', label: 'Fournisseur', render: (v, o) => v ? v : (o.statutFournisseur || '—') },
                { key: 'poidsBrutTotal', label: 'Poids (kg)' },
                { key: 'cbmTotal', label: 'CBM' },
                { key: 'statut', label: 'Statut', render: (s) => pillStatut(s) },
                { key: 'actions', label: 'Actions', render: (v, row) => <a className="btn mini doux" href={`#ficheDemandeLigne:${row.code}`}>Ouvrir</a> }
              ]}
              data={lignes}
            />
          </div>
        )}

        {onglet === 'routage' && (
          <div className="bloc-fiche large">
            <h4>Routage — toutes les lignes de la demande</h4>
            <DataTable
              columns={[
                { key: 'ligne', label: 'Ligne', render: (v) => <a href={`#ficheDemandeLigne:${v}`}>{v}</a> },
                { key: 'ligne', label: 'Produit', render: (v) => lignesParCode[v]?.nomProduit || '—' },
                { key: 'service', label: 'Service' },
                { key: 'responsable', label: 'Responsable' },
                { key: 'dateEnvoi', label: "Date d'envoi", render: (v) => v ? new Date(v).toLocaleDateString('fr-FR') : '—' },
                { key: 'echeance', label: 'Échéance' },
                { key: 'statut', label: 'Statut', render: (s) => pillStatut(s) }
              ]}
              data={routagesDemande}
            />
          </div>
        )}

        {onglet === 'documents' && (
          <div className="bloc-fiche large">
            <h4>
              Documents liés
              {peut('ajouter') && (
                <button className="btn mini" style={{ float: 'right' }} onClick={() => setShowLierDocument(true)}>+ Lier Document</button>
              )}
            </h4>
            <DataTable
              columns={[
                { key: 'code', label: 'Code', render: (val) => <a href={`#ficheDocument:${val}`}>{val}</a> },
                { key: 'nom', label: 'Nom' },
                { key: 'categorie', label: 'Catégorie' }
              ]}
              data={db.documents?.filter(d => d.demande === code) || []}
            />
          </div>
        )}

        {onglet === 'historique' && (
          <div className="bloc-fiche large">
            <h4>Historique</h4>
            <DataTable
              columns={[
                { key: 'date', label: 'Date', render: (v, o) => `${v} ${o.heure || ''}` },
                { key: 'utilisateur', label: 'Utilisateur' },
                { key: 'action', label: 'Action' },
                { key: 'objet', label: 'Objet' },
                { key: 'champ', label: 'Champ' },
                { key: 'avant', label: 'Avant' },
                { key: 'apres', label: 'Après' }
              ]}
              data={historique}
            />
          </div>
        )}

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
