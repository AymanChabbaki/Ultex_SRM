import React, { useState, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useSecurity } from '../../context/SecurityContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import KVDisplay from '../common/KVDisplay';
import DataTable from '../common/DataTable';
import Pill from '../common/Pill';
import ModuleForm from '../modules/ModuleForm';
import Modal from '../common/Modal';
import { MODS } from '../../data/modules';
import { PrinterIcon } from '../common/Icons';
import { DATA_TAGS_WORKFLOW, PIPELINE_ETAPES_CLIENT } from '../../data/constants';
import { calculerRelanceSuivante, calculerPrioriteClient } from '../../utils/dataPipeline';
import { estSuiviOuvert } from '../../utils/closingCoordination';
import { recordFollowup, localDateTime } from '../../utils/dataFollowup';
import { pill } from '../../utils/format';
import { categorieDepuisFichier, lireFichierDataUrl } from '../../utils/fileData';
import { supprimerClientTestGoogleSheets } from '../../services/security';

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
  {k:"responsableCommercial",l:"Responsable commercial"},
  {k:"etapePipeline",l:"Étape du pipeline"}, {k:"dernierContact",l:"Dernier contact"},
  {k:"dernierSuiviData",l:"Dernier suivi Data"},
  {k:"actionSuivante",l:"Action suivante"},
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

const FicheClient = ({ codeProp, code: codeFromProp, ongletInitial }) => {
  const { db, updateDB, audit, genCode, userCourant, chargerDonnees } = useDB();
  const { peut } = useAuth();
  const { demanderElevation } = useSecurity();
  const { toast } = useToast();
  const initialCode = codeProp || codeFromProp || '';
  const [code, setCode] = useState(initialCode);
  const [onglet, setOnglet] = useState(ongletInitial || 'identite');
  const [note, setNote] = useState('');
  const [uploadEnCours, setUploadEnCours] = useState(false);
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
      const parts = hash.split(':');
      setCode(parts[1]);
      if (parts[2]) setOnglet(parts[2]);
      }
    }
    if (ongletInitial) setOnglet(ongletInitial);
  }, [codeProp, codeFromProp, ongletInitial, window.location.hash]);

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
  const historiqueAudit = (db?.audit || []).filter(a => (a.objet || a.ref) === code);

  const enregistrerSuivi = (patch, action) => {
    const updated = recordFollowup(client, patch, { actor: userCourant, notes: note.trim(), action });
    updateDB({ ...db, clients: (db.clients || []).map(c => c.code === code ? updated : c) });
    setNote('');
  };

  const handleMarquerContacte = () => {
    const ajd = new Date().toISOString().slice(0, 10);
    const prochaine = calculerRelanceSuivante(client.nbRelances || 0);
    const nbRelances = (client.nbRelances || 0) + 1;
    enregistrerSuivi({ dernierContact: ajd,
      dernierSuiviData: ajd,
      nbRelances,
      echeanceActionSuivante: prochaine,
    }, 'Contact effectué');
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
    enregistrerSuivi({ etapePipeline: etape }, 'Étape modifiée');
    audit('Clients', 'Étape pipeline modifiée', code, 'etapePipeline', client.etapePipeline, etape);
  };

  const handleChangeSuiviData = (field, value, label) => {
    const oldValue = client[field] || '';
    if (oldValue === value) return;
    enregistrerSuivi({ [field]: value, dateEntreeData: client.dateEntreeData || new Date().toISOString() }, label);
    audit('Clients', `${label} modifié(e)`, code, field, oldValue || '—', value || '—');
    toast(`${label} enregistré${value ? ` : ${value}` : ''}.`);
  };

  const handleAjoutFichiersClient = async (event) => {
    const fichiers = [...(event.target.files || [])];
    event.target.value = '';
    if (!fichiers.length) return;
    setUploadEnCours(true);
    try {
      const nouveaux = await Promise.all(fichiers.map(async fichier => ({
        code: genCode('DOC'),
        nom: fichier.name,
        type: categorieDepuisFichier(fichier),
        typeFichier: fichier.type || 'Fichier',
        fichier: await lireFichierDataUrl(fichier),
        taille: fichier.size,
        client: code,
        statut: 'Reçu',
        version: 1,
        par: userCourant,
        dateAjout: new Date().toISOString(),
        ts: Date.now(),
      })));
      updateDB({ ...db, documents: [...nouveaux, ...(db.documents || [])] });
      nouveaux.forEach(document => audit('Documents client', 'Ajout', document.code, 'client', '—', `${code} · ${document.nom}`));
      toast(`${nouveaux.length} fichier(s) ajouté(s) au Darf de ${client.nom}.`);
    } catch (error) {
      toast(error.message || "Impossible d'ajouter les fichiers.");
    } finally {
      setUploadEnCours(false);
    }
  };

  const estCodeTestGoogleSheets = client.sourceDonnees === 'Google Sheets' && Boolean(client.sheetLeadId);
  const handleSupprimerCodeTest = async () => {
    const confirmation = window.prompt(
      `Cette action supprimera ${code}, ses demandes, produits, contacts et documents de test.\n\nSaisissez exactement ${code} pour confirmer.`
    );
    if (confirmation !== code) {
      if (confirmation !== null) toast('Code de confirmation incorrect.');
      return;
    }
    try {
      const elevationToken = await demanderElevation(`Suppression du code test Google Sheets ${code}`);
      const result = await supprimerClientTestGoogleSheets(code, elevationToken);
      await chargerDonnees();
      window.location.hash = '#clients';
      const total = Object.values(result.counts || {}).reduce((sum, value) => sum + Number(value || 0), 0);
      toast(`${code} et ${Math.max(0, total - 1)} donnée(s) liée(s) supprimés.`);
    } catch (error) {
      if (error?.message !== 'Vérification annulée.') toast(error?.message || 'Suppression impossible.');
    }
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
          <button className="btn or" onClick={() => setOnglet('docs')}>Darf / Fichiers</button>
          <button className="btn" onClick={() => setShowEdit(true)}>Modifier</button>
          <button className="btn doux" onClick={() => setShowRattacher(true)}>Rattacher un suivi Closing</button>
          {estCodeTestGoogleSheets && peut('supprimer') && (
            <button className="btn rouge" onClick={handleSupprimerCodeTest}>Supprimer ce code test</button>
          )}
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
            <h4>Darf — Tous les fichiers du client</h4>
            <div className="champ"><label>Message / notes</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Message reçu ou notes du client…" />
              <button className="btn" disabled={!note.trim()} onClick={() => enregistrerSuivi({}, 'Note Darf')}>Enregistrer la note</button>
            </div>
            <div className="panneau" style={{padding:'14px', marginBottom:'14px'}}>
              <label className="btn or" style={{display:'inline-flex', cursor: uploadEnCours ? 'wait' : 'pointer'}}>
                {uploadEnCours ? 'Ajout en cours…' : '+ Ajouter des fichiers'}
                <input type="file" multiple onChange={handleAjoutFichiersClient} disabled={uploadEnCours} style={{display:'none'}} />
              </label>
              <small style={{display:'block', marginTop:'8px', opacity:0.72}}>
                Tous les formats sont acceptés : documents, PDF, images, audio, vidéo et archives.
              </small>
            </div>
            <DataTable
              columns={[
                {key: 'code', label: 'Code', render: (val) => <a href={`#ficheDocument:${val}`}>{val}</a>},
                {key: 'nom', label: 'Nom'},
                {key: 'type', label: 'Catégorie', render: (v) => v ? pill(v, 'p-gris') : '—'},
                {key: 'url', label: 'Fichier', render: (v, row) => (row.fichier || v) ? <a href={row.fichier || v} target="_blank" rel="noreferrer" download={row.nom}>Ouvrir / télécharger</a> : '—'},
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
              Suivi Data {client.etatVersion > 0 && <span className="pill p-gris">V{client.etatVersion}</span>}
              <span style={{float:'right', display:'flex', gap:'6px'}}>
                {client.dataTag ? pill(client.dataTag, 'p-bleu') : null}
                {pill(calculerPrioriteClient(client).tag, 'p-or')}
              </span>
            </h4>
            <div className="panneau" style={{padding:'14px', marginBottom:'14px'}}>
              <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'12px'}}>
                <div className="champ">
                  <label>Data Tag</label>
                  <select
                    value={client.dataTag || ''}
                    onChange={e => handleChangeSuiviData('dataTag', e.target.value, 'Data Tag')}
                  >
                    <option value="">— Aucun tag —</option>
                    {DATA_TAGS_WORKFLOW.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                  </select>
                </div>
                <div className="champ">
                  <label>Échéance de traitement du code</label>
                  <input
                    type="datetime-local"
                    value={localDateTime(client.echeanceCode)}
                    onChange={e => handleChangeSuiviData('echeanceCode', e.target.value, 'Échéance du code')}
                  />
                </div>
              </div>
              <small style={{display:'block', marginTop:'8px', opacity:0.72}}>
                Enregistrement immédiat dans la fiche client.
              </small>
            </div>
            <KVDisplay data={client} fields={CHAMPS_SUIVI_DATA} />
            <div className="champ"><label>Notes de relance / changement d’état</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Note conservée avec votre prochaine action" />
              <button className="btn doux" disabled={!note.trim()} onClick={() => enregistrerSuivi({}, 'Note de suivi')}>Enregistrer la note</button>
            </div>
            <div className="champ"><label>Prochaine relance — date et heure</label>
              <input type="datetime-local" value={localDateTime(client.echeanceActionSuivante)} onChange={e => handleChangeSuiviData('echeanceActionSuivante', e.target.value, 'Prochaine relance')} />
            </div>
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
          <DataTable columns={[
            {key:'date', label:'Date et heure', render:v => new Date(v).toLocaleString('fr-FR')},
            {key:'version', label:'Version état', render:v => v ? 'V' + v : '—'},
            {key:'utilisateur', label:'Utilisateur'}, {key:'action', label:'Action'},
            {key:'avant', label:'État précédent'}, {key:'etat', label:'État'},
            {key:'etape', label:'Étape'}, {key:'notes', label:'Notes'}, {key:'echeance', label:'Échéance'},
          ]} data={[...(client.historiqueSuivi || [])].reverse()} />
          <DataTable 
            columns={[
              {key: 'ts', label: 'Date', render: (val) => new Date(val).toLocaleString()},
              {key: 'utilisateur', label: 'Utilisateur'},
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
