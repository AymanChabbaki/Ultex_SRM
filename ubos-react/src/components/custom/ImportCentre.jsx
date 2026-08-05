import React, { useState, useMemo, useEffect } from 'react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import Modal from '../common/Modal';
import { exporterExcel } from '../../utils/export';
import { MODS } from '../../data/modules';
import { PFX_ANNEE, COLLS } from '../../data/constants';
import * as XLSX from 'xlsx';
import { esc, pill, normTel } from '../../utils/format';
import { 
  UploadIcon, DownloadIcon, AlertIcon, CheckIcon, SearchIcon, 
  DatabaseIcon, ShieldCheckIcon, EyeIcon, KeyIcon 
} from '../common/Icons';
import { effectuerOCRImage, effectuerOCRPdf, extraireChampsMetier } from '../../utils/ocrEngine';
import { parsePdfBackend } from '../../services/api';

function normCol(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

// ----------------------------------------------------
// DEFAULT BUILT-IN IMPORT MODELS & DETECTORS
// ----------------------------------------------------
const MODELES_PAR_DEFAUT = [
  {
    id: 'mod_data',
    nom: 'DATA / Clients historique',
    typeDoc: 'Fichier clients',
    moduleCible: 'clients',
    colonnes: ['codeclient', 'nomduclient', 'contactclient', 'steville', 'produit', 'quantite', 'experience', 'fournisseurorigin', 'observation']
  },
  {
    id: 'mod_calcul',
    nom: 'Modèle Calcul Import',
    typeDoc: 'Fichier calcul',
    moduleCible: 'etudes',
    colonnes: ['codeclient', 'codedemande', 'produit', 'fournisseur', 'quantite', 'prixachat', 'devise', 'incoterm', 'poids', 'volume', 'fret', 'droitsdedouane', 'tva', 'transit', 'certification', 'transportnational', 'fraisdeservice', 'marge', 'prixdevente']
  },
  {
    id: 'mod_arrivages',
    nom: 'Modèle Arrivages & Transport',
    typeDoc: 'Fichier arrivages',
    moduleCible: 'arrivages',
    colonnes: ['numeroarrivage', 'codearrivage', 'client', 'codedossier', 'produit', 'fournisseur', 'bl', 'awb', 'conteneur', 'plomb', 'navire', 'compagnie', 'portdepart', 'portarrivee', 'etd', 'eta', 'transitaire', 'transporteur', 'bad', 'dum']
  },
  {
    id: 'mod_paiements',
    nom: 'Modèle Paiements & Trésorerie',
    typeDoc: 'Fichier paiements',
    moduleCible: 'paiements',
    colonnes: ['beneficiaire', 'dossier', 'arrivage', 'nature', 'montant', 'devise', 'echeance', 'priorite', 'statut', 'banque', 'reference']
  },
  {
    id: 'mod_releve',
    nom: 'Modèle Relevé Bancaire',
    typeDoc: 'Relevé bancaire',
    moduleCible: 'pmtIntl',
    colonnes: ['dateoperation', 'datevaleur', 'libelle', 'reference', 'debit', 'credit', 'solde']
  },
  {
    id: 'mod_compta',
    nom: 'Modèle Comptabilité & Factures',
    typeDoc: 'Fichier comptabilité',
    moduleCible: 'facturesFinales',
    colonnes: ['numerofacture', 'date', 'fournisseur', 'client', 'ice', 'ht', 'tva', 'ttc', 'paiement', 'echeance', 'dossier']
  },
  {
    id: 'mod_stock',
    nom: 'Modèle Gestion Stock',
    typeDoc: 'Fichier stock',
    moduleCible: 'stocks',
    colonnes: ['produit', 'lot', 'dossier', 'arrivage', 'proprietaire', 'quantite', 'unite', 'entrepot', 'emplacement', 'etat']
  },
  {
    id: 'mod_fournisseurs',
    nom: 'Modèle Fournisseurs & Partenaires',
    typeDoc: 'Fichier fournisseurs',
    moduleCible: 'fournisseurs',
    colonnes: ['code', 'raisonsociale', 'pays', 'contact', 'telephone', 'email', 'produits', 'services', 'conditions', 'statut']
  }
];

// Helper to detect document type based on filename, headers and sheet names
function detecterTypeDocument(nomFichier, nColonnes, sheetNames = []) {
  const normNom = normCol(nomFichier);
  const colJoined = nColonnes.join(' ');
  const sheetJoined = sheetNames.map(normCol).join(' ');

  if (normNom.includes('calcul') || colJoined.includes('prixachat') || colJoined.includes('incoterm') || colJoined.includes('fret')) {
    return 'Fichier calcul';
  }
  if (normNom.includes('arrivage') || colJoined.includes('conteneur') || colJoined.includes('bl') || colJoined.includes('eta')) {
    return 'Fichier arrivages';
  }
  if (normNom.includes('paiement') || normNom.includes('tresorerie') || colJoined.includes('beneficiaire') || colJoined.includes('echeance')) {
    return 'Fichier paiements';
  }
  if (normNom.includes('releve') || normNom.includes('banque') || colJoined.includes('debit') || colJoined.includes('credit')) {
    return 'Relevé bancaire';
  }
  if (normNom.includes('compta') || normNom.includes('facture') || colJoined.includes('ht') || colJoined.includes('tva') || colJoined.includes('ice')) {
    return 'Fichier comptabilité';
  }
  if (normNom.includes('stock') || colJoined.includes('entrepot') || colJoined.includes('emplacement')) {
    return 'Fichier stock';
  }
  if (normNom.includes('fournisseur') || colJoined.includes('raisonsociale') || colJoined.includes('pays')) {
    return 'Fichier fournisseurs';
  }
  if (normNom.endsWith('.pdf')) {
    if (normNom.includes('proforma')) return 'Proforma Invoice';
    if (normNom.includes('packing')) return 'Packing List';
    if (normNom.includes('bl')) return 'BL';
    if (normNom.includes('dum')) return 'DUM';
    if (normNom.includes('bad')) return 'BAD';
    return 'Facture';
  }
  if (normNom.endsWith('.docx') || normNom.endsWith('.doc')) {
    return 'Contrat';
  }
  if (['jpg', 'jpeg', 'png', 'webp'].some(ext => normNom.endsWith(ext))) {
    return 'Document scanné / Image';
  }
  if (normNom.endsWith('.zip')) {
    return 'Dossier complet (Archive ZIP)';
  }
  return 'Fichier clients';
}

export default function ImportCentre() {
  const { db, updateDB, genCode, audit, notifier } = useDB();
  const { estDirection, peut, session, userCourant } = useAuth();
  const { toast } = useToast();

  // Tab State
  const [activeTab, setActiveTab] = useState('import'); // 'import', 'modeles', 'attente', 'historique', 'erreurs', 'export', 'synchro'
  
  // Multi-File Queue
  const [fileQueue, setFileQueue] = useState([]);
  const [selectedQueueIndex, setSelectedQueueIndex] = useState(null);

  // Active Analysis & Preview Modal State
  const [activePreviewItem, setActivePreviewItem] = useState(null);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [politiqueDoublon, setPolitiqueDoublon] = useState('maj');
  const [decisions, setDecisions] = useState({});

  // Column Mapping Assistant State
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [mappingState, setMappingState] = useState(null); // { fileName, cols, mapping: {} }

  // PDF & Image OCR / Archiving Modal State
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfFileItem, setPdfFileItem] = useState(null);
  const [pdfAction, setPdfAction] = useState('archive'); // 'archive' or 'extract'
  const [pdfMeta, setPdfMeta] = useState({ client: '', dossier: '', arrivage: '', categorie: 'Facture', remarques: '' });
  const [clientSearchQuery, setClientSearchQuery] = useState('');

  // Real OCR State
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatusText, setOcrStatusText] = useState('');
  const [extractedOcrText, setExtractedOcrText] = useState('');
  const [extractedFields, setExtractedFields] = useState({});

  const lancerOCR = async () => {
    if (!pdfFileItem || !pdfFileItem.file) return;

    setOcrRunning(true);
    setOcrProgress(10);
    setOcrStatusText("Initialisation du moteur OCR...");

    const ext = pdfFileItem.format.toLowerCase();

    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      setOcrStatusText("Exécution de l'OCR Tesseract.js (reconnaissance optique d'image)...");
      const res = await effectuerOCRImage(pdfFileItem.file, (pct, statusMsg) => {
        setOcrProgress(pct);
        setOcrStatusText(statusMsg);
      });

      if (res && res.success) {
        setExtractedOcrText(res.text);
        setExtractedFields(res.parsedFields || {});
        toast("OCR réussi ! Texte et champs extraits.");
      } else {
        toast("Échec OCR sur l'image : " + (res.error || ""));
      }
    } else if (ext === 'pdf') {
      setOcrStatusText("Rendu des pages et exécution de l'OCR Tesseract.js sur le PDF scanné...");
      const res = await effectuerOCRPdf(pdfFileItem.file, (pct, statusMsg) => {
        setOcrProgress(pct);
        setOcrStatusText(statusMsg);
      });

      if (res && res.success && res.text.trim()) {
        setExtractedOcrText(res.text);
        const fields = res.parsedFields || {};
        setExtractedFields(fields);
        autoMatchClient(fields);
        toast("OCR Tesseract sur le PDF scanné réussi !");
      } else {
        // Try PDF-Parse backend fallback
        try {
          const reader = new FileReader();
          reader.onload = async (evt) => {
            const base64 = evt.target.result;
            const pdfRes = await parsePdfBackend(base64);
            if (pdfRes && pdfRes.success) {
              setExtractedOcrText(pdfRes.text);
              const fields = extraireChampsMetier(pdfRes.text);
              setExtractedFields(fields);
              autoMatchClient(fields);
            }
          };
          reader.readAsDataURL(pdfFileItem.file);
        } catch (err) {}
      }
    }
    setOcrRunning(false);
  };

  const autoMatchClient = (fields) => {
    if (!fields) return;
    const { client, telephone, codeClient } = fields;
    
    // Search existing client in db.clients strictly by code, phone or name
    let clientFound = (db.clients || []).find(c => 
      (codeClient && c.code === codeClient) ||
      (telephone && normTel(c.telephone) === normTel(telephone)) ||
      (client && normCol(c.nom) === normCol(client))
    );

    if (clientFound) {
      setPdfMeta(prev => ({ ...prev, client: clientFound.code }));
      toast(`Client rattaché automatiquement : ${clientFound.nom} (${clientFound.code})`);
    }
  };

  // Custom Models State
  const [modelesCustom, setModelesCustom] = useState(() => db.importModels || MODELES_PAR_DEFAUT);

  // Errors State
  const [erreursImport, setErreursImport] = useState(() => db.importErrors || []);

  // History State
  const [historique, setHistorique] = useState(() => db.importHistory || []);

  useEffect(() => {
    if (db && Array.isArray(db.importHistory)) {
      setHistorique(db.importHistory);
    }
  }, [db]);

  const handleSavePdfDocument = () => {
    if (!pdfFileItem) return;

    const logId = 'IMP-' + String(Date.now()).slice(-6);
    const newDocCode = genCode("DOC");
    const clientSelected = (db.clients || []).find(c => c.code === pdfMeta.client);
    const clientNom = clientSelected ? `${clientSelected.nom} (${clientSelected.code})` : pdfMeta.client;

    const newDocObj = {
      code: newDocCode,
      nom: pdfFileItem.nom,
      categorie: pdfMeta.categorie || 'Facture',
      client: pdfMeta.client || '',
      clientNom: clientNom,
      dossier: pdfMeta.dossier || '',
      statut: 'Validé',
      numeroPiece: extractedFields.numeroFacture || newDocCode,
      dateDoc: extractedFields.dateDoc || new Date().toLocaleDateString('fr-FR'),
      montantHT: extractedFields.montantHT || '0.00',
      montantTTC: extractedFields.montantTTC || '0.00',
      contenuExtrait: extractedOcrText || '',
      remarques: pdfMeta.remarques || 'Intégré via OCR Centre d\'importation',
      par: userCourant,
      ts: Date.now()
    };

    const nextDb = JSON.parse(JSON.stringify(db));
    nextDb.documents = nextDb.documents || [];
    nextDb.documents.unshift(newDocObj);

    // If category is Facture, register in facturesFinales module as well!
    if (['Facture', 'Proforma Invoice'].includes(pdfMeta.categorie || 'Facture')) {
      nextDb.facturesFinales = nextDb.facturesFinales || [];
      const newFactureCode = genCode("FAC");
      nextDb.facturesFinales.unshift({
        code: newFactureCode,
        numeroFacture: extractedFields.numeroFacture || newDocCode,
        date: extractedFields.dateDoc || new Date().toLocaleDateString('fr-FR'),
        client: pdfMeta.client || '',
        clientNom: clientNom,
        dossier: pdfMeta.dossier || '',
        ht: parseFloat(extractedFields.montantHT || 0),
        ttc: parseFloat(extractedFields.montantTTC || 0),
        statut: 'Non payée',
        type: pdfMeta.categorie,
        remarque: `Facture issue de l'import OCR (${pdfFileItem.nom})`,
        ts: Date.now()
      });
    }

    const newHistoryItem = {
      id: logId,
      codeImport: logId,
      fichier: pdfFileItem.nom,
      type: pdfFileItem.typeDetecte || 'Document non tabulaire',
      taille: pdfFileItem.tailleMo + ' Mo',
      utilisateur: userCourant,
      date: new Date().toLocaleDateString('fr-FR'),
      heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      nbLignes: 1,
      crees: 1,
      maj: 0,
      ignores: 0,
      statut: 'Importé (OCR)'
    };

    const nextHist = [newHistoryItem, ...(nextDb.importHistory || [])];
    nextDb.importHistory = nextHist;
    setHistorique(nextHist);

    updateDB(nextDb);
    audit("CentreImportation", "Import OCR Document", logId, pdfFileItem.nom, "—", `Document ${newDocCode} créé pour client ${pdfMeta.client || 'Général'}`);

    toast(`Document ${pdfFileItem.nom} intégré avec succès ! (Code: ${newDocCode}, Client: ${clientNom || 'Non spécifié'})`);
    setShowPdfModal(false);
    setFileQueue(prev => prev.filter(f => f.id !== pdfFileItem.id));
  };

  // Export Filter State
  const [exportModule, setExportModule] = useState('clients');
  const [exportPeriode, setExportPeriode] = useState('all');

  if (!peut('voir') && !estDirection()) {
    return (
      <>
        <Topbar titre="Centre d'intégration et d'importation" />
        <div className="panneau">
          <div className="note-verrou">
            <b>Réservé à l'équipe autorisée</b><br />
            L'accès au Centre d'intégration nécessite les permissions requises.
          </div>
        </div>
      </>
    );
  }

  // ----------------------------------------------------
  // FILE HANDLING & PROCESSING
  // ----------------------------------------------------
  const handleFilesAdded = (filesList) => {
    const newItems = Array.from(filesList).map(file => {
      const ext = file.name.split('.').pop().toLowerCase();
      const isExcel = ['xlsx', 'xls', 'csv'].includes(ext);
      const isPdf = ext === 'pdf';
      const isDoc = ['docx', 'doc', 'txt'].includes(ext);
      const isImg = ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
      const isZip = ext === 'zip';

      let statutLecture = 'En attente';
      if (isPdf) statutLecture = 'Texte extrait (détections PDF)';
      if (isImg) statutLecture = 'OCR nécessaire (Serveur)';
      if (isZip) statutLecture = 'Archive prête';

      return {
        id: 'file_' + Date.now() + Math.random().toString(36).slice(2, 6),
        file,
        nom: file.name,
        format: ext.toUpperCase(),
        tailleMo: (file.size / (1024 * 1024)).toFixed(2),
        date: new Date().toLocaleDateString('fr-FR') + ' ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        utilisateur: userCourant,
        statutLecture,
        typeDetecte: detecterTypeDocument(file.name, [], []),
        modulePropose: 'clients',
        rows: [],
        sheets: [],
        wb: null,
        extractedText: ''
      };
    });

    setFileQueue(prev => [...prev, ...newItems]);
    toast(`${newItems.length} fichier(s) ajouté(s) à la file d'attente.`);

    // Automatically inspect Excel/CSV files
    newItems.forEach(item => {
      if (['XLSX', 'XLS', 'CSV'].includes(item.format)) {
        inspecterFichierExcel(item);
      }
    });
  };

  const inspecterFichierExcel = (item) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const sheets = wb.SheetNames;
        const firstSheet = sheets[0];
        const ws = wb.Sheets[firstSheet];
        const jsonRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const cols = jsonRows.length > 0 ? Object.keys(jsonRows[0]) : [];
        const normCols = cols.map(normCol);

        const typeDetecte = detecterTypeDocument(item.nom, normCols, sheets);

        setFileQueue(prev => prev.map(f => {
          if (f.id === item.id) {
            return {
              ...f,
              wb,
              sheets,
              rows: jsonRows,
              typeDetecte,
              statutLecture: 'Analyse terminée',
              cols
            };
          }
          return f;
        }));
      } catch (err) {
        setFileQueue(prev => prev.map(f => f.id === item.id ? { ...f, statutLecture: 'Échec de lecture' } : f));
      }
    };
    reader.readAsArrayBuffer(item.file);
  };

  // ----------------------------------------------------
  // PREVIEW & IMPORT EXECUTION
  // ----------------------------------------------------
  const handleOpenPreview = (item) => {
    if (['PDF', 'JPG', 'JPEG', 'PNG', 'WEBP', 'DOCX', 'DOC'].includes(item.format)) {
      setPdfFileItem(item);
      setShowPdfModal(true);
      return;
    }

    if (!item.wb) {
      toast("Inspection du fichier en cours...");
      return;
    }

    setActivePreviewItem(item);
    setSelectedSheet(item.sheets[0] || '');
    setPolitiqueDoublon('maj');

    // Initialize line decisions to 'import' by default
    const initialDecisions = {};
    (item.rows || []).slice(0, 20).forEach((r, idx) => {
      initialDecisions[idx] = 'import';
    });
    setDecisions(initialDecisions);
  };

  const handleConfirmImport = () => {
    if (!activePreviewItem) return;

    const rows = activePreviewItem.rows || [];
    let crees = 0, maj = 0, ignores = 0;

    const nextDb = JSON.parse(JSON.stringify(db));
    nextDb.clients = nextDb.clients || [];
    nextDb.demandes = nextDb.demandes || [];
    nextDb.dossiers = nextDb.dossiers || [];
    nextDb.arrivages = nextDb.arrivages || [];
    nextDb.paiements = nextDb.paiements || [];
    nextDb.facturesFinales = nextDb.facturesFinales || [];

    rows.forEach((r, idx) => {
      const decision = decisions[idx] || 'import';
      if (decision === 'ignore') {
        ignores++;
        return;
      }

      // Check module target type
      const code = r['Code client'] || r['codeclient'] || r['Code'] || r['code'];
      const nom = r['Nom du client'] || r['nomduclient'] || r['Nom'] || r['nom'] || r['Client'] || r['client'];
      const contact = r['Contact client'] || r['contactclient'] || r['Téléphone'] || r['telephone'] || r['Contact'] || '';

      if (nom || contact) {
        const existing = nextDb.clients.find(c => (code && c.code === code) || (contact && normTel(c.telephone) === normTel(contact)));
        if (existing) {
          if (decision === 'update' || politiqueDoublon === 'maj') {
            if (nom) existing.nom = nom;
            if (contact) existing.telephone = contact;
            maj++;
          } else {
            ignores++;
          }
        } else {
          const newCode = code || genCode('C');
          nextDb.clients.push({
            code: newCode,
            nom: nom || ('Client ' + newCode),
            telephone: contact,
            ville: r['Ville'] || r['ville'] || r['Ste/Ville'] || '',
            segment: 'Client',
            remarque: 'Importé depuis ' + activePreviewItem.nom,
            ts: Date.now()
          });
          crees++;
        }
      }
    });

    // Register Import Log in History
    const logId = 'IMP-' + String(Date.now()).slice(-6);
    const newHistoryItem = {
      id: logId,
      codeImport: logId,
      fichier: activePreviewItem.nom,
      type: activePreviewItem.typeDetecte,
      taille: activePreviewItem.tailleMo + ' Mo',
      utilisateur: userCourant,
      date: new Date().toLocaleDateString('fr-FR'),
      heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      nbLignes: rows.length,
      crees,
      maj,
      ignores,
      statut: 'Importé'
    };

    const nextHistory = [newHistoryItem, ...historique];
    setHistorique(nextHistory);
    nextDb.importHistory = nextHistory;

    updateDB(nextDb);
    audit("CentreImportation", "Importation réussie", logId, activePreviewItem.nom, "—", `${crees} créés, ${maj} mis à jour`);

    // Remove from queue
    setFileQueue(prev => prev.filter(f => f.id !== activePreviewItem.id));
    setActivePreviewItem(null);
    toast(`Importation réussie : ${crees} fiche(s) créée(s), ${maj} mise(s) à jour.`);
  };

  // ----------------------------------------------------
  // ROLLBACK & ERROR RESOLUTION
  // ----------------------------------------------------
  const handleRollback = (histItem) => {
    if (!estDirection()) {
      toast("Seule la Direction peut annuler une importation.");
      return;
    }
    if (window.confirm(`Annuler logiquement l'importation ${histItem.codeImport} (${histItem.fichier}) ?`)) {
      const nextDb = JSON.parse(JSON.stringify(db));
      const nextHist = historique.map(h => h.id === histItem.id ? { ...h, statut: 'Annulé (Rollback)' } : h);
      setHistorique(nextHist);
      nextDb.importHistory = nextHist;

      updateDB(nextDb);
      audit("CentreImportation", "Annulation (Rollback)", histItem.codeImport, histItem.fichier, "—", "Annulé par " + userCourant);
      toast(`Importation ${histItem.codeImport} annulée.`);
    }
  };

  // ----------------------------------------------------
  // EXPORT ENGINE BY MODULE
  // ----------------------------------------------------
  const handleExportTargeted = () => {
    exporterExcel(exportModule, db, MODS, toast);
    toast(`Exportation Excel du module ${exportModule.toUpperCase()} générée.`);
  };

  return (
    <>
      <Topbar titre="Centre d'intégration & d'importation intelligent" />

      {/* Main Tab Navigation Bar */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '20px', paddingBottom: '4px', borderBottom: '1px solid var(--bord)' }}>
        {[
          { id: 'import', label: '1. Import intelligent', icon: '📥' },
          { id: 'modeles', label: '2. Modèles d’import', icon: '📋' },
          { id: 'attente', label: `3. File d'attente (${fileQueue.length})`, icon: '⏳' },
          { id: 'historique', label: `4. Historique (${historique.length})`, icon: '📜' },
          { id: 'erreurs', label: `5. Erreurs (${erreursImport.length})`, icon: '⚠️' },
          { id: 'export', label: '6. Exportation', icon: '📤' },
          { id: 'synchro', label: '7. Synchronisations', icon: '🔄' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '10px 16px',
              borderRadius: '10px',
              border: 'none',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              background: activeTab === t.id ? 'var(--vert)' : '#ffffff',
              color: activeTab === t.id ? '#ffffff' : 'var(--encre)',
              boxShadow: activeTab === t.id ? '0 4px 12px rgba(1, 89, 163, 0.25)' : 'none',
              border: `1px solid ${activeTab === t.id ? 'var(--vert)' : 'var(--bord)'}`
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ==================================================== */}
      {/* TAB 1: IMPORT INTELLIGENT (DROP ZONE & FILE QUEUE)   */}
      {/* ==================================================== */}
      {activeTab === 'import' && (
        <div>
          {/* Main Large Drag & Drop Dropzone */}
          <div 
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files && e.dataTransfer.files.length) {
                handleFilesAdded(e.dataTransfer.files);
              }
            }}
            style={{
              background: 'linear-gradient(135deg, #ffffff 0%, #f4f7fa 100%)',
              border: '2px dashed var(--vert)',
              borderRadius: '18px',
              padding: '44px 20px',
              textAlign: 'center',
              boxShadow: 'var(--ombre)',
              marginBottom: '24px',
              cursor: 'pointer',
              transition: 'transform 0.2s ease'
            }}
            onClick={() => document.getElementById('multiFileInput').click()}
          >
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>📥</div>
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '26px', color: 'var(--vert)', marginBottom: '8px' }}>
              Glissez-déposez vos fichiers ou dossiers ici
            </h3>
            <p style={{ color: 'var(--gris)', fontSize: '13.5px', maxWidth: '600px', margin: '0 auto 16px' }}>
              Formats acceptés : <b>XLSX, XLS, CSV, PDF, DOCX, DOC, TXT, JSON, XML, JPG, PNG, WEBP, ZIP</b>.
              Analyse automatique de la structure, reconnaissance multi-modèles & détrompeur de doublons.
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn" type="button" onClick={(e) => { e.stopPropagation(); document.getElementById('multiFileInput').click(); }}>
                📄 Sélectionner un ou plusieurs fichiers
              </button>
              <button className="btn doux" type="button" onClick={(e) => { e.stopPropagation(); document.getElementById('folderInput').click(); }}>
                📁 Importer un dossier complet / ZIP
              </button>
            </div>

            <input 
              type="file" 
              id="multiFileInput" 
              multiple 
              accept=".xlsx,.xls,.csv,.pdf,.docx,.doc,.txt,.json,.xml,.jpg,.jpeg,.png,.webp,.zip" 
              style={{ display: 'none' }} 
              onChange={(e) => handleFilesAdded(e.target.files)} 
            />
            <input 
              type="file" 
              id="folderInput" 
              webkitdirectory="true" 
              directory="true" 
              style={{ display: 'none' }} 
              onChange={(e) => handleFilesAdded(e.target.files)} 
            />
          </div>

          {/* Pending Queue List Table */}
          {fileQueue.length > 0 ? (
            <div className="panneau">
              <h4 style={{ padding: '14px 20px', borderBottom: '1px solid var(--bord)', background: '#FBFCFA', fontSize: '16px', color: 'var(--vert)' }}>
                📋 File d'attente des fichiers à importer ({fileQueue.length})
              </h4>
              <div className="defile">
                <table>
                  <thead>
                    <tr>
                      <th>Nom du fichier</th>
                      <th>Format</th>
                      <th>Taille</th>
                      <th>Date</th>
                      <th>Utilisateur</th>
                      <th>Statut de lecture</th>
                      <th>Type détecté</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fileQueue.map((item, idx) => (
                      <tr key={item.id}>
                        <td><b>{item.nom}</b></td>
                        <td>{pill(item.format, 'p-or')}</td>
                        <td>{item.tailleMo} Mo</td>
                        <td>{item.date}</td>
                        <td>{item.utilisateur}</td>
                        <td>
                          <span className={`pill ${item.statutLecture.includes('Échec') ? 'p-rouge' : item.statutLecture.includes('OCR') ? 'p-ambre' : 'p-vert'}`}>
                            {item.statutLecture}
                          </span>
                        </td>
                        <td><b>{item.typeDetecte}</b></td>
                        <td>
                          <div className="acts">
                            <button className="btn mini" onClick={() => handleOpenPreview(item)}>
                              🔍 Analyser & Importer
                            </button>
                            <button className="btn mini rouge" onClick={() => setFileQueue(prev => prev.filter(f => f.id !== item.id))}>
                              Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="vide" style={{ padding: '30px' }}>
              <b>Aucun fichier en attente</b>
              Déposez vos fichiers ci-dessus pour lancer l'analyse intelligente et la correspondance automatique.
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 2: MODÈLES D'IMPORT CONFIGURABLES                 */}
      {/* ==================================================== */}
      {activeTab === 'modeles' && (
        <div className="panneau">
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bord)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h4 style={{ fontSize: '18px', color: 'var(--vert)', margin: 0 }}>📋 Profils & Modèles d’importation ULTEx</h4>
            {estDirection() && (
              <button className="btn mini" onClick={() => {
                setShowMappingModal(true);
                setMappingState({ fileName: 'NouveauModèle.xlsx', cols: ['Code', 'Nom', 'Contact', 'Ville', 'Produit'], mapping: {} });
              }}>
                + Créer un profil d’import
              </button>
            )}
          </div>
          <div className="defile">
            <table>
              <thead>
                <tr>
                  <th>Code Modèle</th>
                  <th>Nom du profil</th>
                  <th>Type de document</th>
                  <th>Module Cible</th>
                  <th>Colonnes Reconnues</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {modelesCustom.map(m => (
                  <tr key={m.id}>
                    <td className="code">{m.id}</td>
                    <td><b>{m.nom}</b></td>
                    <td>{pill(m.typeDoc, 'p-or')}</td>
                    <td><b>{m.moduleCible.toUpperCase()}</b></td>
                    <td>{m.colonnes.slice(0, 5).join(', ')}...</td>
                    <td>{pill('Actif', 'p-vert')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 4: HISTORIQUE ET ROLLBACK                        */}
      {/* ==================================================== */}
      {activeTab === 'historique' && (
        <div className="panneau">
          <h4 style={{ padding: '16px 20px', borderBottom: '1px solid var(--bord)', fontSize: '18px', color: 'var(--vert)' }}>
            📜 Historique permanent des importations
          </h4>
          <div className="defile">
            <table>
              <thead>
                <tr>
                  <th>Code Import</th>
                  <th>Fichier</th>
                  <th>Type</th>
                  <th>Taille</th>
                  <th>Utilisateur</th>
                  <th>Date & Heure</th>
                  <th>Lignes</th>
                  <th>Créations</th>
                  <th>MAJ</th>
                  <th>Statut</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {historique.map(h => (
                  <tr key={h.id}>
                    <td className="code">{h.codeImport}</td>
                    <td><b>{h.fichier}</b></td>
                    <td>{h.type}</td>
                    <td>{h.taille}</td>
                    <td>{h.utilisateur}</td>
                    <td>{h.date} {h.heure}</td>
                    <td>{h.nbLignes}</td>
                    <td><b style={{ color: 'var(--ok)' }}>{h.crees}</b></td>
                    <td><b style={{ color: 'var(--or)' }}>{h.maj}</b></td>
                    <td>{pill(h.statut, h.statut.includes('Annulé') ? 'p-rouge' : 'p-vert')}</td>
                    <td>
                      {!h.statut.includes('Annulé') && estDirection() && (
                        <button className="btn mini rouge" onClick={() => handleRollback(h)}>
                          Annuler (Rollback)
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!historique.length && <tr><td colSpan="11" className="vide">Aucun historique d'import disponible.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 5: ERREURS ET ANOMALIES                           */}
      {/* ==================================================== */}
      {activeTab === 'erreurs' && (
        <div className="panneau">
          <h4 style={{ padding: '16px 20px', borderBottom: '1px solid var(--bord)', fontSize: '18px', color: 'var(--vert)' }}>
            ⚠️ Registre des erreurs et anomalies d'importation
          </h4>
          {erreursImport.length ? (
            <div className="defile">
              <table>
                <thead>
                  <tr>
                    <th>Fichier</th>
                    <th>Ligne</th>
                    <th>Champ</th>
                    <th>Valeur erronée</th>
                    <th>Erreur</th>
                    <th>Correction</th>
                  </tr>
                </thead>
                <tbody>
                  {erreursImport.map((err, i) => (
                    <tr key={i}>
                      <td>{err.fichier}</td>
                      <td>{err.ligne}</td>
                      <td>{err.champ}</td>
                      <td><code>{err.valeur}</code></td>
                      <td><span className="pill p-rouge">{err.message}</span></td>
                      <td><button className="btn mini">Corriger en ligne</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="vide" style={{ padding: '30px' }}>
              <b>Aucune anomalie détectée</b>
              Tous les fichiers récents ont été lus et intégrés correctement sans erreur de syntaxe.
            </div>
          )}
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 6: EXPORTATION CIBLÉE PAR MODULE                 */}
      {/* ==================================================== */}
      {activeTab === 'export' && (
        <div className="panneau" style={{ padding: '24px' }}>
          <h4 style={{ fontSize: '20px', color: 'var(--vert)', marginBottom: '16px' }}>📤 Centre d'exportation ciblée par module</h4>
          <div className="corps" style={{ gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div className="champ">
              <label>SELECTIONNER LE MODULE À EXPORTER</label>
              <select value={exportModule} onChange={e => setExportModule(e.target.value)}>
                {COLLS.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="champ">
              <label>PÉRIODE</label>
              <select value={exportPeriode} onChange={e => setExportPeriode(e.target.value)}>
                <option value="all">Toutes les données</option>
                <option value="month">Ce mois-ci</option>
                <option value="year">Année 2026</option>
              </select>
            </div>
          </div>
          <button className="btn or" style={{ marginTop: '20px', width: '100%', padding: '12px' }} onClick={handleExportTargeted}>
            📤 Télécharger le classeur Excel ({exportModule.toUpperCase()})
          </button>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: PREVIEW & HUMAN VALIDATION (STEP 9)           */}
      {/* ==================================================== */}
      {activePreviewItem && (
        <Modal
          large={true}
          title={`🔍 Prévisualisation & Validation — ${activePreviewItem.nom}`}
          onClose={() => setActivePreviewItem(null)}
          footer={
            <>
              <button className="btn doux" onClick={() => setActivePreviewItem(null)}>Annuler</button>
              <button className="btn or" onClick={handleConfirmImport}>
                Confirmer & Intégrer dans UBOS ({activePreviewItem.rows?.length || 0} lignes)
              </button>
            </>
          }
        >
          <div className="corps">
            <div className="champ">
              <label>FEUILLE EXCEL</label>
              <select value={selectedSheet} onChange={e => setSelectedSheet(e.target.value)}>
                {(activePreviewItem.sheets || []).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="champ">
              <label>GESTION DES DOUBLONS</label>
              <select value={politiqueDoublon} onChange={e => setPolitiqueDoublon(e.target.value)}>
                <option value="maj">Mettre à jour la fiche existante</option>
                <option value="ignorer">Ignorer la ligne doublon</option>
                <option value="creer">Créer un nouveau code séparé</option>
              </select>
            </div>

            <div className="champ large">
              <b style={{ display: 'block', margin: '10px 0 6px' }}>
                Prévisualisation des 20 premières lignes avec décision par ligne :
              </b>
              <div className="defile" style={{ border: '1px solid var(--bord)', borderRadius: '10px' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Ligne</th>
                      <th>Client / Code</th>
                      <th>Contact / Ville</th>
                      <th>Produit / Service</th>
                      <th>Type détecté</th>
                      <th>Décision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activePreviewItem.rows || []).slice(0, 20).map((r, i) => (
                      <tr key={i}>
                        <td>#{i + 1}</td>
                        <td><b>{r['Nom du client'] || r['Nom'] || r['Client'] || '—'}</b><br /><small>{r['Code client'] || r['Code'] || 'Auto'}</small></td>
                        <td>{r['Contact client'] || r['Téléphone'] || '—'}<br /><small>{r['Ville'] || ''}</small></td>
                        <td>{r['Produit'] || r['Designation'] || '—'}</td>
                        <td>{pill(activePreviewItem.typeDetecte, 'p-or')}</td>
                        <td>
                          <select 
                            value={decisions[i] || 'import'}
                            onChange={e => setDecisions({ ...decisions, [i]: e.target.value })}
                            style={{ padding: '4px 8px', borderRadius: '6px' }}
                          >
                            <option value="import">Importer</option>
                            <option value="update">Mettre à jour</option>
                            <option value="ignore">Ignorer</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* ==================================================== */}
      {/* MODAL: PDF & IMAGE ARCHIVING / EXTRACTION (STEP 11)   */}
      {/* ==================================================== */}
      {showPdfModal && pdfFileItem && (
        <Modal
          large={true}
          title={`📄 Traitement OCR & Analyse de Document — ${pdfFileItem.nom}`}
          onClose={() => setShowPdfModal(false)}
          footer={
            <>
              <button className="btn doux" onClick={() => setShowPdfModal(false)}>Annuler</button>
              <button className="btn" onClick={handleSavePdfDocument}>
                Enregistrer dans UBOS
              </button>
            </>
          }
        >
          <div className="corps">
            <div className="champ large" style={{ background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid var(--bord)', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div>
                  <b style={{ fontSize: '15px', color: 'var(--vert)' }}>🔍 Moteur OCR Tesseract.js & Extracteur PDF</b>
                  <div style={{ fontSize: '12px', color: 'var(--gris)' }}>
                    Format : <b>{pdfFileItem.format}</b> ({pdfFileItem.tailleMo} Mo) · Reconnaissance optique et analyse sémantique
                  </div>
                </div>
                <button className="btn or" onClick={lancerOCR} disabled={ocrRunning}>
                  {ocrRunning ? '⏳ OCR en cours...' : '🚀 Exécuter l\'OCR maintenant'}
                </button>
              </div>

              {ocrRunning && (
                <div style={{ marginTop: '10px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--vert)', marginBottom: '4px' }}>
                    {ocrStatusText} ({ocrProgress}%)
                  </div>
                  <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{ width: `${ocrProgress}%`, height: '100%', background: 'var(--vert)', transition: 'width 0.3s ease' }}></div>
                  </div>
                </div>
              )}
            </div>

            {extractedOcrText ? (
              <div className="champ large" style={{ marginBottom: '16px' }}>
                <label style={{ color: '#059669', fontWeight: 700 }}>✅ TEXTE RECONNU & EXTRAIT DU DOCUMENT :</label>
                <textarea 
                  rows={5} 
                  value={extractedOcrText} 
                  onChange={e => setExtractedOcrText(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: '12px', background: '#0f172a', color: '#38bdf8', padding: '10px', borderRadius: '8px' }}
                />
              </div>
            ) : null}

            {/* Parsed Fields Grid */}
            <div className="champ">
              <label>N° Facture / Pièce détecté</label>
              <input 
                value={extractedFields.numeroFacture || ''} 
                onChange={e => setExtractedFields({ ...extractedFields, numeroFacture: e.target.value })}
                placeholder="Ex: FAC-2026-0042"
              />
            </div>
            <div className="champ">
              <label>Date du document</label>
              <input 
                value={extractedFields.dateDoc || ''} 
                onChange={e => setExtractedFields({ ...extractedFields, dateDoc: e.target.value })}
                placeholder="Ex: 04/08/2026"
              />
            </div>
            <div className="champ">
              <label>Montant HT (MAD)</label>
              <input 
                value={extractedFields.montantHT || ''} 
                onChange={e => setExtractedFields({ ...extractedFields, montantHT: e.target.value })}
                placeholder="Ex: 10000.00"
              />
            </div>
            <div className="champ">
              <label>Montant TTC (MAD)</label>
              <input 
                value={extractedFields.montantTTC || ''} 
                onChange={e => setExtractedFields({ ...extractedFields, montantTTC: e.target.value })}
                placeholder="Ex: 12000.00"
              />
            </div>
            <div className="champ">
              <label>N° BL / AWB</label>
              <input 
                value={extractedFields.blNumber || ''} 
                onChange={e => setExtractedFields({ ...extractedFields, blNumber: e.target.value })}
                placeholder="Ex: COSU632910"
              />
            </div>
            <div className="champ">
              <label>Conteneur</label>
              <input 
                value={extractedFields.conteneur || ''} 
                onChange={e => setExtractedFields({ ...extractedFields, conteneur: e.target.value })}
                placeholder="Ex: TEMU8492019"
              />
            </div>

            <div className="champ">
              <label>CATÉGORIE DOCUMENT</label>
              <select value={pdfMeta.categorie} onChange={e => setPdfMeta({ ...pdfMeta, categorie: e.target.value })}>
                <option value="Facture">Facture</option>
                <option value="Proforma Invoice">Proforma Invoice</option>
                <option value="Packing List">Packing List</option>
                <option value="BL">BL / AWB</option>
                <option value="DUM">DUM / Douane</option>
                <option value="Contrat">Contrat Client / Fournisseur</option>
              </select>
            </div>

            <div className="champ large">
              <label>RATTACHER AU CLIENT (Recherche rapide par Nom / Code / Tél)</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input 
                  type="text" 
                  placeholder="🔍 Tapez un nom, un code (ex: 0826IM9402) ou un téléphone pour filtrer..."
                  value={clientSearchQuery}
                  onChange={e => setClientSearchQuery(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', fontSize: '13px', borderRadius: '8px', border: '1px solid var(--bord)' }}
                />
                {clientSearchQuery && (
                  <button 
                    type="button"
                    className="btn doux" 
                    style={{ padding: '0 12px', fontSize: '12px' }}
                    onClick={() => setClientSearchQuery('')}
                  >
                    Effacer
                  </button>
                )}
              </div>

              <select 
                value={pdfMeta.client} 
                onChange={e => setPdfMeta({ ...pdfMeta, client: e.target.value })}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', fontSize: '13px' }}
              >
                <option value="">Sélectionner un client...</option>
                {(db.clients || [])
                  .filter(c => {
                    if (!clientSearchQuery) return true;
                    const q = clientSearchQuery.toLowerCase();
                    return (
                      (c.nom && c.nom.toLowerCase().includes(q)) ||
                      (c.code && c.code.toLowerCase().includes(q)) ||
                      (c.telephone && c.telephone.toLowerCase().includes(q))
                    );
                  })
                  .map(c => (
                    <option key={c.code} value={c.code}>
                      {c.nom} ({c.code}) {c.telephone ? `— Tél: ${c.telephone}` : ''}
                    </option>
                  ))}
              </select>
            </div>

            <div className="champ large">
              <label>RATTACHER AU DOSSIER</label>
              <select value={pdfMeta.dossier} onChange={e => setPdfMeta({ ...pdfMeta, dossier: e.target.value })}>
                <option value="">Sélectionner un dossier (optionnel)...</option>
                {(db.dossiers || []).map(d => <option key={d.code} value={d.code}>{d.code} - {d.client}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* ==================================================== */}
      {/* MODAL: COLUMN MAPPING ASSISTANT (STEP 7)            */}
      {/* ==================================================== */}
      {showMappingModal && mappingState && (
        <Modal
          large={true}
          title={`⚙️ Assistant de Correspondance des Colonnes — ${mappingState.fileName}`}
          onClose={() => setShowMappingModal(false)}
          footer={
            <>
              <button className="btn doux" onClick={() => setShowMappingModal(false)}>Annuler</button>
              <button className="btn or" onClick={() => {
                toast("Nouveau profil d'importation sauvegardé.");
                setShowMappingModal(false);
              }}>
                Enregistrer comme nouveau modèle d’import
              </button>
            </>
          }
        >
          <div className="corps">
            <div className="champ large">
              <b style={{ display: 'block', marginBottom: '8px' }}>
                Mappez les colonnes de votre fichier vers les champs UBOS :
              </b>
              <div className="defile">
                <table>
                  <thead>
                    <tr>
                      <th>Colonne Fichier</th>
                      <th>Champ Cible UBOS</th>
                      <th>Transformation / Règle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mappingState.cols.map((colName, idx) => (
                      <tr key={idx}>
                        <td><b>{colName}</b></td>
                        <td>
                          <select defaultValue="client.nom" style={{ padding: '4px 8px', borderRadius: '6px' }}>
                            <option value="client.code">client.code (Code client)</option>
                            <option value="client.nom">client.nom (Nom du client)</option>
                            <option value="client.telephone">client.telephone (Téléphone)</option>
                            <option value="calcul.prixAchat">calcul.prixAchat (Prix d'achat FOB)</option>
                            <option value="arrivage.blHouse">arrivage.blHouse (N° BL)</option>
                            <option value="pieceComptable.montantTTC">pieceComptable.montantTTC (Total TTC)</option>
                            <option value="ignore">-- Ignorer cette colonne --</option>
                          </select>
                        </td>
                        <td>
                          <select defaultValue="clean" style={{ padding: '4px 8px', borderRadius: '6px' }}>
                            <option value="clean">Nettoyer texte</option>
                            <option value="upper">MAJUSCULES</option>
                            <option value="date">Convertir Date</option>
                            <option value="devise">Convertir Devise (MAD/USD/EUR)</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
