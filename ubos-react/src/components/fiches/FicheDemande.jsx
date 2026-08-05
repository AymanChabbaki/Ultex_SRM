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
import { pillStatut } from '../../utils/format';
import { migrerLignesDemande, calculerIndicateursDemande, verifierMinimumCalcul } from '../../utils/demandes';
import { STATUTS_LIGNE_DEMANDE } from '../../data/constants';

const FicheDemande = ({ codeProp, code: codeFromProp }) => {
  const { db, updateDB, genCode, audit, notifier } = useDB();
  const { peut } = useAuth();
  const { toast } = useToast();
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

  const handleEnvoyerCalcul = (ligne) => {
    const verif = verifierMinimumCalcul(ligne);
    const nextLignes = (db.demandeLignes || []).map(l => l.code === ligne.code ? { ...l, statut: 'En calcul' } : l);
    const tacheCode = genCode('T');
    const tache = {
      code: tacheCode, titre: `Chiffrage — ${ligne.nomProduit || ligne.code}`, dossier: '', assigne: 'Études & Chiffrage',
      echeance: '', priorite: 'Normale', origine: 'Tâche courante', statut: 'À faire',
      remarque: `Ligne ${ligne.code} de la demande ${code}.${verif.ok ? '' : ' Sous réserve — manquant : ' + verif.manquants.join(', ') + '.'}`,
      ts: Date.now()
    };
    const routage = { code: genCode('RT'), ligne: ligne.code, demande: code, service: 'Études & Chiffrage', statut: verif.ok ? 'Envoyée' : 'Envoyée sous réserve', dateEnvoi: Date.now() };
    updateDB({ ...db, demandeLignes: nextLignes, taches: [tache, ...(db.taches || [])], demandeRoutages: [routage, ...(db.demandeRoutages || [])] });
    audit('Demandes', 'Envoi au Calcul', ligne.code, 'statut', ligne.statut, 'En calcul', code);
    notifier('Études & Chiffrage', verif.ok
      ? `Nouvelle ligne à chiffrer : ${ligne.nomProduit || ligne.code} (${ligne.code}).`
      : `Ligne à chiffrer envoyée sous réserve : ${ligne.nomProduit || ligne.code} (${ligne.code}). Manquant : ${verif.manquants.join(', ')}.`, 'Demandes');
    toast(verif.ok ? 'Ligne envoyée au Calcul.' : `Ligne envoyée au Calcul sous réserve — informations manquantes : ${verif.manquants.join(', ')}.`);
  };

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
                { key: 'quantite', label: 'Quantité', render: (v, o) => v ? `${v} ${o.unite || ''}` : '—' },
                { key: 'prixUnitaire', label: 'Prix', render: (v, o) => v ? `${v} ${o.devise || ''}` : '—' },
                { key: 'fournisseur', label: 'Fournisseur', render: (v, o) => v ? v : (o.statutFournisseur || '—') },
                { key: 'poidsBrutTotal', label: 'Poids (kg)' },
                { key: 'cbmTotal', label: 'CBM' },
                { key: 'statut', label: 'Statut', render: (s) => pillStatut(s) },
                {
                  key: 'actions', label: 'Actions', render: (v, row) => (
                    <>
                      <a className="btn mini doux" href={`#ficheDemandeLigne:${row.code}`}>Ouvrir</a>
                      {peut('modifier') && <button className="btn mini or" onClick={() => handleEnvoyerCalcul(row)}>Envoyer au Calcul</button>}
                    </>
                  )
                }
              ]}
              data={lignes}
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
