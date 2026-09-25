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
import { pill } from '../../utils/format';
import {
  ACTIONS_REVUE_ARRIVAGE, actionsRevueArrivage, destinataireImane, destinataireYasser,
  ETATS_REVUE_ARRIVAGE, roleRevueArrivage, transitionRevueArrivage
} from '../../utils/arrivageWorkflow';

const FRAIS_CHAMPS = [
  {k: 'typeFrais', l: 'Type de frais', t: 'select', opts: ['Transit portuaire', 'Magasinage', 'Manutention', 'Douane / Liquidation', 'Transport', 'Assurance', 'Documentation', 'Autre'], req: 1},
  {k: 'montant', l: 'Montant (MAD)', t: 'number', req: 1},
  {k: 'fournisseur', l: 'Prestataire', t: 'ref', coll: 'partenaires', cle: 'nom'},
  {k: 'repartition', l: 'Répartition (dossiers)', t: 'text'}
];

const FicheArrivage = ({ codeProp, code: codeFromProp }) => {
  const { db, updateDB, audit, notifier, userCourant } = useDB();
  const { peut, session } = useAuth();
  const { toast } = useToast();
  const initialCode = codeProp || codeFromProp || '';
  const [code, setCode] = useState(initialCode);
  const [showEdit, setShowEdit] = useState(false);
  const [showAjouterCommande, setShowAjouterCommande] = useState(false);
  const [commandeChoisie, setCommandeChoisie] = useState('');
  const [showAjouterFrais, setShowAjouterFrais] = useState(false);
  const [showLierDocument, setShowLierDocument] = useState(false);
  const [noteCircuit, setNoteCircuit] = useState('');

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
    {k: 'ancienNumero', l: 'Ancien N° arrivage'},
    {k: 'codeClientSource', l: 'Code client'},
    {k: 'nomClientSource', l: 'Nom du client'},
    {k: 'produitSource', l: 'Produit'},
    {k: 'incotermSource', l: 'Incoterm'},
    {k: 'serviceSource', l: 'Service'},
    {k: 'dateConfirmationSource', l: 'Confirmation client'},
    {k: 'totalImporteSource', l: 'Total importé'},
    {k: 'dateEngagementSource', l: "Date d'engagement"},
    {k: 'datePaiementSource', l: 'Date de paiement'},
    {k: 'modePaiementSource', l: 'Mode de paiement'},
    {k: 'numeroProformaSource', l: 'N° proforma'},
    {k: 'volumePoidsSource', l: 'CBM / poids'},
    {k: 'offreTransportSource', l: 'Offre transport'},
    {k: 'trackingSource', l: 'N° suivi'},
    {k: 'modeTransport', l: 'Mode de transport'},
    {k: 'compagnieSource', l: 'Compagnie source'},
    {k: 'transporteur', l: 'Transporteur'},
    {k: 'numReservation', l: 'N° réservation'},
    {k: 'numBLMaitre', l: 'N° BL maître'},
    {k: 'numBLHouse', l: 'N° BL house'},
    {k: 'numAWB', l: 'N° AWB'},
    {k: 'dateDepartPrevue', l: 'Départ prévu'},
    {k: 'dateDepartReelle', l: 'Départ réel'},
    {k: 'etaPrevue', l: 'Arrivée prévue'},
    {k: 'dateArriveeReelle', l: 'Arrivée réelle'},
    {k: 'dateSortieSource', l: 'Date de sortie'},
    {k: 'portDepart', l: 'Port de Départ'},
    {k: 'portArrivee', l: 'Port d\'Arrivée'},
    {k: 'statut', l: 'Statut Logistique'}
  ];

  const commandes = db.commandes?.filter(c => arrivage.commandes?.includes(c.code)) || [];
  const commandesDisponibles = db.commandes?.filter(c => !arrivage.commandes?.includes(c.code) && c.statut !== 'Annulée') || [];
  const documents = db.documents?.filter(d => d.arrivage === code) || [];
  const roleCircuit = roleRevueArrivage(session);
  const actionsCircuit = actionsRevueArrivage(arrivage, roleCircuit);
  const historiqueCircuit = arrivage.circuitHistorique || [];

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

  const handleTransitionCircuit = (action) => {
    try {
      const result = transitionRevueArrivage(arrivage, action, {
        role: roleCircuit,
        auteur: userCourant,
        note: noteCircuit,
      });
      updateDB({
        ...db,
        arrivages: (db.arrivages || []).map(item => item.code === code ? result.arrivage : item),
      });
      audit('Arrivages / LIMEX', result.entree.libelle, code, 'circuitValidation', result.entree.avant, result.entree.apres);

      const cible = result.cible === 'Imane'
        ? destinataireImane(db)
        : result.cible === 'Yasser'
          ? destinataireYasser(db)
          : result.cible;
      if (cible) {
        const commandesTexte = (result.arrivage.commandes || []).join(', ') || 'aucune commande';
        const noteTexte = result.entree.note ? `\nNote : ${result.entree.note}` : '';
        notifier(cible, `${result.entree.libelle} — ${code}\nCommandes : ${commandesTexte}${noteTexte}\nLien : #ficheArrivage:${code}`, 'Arrivages / LIMEX');
      }
      setNoteCircuit('');
      toast(result.entree.libelle);
    } catch (error) {
      toast(error.message || "Impossible d'effectuer cette action.");
    }
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

        <div className="bloc-fiche large" style={{ border: '1px solid var(--or)' }}>
          <h4>Circuit de validation LIMEX</h4>
          <div className="stats" style={{ marginBottom: '14px' }}>
            <div><small>État</small><br />{pill(arrivage.circuitValidation || ETATS_REVUE_ARRIVAGE.NON_DEMARRE, arrivage.circuitValidation === ETATS_REVUE_ARRIVAGE.VALIDE ? 'p-vert' : 'p-ambre')}</div>
            <div><small>Responsable actuel</small><br /><b>{arrivage.circuitDestinataire || '—'}</b></div>
            <div><small>Dernière action</small><br /><b>{arrivage.circuitDerniereActionPar || '—'}</b><br /><small>{arrivage.circuitDerniereActionLe ? new Date(arrivage.circuitDerniereActionLe).toLocaleString('fr-FR') : '—'}</small></div>
          </div>

          {actionsCircuit.length > 0 && (
            <div className="panneau" style={{ padding: '14px', marginBottom: '14px' }}>
              <div className="champ large">
                <label>Note / instruction pour le prochain intervenant</label>
                <textarea
                  value={noteCircuit}
                  onChange={event => setNoteCircuit(event.target.value)}
                  placeholder={roleCircuit === 'Direction'
                    ? "Écrivez l'analyse et les corrections demandées à Imane…"
                    : roleCircuit === 'Yasser'
                      ? 'Décrivez les analyses, suivis ou documents terminés…'
                      : 'Écrivez les instructions, contre-notes ou le motif de validation…'}
                />
              </div>
              <div className="outils" style={{ marginBottom: 0, flexWrap: 'wrap' }}>
                {actionsCircuit.includes(ACTIONS_REVUE_ARRIVAGE.DEMARRER) && (
                  <button className="btn or" onClick={() => handleTransitionCircuit(ACTIONS_REVUE_ARRIVAGE.DEMARRER)}>Envoyer à Imane</button>
                )}
                {actionsCircuit.includes(ACTIONS_REVUE_ARRIVAGE.ENVOYER_DIRECTION) && (
                  <button className="btn or" onClick={() => handleTransitionCircuit(ACTIONS_REVUE_ARRIVAGE.ENVOYER_DIRECTION)}>Envoyer à la Direction pour analyse</button>
                )}
                {actionsCircuit.includes(ACTIONS_REVUE_ARRIVAGE.ENVOYER_YASSER) && (
                  <button className="btn doux" onClick={() => handleTransitionCircuit(ACTIONS_REVUE_ARRIVAGE.ENVOYER_YASSER)}>Envoyer à Yasser — analyse / suivi / documents</button>
                )}
                {actionsCircuit.includes(ACTIONS_REVUE_ARRIVAGE.RETOUR_IMANE) && (
                  <button className="btn or" onClick={() => handleTransitionCircuit(ACTIONS_REVUE_ARRIVAGE.RETOUR_IMANE)}>Travail terminé — retourner à Imane</button>
                )}
                {actionsCircuit.includes(ACTIONS_REVUE_ARRIVAGE.VALIDER) && (
                  <button className="btn vert" onClick={() => handleTransitionCircuit(ACTIONS_REVUE_ARRIVAGE.VALIDER)}>Valider l'arrivage</button>
                )}
              </div>
            </div>
          )}

          <h4>Historique des échanges</h4>
          {historiqueCircuit.length ? (
            <div className="liste-notif">
              {historiqueCircuit.map(entree => (
                <div className="notif" key={entree.id || `${entree.date}-${entree.action}`}>
                  <div className="pt-n"></div>
                  <div className="spacer">
                    <div><b>{entree.libelle}</b></div>
                    {entree.note && <div style={{ whiteSpace: 'pre-wrap' }}>{entree.note}</div>}
                    <div className="qui">{entree.auteur || '—'} · {entree.date ? new Date(entree.date).toLocaleString('fr-FR') : '—'} · {entree.avant || '—'} → {entree.apres || '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="vide"><b>Aucun échange</b>Le circuit n'a pas encore démarré.</div>}
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
              {key: 'type', label: 'Catégorie'}
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
