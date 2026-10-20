import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Plus, Save, Send, Trash2 } from 'lucide-react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import ModuleForm from '../modules/ModuleForm';
import { MODS } from '../../data/modules';
import { openStoredDocument } from '../../services/api';
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
  ACTIONS_REVUE_ARRIVAGE, ETATS_REVUE_ARRIVAGE, transitionRevueArrivage,
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
  const [documentForm, setDocumentForm] = useState(null);
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

  const prepareDocumentForm = (item) => {
    const related = context.documents.filter(document => document.phaseLimex === section.id
      && document.controleLimex === item.id && (document.produitLimex || '') === (section.productScoped ? productKey : ''));
    const nextVersion = Math.max(0, ...related.map(document => Number(document.version || 1))) + 1;
    setDocumentForm({ phaseId: section.id, controlId: item.id, productKey, ligneDemande: selectedProduct?.code || '', version: nextVersion });
  };

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
    if (item.expectedDocument) return <div className="limex-imane-document-cell"><span>{value || 'Pas encore disponible'}</span><button className="btn mini doux" disabled={!canEdit} onClick={() => prepareDocumentForm(item)}>Déposer une version</button></div>;
    return <textarea rows="2" {...common} placeholder="Information à renseigner par Imane / équipe opérationnelle" />;
  };

  const sendToDirection = async () => {
    if (!canEdit) return;
    const missingAnswers = requests.filter(request => !String(answers[request.id]?.text || '').trim());
    if (requests.length && missingAnswers.length) {
      toast(`Répondez aux ${missingAnswers.length} demande(s) de complément avant l'envoi.`);
      return;
    }
    const now = new Date().toISOString();
    const responseResult = requests.length
      ? applyImaneComplementResponses(draft, answers, draft.imaneComplementResponse || '', { author: userCourant || 'Imane', date: now, sent: true })
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

  return (
    <section className="limex-imane-workspace">
      <header className="limex-imane-header">
        <div><small>ESPACE IMANE · PRÉPARATION OPÉRATIONNELLE</small><h3>Informations source de l'analyse LIMEX</h3><p>Vous renseignez les données et documents. La Direction modifie uniquement le statut et sa directive.</p></div>
        <span className={canEdit ? 'editable' : 'readonly'}>{canEdit ? 'Saisie ouverte' : 'Lecture seule'}</span>
      </header>

      {analysisReturned && (
        <div className="limex-imane-direction-return">
          <b>Retour de la Direction · V{draft.lastFrozenVersion || Math.max(1, (draft.versions || []).length)}</b>
          <p>{draft.nextActionsForImane || draft.directionDecisions || draft.generalObservation || 'Consultez les statuts et directives ligne par ligne.'}</p>
        </div>
      )}

      <nav className="limex-phase-stepper">
        {LIMEX_DIRECTION_SECTIONS.map((item, index) => {
          const itemProgress = sectionProgress(draft, item.id);
          return <button key={item.id} className={section.id === item.id ? 'active' : ''} onClick={() => setSectionId(item.id)} title={`${item.title} · ${itemProgress.completed}/${itemProgress.total}`}><span>{index + 1}</span><small>{item.title}</small></button>;
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
            const document = context.documents.find(entry => entry.code === control.documentCode);
            return <tr key={item.id} className={request ? 'has-request' : ''}>
              <td>{index + 1}</td><td><b>{item.label}</b>{request && <em>Complément demandé</em>}</td>
              <td>{renderEditor(item, control)}</td>
              <td><span className={`limex-status ${statusClass(control.status)}`}>{canonicalDirectionStatus(control.status)}</span><p>{control.observation || 'Aucune directive'}</p></td>
              <td>
                {document && <button className="btn mini doux" onClick={() => openDocument(document)}><FileText size={13} /> Voir V{document.version || 1}</button>}
                {request && <div className="limex-imane-request-answer"><small>{request.detail}</small><textarea rows="2" value={answers[request.id]?.text || ''} onChange={event => setAnswers(current => ({ ...current, [request.id]: { ...(current[request.id] || {}), text: event.target.value } }))} placeholder="Réponse exacte à la Direction" /></div>}
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

      <footer className="limex-imane-actions">
        <div><Save size={15} /><span>{saveState}</span></div>
        <button className="btn doux" disabled={sectionIndex === 0} onClick={() => setSectionId(LIMEX_DIRECTION_SECTIONS[sectionIndex - 1].id)}><ChevronLeft size={15} /> Précédente</button>
        <button className="btn doux" disabled={sectionIndex === LIMEX_DIRECTION_SECTIONS.length - 1} onClick={() => setSectionId(LIMEX_DIRECTION_SECTIONS[sectionIndex + 1].id)}>Suivante <ChevronRight size={15} /></button>
        <button className="btn doux" disabled={!canEdit} onClick={() => persist()}><Save size={15} /> Enregistrer</button>
        <button className="btn" disabled={!canEdit} onClick={sendToDirection}><Send size={15} /> Enregistrer et transmettre à la Direction</button>
      </footer>

      {documentForm && <ModuleForm moduleId="documents" MODS={MODS} initialData={{
        arrivage: arrivage.code, commande: context.commandes[0]?.code || '',
        demande: context.commandes[0]?.demande || context.commandes[0]?.source_demande_id || '',
        ligneDemande: documentForm.ligneDemande || '', phaseLimex: documentForm.phaseId,
        controleLimex: documentForm.controlId, produitLimex: documentForm.productKey || '',
        version: documentForm.version || 1, versionCourante: true, statut: 'À vérifier',
      }} onClose={() => setDocumentForm(null)} />}
    </section>
  );
}
