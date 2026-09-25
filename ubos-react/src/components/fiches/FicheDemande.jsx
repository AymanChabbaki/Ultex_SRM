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
import { migrerLignesDemande, calculerIndicateursDemande } from '../../utils/demandes';
import { STATUTS_LIGNE_DEMANDE } from '../../data/constants';
import LigneModal from '../common/LigneModal';
import { prochaineReferenceCommande, lignesCommandeDepuisDemande } from '../../utils/workflowArchitecture';
import { syncPaymentToWorkflow } from '../../services/api';
import { notificationsNouvelleCommande } from '../../utils/arrivageWorkflow';

const CONFIRMATION_COMMANDE = [
  { k: 'condition', l: 'Condition de confirmation', t: 'select', opts: ['Devis accepté','Bon de commande signé','Contrat signé','Acompte reçu','Preuve de paiement reçue','Validation exceptionnelle de la Direction'], req: 1 },
  { k: 'dateConfirmation', l: 'Date de confirmation', t: 'date', req: 1 },
  { k: 'formuleUltex', l: 'Package commercial', t: 'select', opts: ['Sourcing','Accompagnement','Importation clé en main','Transport uniquement','Transit uniquement'], req: 1 },
  { k: 'datePaiement', l: 'Date du paiement', t: 'date', req: 1 },
  { k: 'montantPaiement', l: 'Montant payé — MAD', t: 'number', req: 1 },
  { k: 'modePaiement', l: 'Mode de paiement', t: 'select', opts: ['Virement','Espèces','Chèque','Effet','Carte','Autre'], req: 1 },
  { k: 'statutPaiement', l: 'Statut du paiement', t: 'select', opts: ['À vérifier','Confirmé'], req: 1 },
  { k: 'referencePaiement', l: 'Référence', t: 'text' },
  { k: 'observationPaiement', l: 'Détails / observation', t: 'textarea', large: 1 },
  { k: 'pieceJointePaiement', l: 'Facture / justificatif', t: 'file' },
];

const FicheDemande = ({ codeProp, code: codeFromProp }) => {
  const { db, updateDB, genCode, audit, notifier, userCourant } = useDB();
  const { peut } = useAuth();
  const { toast } = useToast();
  const initialCode = codeProp || codeFromProp || '';
  const [code, setCode] = useState(initialCode);
  const [showEdit, setShowEdit] = useState(false);
  const [showLierDocument, setShowLierDocument] = useState(false);
  const [onglet, setOnglet] = useState('lignes');
  const [showConversion, setShowConversion] = useState(false);

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
    { k: 'etapeUltex', l: 'Étape Workflow' },
    { k: 'tagsPipeline', l: 'Tags Workflow' },
    { k: 'modeTransport', l: 'Mode de transport' },
    { k: 'montantVente', l: 'Dernier devis validé', render: v => v != null ? `${Number(v).toLocaleString('fr-FR')} MAD` : '—' },
    { k: 'montantAchat', l: 'Coût marchandise validé', render: v => v != null ? `${Number(v).toLocaleString('fr-FR')} MAD` : '—' },
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
    const clientCode = demande.client || 'SANS-CLIENT';
    const n = (db.demandeLignes || []).filter(l => String(l.referenceMetier || '').endsWith(`-${clientCode}`)).length + 1;
    const brouillon = { code: newCode, referenceMetier: `P${n}-${clientCode}`, demande: code, statut: STATUTS_LIGNE_DEMANDE[0], ts: Date.now() };
    updateDB({ ...db, demandeLignes: [brouillon, ...(db.demandeLignes || [])] });
    audit('Demandes', 'Ajout produit', newCode, '—', '—', 'Nouvelle ligne', code);
    window.location.hash = `ficheDemandeLigne:${newCode}`;
  };

  const handleSupprimerProduit = (ligne) => {
    const libelle = ligne.nomProduit || ligne.referenceMetier || ligne.code;
    const routagesLies = (db.demandeRoutages || []).filter(r => r.ligne === ligne.code).length;
    const precision = routagesLies > 0 ? `\n${routagesLies} routage(s) lié(s) seront également supprimé(s).` : '';
    if (!window.confirm(`Supprimer le produit « ${libelle} » de cette demande ?${precision}`)) return;

    updateDB({
      ...db,
      demandeLignes: (db.demandeLignes || []).filter(l => l.code !== ligne.code),
      demandeRoutages: (db.demandeRoutages || []).filter(r => r.ligne !== ligne.code),
    });
    audit('Demandes', 'Suppression produit', ligne.code, 'demandeLignes', libelle, 'Supprimé', code);
    toast(`Produit ${libelle} supprimé de la demande.`);
  };

  const commandesExistantes = (db.commandes || []).filter(c => (c.source_demande_id || c.demande) === code);

  const handleConvertirCommande = async (confirmation) => {
    if (!confirmation.condition || confirmation.statutPaiement !== 'Confirmé' || !(Number(confirmation.montantPaiement) > 0)) {
      toast('La confirmation client et un paiement confirmé avec un montant valide sont obligatoires.');
      return;
    }
    if (!demande.ultexDossierId) {
      toast("Cette demande n'est pas liée à un dossier Workflow — synchronisation du paiement impossible.");
      return;
    }
    const paiement = {
      code: genCode('PAY'),
      client: demande.client,
      demande: demande.code,
      nature: 'Paiement commande',
      montant: Number(confirmation.montantPaiement),
      devise: 'MAD',
      modePaiement: confirmation.modePaiement,
      statut: 'Payé',
      datePaiementEffectif: confirmation.datePaiement,
      remarque: confirmation.referencePaiement || confirmation.observationPaiement || '',
      reference: confirmation.referencePaiement || '',
      pieceJointe: confirmation.pieceJointePaiement || '',
      par: userCourant,
      ts: Date.now(),
    };
    const commande = {
      code: genCode('CMD'),
      referenceMetier: prochaineReferenceCommande(db, demande.client),
      client: demande.client,
      demande: demande.code,
      source_demande_id: demande.code,
      condition: confirmation.condition,
      paiement: paiement.code,
      dateConfirmation: confirmation.dateConfirmation || new Date().toISOString().slice(0, 10),
      formuleUltex: confirmation.formuleUltex,
      statut: 'Confirmée',
      lignes: lignesCommandeDepuisDemande(db, demande.code),
      par: userCourant,
      ts: Date.now()
    };
    const nextDb = {
      ...db,
      paiements: [paiement, ...(db.paiements || [])],
      commandes: [commande, ...(db.commandes || [])],
      demandes: (db.demandes || []).map(d => d.code === code ? { ...d, statut: 'Confirmée' } : d)
    };
    await updateDB(nextDb);
    let workflowSynced = true;
    try {
      await syncPaymentToWorkflow({
        ultex_dossier_id: demande.ultexDossierId,
        crm_payment_id: paiement.code,
        date: paiement.datePaiementEffectif,
        montant: paiement.montant,
        mode: paiement.modePaiement,
        statut: 'confirme',
        reference: paiement.reference,
        observation: confirmation.observationPaiement || '',
        justificatif: paiement.pieceJointe,
      });
    } catch (error) {
      workflowSynced = false;
      toast(`${error.message}. Le paiement reste enregistré dans le CRM.`);
    }
    audit('Commandes', 'Conversion depuis demande confirmée', commande.code, 'source_demande_id', '—', demande.code, demande.code);
    audit('Paiements', 'Paiement de confirmation créé', paiement.code, 'montant', '—', `${paiement.montant} MAD`, demande.code);
    notificationsNouvelleCommande(db, commande).forEach(notification => {
      notifier(notification.dest, notification.message, notification.module);
    });
    setShowConversion(false);
    window.location.hash = `ficheCommande:${commande.code}`;
    toast(`Commande ${commande.referenceMetier} créée.${workflowSynced ? ' Paiement synchronisé avec le Reliquat Workflow.' : ' Paiement à resynchroniser avec Workflow.'}`);
  };

  const routagesDemande = (db.demandeRoutages || []).filter(r => r.demande === code).sort((a, b) => (b.dateEnvoi || 0) - (a.dateEnvoi || 0));
  const lignesParCode = Object.fromEntries(lignes.map(l => [l.code, l]));

  return (
    <div>
      <Topbar titre={`Demande : ${demande.referenceMetier || code}`} />
      <div className="panneau">

        <div className="outils">
          <b className="titre-fiche">{demande.referenceMetier || code}</b>
          <span className="spacer"></span>
          {peut('ajouter') && (
            <button className="btn vert" onClick={() => setShowConversion(true)}>Confirmer + créer commande</button>
          )}
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

        {commandesExistantes.length > 0 && (
          <div className="bloc-fiche large">
            <h4>Commandes issues de cette demande</h4>
            <DataTable columns={[
              { key: 'referenceMetier', label: 'Commande', render: (v, o) => <a href={`#ficheCommande:${o.code}`}>{v || o.code}</a> },
              { key: 'dateConfirmation', label: 'Confirmation' },
              { key: 'statut', label: 'Statut', render: s => pillStatut(s) }
            ]} data={commandesExistantes} />
          </div>
        )}

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
                { key: 'referenceMetier', label: 'Produit', render: (v,o) => <a href={`#ficheDemandeLigne:${o.code}`}>{v || o.code}</a> },
                { key: 'nomProduit', label: 'Produit' },
                { key: 'typeTraitement', label: 'Circuit', render: (v) => v ? <span className="pill p-bleu">{v}</span> : <span className="pill p-gris">À définir</span> },
                { key: 'quantite', label: 'Quantité', render: (v, o) => v ? `${v} ${o.unite || ''}` : '—' },
                { key: 'prixUnitaire', label: 'Prix', render: (v, o) => v ? `${v} ${o.devise || ''}` : '—' },
                { key: 'fournisseur', label: 'Fournisseur', render: (v, o) => v ? v : (o.statutFournisseur || '—') },
                { key: 'poidsBrutTotal', label: 'Poids (kg)' },
                { key: 'cbmTotal', label: 'CBM' },
                { key: 'statut', label: 'Statut', render: (s) => pillStatut(s) },
                { key: 'actions', label: 'Actions', render: (v, row) => (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <a className="btn mini doux" href={`#ficheDemandeLigne:${row.code}`}>Ouvrir</a>
                    {peut('modifier') && <a className="btn mini" href={`#ficheDemandeLigne:${row.code}`}>Modifier</a>}
                    {peut('supprimer') && (
                      <button className="btn mini rouge" type="button" onClick={() => handleSupprimerProduit(row)}>Supprimer</button>
                    )}
                  </div>
                ) }
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

        {showConversion && (
          <LigneModal
            title="Confirmation client et création de la commande"
            champs={CONFIRMATION_COMMANDE}
            initialData={{
              dateConfirmation: new Date().toISOString().slice(0, 10),
              datePaiement: new Date().toISOString().slice(0, 10),
              modePaiement: 'Virement',
              statutPaiement: 'Confirmé',
            }}
            onSave={handleConvertirCommande}
            onClose={() => setShowConversion(false)}
          />
        )}

      </div>
    </div>
  );
};

export default FicheDemande;
