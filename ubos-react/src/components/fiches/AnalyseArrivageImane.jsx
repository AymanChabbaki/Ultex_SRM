import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Plus, Save, Send, Trash2, Upload } from 'lucide-react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { openStoredDocument } from '../../services/api';
import { categorieDepuisFichier, lireFichierDataUrl } from '../../utils/fileData';
import {
  applyImaneComplementResponses,
  buildDirectionAnalysisContext,
  canonicalDirectionStatus,
  createDirectionAnalysisDraft,
  directionProductKey,
  LIMEX_DIRECTION_SECTIONS,
  sectionProgress,
} from '../../utils/arrivageDirectionAnalysis';
import {
  ACTIONS_REVUE_ARRIVAGE, destinataireYasser, ETATS_REVUE_ARRIVAGE, transitionRevueArrivage,
} from '../../utils/arrivageWorkflow';
import './AnalyseArrivageDirection.css';
import './AnalyseArrivageImane.css';

const TRANSPORT_MODES = ['DGI-M', 'DGI-A', 'DGI-R', 'ECG-M', 'ECG-A', 'ECG-R'];
const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP'];
const INSPECTIONS = ['Non prévue', 'Prévue', 'Réalisée – conforme', 'Réalisée – non conforme'];
const SAMPLES = ['Non demandé', 'Demandé', 'Reçu', 'Validé', 'Refusé'];
const PAYMENT_METHODS = [
  'TT avance', 'TT contre copie BL', 'Open account (compte ouvert)',
  'D/P — Documents contre paiement', 'D/A — Documents contre acceptation',
  'LC à vue', 'LC à usance / différée', 'LC confirmée', 'LC stand-by (SBLC)',
  'Alibaba Trade Assurance', 'Escrow / tiers de confiance', 'Autre',
];

const stableDraft = draft => JSON.stringify({ ...draft, updatedAt: undefined, preparedBy: undefined });

const statusClass = status => ({
  Conforme: 'limex-status-ok', 'À vérifier': 'limex-status-warning', 'À corriger': 'limex-status-danger',
  'Information manquante': 'limex-status-danger', 'Pas encore disponible': 'limex-status-neutral',
  'En attente de complément': 'limex-status-info', Bloquant: 'limex-status-blocked',
  'Non applicable': 'limex-status-neutral',
}[canonicalDirectionStatus(status)] || 'limex-status-neutral');

const makeHistory = (draft, path, label, before, after, user) => {
  if (JSON.stringify(before ?? '') === JSON.stringify(after ?? '')) return draft;
  return {
    ...draft,
    changeHistory: [{
      id: `CHG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      path, label, before, after, user, date: new Date().toISOString(), source: 'Imane',
    }, ...(draft.changeHistory || [])].slice(0, 1000),
  };
};

export default function AnalyseArrivageImane({ arrivage }) {
  const { db, updateDB, genCode, audit, notifier, userCourant } = useDB();
  const { peut } = useAuth();
  const { toast } = useToast();
  const existing = useMemo(
    () => (db.analysesLimex || []).find(item => item.arrivage === arrivage.code),
    [db.analysesLimex, arrivage.code],
  );
  const context = useMemo(() => buildDirectionAnalysisContext(db, arrivage), [db, arrivage]);
  const seed = useMemo(() => createDirectionAnalysisDraft(db, arrivage, existing), [db, arrivage, existing]);
  const [draft, setDraft] = useState(seed);
  const [sectionId, setSectionId] = useState(seed.activeSection || LIMEX_DIRECTION_SECTIONS[0].id);
  const [selectedProductIndex, setSelectedProductIndex] = useState(Number(seed.selectedProductIndex || 0));
  const [uploadingControlId, setUploadingControlId] = useState('');
  const [answers, setAnswers] = useState({});
  const [saveState, setSaveState] = useState('Enregistré');
  const saveTimer = useRef(null);
  const dbRef = useRef(db);
  const codeRef = useRef(existing?.code || null);
  const lastSavedRef = useRef(stableDraft(seed));

  const canEdit = peut('modifier') && arrivage.circuitValidation === ETATS_REVUE_ARRIVAGE.IMANE;
  const sectionIndex = Math.max(0, LIMEX_DIRECTION_SECTIONS.findIndex(item => item.id === sectionId));
  const section = LIMEX_DIRECTION_SECTIONS[sectionIndex];
  const selectedProduct = context.lines[Math.min(selectedProductIndex, Math.max(0, context.lines.length - 1))];
  const productKey = selectedProduct ? directionProductKey(selectedProduct, selectedProductIndex) : '';
  const sectionControls = section.productScoped && productKey
    ? (draft.productControls?.[productKey]?.[section.id] || {})
    : (draft.controls?.[section.id] || {});
  const requests = (draft.complementRequests || []).filter(request => request.status !== 'Reçu');
  const controlForRequest = request => (request.productKey
    ? draft.productControls?.[request.productKey]?.[request.sectionId]?.[request.itemId]
    : draft.controls?.[request.sectionId]?.[request.itemId]) || {};
  const requestIsReady = request => {
    const answer = answers[request.id] || {};
    const control = controlForRequest(request);
    return Boolean(
      String(answer.text || request.response || '').trim()
      || String(answer.documentCode || request.responseDocumentCode || control.documentCode || '').trim()
      || (canonicalDirectionStatus(control.status) !== 'En attente de complément' && String(control.current || '').trim()),
    );
  };
  const unresolvedRequests = requests.filter(request => !requestIsReady(request));
  const requestsBySection = requests.reduce((counts, request) => ({
    ...counts,
    [request.sectionId]: {
      total: Number(counts[request.sectionId]?.total || 0) + 1,
      missing: Number(counts[request.sectionId]?.missing || 0) + (requestIsReady(request) ? 0 : 1),
    },
  }), {});
  const analysisReturned = ['Analyse transmise', 'Complément demandé', 'Complément fourni'].includes(draft.status)
    || (draft.versions || []).length > 0;
  const commandsAssignedElsewhere = new Set((db.arrivages || []).filter(item => item.code !== arrivage.code).flatMap(item => item.commandes || []));
  const availableCommands = (db.commandes || []).filter(item => !commandsAssignedElsewhere.has(item.code) || (arrivage.commandes || []).includes(item.code));
  const countryOptions = [...new Set([
    ...context.suppliers.map(item => item.pays), ...context.clients.map(item => item.pays),
    ...(db.fournisseurs || []).map(item => item.pays), ...(db.clients || []).map(item => item.pays),
    'Chine', 'Maroc', 'Turquie', 'Espagne', 'France', 'Italie', 'Inde', 'Émirats arabes unis',
  ].filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'fr'));
  const hsOptions = [...new Set([
    ...(db.produits || []).map(item => item.hsCode),
    ...context.lines.map(item => item.hsCode || item.hs_code || item.codeHs),
  ].filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true }));

  useEffect(() => { dbRef.current = db; }, [db]);
  /* oxlint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    setDraft(seed);
    setSectionId(seed.activeSection || LIMEX_DIRECTION_SECTIONS[0].id);
    codeRef.current = existing?.code || null;
    lastSavedRef.current = stableDraft(seed);
    setAnswers(Object.fromEntries((seed.complementRequests || []).map(request => [request.id, {
      text: request.response || '', documentCode: request.responseDocumentCode || '',
    }])));
  }, [arrivage.code, existing?.updatedAt]);
  /* oxlint-enable react-hooks/exhaustive-deps */

  const replaceAnalysis = (database, record) => {
    const records = database.analysesLimex || [];
    return records.some(item => item.code === record.code || item.arrivage === arrivage.code)
      ? records.map(item => item.code === record.code || item.arrivage === arrivage.code ? record : item)
      : [...records, record];
  };

  const persist = async (source = draft, silent = false) => {
    const now = new Date().toISOString();
    const code = source.code || codeRef.current || genCode('ANL');
    codeRef.current = code;
    const record = {
      ...source, id: code, code, arrivage: arrivage.code,
      status: source.status === 'Analyse transmise' ? 'Analyse transmise' : (source.status || 'Préparation Imane'),
      preparedBy: userCourant || 'Imane', updatedAt: now,
    };
    const latest = dbRef.current;
    await updateDB({
      ...latest,
      analysesLimex: replaceAnalysis(latest, record),
      arrivages: (latest.arrivages || []).map(item => item.code === arrivage.code
        ? { ...item, analyseLimexCode: code, analyseLimexStatut: record.status, analyseLimexMaj: now }
        : item),
    });
    lastSavedRef.current = stableDraft(record);
    setDraft(record);
    if (!silent) toast('Informations LIMEX enregistrées.');
    return record;
  };

  useEffect(() => {
    if (!canEdit) return undefined;
    const snapshot = stableDraft(draft);
    if (snapshot === lastSavedRef.current) return undefined;
    setSaveState('Modifications non enregistrées…');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState('Enregistrement automatique…');
      try {
        await persist(draft, true);
        lastSavedRef.current = snapshot;
        setSaveState(`Enregistré automatiquement à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`);
      } catch (error) {
        setSaveState(`Échec de l’enregistrement${error?.message ? ` : ${error.message}` : ''}`);
      }
    }, 1000);
    return () => clearTimeout(saveTimer.current);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, canEdit]);

  useEffect(() => {
    const linked = Object.values(context.documents.filter(document => document.phaseLimex && document.controleLimex).reduce((groups, document) => {
      const key = `${document.produitLimex || ''}|${document.phaseLimex}|${document.controleLimex}`;
      const previous = groups[key];
      if (!previous || Number(document.version || 1) > Number(previous.version || 1)
        || (Number(document.version || 1) === Number(previous.version || 1) && Number(document.ts || 0) > Number(previous.ts || 0))) groups[key] = document;
      return groups;
    }, {}));
    if (!linked.length) return;
    setDraft(current => {
      let next = current;
      linked.forEach(document => {
        const targetProduct = document.produitLimex || '';
        const previous = targetProduct
          ? next.productControls?.[targetProduct]?.[document.phaseLimex]?.[document.controleLimex]
          : next.controls?.[document.phaseLimex]?.[document.controleLimex];
        if (!previous || previous.documentCode === document.code) return;
        const nextControl = { ...previous, current: document.nom || document.code, documentCode: document.code, status: 'À vérifier' };
        next = targetProduct ? {
          ...next,
          productControls: {
            ...next.productControls,
            [targetProduct]: {
              ...next.productControls?.[targetProduct],
              [document.phaseLimex]: { ...next.productControls?.[targetProduct]?.[document.phaseLimex], [document.controleLimex]: nextControl },
            },
          },
        } : {
          ...next,
          controls: { ...next.controls, [document.phaseLimex]: { ...next.controls?.[document.phaseLimex], [document.controleLimex]: nextControl } },
        };
      });
      return next;
    });
  }, [context.documents]);

  const updateCurrent = (item, value) => setDraft(current => {
    const scoped = section.productScoped && productKey;
    const previous = scoped
      ? current.productControls?.[productKey]?.[section.id]?.[item.id]
      : current.controls?.[section.id]?.[item.id];
    const nextControl = {
      ...previous,
      current: value,
      status: value ? 'À vérifier' : (item.expectedDocument ? 'Pas encore disponible' : 'Information manquante'),
    };
    const next = scoped ? {
      ...current,
      productControls: {
        ...current.productControls,
        [productKey]: {
          ...current.productControls?.[productKey],
          [section.id]: { ...current.productControls?.[productKey]?.[section.id], [item.id]: nextControl },
        },
      },
    } : {
      ...current,
      controls: { ...current.controls, [section.id]: { ...current.controls?.[section.id], [item.id]: nextControl } },
    };
    return makeHistory(next, `${scoped ? `productControls.${productKey}` : 'controls'}.${section.id}.${item.id}.current`, `${section.title} · ${item.label}`, previous?.current, value, userCourant || 'Imane');
  });

  const linkDocument = (item, documentCode, request = null, uploadedDocument = null) => {
    const document = uploadedDocument || context.documents.find(entry => entry.code === documentCode);
    setDraft(current => {
      const scoped = section.productScoped && productKey;
      const previous = scoped
        ? current.productControls?.[productKey]?.[section.id]?.[item.id]
        : current.controls?.[section.id]?.[item.id];
      const nextControl = {
        ...previous,
        documentCode,
        ...(item.expectedDocument && document ? { current: document.nom || document.code } : {}),
        ...(document ? { status: 'À vérifier' } : {}),
      };
      const next = scoped ? {
        ...current,
        productControls: {
          ...current.productControls,
          [productKey]: {
            ...current.productControls?.[productKey],
            [section.id]: { ...current.productControls?.[productKey]?.[section.id], [item.id]: nextControl },
          },
        },
      } : {
        ...current,
        controls: { ...current.controls, [section.id]: { ...current.controls?.[section.id], [item.id]: nextControl } },
      };
      return makeHistory(next, `${scoped ? `productControls.${productKey}` : 'controls'}.${section.id}.${item.id}.documentCode`, `${section.title} · ${item.label} · Document`, previous?.documentCode, documentCode, userCourant || 'Imane');
    });
    if (request) {
      setAnswers(current => ({
        ...current,
        [request.id]: { ...(current[request.id] || {}), documentCode },
      }));
      setDraft(current => ({
        ...current,
        complementRequests: (current.complementRequests || []).map(entry => entry.id === request.id
          ? { ...entry, responseDocumentCode: documentCode, status: documentCode ? 'Réponse saisie' : 'En attente de complément' }
          : entry),
      }));
    }
  };

  const updateRequestText = (request, text) => {
    setAnswers(current => ({
      ...current,
      [request.id]: { ...(current[request.id] || {}), text },
    }));
    setDraft(current => ({
      ...current,
      complementRequests: (current.complementRequests || []).map(entry => entry.id === request.id
        ? { ...entry, response: text, status: String(text || entry.responseDocumentCode || '').trim() ? 'Réponse saisie' : 'En attente de complément' }
        : entry),
    }));
  };

  const uploadDocument = async (item, request, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canEdit) return;
    const scopeKey = section.productScoped ? productKey : '';
    const uploadKey = `${section.id}:${scopeKey}:${item.id}`;
    const related = context.documents.filter(document => document.phaseLimex === section.id
      && document.controleLimex === item.id && (document.produitLimex || '') === scopeKey);
    const nextVersion = Math.max(0, ...related.map(document => Number(document.version || 1))) + 1;
    setUploadingControlId(uploadKey);
    try {
      const document = {
        code: genCode('DOC'), nom: file.name, type: categorieDepuisFichier(file),
        typeFichier: file.type || 'Fichier', fichier: await lireFichierDataUrl(file), taille: file.size,
        arrivage: arrivage.code, commande: context.commandes[0]?.code || '',
        demande: context.commandes[0]?.demande || context.commandes[0]?.source_demande_id || '',
        ligneDemande: selectedProduct?.code || '', phaseLimex: section.id, controleLimex: item.id,
        produitLimex: scopeKey, version: nextVersion, versionCourante: true, statut: 'À vérifier',
        commentaire: request ? `Pièce jointe au complément Direction : ${request.label}` : `Pièce jointe LIMEX : ${item.label}`,
        par: userCourant || 'Imane', dateAjout: new Date().toISOString(), ts: Date.now(),
      };
      const latest = dbRef.current;
      await updateDB({ ...latest, documents: [document, ...(latest.documents || [])] });
      linkDocument(item, document.code, request, document);
      audit('Arrivages / LIMEX', 'Pièce jointe ajoutée', arrivage.code, `${section.title} · ${item.label}`, '—', `${document.code} · ${document.nom}`);
      toast(`${document.nom} joint directement à ${item.label}.`);
    } catch (error) {
      toast(error.message || "Impossible d'ajouter la pièce jointe.");
    } finally {
      setUploadingControlId('');
    }
  };

  const updateArrivalCommands = (item, event) => {
    const commandCodes = [...event.target.selectedOptions].map(option => option.value);
    const references = commandCodes.map(commandCode => {
      const command = (db.commandes || []).find(entry => entry.code === commandCode);
      return command?.referenceMetier || command?.code || commandCode;
    }).join(', ');
    updateCurrent(item, references);
    const latest = dbRef.current;
    updateDB({
      ...latest,
      arrivages: (latest.arrivages || []).map(entry => entry.code === arrivage.code ? { ...entry, commandes: commandCodes } : entry),
      commandes: (latest.commandes || []).map(command => commandCodes.includes(command.code)
        ? { ...command, statut: 'En arrivage' }
        : command),
    });
  };

  const openDocument = async document => {
    if (!document) return;
    try {
      const direct = document.url || (String(document.fichier || '').startsWith('data:') ? document.fichier : '');
      if (direct) window.open(direct, '_blank', 'noopener,noreferrer');
      else if (document.storagePath) await openStoredDocument(document.code);
      else toast("Aucun fichier n'est attaché à ce document.");
    } catch (error) { toast(error.message || "Impossible d'ouvrir le document."); }
  };

  const renderEditor = (item, control) => {
    const value = control.current || '';
    const common = { disabled: !canEdit, value, onChange: event => updateCurrent(item, event.target.value) };
    if (section.id === 'general' && item.id === 'commandes') return <div className="limex-imane-inline"><select multiple disabled={!canEdit} value={arrivage.commandes || []} onChange={event => updateArrivalCommands(item, event)}>{availableCommands.map(command => <option key={command.code} value={command.code}>{command.referenceMetier || command.code} · {context.clients.find(client => client.code === command.client)?.nom || command.client || '—'}</option>)}</select><small>Ctrl/Cmd + clic pour sélectionner plusieurs commandes sans arrivage.</small></div>;
    if (section.id === 'general' && item.id === 'clients') return <select multiple disabled value={context.clients.map(client => client.code)}>{(db.clients || []).map(client => <option key={client.code} value={client.code}>{client.code} · {client.nom || '—'}</option>)}</select>;
    if (section.id === 'general' && item.id === 'produits') return <select multiple disabled value={context.lines.map((line, index) => directionProductKey(line, index))}>{context.lines.map((line, index) => <option key={directionProductKey(line, index)} value={directionProductKey(line, index)}>{line.nomProduit || line.produit || directionProductKey(line, index)}</option>)}</select>;
    if (section.id === 'general' && item.id === 'operation') return <select {...common}><option value="">—</option>{['Import', 'Export', 'Transit', 'Réexportation'].map(option => <option key={option}>{option}</option>)}</select>;
    if (section.id === 'general' && item.id === 'mode') return <select {...common}><option value="">—</option>{TRANSPORT_MODES.map(option => <option key={option}>{option}</option>)}</select>;
    if (section.id === 'general' && item.id === 'destination') {
      const hasType = String(value).includes(' · ');
      const [rawType = '', ...destinationParts] = String(value).split(' · ');
      const destinationType = hasType ? rawType : '';
      const destinationCity = hasType ? destinationParts.join(' · ') : rawType;
      return <div className="limex-imane-two-fields"><select disabled={!canEdit} value={destinationType} onChange={event => updateCurrent(item, [event.target.value, destinationCity].filter(Boolean).join(' · '))}><option value="">Type…</option><option>Port</option><option>Aéroport</option></select><input disabled={!canEdit} value={destinationCity} onChange={event => updateCurrent(item, [destinationType, event.target.value].filter(Boolean).join(' · '))} placeholder="Ville" /></div>;
    }
    if (section.id === 'general' && item.id === 'eta') return <input type="date" {...common} />;
    if (section.id === 'fournisseur' && item.id === 'identite') return <select {...common}><option value="">— Sélectionner un fournisseur enregistré —</option>{(db.fournisseurs || []).map(supplier => <option key={supplier.code} value={supplier.nom || supplier.raisonSociale || supplier.code}>{supplier.nom || supplier.raisonSociale || supplier.code} · {supplier.pays || '—'}</option>)}</select>;
    if (section.id === 'production' && item.id === 'pret') return <select {...common}><option value="">—</option><option>Oui</option><option>Non</option></select>;
    if (section.id === 'production' && item.id === 'delai') return <input type="number" min="0" step="1" {...common} />;
    if (section.id === 'production' && ['debut', 'fin'].includes(item.id)) return <input type="date" {...common} />;
    if (section.id === 'production' && item.id === 'inspection') return <select {...common}><option value="">—</option>{INSPECTIONS.map(option => <option key={option}>{option}</option>)}</select>;
    if (section.id === 'production' && item.id === 'echantillon') return <select {...common}><option value="">—</option>{SAMPLES.map(option => <option key={option}>{option}</option>)}</select>;
    if (section.id === 'commercial' && item.id === 'quantite') return <div className="limex-imane-two-fields"><input type="number" min="0" disabled={!canEdit} value={String(value).split(' ')[0] || ''} onChange={event => updateCurrent(item, `${event.target.value} ${String(value).split(' ').slice(1).join(' ') || 'Pièces'}`.trim())} /><select disabled={!canEdit} value={String(value).split(' ').slice(1).join(' ') || 'Pièces'} onChange={event => updateCurrent(item, `${String(value).split(' ')[0] || 0} ${event.target.value}`)}>{['Pièces', 'Cartons', 'Kg', 'm³', 'Lots', 'Palettes'].map(option => <option key={option}>{option}</option>)}</select></div>;
    if (section.id === 'commercial' && item.id === 'prix-unitaire') return <div className="limex-imane-two-fields"><input type="number" min="0" step="0.0001" disabled={!canEdit} value={String(value).split(' ')[0] || ''} onChange={event => updateCurrent(item, `${event.target.value} ${String(value).split(' ')[1] || 'USD'}`)} /><select disabled={!canEdit} value={String(value).split(' ')[1] || 'USD'} onChange={event => updateCurrent(item, `${String(value).split(' ')[0] || 0} ${event.target.value}`)}>{['USD', 'EUR', 'CNY', 'MAD'].map(option => <option key={option}>{option}</option>)}</select></div>;
    if (section.id === 'commercial' && item.id === 'total-proforma') return <input disabled value={value} title="Calculé automatiquement depuis la proforma" />;
    if (section.id === 'commercial' && item.id === 'shipping') return <input {...common} placeholder="Montant + devise, ou N/A selon l’incoterm" />;
    if (section.id === 'origine-valeur' && ['origine', 'provenance'].includes(item.id)) return <select {...common}><option value="">—</option>{countryOptions.map(option => <option key={option}>{option}</option>)}</select>;
    if (section.id === 'origine-valeur' && item.id === 'incoterm') {
      const [incoterm = '', ...placeParts] = String(value).split(' ');
      return <div className="limex-imane-two-fields"><select disabled={!canEdit} value={incoterm} onChange={event => updateCurrent(item, `${event.target.value} ${placeParts.join(' ')}`.trim())}><option value="">—</option>{INCOTERMS.map(option => <option key={option}>{option}</option>)}</select><input disabled={!canEdit} value={placeParts.join(' ')} onChange={event => updateCurrent(item, `${incoterm} ${event.target.value}`.trim())} placeholder="Lieu convenu obligatoire" /></div>;
    }
    if (section.id === 'origine-valeur' && ['valeur', 'valeur-mad', 'valeur-douane'].includes(item.id)) return <input disabled value={value} title="Valeur calculée automatiquement" />;
    if (section.id === 'origine-valeur' && item.id === 'taux-change') return <input type="number" min="0" step="0.0001" {...common} />;
    if (section.id === 'douane' && item.id === 'hs') return <select {...common}><option value="">— Rechercher / sélectionner un HS existant —</option>{hsOptions.map(option => <option key={option}>{option}</option>)}</select>;
    if (section.id === 'douane' && item.id === 'droits') return <input disabled value={value} title="Calculé depuis le HS code et la valeur en douane" />;
    if (section.id === 'douane' && item.id === 'conformite') return <select {...common}><option value="">—</option><option>Non</option><option>Oui — MCINET</option><option>Oui — ONSSA</option><option>Oui — ANRT</option><option>Oui — Ministère de la Santé</option><option>Oui — Autre organisme</option></select>;
    if (section.id === 'douane' && item.id === 'regime-import') return <select {...common}><option value="">—</option><option>Libre</option><option>Soumis à autorisation — MCINET</option><option>Soumis à autorisation — ONSSA</option><option>Soumis à autorisation — ANRT</option><option>Soumis à autorisation — Ministère de la Santé</option><option>Soumis à autorisation — Autre</option><option>Interdit</option></select>;
    if (section.id === 'douane' && item.id === 'certificats') return <select {...common}><option value="">—</option><option>Certificat de conformité</option><option>Sanitaire</option><option>Phytosanitaire</option><option>Analyse labo</option><option>Aucun</option></select>;
    if (section.id === 'paiements' && item.id === 'methode') return <select {...common}><option value="">—</option>{PAYMENT_METHODS.map(option => <option key={option}>{option}</option>)}</select>;
    if (section.id === 'paiements' && ['avance-reliquat', 'beneficiaire-banque'].includes(item.id)) return <input disabled value={value} title="Calculé ou repris automatiquement" />;
    if (item.expectedDocument) return <div className="limex-imane-document-cell"><span>{value || 'Pas encore disponible'}</span></div>;
    return <textarea rows="2" {...common} placeholder="Information à renseigner par Imane / équipe opérationnelle" />;
  };

  const sendToDirection = async () => {
    if (!canEdit) return;
    const missingAnswers = unresolvedRequests;
    if (requests.length && missingAnswers.length) {
      toast(`Répondez aux ${missingAnswers.length} demande(s) de complément avant l'envoi.`);
      return;
    }
    const now = new Date().toISOString();
    const effectiveAnswers = Object.fromEntries(requests.map(request => {
      const answer = answers[request.id] || {};
      const control = controlForRequest(request);
      return [request.id, {
        text: String(answer.text || control.current || '').trim(),
        documentCode: answer.documentCode || control.documentCode || '',
      }];
    }));
    const responseResult = requests.length
      ? applyImaneComplementResponses(draft, effectiveAnswers, draft.imaneComplementResponse || '', { author: userCourant || 'Imane', date: now, sent: true })
      : { record: { ...draft, status: 'Prêt pour analyse Direction', updatedAt: now }, answeredRequests: [] };
    try {
      const record = await persist(responseResult.record, true);
      const transition = transitionRevueArrivage(arrivage, ACTIONS_REVUE_ARRIVAGE.ENVOYER_DIRECTION, {
        role: 'Imane', auteur: userCourant || 'Imane', date: now,
        note: requests.length ? 'Compléments renseignés dans les contrôles LIMEX et transmis à la Direction.' : 'Informations LIMEX complétées par Imane.',
      });
      await updateDB({
        ...dbRef.current,
        analysesLimex: replaceAnalysis(dbRef.current, record),
        arrivages: (dbRef.current.arrivages || []).map(item => item.code === arrivage.code ? transition.arrivage : item),
      });
      audit('Arrivages / LIMEX', 'Informations Imane transmises à la Direction', arrivage.code, 'circuitValidation', transition.entree.avant, transition.entree.apres);
      notifier('Direction', `Informations LIMEX prêtes — ${arrivage.code}\n${requests.length ? `${requests.length} complément(s) fourni(s)` : 'Saisie initiale complétée'}\nLien : #ficheArrivage:${arrivage.code}`, 'Arrivages / LIMEX');
      toast('Informations transmises à la Direction.');
    } catch (error) { toast(error.message || 'Impossible de transmettre à la Direction.'); }
  };

  const askYasserForMissing = async () => {
    if (!canEdit || !unresolvedRequests.length) return;
    const now = new Date().toISOString();
    const details = unresolvedRequests.map(request => `• ${request.section || request.sectionId} — ${request.label}${request.detail ? ` : ${request.detail}` : ''}`);
    const note = `Compléments demandés par la Direction encore manquants :\n${details.join('\n')}`;
    try {
      const record = await persist({
        ...draft,
        status: 'Compléments demandés à Yasser',
        yasserRequestedAt: now,
        yasserRequestedBy: userCourant || 'Imane',
        yasserRequestedItems: unresolvedRequests.map(request => request.id),
      }, true);
      const transition = transitionRevueArrivage(arrivage, ACTIONS_REVUE_ARRIVAGE.ENVOYER_YASSER, {
        role: 'Imane', auteur: userCourant || 'Imane', note, date: now,
      });
      const latest = dbRef.current;
      await updateDB({
        ...latest,
        analysesLimex: replaceAnalysis(latest, record),
        arrivages: (latest.arrivages || []).map(item => item.code === arrivage.code ? transition.arrivage : item),
      });
      audit('Arrivages / LIMEX', 'Compléments Direction demandés à Yasser', arrivage.code, 'compléments', '—', details.join(' | '));
      notifier(destinataireYasser(latest), `Compléments LIMEX demandés par Imane — ${arrivage.code}\n${details.join('\n')}\nLien : #ficheArrivage:${arrivage.code}`, 'Arrivages / LIMEX');
      toast(`${unresolvedRequests.length} complément(s) transmis à Yasser.`);
    } catch (error) {
      toast(error.message || 'Impossible de transmettre les compléments à Yasser.');
    }
  };

  const addExecutionTask = () => setDraft(current => ({
    ...current,
    executionPlan: [...(current.executionPlan || []), {
      id: `TASK-${Date.now()}`, title: '', assignee: '', deadline: '', status: 'À faire',
    }],
  }));
  const updateExecutionTask = (id, patch) => setDraft(current => ({
    ...current,
    executionPlan: (current.executionPlan || []).map(task => task.id === id ? { ...task, ...patch } : task),
  }));
  const deleteExecutionTask = id => setDraft(current => ({
    ...current, executionPlan: (current.executionPlan || []).filter(task => task.id !== id),
  }));
  const openRequestedControl = request => {
    setSectionId(request.sectionId);
    if (request.productKey) {
      const index = context.lines.findIndex((line, lineIndex) => directionProductKey(line, lineIndex) === request.productKey);
      if (index >= 0) setSelectedProductIndex(index);
    }
  };

  return (
    <section className="limex-imane-workspace">
      <header className="limex-imane-header">
        <div><small>ESPACE IMANE · PRÉPARATION OPÉRATIONNELLE</small><h3>Informations source de l'analyse LIMEX</h3><p>Vous renseignez les données et documents. La Direction modifie uniquement le statut et sa directive.</p></div>
        <div className="limex-imane-header-state">
          <span className={canEdit ? 'editable' : 'readonly'}>{canEdit ? 'Saisie ouverte' : 'Lecture seule'}</span>
          <small>{arrivage.circuitValidation || ETATS_REVUE_ARRIVAGE.NON_DEMARRE}</small>
        </div>
      </header>

      <div className="limex-imane-circuit-summary">
        <div><small>Responsable actuel</small><b>{arrivage.circuitDestinataire || 'Imane'}</b></div>
        <div><small>Dernière action</small><b>{arrivage.circuitDerniereActionPar || '—'}</b><span>{arrivage.circuitDerniereActionLe ? new Date(arrivage.circuitDerniereActionLe).toLocaleString('fr-FR') : '—'}</span></div>
        <div><small>Dernière instruction</small><b>{arrivage.circuitDerniereNote || 'Aucune instruction'}</b></div>
      </div>

      {analysisReturned && (
        <div className="limex-imane-direction-return">
          <b>Retour de la Direction · V{draft.lastFrozenVersion || Math.max(1, (draft.versions || []).length)}</b>
          <p>{draft.nextActionsForImane || draft.directionDecisions || draft.generalObservation || 'Consultez les statuts et directives ligne par ligne.'}</p>
        </div>
      )}

      {requests.length > 0 && (
        <section className="limex-imane-request-board">
          <header><div><b>Informations demandées par la Direction</b><p>{unresolvedRequests.length} encore manquante(s) sur {requests.length}. Cliquez sur un élément pour ouvrir directement son étape.</p></div><strong>{unresolvedRequests.length}</strong></header>
          <div>{requests.map(request => {
            const ready = requestIsReady(request);
            return <button type="button" key={request.id} className={ready ? 'ready' : 'missing'} onClick={() => openRequestedControl(request)}><span>{request.section || request.sectionId}</span><b>{request.label}</b><small>{ready ? 'Renseigné — prêt à renvoyer' : (request.detail || 'Information manquante')}</small></button>;
          })}</div>
        </section>
      )}

      <nav className="limex-phase-stepper">
        {LIMEX_DIRECTION_SECTIONS.map((item, index) => {
          const itemProgress = sectionProgress(draft, item.id);
          const requestCount = requestsBySection[item.id];
          const classes = [section.id === item.id ? 'active' : '', requestCount?.missing ? 'has-missing-request' : '', requestCount?.total && !requestCount?.missing ? 'requests-ready' : ''].filter(Boolean).join(' ');
          return <button key={item.id} className={classes} onClick={() => setSectionId(item.id)} title={`${item.title} · ${itemProgress.completed}/${itemProgress.total}`}><span>{index + 1}</span><small>{item.title}</small>{requestCount?.total > 0 && <b className="limex-step-request-count">{requestCount.missing || '✓'}</b>}</button>;
        })}
      </nav>

      {section.productScoped && context.lines.length > 0 && (
        <div className="limex-imane-product-select"><label>Produit à renseigner<select value={selectedProductIndex} onChange={event => setSelectedProductIndex(Number(event.target.value))}>{context.lines.map((line, index) => <option key={directionProductKey(line, index)} value={index}>{index + 1}/{context.lines.length} · {line.nomProduit || line.produit || directionProductKey(line, index)}</option>)}</select></label></div>
      )}

      <div className="limex-imane-table-wrap">
        <table className="limex-imane-table">
          <thead><tr><th>#</th><th>Point de contrôle</th><th>Information actuelle — Imane / équipe</th><th>Analyse Direction</th><th>Document / complément</th></tr></thead>
          <tbody>{section.items.map((item, index) => {
            const control = sectionControls[item.id] || {};
            const request = requests.find(entry => entry.sectionId === section.id && entry.itemId === item.id && (entry.productKey || '') === (section.productScoped ? productKey : ''));
            const requestReady = request ? requestIsReady(request) : false;
            const selectedDocumentCode = answers[request?.id]?.documentCode || control.documentCode || '';
            const document = context.documents.find(entry => entry.code === selectedDocumentCode);
            const uploadKey = `${section.id}:${section.productScoped ? productKey : ''}:${item.id}`;
            return <tr key={item.id} className={request ? (requestReady ? 'has-request request-ready' : 'has-request request-missing') : ''}>
              <td>{index + 1}</td><td><b>{item.label}</b>{request && <em>{requestReady ? 'Complément renseigné' : 'Demandé par la Direction'}</em>}</td>
              <td>{renderEditor(item, control)}</td>
              <td><span className={`limex-status ${statusClass(control.status)}`}>{canonicalDirectionStatus(control.status)}</span><p>{control.observation || 'Aucune directive'}</p></td>
              <td>
                <div className="limex-imane-document-actions">
                  <select disabled={!canEdit} value={selectedDocumentCode} onChange={event => linkDocument(item, event.target.value, request)}>
                    <option value="">— Sélectionner un document existant —</option>
                    {context.documents.map(entry => <option key={entry.code} value={entry.code}>{entry.nom || entry.code} · V{entry.version || 1}{entry.versionCourante === false ? ' · archivée' : ''}</option>)}
                  </select>
                  <div>
                    <label className={`btn mini doux${!canEdit ? ' disabled' : ''}`}>
                      <Upload size={13} /> {uploadingControlId === uploadKey ? 'Ajout…' : 'Joindre un fichier'}
                      <input type="file" hidden disabled={!canEdit || Boolean(uploadingControlId)} onChange={event => uploadDocument(item, request, event)} />
                    </label>
                    {document && <button className="btn mini doux" onClick={() => openDocument(document)}><FileText size={13} /> Voir V{document.version || 1}</button>}
                  </div>
                </div>
                {request && <div className="limex-imane-request-answer"><small><b>Demande exacte :</b> {request.detail || request.label}</small><textarea rows="2" value={answers[request.id]?.text || ''} onChange={event => updateRequestText(request, event.target.value)} placeholder="Réponse exacte à la Direction" /></div>}
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>

      {analysisReturned && (
        <section className="limex-execution-builder">
          <header><div><h4>Plan d'exécution — Imane</h4><p>Imane affecte les personnes et les délais après réception de l'analyse Direction.</p></div><button className="btn mini" disabled={!canEdit} onClick={addExecutionTask}><Plus size={14} /> Ajouter une tâche</button></header>
          {(draft.executionPlan || []).length ? <div>{(draft.executionPlan || []).map(task => <article key={task.id}>
            <input value={task.title} disabled={!canEdit} onChange={event => updateExecutionTask(task.id, { title: event.target.value })} placeholder="Action à exécuter" />
            <select value={task.assignee} disabled={!canEdit} onChange={event => updateExecutionTask(task.id, { assignee: event.target.value })}><option value="">Responsable…</option>{(db.utilisateurs || []).filter(user => user.actif !== false).map(user => <option key={user.code || user.email} value={user.nom || user.email}>{user.nom || user.email}</option>)}</select>
            <input type="date" value={task.deadline || ''} disabled={!canEdit} onChange={event => updateExecutionTask(task.id, { deadline: event.target.value })} />
            <select value={task.status || 'À faire'} disabled={!canEdit} onChange={event => updateExecutionTask(task.id, { status: event.target.value })}>{['À faire', 'En cours', 'En attente', 'Terminée', 'Bloquée'].map(status => <option key={status}>{status}</option>)}</select>
            <button className="btn mini rouge" disabled={!canEdit} onClick={() => deleteExecutionTask(task.id)}><Trash2 size={13} /></button>
          </article>)}</div> : <p className="limex-empty">Aucune tâche créée. La Direction ne choisit pas les exécutants : ce plan appartient à Imane.</p>}
        </section>
      )}

      <details className="limex-imane-history">
        <summary>Historique des échanges ({(arrivage.circuitHistorique || []).length})</summary>
        {(arrivage.circuitHistorique || []).length ? (arrivage.circuitHistorique || []).map(entry => <article key={entry.id || `${entry.date}-${entry.action}`}><b>{entry.libelle}</b>{entry.note && <p>{entry.note}</p>}<small>{entry.auteur || '—'} · {entry.date ? new Date(entry.date).toLocaleString('fr-FR') : '—'} · {entry.avant || '—'} → {entry.apres || '—'}</small></article>) : <p>Aucun échange enregistré.</p>}
      </details>

      <footer className="limex-imane-actions">
        <div><Save size={15} /><span>{saveState}</span></div>
        <button className="btn doux" disabled={sectionIndex === 0} onClick={() => setSectionId(LIMEX_DIRECTION_SECTIONS[sectionIndex - 1].id)}><ChevronLeft size={15} /> Précédente</button>
        <button className="btn doux" disabled={sectionIndex === LIMEX_DIRECTION_SECTIONS.length - 1} onClick={() => setSectionId(LIMEX_DIRECTION_SECTIONS[sectionIndex + 1].id)}>Suivante <ChevronRight size={15} /></button>
        <button className="btn doux" disabled={!canEdit} onClick={() => persist()}><Save size={15} /> Enregistrer</button>
        {requests.length > 0 && <button className="btn or" disabled={!canEdit || !unresolvedRequests.length} onClick={askYasserForMissing}><Send size={15} /> Demander à Yasser ({unresolvedRequests.length})</button>}
        <button className="btn" disabled={!canEdit} onClick={sendToDirection}><Send size={15} /> Enregistrer et transmettre à la Direction</button>
      </footer>
    </section>
  );
}
