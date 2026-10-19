import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Boxes, Check, ChevronLeft, ChevronRight, ClipboardCheck,
  FileDown, FileText, Package, Save, Send, ShoppingCart, Truck, UserRound, Users,
} from 'lucide-react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import ModuleForm from '../modules/ModuleForm';
import ArrivageChat from '../arrivages/ArrivageChat';
import { MODS } from '../../data/modules';
import { openStoredDocument } from '../../services/api';
import {
  LIMEX_DIRECTION_SECTIONS,
  LIMEX_DIRECTION_STATUSES,
  buildDirectionAnalysisContext,
  canonicalDirectionStatus,
  createDirectionAnalysisDraft,
  directionFinalCheck,
  directionProductKey,
  freezeDirectionAnalysisVersion,
  missingDirectionInformation,
  sectionProgress,
  summarizeDirectionAnalysis,
} from '../../utils/arrivageDirectionAnalysis';
import {
  ACTIONS_REVUE_ARRIVAGE, destinataireImane, ETATS_REVUE_ARRIVAGE, transitionRevueArrivage,
} from '../../utils/arrivageWorkflow';
import './AnalyseArrivageDirection.css';

const TAB_ITEMS = [
  ['analysis', 'Analyse LIMEX'], ['orders', 'Commandes liées'], ['products', 'Produits'],
  ['suppliers', 'Fournisseurs'], ['documents', 'Documents'], ['chat', 'Discussion'], ['history', 'Historique'],
];

const STATUS_CLASS = {
  Conforme: 'limex-status-ok',
  'À vérifier': 'limex-status-warning',
  'Non examiné': 'limex-status-neutral',
  'Pas encore disponible': 'limex-status-neutral',
  'À corriger': 'limex-status-danger',
  'Information manquante': 'limex-status-danger',
  'En attente de complément': 'limex-status-info',
  'Réponse saisie': 'limex-status-info',
  Reçu: 'limex-status-ok',
  Bloquant: 'limex-status-blocked',
  'Non applicable': 'limex-status-neutral',
};

const FIELD_LABELS = {
  urgency: 'Urgence globale', informationLevel: "Niveau d'information", generalObservation: 'Observation générale',
  immediateAttention: "Points d'attention", complements: 'Compléments à demander', mainSource: 'Source principale',
  controlStatus: 'Statut du contrôle', blockage: 'Blocage', releaseCondition: 'Condition de levée',
  directionValidation: 'Validation Direction', mainObservations: 'Principales observations',
  directionDecisions: 'Décisions / Conditions Direction', identifiedRisks: 'Risques identifiés',
  decisionRequired: 'Décision requise', decisionApproved: 'Autorisation Direction',
  nextActionsForImane: 'Instructions à transmettre à Imane', analysisLevel: "Niveau d'analyse", analysisTarget: "Cible de l'analyse",
};

const unique = values => [...new Set(values.filter(Boolean))];
const displayDate = value => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
};
const displayDateTime = value => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('fr-FR', { timeZone: 'UTC' });
};

function statusLabel(status) {
  const canonical = canonicalDirectionStatus(status);
  return <span className={`limex-status ${STATUS_CLASS[canonical] || 'limex-status-neutral'}`}>{canonical}</span>;
}

const stableDraft = draft => JSON.stringify({
  ...draft,
  activeSection: undefined,
  selectedProductIndex: undefined,
  updatedAt: undefined,
  autosavedAt: undefined,
  analysePar: undefined,
  dateAnalyse: undefined,
});

function withHistory(current, path, label, before, after, user, documentCode = '') {
  if (JSON.stringify(before ?? '') === JSON.stringify(after ?? '')) return current;
  const now = new Date().toISOString();
  const history = [...(current.changeHistory || [])];
  const last = history[0];
  if (last?.path === path && last?.user === user && Date.parse(now) - Date.parse(last.date) < 4000) {
    history[0] = { ...last, after, date: now, documentCode: documentCode || last.documentCode || '' };
  } else {
    history.unshift({ id: `CHG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, path, label, before, after, user, date: now, documentCode });
  }
  return { ...current, changeHistory: history.slice(0, 1000) };
}

export default function AnalyseArrivageDirection({ arrivage }) {
  const { db, updateDB, genCode, audit, notifier, userCourant } = useDB();
  const { peut } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('analysis');
  const [showDocumentForm, setShowDocumentForm] = useState(null);
  const [autoSaveState, setAutoSaveState] = useState('Enregistré');
  const dbRef = useRef(db);
  const lastSavedRef = useRef('');
  const autoSaveTimerRef = useRef(null);
  const analysisCodeRef = useRef(null);
  const existing = useMemo(
    () => (db.analysesLimex || []).find(item => item.arrivage === arrivage.code),
    [db.analysesLimex, arrivage.code],
  );
  const context = useMemo(() => buildDirectionAnalysisContext(db, arrivage), [db, arrivage]);
  const seed = useMemo(() => createDirectionAnalysisDraft(db, arrivage, existing), [db, arrivage, existing]);
  const [draft, setDraft] = useState(seed);

  // Reload only when another arrival is opened or a persisted analysis version changes.
  // Using the whole DB here would erase unsaved Direction notes whenever a notification arrives.
  /* oxlint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    setDraft(seed);
    lastSavedRef.current = stableDraft(seed);
    analysisCodeRef.current = existing?.code || null;
  }, [arrivage.code, existing?.updatedAt]);
  /* oxlint-enable react-hooks/exhaustive-deps */

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  useEffect(() => {
    const linkedDocuments = context.documents.filter(document => document.phaseLimex && document.controleLimex);
    if (!linkedDocuments.length) return;
    setDraft(current => {
      let next = current;
      linkedDocuments.forEach(document => {
        const productKey = document.produitLimex || '';
        const existingControl = productKey
          ? current.productControls?.[productKey]?.[document.phaseLimex]?.[document.controleLimex]
          : current.controls?.[document.phaseLimex]?.[document.controleLimex];
        if (!existingControl || existingControl.documentCode === document.code) return;
        if (productKey) {
          next = {
            ...next,
            productControls: {
              ...next.productControls,
              [productKey]: {
                ...next.productControls?.[productKey],
                [document.phaseLimex]: {
                  ...next.productControls?.[productKey]?.[document.phaseLimex],
                  [document.controleLimex]: { ...existingControl, current: document.nom || document.code, documentCode: document.code, status: 'À vérifier' },
                },
              },
            },
          };
        } else {
          next = {
            ...next,
            controls: {
              ...next.controls,
              [document.phaseLimex]: {
                ...next.controls?.[document.phaseLimex],
                [document.controleLimex]: { ...existingControl, current: document.nom || document.code, documentCode: document.code, status: 'À vérifier' },
              },
            },
          };
        }
      });
      return next;
    });
  }, [context.documents]);

  const canEdit = peut('modifier') && arrivage.circuitValidation === ETATS_REVUE_ARRIVAGE.DIRECTION;
  const sectionIndex = Math.max(0, LIMEX_DIRECTION_SECTIONS.findIndex(section => section.id === draft.activeSection));
  const section = LIMEX_DIRECTION_SECTIONS[sectionIndex];
  const selectedProductIndex = Math.min(Number(draft.selectedProductIndex || 0), Math.max(0, context.lines.length - 1));
  const selectedProduct = context.lines[selectedProductIndex];
  const selectedProductKey = selectedProduct ? directionProductKey(selectedProduct, selectedProductIndex) : '';
  const primaryOrder = context.commandes[0];
  const primaryClient = context.clients[0];
  const primaryDemandCode = primaryOrder?.demande || primaryOrder?.source_demande_id || selectedProduct?.demande;
  const primaryDemand = (db.demandes || []).find(item => item.code === primaryDemandCode);
  const sectionControls = section.productScoped && selectedProductKey
    ? (draft.productControls?.[selectedProductKey]?.[section.id] || {})
    : (draft.controls?.[section.id] || {});
  const progress = sectionProgress(draft, section.id, section.productScoped ? selectedProductKey : '');
  const summary = summarizeDirectionAnalysis(draft);
  const finalCheck = directionFinalCheck(draft);
  const missing = missingDirectionInformation(draft);
  const sectionMissing = missing.filter(item => item.sectionId === section.id);
  const createdEntry = [...(arrivage.circuitHistorique || [])].at(-1);
  const clientsCount = context.clients.length;
  const productsCount = context.lines.length || (arrivage.produitSource ? 1 : 0);
  const statusText = canEdit ? 'Analyse en cours' : (draft.status || arrivage.circuitValidation || 'Consultation');

  const updateDraft = patch => setDraft(current => {
    let next = { ...current, ...patch };
    Object.entries(patch).forEach(([key, value]) => {
      if (['activeSection', 'selectedProductIndex'].includes(key)) return;
      next = withHistory(next, key, FIELD_LABELS[key] || key, current[key], value, userCourant);
    });
    return next;
  });
  const updateControl = (itemId, patch) => setDraft(current => {
    const productScoped = section.productScoped && selectedProductKey;
    const previous = productScoped
      ? (current.productControls?.[selectedProductKey]?.[section.id]?.[itemId] || {})
      : (current.controls?.[section.id]?.[itemId] || {});
    let next = productScoped ? {
      ...current,
      productControls: {
        ...current.productControls,
        [selectedProductKey]: {
          ...current.productControls?.[selectedProductKey],
          [section.id]: {
            ...current.productControls?.[selectedProductKey]?.[section.id],
            [itemId]: { ...previous, ...patch },
          },
        },
      },
    } : {
      ...current,
      controls: {
        ...current.controls,
        [section.id]: { ...current.controls?.[section.id], [itemId]: { ...previous, ...patch } },
      },
    };
    Object.entries(patch).forEach(([key, value]) => {
      next = withHistory(
        next,
        `${productScoped ? `productControls.${selectedProductKey}` : 'controls'}.${section.id}.${itemId}.${key}`,
        `${section.title} · ${section.items.find(item => item.id === itemId)?.label || itemId} · ${key}`,
        previous[key], value, userCourant, key === 'documentCode' ? value : previous.documentCode,
      );
    });
    return next;
  });

  const openDocument = async document => {
    if (!document) {
      toast('Document introuvable.');
      return;
    }
    try {
      const directUrl = document.url || (String(document.fichier || '').startsWith('data:') ? document.fichier : '');
      if (directUrl) {
        window.open(directUrl, '_blank', 'noopener,noreferrer');
        return;
      }
      if (document.storagePath) {
        await openStoredDocument(document.code);
        return;
      }
      toast(`Aucun fichier n'est attaché à « ${document.nom || document.code} ».`);
    } catch (error) {
      toast(error.message || "Impossible d'ouvrir le document.");
    }
  };

  const requestComplement = item => {
    if (!canEdit) return;
    const control = sectionControls[item.id] || {};
    const exists = (draft.complementRequests || []).some(request => request.sectionId === section.id
      && request.itemId === item.id && (request.productKey || '') === (section.productScoped ? selectedProductKey : '') && request.status !== 'Reçu');
    if (exists) {
      toast('Une demande active existe déjà pour ce point.');
      return;
    }
    const request = {
      id: `CMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sectionId: section.id,
      section: section.title,
      itemId: item.id,
      productKey: section.productScoped ? selectedProductKey : '',
      productLabel: section.productScoped ? (selectedProduct?.nomProduit || selectedProduct?.produit || selectedProductKey) : '',
      label: item.label,
      detail: control.observation || `Compléter : ${item.label}`,
      status: 'En attente de complément',
      requestedBy: userCourant,
      requestedAt: new Date().toISOString(),
    };
    updateControl(item.id, { status: 'En attente de complément' });
    setDraft(current => withHistory({
      ...current,
      complementRequests: [...(current.complementRequests || []), request],
      complements: [current.complements, `• ${request.detail}`].filter(Boolean).join('\n'),
    }, `complementRequests.${request.id}`, `Demande de complément · ${item.label}`, '', request.detail, userCourant));
    toast(`Demande ajoutée : ${item.label}`);
  };

  const requestGeneralComplement = () => {
    if (!canEdit) return;
    const request = {
      id: `CMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sectionId: section.id,
      section: section.title,
      itemId: '',
      label: 'Demande générale',
      detail: `Complément à préciser pour la rubrique « ${section.title} »`,
      status: 'En attente de complément',
      requestedBy: userCourant,
      requestedAt: new Date().toISOString(),
    };
    setDraft(current => ({
      ...current,
      complementRequests: [...(current.complementRequests || []), request],
      complements: [current.complements, `• ${request.detail}`].filter(Boolean).join('\n'),
    }));
    toast('Demande générale ajoutée. Précisez-la dans le champ « Compléments à demander ».');
  };

  const analysisRecord = (source, status = source.status || 'Brouillon') => {
    const now = new Date().toISOString();
    const code = source.code || existing?.code || analysisCodeRef.current || genCode('ANL');
    analysisCodeRef.current = code;
    return {
      ...source,
      id: code,
      code,
      arrivage: arrivage.code,
      status,
      analysePar: userCourant,
      dateAnalyse: source.dateAnalyse || now,
      updatedAt: now,
    };
  };

  const replaceAnalysisIn = (database, record) => {
    const records = database.analysesLimex || [];
    return records.some(item => item.code === record.code || item.arrivage === arrivage.code)
      ? records.map(item => item.code === record.code || item.arrivage === arrivage.code ? record : item)
      : [...records, record];
  };
  const replaceAnalysis = record => replaceAnalysisIn(db, record);

  useEffect(() => {
    if (!canEdit) return undefined;
    const snapshot = stableDraft(draft);
    if (snapshot === lastSavedRef.current) return undefined;
    setAutoSaveState('Modifications non enregistrées…');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      setAutoSaveState('Enregistrement automatique…');
      const latestDb = dbRef.current;
      const record = analysisRecord({ ...draft, autosavedAt: new Date().toISOString() }, 'Brouillon');
      try {
        await updateDB({
          ...latestDb,
          analysesLimex: replaceAnalysisIn(latestDb, record),
          arrivages: (latestDb.arrivages || []).map(item => item.code === arrivage.code
            ? { ...item, analyseLimexCode: record.code, analyseLimexStatut: record.status, analyseLimexMaj: record.updatedAt }
            : item),
        });
        lastSavedRef.current = snapshot;
        setAutoSaveState(`Enregistré automatiquement à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`);
      } catch (error) {
        setAutoSaveState(`Échec de l’enregistrement automatique${error?.message ? ` : ${error.message}` : ''}`);
      }
    }, 900);
    return () => clearTimeout(autoSaveTimerRef.current);
    // Autosave intentionally follows every meaningful draft mutation.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, canEdit, arrivage.code]);

  const saveAnalysis = async (quiet = false) => {
    if (!canEdit) {
      toast("L'analyse est en lecture seule tant que l'arrivage n'est pas affecté à la Direction.");
      return null;
    }
    const record = analysisRecord(draft, 'Brouillon');
    await updateDB({
      ...db,
      analysesLimex: replaceAnalysis(record),
      arrivages: (db.arrivages || []).map(item => item.code === arrivage.code
        ? { ...item, analyseLimexCode: record.code, analyseLimexStatut: record.status, analyseLimexMaj: record.updatedAt }
        : item),
    });
    setDraft(record);
    audit('Analyse LIMEX Direction', 'Enregistrement', arrivage.code, 'statut', existing?.status || '—', record.status);
    if (!quiet) toast('Analyse LIMEX enregistrée.');
    return record;
  };

  const submitToImane = async type => {
    if (!canEdit) {
      toast("Cet arrivage n'est pas actuellement affecté à la Direction.");
      return;
    }
    if (type === 'complement' && !String(draft.complements || '').trim()) {
      toast('Indiquez les compléments à demander à Imane.');
      return;
    }
    if (type === 'finish' && !finalCheck.canSubmit) {
      toast(`Analyse incomplète : ${finalCheck.unexamined.length} point(s) à traiter, ${finalCheck.bloquants} blocage(s) et ${finalCheck.openDecisions} décision(s) ouverte(s).`);
      return;
    }
    const status = type === 'complement' ? 'Complément demandé' : 'Analyse transmise';
    const prepared = {
      ...draft,
      directionValidation: type === 'complement' ? 'Complément requis' : 'Analysé',
      status,
    };
    const record = analysisRecord(type === 'finish'
      ? freezeDirectionAnalysisVersion(prepared, userCourant)
      : prepared, status);
    const note = type === 'complement'
      ? `Compléments demandés par la Direction :\n${String(record.complements).trim()}`
      : String(record.generalObservation || record.directionDecisions || 'Analyse LIMEX Direction terminée.').trim();
    try {
      const transition = transitionRevueArrivage(arrivage, ACTIONS_REVUE_ARRIVAGE.RETOUR_IMANE, {
        role: 'Direction', auteur: userCourant, note,
      });
      const label = type === 'complement'
        ? 'Complément demandé à Imane par la Direction'
        : "Analyse LIMEX terminée et transmise à Imane";
      transition.entree.libelle = label;
      transition.arrivage.circuitHistorique[0].libelle = label;
      transition.arrivage.analyseLimexCode = record.code;
      transition.arrivage.analyseLimexStatut = record.status;
      transition.arrivage.analyseLimexMaj = record.updatedAt;
      await updateDB({
        ...db,
        analysesLimex: replaceAnalysis(record),
        arrivages: (db.arrivages || []).map(item => item.code === arrivage.code ? transition.arrivage : item),
      });
      setDraft(record);
      audit('Analyse LIMEX Direction', label, arrivage.code, 'statut', existing?.status || 'Brouillon', status);
      const imane = destinataireImane(db);
      notifier(
        imane,
        `${label} — ${arrivage.code}\n${note}\nPoints bloquants : ${summary.bloquants}\nInformations manquantes : ${summary.manquants}\nLien : #ficheArrivage:${arrivage.code}`,
        'Arrivages / LIMEX',
      );
      toast(label);
    } catch (error) {
      toast(error.message || "Impossible de transmettre l'analyse.");
    }
  };

  const validateSection = () => {
    if (!canEdit) return;
    const rows = section.productScoped
      ? Object.values(draft.productControls || {}).map(product => product?.[section.id] || {})
      : [draft.controls?.[section.id] || {}];
    const unresolved = rows.flatMap(group => Object.values(group)).filter(control => {
      const status = canonicalDirectionStatus(control.status);
      return status !== 'Non applicable' && (
        !String(control.current || '').trim()
        || ['Non examiné', 'Pas encore disponible', 'À vérifier', 'Information manquante', 'En attente de complément'].includes(status)
      );
    });
    if (unresolved.length) {
      toast(`Phase non validée : ${unresolved.length} point(s) obligatoire(s) restent à vérifier ou à compléter.`);
      return;
    }
    setDraft(current => withHistory({
      ...current,
      validatedSections: unique([...(current.validatedSections || []), section.id]),
    }, `validatedSections.${section.id}`, `Validation phase ${String(sectionIndex + 1).padStart(2, '0')} · ${section.title}`, false, true, userCourant));
    toast(`Rubrique « ${section.title} » contrôlée.`);
  };

  const changeSection = nextIndex => {
    const bounded = Math.min(Math.max(nextIndex, 0), LIMEX_DIRECTION_SECTIONS.length - 1);
    setDraft(current => ({ ...current, activeSection: LIMEX_DIRECTION_SECTIONS[bounded].id }));
    setActiveTab('analysis');
  };

  const renderHeader = () => (
    <>
      <div className="limex-back-row">
        <button className="btn mini doux" onClick={() => { window.location.hash = 'arrivages'; }}>← Retour à la liste des arrivages</button>
      </div>
      <section className="limex-arrival-header">
        <div className="limex-arrival-title">
          <div className="limex-arrival-icon"><ClipboardCheck size={24} /></div>
          <div>
            <div className="limex-title-line">
              <h2>Analyse LIMEX — {arrivage.ancienNumero || arrivage.code}</h2>
              <span className="limex-state-chip">{statusText}</span>
            </div>
            <p>{context.origin || 'Origine à compléter'} → {context.destination || 'Destination à compléter'} · {context.modeTransport || 'Transport à confirmer'} · Créé par {createdEntry?.auteur || arrivage.responsableLimex || '—'} le {displayDate(createdEntry?.date || arrivage.createdAt || arrivage.ts)}</p>
          </div>
        </div>
        <div className="limex-header-kpis">
          <div><ShoppingCart size={18} /><b>{context.commandes.length}</b><span>Commandes</span></div>
          <div><Users size={18} /><b>{clientsCount}</b><span>Clients</span></div>
          <div><Package size={18} /><b>{productsCount}</b><span>Produits</span></div>
          <div><Boxes size={18} /><b>{context.suppliers.length}</b><span>Fournisseurs</span></div>
          <div><FileText size={18} /><b>{context.documents.length}</b><span>Documents</span></div>
          <div><Truck size={18} /><b>{displayDate(context.eta)}</b><span>ETA prévue</span></div>
        </div>
      </section>
      <div className="limex-reference-row">
        <span><UserRound size={16} /> Client : <a href={primaryClient?.code ? `#ficheClient:${primaryClient.code}` : undefined}>{primaryClient?.code || '—'} · {primaryClient?.nom || 'À sélectionner'}</a></span>
        <span><FileText size={16} /> Demande : <a href={primaryDemandCode ? `#ficheDemande:${primaryDemandCode}` : undefined}>{primaryDemand?.referenceMetier || primaryDemand?.reference || primaryDemandCode || '—'}</a></span>
        <span><ShoppingCart size={16} /> Commande : <a href={primaryOrder?.code ? `#ficheCommande:${primaryOrder.code}` : undefined}>{primaryOrder?.referenceMetier || primaryOrder?.code || '—'}</a></span>
        <span><Truck size={16} /> Arrivage : <b>{arrivage.ancienNumero || arrivage.code}</b></span>
      </div>
      <nav className="limex-tabs">
        {TAB_ITEMS.map(([id, label]) => (
          <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>{label}</button>
        ))}
      </nav>
      {activeTab === 'analysis' && (
        <nav className="limex-phase-stepper" aria-label="Phases de l'analyse LIMEX">
          {LIMEX_DIRECTION_SECTIONS.map((item, index) => {
            const itemProgress = sectionProgress(draft, item.id);
            const complete = itemProgress.total > 0 && itemProgress.completed === itemProgress.total;
            return (
              <button key={item.id} className={`${section.id === item.id ? 'active' : ''} ${complete ? 'complete' : ''}`} onClick={() => changeSection(index)} title={`${item.title} · ${itemProgress.completed}/${itemProgress.total}`}>
                <span>{index + 1}</span><small>{item.title}</small>
              </button>
            );
          })}
        </nav>
      )}
    </>
  );

  const renderAnalysis = () => (
    <>
      {draft.imaneComplementResponse && (
        <section className="limex-direction-form">
          <h3>Réponse générale d'Imane</h3>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{draft.imaneComplementResponse}</p>
          <small>
            {draft.imaneComplementRespondedBy || 'Imane'} · {displayDateTime(draft.imaneComplementRespondedAt)}
          </small>
        </section>
      )}
      <div className="limex-analysis-layout">
        <main className="limex-analysis-main">
          {section.productScoped && context.lines.length > 0 && (
            <section className="limex-product-review">
              <header>
                <div>
                  <small>VÉRIFICATION PRODUIT PAR PRODUIT · {progress.completed}/{progress.total}</small>
                  <h3>{selectedProduct?.nomProduit || selectedProduct?.produit || `Produit ${selectedProductIndex + 1}`}</h3>
                </div>
                <label>
                  Produit
                  <select value={selectedProductIndex} onChange={event => updateDraft({ selectedProductIndex: Number(event.target.value) })}>
                    {context.lines.map((line, index) => <option key={`${line.commande.code}-${line.code || index}`} value={index}>{index + 1} / {context.lines.length} · {line.nomProduit || line.produit || 'Produit'}</option>)}
                  </select>
                </label>
              </header>
              {section.id === 'technique' && (
                <div className="limex-photo-gallery">
                  {context.documents.filter(document => document.ligneDemande === selectedProduct?.code && /photo|image|catalogue/i.test(`${document.nom || ''} ${document.type || ''}`)).length
                    ? context.documents.filter(document => document.ligneDemande === selectedProduct?.code && /photo|image|catalogue/i.test(`${document.nom || ''} ${document.type || ''}`)).map(document => (
                      <button key={document.code} onClick={() => openDocument(document)}><FileText size={24} /><span>{document.nom || document.code}</span></button>
                    ))
                    : <p>Aucune photo déposée pour ce produit.</p>}
                </div>
              )}
              <div className="limex-product-grid">
                <div><span>Commande</span><b>{selectedProduct?.commande?.referenceMetier || selectedProduct?.commande?.code || '—'}</b></div>
                <div><span>Désignation technique</span><b>{selectedProduct?.designationTechnique || selectedProduct?.description || '—'}</b></div>
                <div><span>Quantité</span><b>{selectedProduct?.quantite || '—'} {selectedProduct?.unite || ''}</b></div>
                <div><span>HS Code proposé</span><b>{selectedProduct?.hsCode || selectedProduct?.hs_code || '—'}</b></div>
                <div><span>Incoterm</span><b>{selectedProduct?.incoterm || context.incoterms || '—'}</b></div>
                <div><span>Fournisseur</span><b>{context.suppliers.find(item => item.code === selectedProduct?.fournisseur)?.nom || selectedProduct?.fournisseur || '—'}</b></div>
              </div>
            </section>
          )}
          <section className="limex-section-card">
            <header>
              <div>
                <small>PHASE {String(sectionIndex + 1).padStart(2, '0')}</small>
                <h3>{section.title}</h3>
              </div>
              <div className="limex-progress"><b>{progress.completed} / {progress.total}</b><span><i style={{ width: `${progress.percent}%` }} /></span></div>
            </header>
            <div className="limex-control-table-wrap">
              <table className="limex-control-table">
                <thead><tr><th>#</th><th>Point de contrôle</th><th>Information actuelle (équipe)</th><th>Statut Direction</th><th>Observation / Directive Direction</th><th>Preuve</th><th>Action</th></tr></thead>
                <tbody>
                  {section.items.map((item, index) => {
                    const control = sectionControls[item.id] || {};
                    const pendingRequest = (draft.complementRequests || []).find(request => request.sectionId === section.id
                      && request.itemId === item.id && (request.productKey || '') === (section.productScoped ? selectedProductKey : '') && request.status !== 'Reçu');
                    return (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td><b>{item.label}</b>{pendingRequest && <span className="limex-request-dot" title="Complément en attente">Complément en attente</span>}</td>
                        <td><div className="limex-current-value">{control.current || 'Pas encore disponible'}</div></td>
                        <td>
                          <select className={STATUS_CLASS[canonicalDirectionStatus(control.status)] || ''} value={canonicalDirectionStatus(control.status)} disabled={!canEdit} onChange={event => updateControl(item.id, { status: event.target.value })}>
                            {LIMEX_DIRECTION_STATUSES.map(status => <option key={status}>{status}</option>)}
                          </select>
                        </td>
                        <td><textarea rows="2" value={control.observation || ''} disabled={!canEdit} onChange={event => updateControl(item.id, { observation: event.target.value })} placeholder="Observation ou instruction…" /></td>
                        <td>
                          <select value={control.documentCode || ''} disabled={!canEdit} onChange={event => {
                            const document = context.documents.find(entry => entry.code === event.target.value);
                            updateControl(item.id, {
                              documentCode: event.target.value,
                              ...(document ? { current: document.nom || document.code, status: 'À vérifier' } : {}),
                            });
                          }}>
                            <option value="">—</option>
                            {context.documents.map(document => <option key={document.code} value={document.code}>{document.nom || document.code} · V{document.version || 1}</option>)}
                          </select>
                          {control.documentCode && <button type="button" className="limex-document-link" onClick={() => openDocument(context.documents.find(document => document.code === control.documentCode))}>Voir</button>}
                        </td>
                        <td>
                          <div className="limex-row-actions">
                            {control.documentCode && <button type="button" className="btn mini doux" onClick={() => openDocument(context.documents.find(document => document.code === control.documentCode))}>Voir</button>}
                            {item.expectedDocument && peut('ajouter') && <button type="button" className="btn mini doux" onClick={() => setShowDocumentForm({ phaseId: section.id, controlId: item.id, productKey: section.productScoped ? selectedProductKey : '', ligneDemande: selectedProduct?.code || '' })}>Déposer</button>}
                            {section.id === 'fournisseur' && item.id === 'identite' && context.suppliers[0]?.code && <button type="button" className="btn mini doux" onClick={() => { window.location.hash = `ficheFournisseur:${context.suppliers[0].code}`; }}>Voir profil</button>}
                            <button type="button" className="btn mini" disabled={!canEdit || Boolean(pendingRequest)} onClick={() => requestComplement(item)}>{pendingRequest ? 'En attente' : 'Demander'}</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <div className="limex-side-panel">
          <section>
            <header><h3>Documents liés à cette phase</h3>{peut('ajouter') && <button className="btn mini" onClick={() => setShowDocumentForm({ phaseId: section.id, controlId: '', productKey: section.productScoped ? selectedProductKey : '', ligneDemande: selectedProduct?.code || '' })}>+ Ajouter</button>}</header>
            <div className="limex-document-list">
              {context.documents.length ? context.documents.slice(0, 8).map(document => (
                <div key={document.code} className="limex-document-row">
                  <FileText size={17} /><span><b>{document.nom || document.code}</b><small>{document.type || 'Document'} · V{document.version || 1}{document.versionCourante === false ? ' · Ancienne version' : ' · Version courante'} · {displayDate(document.dateDocument || document.createdAt)}</small></span>{statusLabel(document.statut || 'Reçu')}
                  <button type="button" className="btn mini doux" onClick={() => openDocument(document)}>Voir</button>
                </div>
              )) : <p className="limex-empty">Aucun document lié.</p>}
            </div>
            {context.documents.length > 8 && <button className="limex-text-button" onClick={() => setActiveTab('documents')}>Voir tous les documents ({context.documents.length}) →</button>}
          </section>
          <section>
            <header><h3><AlertTriangle size={17} /> Demandes de complément</h3><button className="btn mini" disabled={!canEdit} onClick={requestGeneralComplement}>+ Nouvelle demande</button></header>
            <div className="limex-request-list">
              {(draft.complementRequests || []).length ? (draft.complementRequests || []).slice().reverse().map(request => (
                <button key={request.id} onClick={() => changeSection(LIMEX_DIRECTION_SECTIONS.findIndex(sectionItem => sectionItem.id === request.sectionId))}>
                  <span>
                    <b>{request.label}</b>
                    <small>{request.requestedBy || 'Direction'} · {displayDate(request.requestedAt)}</small>
                    {request.response && <small>Réponse Imane : {request.response}</small>}
                  </span>
                  {statusLabel(request.status)}
                </button>
              )) : <p className="limex-empty">Aucune demande créée. Utilisez « Demander » sur un point de contrôle.</p>}
            </div>
          </section>
        </div>
      </div>

      <section className="limex-missing-strip">
        <header><h3><AlertTriangle size={18} /> Informations manquantes — {section.title}</h3><b>{sectionMissing.length} dans cette phase · {missing.length} au total</b></header>
        <div>
          {sectionMissing.length ? sectionMissing.slice(0, 10).map(item => (
            <button key={`${item.sectionId}-${item.productKey || ''}-${item.label}`} onClick={() => changeSection(LIMEX_DIRECTION_SECTIONS.findIndex(sectionItem => sectionItem.id === item.sectionId))}>
              <span>{item.productKey ? `${item.productKey} · ` : ''}{item.label}</span>{statusLabel(item.status)}
            </button>
          )) : <p>Aucune information manquante dans cette phase.</p>}
        </div>
      </section>

      {section.id === 'general' && <section className="limex-direction-form">
        <h3>Analyse Direction</h3>
        <div className="limex-form-grid">
          <label>Urgence globale
            <select value={draft.urgency || 'Normale'} disabled={!canEdit} onChange={event => updateDraft({ urgency: event.target.value })}>
              {['Critique', 'Haute', 'Normale', 'Faible'].map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>Niveau d'information pour commencer
            <select value={draft.informationLevel || 'Partiellement'} disabled={!canEdit} onChange={event => updateDraft({ informationLevel: event.target.value })}>
              {['Oui', 'Partiellement', 'Non'].map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="wide">Observation générale Direction
            <textarea rows="3" value={draft.generalObservation || ''} disabled={!canEdit} onChange={event => updateDraft({ generalObservation: event.target.value })} />
          </label>
          <label>Points d'attention immédiats
            <textarea rows="4" value={draft.immediateAttention || ''} disabled={!canEdit} onChange={event => updateDraft({ immediateAttention: event.target.value })} placeholder="Un point par ligne" />
          </label>
          <label>Compléments à demander
            <textarea rows="4" value={draft.complements || ''} disabled={!canEdit} onChange={event => updateDraft({ complements: event.target.value })} placeholder="Un complément par ligne" />
          </label>
          <label>Source principale
            <select value={draft.mainSource || 'Dossier UBOS'} disabled={!canEdit} onChange={event => updateDraft({ mainSource: event.target.value })}>
              {['Dossier UBOS', 'Documents fournisseur', 'Analyse Direction', 'Retour Imane', 'Autre'].map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>Statut du contrôle
            <select value={draft.controlStatus || 'À vérifier'} disabled={!canEdit} onChange={event => updateDraft({ controlStatus: event.target.value })}>
              {['Conforme', 'À vérifier', 'Non conforme', 'Bloqué'].map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>Blocage
            <select value={draft.blockage || 'Aucun'} disabled={!canEdit} onChange={event => updateDraft({ blockage: event.target.value })}>
              {['Aucun', 'Documentaire', 'Fournisseur', 'Douane / réglementation', 'Paiement', 'Transport', 'Direction'].map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>Condition de levée
            <input value={draft.releaseCondition || ''} disabled={!canEdit} onChange={event => updateDraft({ releaseCondition: event.target.value })} />
          </label>
        </div>
      </section>}

      {section.id === 'risques' && <><section className="limex-validation-card">
        <h3>Contrôle & validation</h3>
        <div>
          <label>Validation Direction
            <select value={draft.directionValidation || 'En attente'} disabled={!canEdit} onChange={event => updateDraft({ directionValidation: event.target.value })}>
              {['En attente', 'Analysé', 'Complément requis', 'À revérifier', 'Validé sous réserve', 'Bloqué'].map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label>Analysé par<input value={draft.analysePar || userCourant || ''} disabled /></label>
          <label>Date d'analyse<input value={draft.dateAnalyse ? String(draft.dateAnalyse).slice(0, 10) : new Date().toISOString().slice(0, 10)} disabled /></label>
          <label>État du circuit<input value={arrivage.circuitValidation || '—'} disabled /></label>
        </div>
      </section>

      <section className="limex-summary-card">
        <h3>Synthèse de l'analyse LIMEX (Direction)</h3>
        <div className="limex-summary-kpis">
          <div className="ok"><b>{summary.conformes}</b><span>Points conformes</span></div>
          <div className="warning"><b>{summary.verifier}</b><span>À vérifier</span></div>
          <div className="danger"><b>{summary.corrections}</b><span>Corrections nécessaires</span></div>
          <div className="info"><b>{summary.manquants}</b><span>Informations manquantes</span></div>
          <div className="blocked"><b>{summary.bloquants}</b><span>Points bloquants</span></div>
          <div><b>{summary.nonApplicables}</b><span>Non applicables</span></div>
        </div>
        <div className="limex-summary-inputs">
          <label>Principales observations<textarea rows="5" value={draft.mainObservations || ''} disabled={!canEdit} onChange={event => updateDraft({ mainObservations: event.target.value })} /></label>
          <label>Décisions / Conditions Direction<textarea rows="5" value={draft.directionDecisions || ''} disabled={!canEdit} onChange={event => updateDraft({ directionDecisions: event.target.value })} /></label>
          <label>Risques identifiés<textarea rows="5" value={draft.identifiedRisks || ''} disabled={!canEdit} onChange={event => updateDraft({ identifiedRisks: event.target.value })} /></label>
        </div>
      </section>

      <section className="limex-decision-card">
        <div>
          <h3>Décision Direction requise</h3>
          <label><input type="checkbox" checked={Boolean(draft.decisionApproved)} disabled={!canEdit} onChange={event => updateDraft({ decisionApproved: event.target.checked })} /> Autoriser l'engagement après levée des corrections et réception des documents requis</label>
          <textarea rows="3" value={draft.decisionRequired || ''} disabled={!canEdit} onChange={event => updateDraft({ decisionRequired: event.target.value })} placeholder="Décision, réserves ou conditions obligatoires…" />
        </div>
        <div className="limex-imane-instructions">
          <h3>Instructions transmises à Imane</h3>
          <p>La Direction décrit le résultat attendu. Imane construit ensuite le plan d'exécution, affecte les personnes et fixe les échéances.</p>
          <textarea rows="5" value={draft.nextActionsForImane || ''} disabled={!canEdit} onChange={event => updateDraft({ nextActionsForImane: event.target.value })} placeholder="Actions attendues, priorités, conditions et échéances à organiser par Imane…" />
          <div className="limex-final-checks">
            <span className={finalCheck.unexamined.length ? 'bad' : 'good'}>{finalCheck.unexamined.length ? `${finalCheck.unexamined.length} point(s) non finalisé(s)` : 'Tous les points sont examinés'}</span>
            <span className={finalCheck.bloquants ? 'bad' : 'good'}>{finalCheck.bloquants ? `${finalCheck.bloquants} blocage(s)` : 'Aucun blocage ouvert'}</span>
            <span className={finalCheck.openDecisions ? 'bad' : 'good'}>{finalCheck.openDecisions ? 'Décision Direction à renseigner' : 'Décision Direction renseignée'}</span>
          </div>
        </div>
      </section></>}

      <div className="limex-action-bar">
        <div className="limex-save-state"><Save size={16} /><span>{autoSaveState}</span><button className="btn mini doux" disabled={!canEdit} onClick={() => saveAnalysis()}>Enregistrer maintenant</button></div>
        <div className="limex-phase-actions">
          {sectionIndex > 0 && <button className="btn doux" onClick={() => changeSection(sectionIndex - 1)}><ChevronLeft size={16} /> Phase précédente</button>}
          <button className="btn vert" disabled={!canEdit} onClick={validateSection}><Check size={17} /> Valider la phase</button>
          {sectionIndex < LIMEX_DIRECTION_SECTIONS.length - 1 && <button className="btn" onClick={() => changeSection(sectionIndex + 1)}>Phase suivante <ChevronRight size={16} /></button>}
        </div>
        <button className="btn or" disabled={!canEdit} onClick={() => submitToImane('complement')}><Send size={17} /> Demander un complément à Imane</button>
        {section.id === 'risques' && <button className="btn doux" onClick={() => window.print()}><FileDown size={17} /> Exporter PDF</button>}
        {section.id === 'risques' && <button className="btn" disabled={!canEdit || !finalCheck.canSubmit} onClick={() => submitToImane('finish')}><Check size={17} /> Analyse terminée → Transmettre à Imane</button>}
      </div>
    </>
  );

  const renderTableTab = () => {
    if (activeTab === 'chat') return <ArrivageChat arrivageCode={arrivage.code} />;
    if (activeTab === 'orders') return (
      <section className="limex-tab-card"><h3>Commandes liées</h3><table><thead><tr><th>Commande</th><th>Client</th><th>Condition</th><th>Package</th><th>Statut</th></tr></thead><tbody>{context.commandes.map(order => <tr key={order.code}><td><a href={`#ficheCommande:${order.code}`}>{order.referenceMetier || order.code}</a></td><td>{context.clients.find(client => client.code === order.client)?.nom || order.client || '—'}</td><td>{order.condition || '—'}</td><td>{order.formuleUltex || '—'}</td><td>{statusLabel(order.statut || 'En traitement')}</td></tr>)}</tbody></table></section>
    );
    if (activeTab === 'products') return (
      <section className="limex-tab-card"><h3>Produits concernés</h3><table><thead><tr><th>Commande</th><th>Produit</th><th>Désignation</th><th>Quantité</th><th>HS Code</th><th>Fournisseur</th></tr></thead><tbody>{context.lines.map((line, index) => <tr key={`${line.commande.code}-${line.code || index}`}><td>{line.commande.referenceMetier || line.commande.code}</td><td>{line.nomProduit || line.produit || '—'}</td><td>{line.designationTechnique || line.description || '—'}</td><td>{line.quantite || '—'} {line.unite || ''}</td><td>{line.hsCode || line.hs_code || '—'}</td><td>{context.suppliers.find(item => item.code === line.fournisseur)?.nom || line.fournisseur || '—'}</td></tr>)}</tbody></table></section>
    );
    if (activeTab === 'suppliers') return (
      <section className="limex-tab-card"><h3>Fournisseurs concernés</h3><table><thead><tr><th>Code</th><th>Fournisseur</th><th>Pays / ville</th><th>Contact</th><th>Téléphone</th><th>Email</th></tr></thead><tbody>{context.suppliers.map(supplier => <tr key={supplier.code}><td>{supplier.code}</td><td>{supplier.nom || supplier.raisonSociale || '—'}</td><td>{[supplier.ville, supplier.pays].filter(Boolean).join(', ') || '—'}</td><td>{supplier.contact || '—'}</td><td>{supplier.telephone || '—'}</td><td>{supplier.email || '—'}</td></tr>)}</tbody></table></section>
    );
    if (activeTab === 'documents') return (
      <section className="limex-tab-card"><div className="limex-tab-title"><h3>Documents liés</h3>{peut('ajouter') && <button className="btn mini" onClick={() => setShowDocumentForm({ phaseId: section.id, controlId: '', productKey: '', ligneDemande: '' })}>+ Ajouter</button>}</div><table><thead><tr><th>Document</th><th>Catégorie</th><th>Phase / contrôle</th><th>Version</th><th>Date</th><th>Statut</th><th></th></tr></thead><tbody>{context.documents.map(document => <tr key={document.code}><td>{document.nom || document.code}</td><td>{document.type || '—'}</td><td>{[document.phaseLimex, document.controleLimex].filter(Boolean).join(' · ') || '—'}</td><td>V{document.version || 1}{document.versionCourante === false ? ' · archivée' : ' · courante'}</td><td>{displayDate(document.dateDocument || document.createdAt)}</td><td>{statusLabel(document.statut || 'Reçu')}</td><td><button type="button" className="btn mini doux" onClick={() => openDocument(document)}>Voir</button></td></tr>)}</tbody></table></section>
    );
    const analysisHistory = (draft.changeHistory || []).map(entry => ({
      id: entry.id, date: entry.date, auteur: entry.user, libelle: entry.label,
      note: `${String(entry.before ?? '—')} → ${String(entry.after ?? '—')}${entry.documentCode ? ` · Document ${entry.documentCode}` : ''}`,
    }));
    const versionHistory = (draft.versions || []).map(version => ({
      id: `VERSION-${version.version}`, date: version.frozenAt, auteur: version.frozenBy,
      libelle: `Version V${version.version} figée`, note: `${version.status} · ${version.directionValidation || '—'}`,
    }));
    return (
      <section className="limex-tab-card"><h3>Historique complet et versions figées</h3><div className="limex-history">{[...analysisHistory, ...versionHistory, ...(arrivage.circuitHistorique || [])].sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0)).map(entry => <div key={entry.id || `${entry.date}-${entry.action}`}><span /><p><b>{entry.libelle}</b><small>{displayDateTime(entry.date)} · {entry.auteur || '—'}</small>{entry.note && <em>{entry.note}</em>}</p></div>)}</div></section>
    );
  };

  return (
    <div className="limex-direction-page">
      <Topbar titre="Analyse LIMEX — Direction" />
      {renderHeader()}
      {activeTab === 'analysis' ? renderAnalysis() : renderTableTab()}
      {showDocumentForm && (
        <ModuleForm moduleId="documents" MODS={MODS} initialData={{
          arrivage: arrivage.code,
          commande: primaryOrder?.code || '',
          demande: primaryDemandCode || '',
          ligneDemande: showDocumentForm.ligneDemande || '',
          produitLimex: showDocumentForm.productKey || '',
          phaseLimex: showDocumentForm.phaseId || '',
          controleLimex: showDocumentForm.controlId || '',
          version: 1,
          versionCourante: true,
          statut: 'À vérifier',
        }} onClose={() => setShowDocumentForm(null)} />
      )}
    </div>
  );
}
