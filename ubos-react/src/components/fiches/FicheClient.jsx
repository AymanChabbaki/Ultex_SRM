import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import KVDisplay from '../common/KVDisplay';
import DataTable from '../common/DataTable';
import Pill from '../common/Pill';
import ModuleForm from '../modules/ModuleForm';
import Modal from '../common/Modal';
import { MODS } from '../../data/modules';
import { PrinterIcon } from '../common/Icons';
import { PIPELINE_ETAPES_CLIENT } from '../../data/constants';
import { calculerRelanceSuivante, calculerPrioriteClient } from '../../utils/dataPipeline';
import { estSuiviOuvert } from '../../utils/closingCoordination';
import { pill } from '../../utils/format';

const ONGLETS_360 = [
  ["identite", "1. Identité"],
  ["commercial", "2. Profil commercial"],
  ["import", "3. Profil import"],
  ["comportemental", "4. Comportemental"],
  ["financier", "5. Situation financière"],
  ["docs", "6. Documents"],
  ["contacts", "7. Contacts associés"],
  ["demandes", "8. Demandes & Consultations"],
  ["commandes", "9. Commandes"],
  ["dossiers", "10. Dossiers Import"],
  ["suiviData", "11. Suivi Data"]
];

const CHAMPS_SUIVI_DATA = [
  {k:"responsableCommercial",l:"Responsable commercial"}, {k:"etapePipeline",l:"Étape du pipeline"},
  {k:"dernierContact",l:"Dernier contact"}, {k:"actionSuivante",l:"Action suivante"},
  {k:"respActionSuivante",l:"Responsable de l'action"}, {k:"echeanceActionSuivante",l:"Prochaine relance"},
  {k:"nbRelances",l:"Nombre de relances effectuées"}
];

const CHAMPS_IDENTITE = [
  {k:"type",l:"Type"}, {k:"nom",l:"Nom"}, {k:"codeClientUltex",l:"Code client ULTEX"}, {k:"raisonSociale",l:"Raison sociale"},
  {k:"ice",l:"ICE"}, {k:"idFiscal",l:"Identifiant fiscal (IF)"}, {k:"rc",l:"RC"}, {k:"cnss",l:"CNSS"},
  {k:"adresse",l:"Adresse"}, {k:"ville",l:"Ville"}, {k:"pays",l:"Pays"},
  {k:"telephone",l:"Téléphone"}, {k:"whatsapp",l:"WhatsApp"}, {k:"email",l:"E-mail"},
  {k:"siteWeb",l:"Site web"}, {k:"googleMaps",l:"Lien Google Maps"}, {k:"gps",l:"Coordonnées GPS"},
  {k:"reseauxSociaux",l:"Réseaux sociaux"}, {k:"dateCreation",l:"Date de création"},
  {k:"responsableCommercial",l:"Responsable commercial"}, {k:"representantLegal",l:"Représentant légal"},
  {k:"segment",l:"Statut"}
];

const CHAMPS_COMMERCIAL = [
  {k:"secteurActivite",l:"Secteur d'activité"}, {k:"metier",l:"Métier"},
  {k:"activitePrincipale",l:"Activité principale"}, {k:"activiteSecondaire",l:"Activité secondaire"},
  {k:"localCommercial",l:"Type de local"}, {k:"marketplaceUtilisee",l:"Marketplace utilisée"},
  {k:"nbEmployes",l:"Nombre d'employés"}, {k:"anneesExistence",l:"Années d'existence"},
  {k:"caEstime",l:"CA estimé (MAD/an)"}, {k:"objectif",l:"Objectif du client"},
  {k:"projetActuel",l:"Projet actuel"}, {k:"projetFutur",l:"Projet futur"},
  {k:"produitsVendus",l:"Produits vendus"}, {k:"produitsSouhaites",l:"Produits souhaités"},
  {k:"paysImport",l:"Pays d'import habituels"}, {k:"frequenceAchat",l:"Fréquence d'achat"},
  {k:"budgetMoyen",l:"Budget moyen par commande (MAD)"}, {k:"urgence",l:"Urgence habituelle"},
  {k:"sourcePremierContact",l:"Source du premier contact"}, {k:"datePremierContact",l:"Date du premier contact"}
];

const CHAMPS_IMPORT = [
  {k:"niveauImport",l:"Niveau import"}, {k:"nbImportations",l:"Nombre d'importations réalisées"},
  {k:"incotermsConnus",l:"Incoterms connus"}, {k:"documentsConnus",l:"Documents connus"},
  {k:"transportConnu",l:"Transport connu"}, {k:"douaneConnue",l:"Douane connue"},
  {k:"certificationsConnues",l:"Certifications connues"}, {k:"historiquePays",l:"Historique pays (notes)"},
  {k:"historiqueFournisseurs",l:"Historique fournisseurs (notes)"}, {k:"historiqueProduits",l:"Historique produits (notes)"},
  {k:"preferencesFournisseurs",l:"Préférences fournisseurs"}, {k:"exigenceQualite",l:"Exigence qualité"},
  {k:"marquesPreferees",l:"Marques préférées"}, {k:"budgetReel",l:"Budget réel constaté"},
  {k:"produitsRetenus",l:"Produits retenus"}
];

const CHAMPS_COMPORTEMENTAL = [
  {k:"personnalite",l:"Personnalité"}, {k:"vitesseDecision",l:"Décision"},
  {k:"communicationPreferee",l:"Communication préférée"}, {k:"heurePreferee",l:"Heure préférée"},
  {k:"langue",l:"Langue"}, {k:"centresInteret",l:"Centres d'intérêt"},
  {k:"sensibilitePrix",l:"Sensibilité au prix"}, {k:"sensibiliteQualite",l:"Sensibilité qualité"},
  {k:"sensibiliteDelai",l:"Sensibilité délai"}, {k:"objections",l:"Objections courantes"},
  {k:"pourquoiAchat",l:"Pourquoi il achète"}, {k:"pourquoiRefus",l:"Pourquoi il refuse"}
];

const FicheClient = ({ codeProp, code: codeFromProp }) => {
  const { db, updateDB, audit } = useDB();
  const { toast } = useToast();
  const initialCode = codeProp || codeFromProp || '';
  const [code, setCode] = useState(initialCode);
  const [onglet, setOnglet] = useState('identite');
  const [showEdit, setShowEdit] = useState(false);
  const [showRattacher, setShowRattacher] = useState(false);
  const [codeSuiviRecherche, setCodeSuiviRecherche] = useState('');

  useEffect(() => {
    const c = codeProp || codeFromProp;
    if (c) {
      setCode(c);
    } else {
      const hash = window.location.hash;
      if (hash.startsWith('#ficheClient:')) {
        setCode(hash.split(':')[1]);
      }
    }
  }, [codeProp, codeFromProp, window.location.hash]);

  const client = (db?.clients || []).find(c => c.code === code);
  
  if (!client) {
    return (
      <div>
        <Topbar titre="Profil Client 360°" />
        <div className="panneau">
          <div className="vide"><b>Client introuvable</b> {code ? `(${code})` : ''} n'existe pas.</div>
        </div>
      </div>
    );
  }

  const doss = (db?.dossiers || []).filter(d => d.client === code);
  const commandes = (db?.commandes || []).filter(c => c.client === code);
  const demandes = (db?.demandes || []).filter(d => d.client === code);
  const contacts = (db?.contacts || []).filter(c => c.codeClientAssocie === code || c.client === code);
  const docs = (db?.documents || []).filter(d => d.client === code);
  const historiqueAudit = (db?.audit || []).filter(a => a.ref === code);

  const handleMarquerContacte = () => {
    const ajd = new Date().toISOString().slice(0, 10);
    const prochaine = calculerRelanceSuivante(client.nbRelances || 0);
    const nbRelances = (client.nbRelances || 0) + 1;
    const nextClients = (db.clients || []).map(c => c.code === code ? { ...c, dernierContact: ajd, nbRelances, echeanceActionSuivante: prochaine } : c);
    updateDB({ ...db, clients: nextClients });
    audit('Clients', 'Contact effectué', code, 'dernierContact', client.dernierContact, ajd);
    toast(`Contact enregistré. Prochaine relance : ${prochaine}.`);
  };

  const handleRattacherSuivi = () => {
    const suivi = (db.suivisClosing || []).find(s => s.codeSuivi === codeSuiviRecherche.trim() && estSuiviOuvert(s));
    if (!suivi) { toast('Aucun suivi Closing ouvert trouvé pour ce code.'); return; }
    updateDB({ ...db, suivisClosing: (db.suivisClosing || []).map(s => s.code === suivi.code ? { ...s, client: code } : s) });
    audit('Suivi Closing', 'Rattaché au client', suivi.code, 'client', '—', code);
    toast(`Suivi ${suivi.codeSuivi} rattaché à ce client.`);
    setShowRattacher(false);
    setCodeSuiviRecherche('');
  };

  const handleChangeEtape = (etape) => {
    const nextClients = (db.clients || []).map(c => c.code === code ? { ...c, etapePipeline: etape } : c);
    updateDB({ ...db, clients: nextClients });
    audit('Clients', 'Étape pipeline modifiée', code, 'etapePipeline', client.etapePipeline, etape);
  };

  return (
    <div>
      <Topbar titre="Profil Client 360°" />
      <div className="panneau">
        <div className="outils">
          <span className="pill p-or" style={{fontSize:'14px', padding:'6px 14px'}}>{client.code}</span>
          <b className="titre-fiche">{client.nom}</b>
          <Pill type={client.segment} texte={client.segment} />
          <span className="spacer"></span>
          <button className="btn" onClick={() => setShowEdit(true)}>Modifier</button>
          <button className="btn doux" onClick={() => setShowRattacher(true)}>Rattacher un suivi Closing</button>
          <button className="btn or" onClick={() => window.print()}><PrinterIcon size={14} /> Imprimer / PDF</button>
        </div>

        {showEdit && (
          <ModuleForm
            moduleId="clients"
            MODS={MODS}
            recordCode={code}
            onClose={() => setShowEdit(false)}
          />
        )}

        {showRattacher && (
          <Modal title="Rattacher un suivi Closing existant" onClose={() => setShowRattacher(false)} footer={
            <><button className="btn doux" onClick={() => setShowRattacher(false)}>Annuler</button><button className="btn or" onClick={handleRattacherSuivi}>Rattacher</button></>
          }>
            <div className="corps">
              <div className="champ large">
                <label>Code du suivi Closing</label>
                <input autoFocus value={codeSuiviRecherche} onChange={e => setCodeSuiviRecherche(e.target.value)} placeholder="Ex. 8477" />
              </div>
            </div>
          </Modal>
        )}

        <div style={{display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'14px'}}>
          {ONGLETS_360.map(([id, lbl]) => (
            <button 
              key={id}
              className={`btn mini ${onglet === id ? "or" : "doux"}`} 
              onClick={() => setOnglet(id)}
            >
              {lbl}
            </button>
          ))}
        </div>

        {onglet === "identite" && (
          <div className="bloc-fiche large">
            <h4>Identité</h4>
            <KVDisplay data={client} fields={CHAMPS_IDENTITE} />
          </div>
        )}

        {onglet === "commercial" && (
          <div className="bloc-fiche large">
            <h4>Profil commercial</h4>
            <KVDisplay data={client} fields={CHAMPS_COMMERCIAL} />
          </div>
        )}

        {onglet === "import" && (
          <div className="bloc-fiche large">
            <h4>Profil import</h4>
            <KVDisplay data={client} fields={CHAMPS_IMPORT} />
          </div>
        )}

        {onglet === "comportemental" && (
          <div className="bloc-fiche large">
            <h4>Profil comportemental</h4>
            <KVDisplay data={client} fields={CHAMPS_COMPORTEMENTAL} />
          </div>
        )}

        {onglet === "financier" && (
          <div className="bloc-fiche large">
            <h4>Situation financière</h4>
            <p>Module finance à venir</p>
          </div>
        )}

        {onglet === "docs" && (
          <div className="bloc-fiche large">
            <h4>Documents liés</h4>
            <DataTable
              columns={[
                {key: 'code', label: 'Code', render: (val) => <a href={`#ficheDocument:${val}`}>{val}</a>},
                {key: 'nom', label: 'Nom'},
                {key: 'type', label: 'Catégorie', render: (v) => v ? pill(v, 'p-gris') : '—'},
                {key: 'url', label: 'Lien', render: (v) => v ? <a href={v} target="_blank" rel="noreferrer">Ouvrir</a> : '—'},
                {key: 'statut', label: 'Statut', render: (v) => <Pill type={v} texte={v} />}
              ]}
              data={docs}
            />
          </div>
        )}

        {onglet === "contacts" && (
          <div className="bloc-fiche large">
            <h4>Contacts associés</h4>
            <DataTable 
              columns={[
                {key: 'code', label: 'Code'},
                {key: 'nom', label: 'Nom'},
                {key: 'fonction', label: 'Fonction'},
                {key: 'telephone', label: 'Téléphone'},
                {key: 'email', label: 'Email'}
              ]}
              data={contacts}
            />
          </div>
        )}

        {onglet === "demandes" && (
          <div className="bloc-fiche large">
            <h4>Demandes & Consultations</h4>
            <DataTable 
              columns={[
                {key: 'code', label: 'Code', render: (val) => <a href={`#ficheDemande:${val}`}>{val}</a>},
                {key: 'date', label: 'Date', render: (val) => val ? new Date(val).toLocaleDateString() : ''},
                {key: 'statut', label: 'Statut', render: (val) => <Pill type={val} texte={val} />}
              ]}
              data={demandes}
            />
          </div>
        )}

        {onglet === "commandes" && (
          <div className="bloc-fiche large">
            <h4>Commandes</h4>
            <DataTable 
              columns={[
                {key: 'code', label: 'Code', render: (val) => <a href={`#ficheCommande:${val}`}>{val}</a>},
                {key: 'date', label: 'Date', render: (val) => val ? new Date(val).toLocaleDateString() : ''},
                {key: 'statut', label: 'Statut', render: (val) => <Pill type={val} texte={val} />}
              ]}
              data={commandes}
            />
          </div>
        )}

        {onglet === "dossiers" && (
          <div className="bloc-fiche large">
            <h4>Dossiers Import</h4>
            <DataTable
              columns={[
                {key: 'code', label: 'Code', render: (val) => <a href={`#ficheDossier:${val}`}>{val}</a>},
                {key: 'produit', label: 'Produit'},
                {key: 'etape', label: 'Étape', render: (val) => <Pill type={val} texte={val} />}
              ]}
              data={doss}
            />
          </div>
        )}

        {onglet === "suiviData" && (
          <div className="bloc-fiche large">
            <h4>
              Suivi Data
              <span style={{float:'right'}}>{pill(calculerPrioriteClient(client).tag, 'p-or')}</span>
            </h4>
            <KVDisplay data={client} fields={CHAMPS_SUIVI_DATA} />
            <div style={{display:'flex', gap:'10px', alignItems:'flex-end', marginTop:'14px', flexWrap:'wrap'}}>
              <div className="champ" style={{maxWidth:'320px'}}>
                <label>Changer l'étape du pipeline</label>
                <select value={client.etapePipeline || ''} onChange={e => handleChangeEtape(e.target.value)}>
                  <option value="">—</option>
                  {PIPELINE_ETAPES_CLIENT.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <button className="btn or" onClick={handleMarquerContacte}>Marquer comme contacté aujourd'hui</button>
            </div>
          </div>
        )}

        <div className="bloc-fiche large" style={{marginTop:'20px'}}>
          <h4>Historique / Audit</h4>
          <DataTable 
            columns={[
              {key: 'ts', label: 'Date', render: (val) => new Date(val).toLocaleString()},
              {key: 'par', label: 'Utilisateur'},
              {key: 'action', label: 'Action'},
              {key: 'champ', label: 'Champ'},
              {key: 'apres', label: 'Valeur'}
            ]}
            data={historiqueAudit}
          />
        </div>

      </div>
    </div>
  );
};

export default FicheClient;
