import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import Topbar from '../layout/Topbar';
import KVDisplay from '../common/KVDisplay';
import DataTable from '../common/DataTable';
import Pill from '../common/Pill';
import ModuleForm from '../modules/ModuleForm';
import { MODS } from '../../data/modules';
import { PrinterIcon } from '../common/Icons';

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
  ["dossiers", "10. Dossiers Import"]
];

const CHAMPS_IDENTITE = [
  {k:"type",l:"Type"}, {k:"nom",l:"Nom"}, {k:"raisonSociale",l:"Raison sociale"},
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
  const { db } = useDB();
  const initialCode = codeProp || codeFromProp || '';
  const [code, setCode] = useState(initialCode);
  const [onglet, setOnglet] = useState('identite');
  const [showEdit, setShowEdit] = useState(false);

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
  const audit = (db?.audit || []).filter(a => a.ref === code);

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
                {key: 'categorie', label: 'Catégorie'},
                {key: 'dateCreation', label: 'Date', render: (val) => val ? new Date(val).toLocaleDateString() : ''}
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
            data={audit}
          />
        </div>

      </div>
    </div>
  );
};

export default FicheClient;
