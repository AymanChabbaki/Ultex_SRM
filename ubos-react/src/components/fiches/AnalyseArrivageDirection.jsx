import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Boxes, Check, ChevronLeft, ChevronRight, ClipboardCheck, FileText,
  Package, Save, Send, ShoppingCart, Truck, Users,
} from 'lucide-react';
import { useDB } from '../../context/DBContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Topbar from '../layout/Topbar';
import ModuleForm from '../modules/ModuleForm';
import { MODS } from '../../data/modules';
import { openStoredDocument } from '../../services/api';
import {
  LIMEX_DIRECTION_SECTIONS,
  LIMEX_DIRECTION_STATUSES,
  buildDirectionAnalysisContext,
  createDirectionAnalysisDraft,
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
  ['suppliers', 'Fournisseurs'], ['documents', 'Documents'], ['history', 'Historique'],
];

const STATUS_CLASS = {
  Conforme: 'limex-status-ok',
  'À vérifier': 'limex-status-warning',
  'Non vérifié': 'limex-status-neutral',
  'À corriger': 'limex-status-danger',
  Manquant: 'limex-status-danger',
  'À recevoir': 'limex-status-info',
  Bloquant: 'limex-status-blocked',
  'N/A': 'limex-status-neutral',
};

const unique = values => [...new Set(values.filter(Boolean))];
const displayDate = value => value ? new Date(value).toLocaleDateString('fr-FR', { timeZone: 'UTC' }) : '—';
const displayDateTime = value => value ? new Date(value).toLocaleString('fr-FR', { timeZone: 'UTC' }) : '—';

function statusLabel(status) {
  return <span className={`limex-status ${STATUS_CLASS[status] || 'limex-status-neutral'}`}>{status || 'Non vérifié'}</span>;
}

export default function AnalyseArrivageDirection({ arrivage }) {
  const { db, updateDB, genCode, audit, notifier, userCourant } = useDB();
  const { peut } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('analysis');
  const [showDocumentForm, setShowDocumentForm] = useState(false);
  const existing = useMemo(
    () => (db.analysesLimex || []).find(item => item.arrivage === arrivage.code),
    [db.analysesLimex, arrivage.code],
  );
  const context = useMemo(() => buildDirectionAnalysisContext(db, arrivage), [db, arrivage]);
  const seed = useMemo(() => createDirectionAnalysisDraft(db, arrivage, existing), [db, arrivage, existing]);
  const [draft, setDraft] = useState(seed);

  // Reload only when another arrival is opened or a persisted analysis version changes.
  // Using the whole DB here would erase unsaved Direction notes whenever a notification arrives.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setDraft(seed);
  }, [arrivage.code, existing?.updatedAt]);

  const canEdit = peut('modifier') && arrivage.circuitValidation === ETATS_REVUE_ARRIVAGE.DIRECTION;
  const sectionIndex = Math.max(0, LIMEX_DIRECTION_SECTIONS.findIndex(section => section.id === draft.activeSection));
  const section = LIMEX_DIRECTION_SECTIONS[sectionIndex];
  const sectionControls = draft.controls?.[section.id] || {};
  const progress = sectionProgress(draft, section.id);
  const summary = summarizeDirectionAnalysis(draft);
  const missing = missingDirectionInformation(draft);
  const createdEntry = [...(arrivage.circuitHistorique || [])].at(-1);
  const clientsCount = context.clients.length;
  const productsCount = context.lines.length || (arrivage.produitSource ? 1 : 0);
  const statusText = canEdit ? 'Analyse en cours' : (draft.status || arrivage.circuitValidation || 'Consultation');
  const selectedProductIndex = Math.min(Number(draft.selectedProductIndex || 0), Math.max(0, context.lines.length - 1));
  const selectedProduct = context.lines[selectedProductIndex];

  const updateDraft = patch => setDraft(current => ({ ...current, ...patch }));
  const updateControl = (itemId, patch) => setDraft(current => ({
    ...current,
    controls: {
      ...current.controls,
      [section.id]: {
        ...current.controls?.[section.id],
        [itemId]: { ...current.controls?.[section.id]?.[itemId], ...patch },
      },
    },
  }));

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
    const control = draft.controls?.[section.id]?.[item.id] || {};
    const exists = (draft.complementRequests || []).some(request => request.sectionId === section.id && request.itemId === item.id && request.status !== 'Reçu');
    if (exists) {
      toast('Une demande active existe déjà pour ce point.');
      return;
    }
    const request = {
      id: `CMP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sectionId: section.id,
      section: section.title,
      itemId: item.id,
      label: item.label,
      detail: control.observation || `Compléter : ${item.label}`,
      status: 'En attente',
      requestedBy: userCourant,
      requestedAt: new Date().toISOString(),
    };
    setDraft(current => ({
      ...current,
      complementRequests: [...(current.complementRequests || []), request],
      complements: [current.complements, `• ${request.detail}`].filter(Boolean).join('\n'),
      controls: {
        ...current.controls,
        [section.id]: {
          ...current.controls?.[section.id],
          [item.id]: { ...current.controls?.[section.id]?.[item.id], status: 'À recevoir' },
        },
      },
    }));
    toast(`Demande ajoutée : ${item.label}`);
  };

  const analysisRecord = (source, status = source.status || 'Brouillon') => {
    const now = new Date().toISOString();
    const code = source.code || existing?.code || genCode('ANL');
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

  const replaceAnalysis = record => {
    const records = db.analysesLimex || [];
    return records.some(item => item.code === record.code || item.arrivage === arrivage.code)
      ? records.map(item => item.code === record.code || item.arrivage === arrivage.code ? record : item)
      : [...records, record];
  };

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
    const status = type === 'complement' ? 'Complément demandé' : 'Analyse transmise';
    const record = analysisRecord({
      ...draft,
      directionValidation: type === 'complement' ? 'Complément requis' : 'Analysé',
    }, status);
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
    setDraft(current => {
      const nextControls = { ...current.controls?.[section.id] };
      Object.entries(nextControls).forEach(([itemId, control]) => {
        if (['Non vérifié', 'À vérifier'].includes(control.status)) {
          nextControls[itemId] = { ...control, status: control.current ? 'Conforme' : 'Manquant' };
        }
      });
      return {
        ...current,
        controls: { ...current.controls, [section.id]: nextControls },
        validatedSections: unique([...(current.validatedSections || []), section.id]),
      };
    });
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
      <nav className="limex-tabs">
        {TAB_ITEMS.map(([id, label]) => (
          <button key={id} className={activeTab === id ? 'active' : ''} onClick={() => setActiveTab(id)}>{label}</button>
        ))}
      </nav>
    </>
  );

  const renderAnalysis = () => (
    <>
      <div className="limex-analysis-layout">
        <aside className="limex-sections-panel">
          <h3>Rubriques d'analyse</h3>
          {LIMEX_DIRECTION_SECTIONS.map((item, index) => {
            const itemProgress = sectionProgress(draft, item.id);
            return (
              <button key={item.id} className={section.id === item.id ? 'active' : ''} onClick={() => changeSection(index)}>
                <span className="limex-section-number">{String(index + 1).padStart(2, '0')}</span>
                <span>{item.title}</span>
                <em>{itemProgress.completed}/{itemProgress.total}</em>
              </button>
            );
          })}
        </aside>

        <main className="limex-analysis-main">
          {section.id === 'technique' && context.lines.length > 0 && (
            <section className="limex-product-review">
              <header>
                <div>
                  <small>VÉRIFICATION PAR PRODUIT</small>
                  <h3>{selectedProduct?.nomProduit || selectedProduct?.produit || `Produit ${selectedProductIndex + 1}`}</h3>
                </div>
                <label>
                  Produit
                  <select value={selectedProductIndex} disabled={!canEdit} onChange={event => updateDraft({ selectedProductIndex: Number(event.target.value) })}>
                    {context.lines.map((line, index) => <option key={`${line.commande.code}-${line.code || index}`} value={index}>{index + 1} / {context.lines.length} · {line.nomProduit || line.produit || 'Produit'}</option>)}
                  </select>
                </label>
              </header>
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
                <thead><tr><th>#</th><th>Point de contrôle</th><th>Information actuelle</th><th>Statut</th><th>Observation / Directive</th><th>Document</th><th>Action</th></tr></thead>
                <tbody>
                  {section.items.map((item, index) => {
                    const control = sectionControls[item.id] || {};
                    return (
                      <tr key={item.id}>
                        <td>{index + 1}</td>
                        <td><b>{item.label}</b></td>
                        <td><textarea rows="2" value={control.current || ''} disabled={!canEdit} onChange={event => updateControl(item.id, { current: event.target.value })} placeholder="Information manquante" /></td>
                        <td>
                          <select className={STATUS_CLASS[control.status] || ''} value={control.status || 'Non vérifié'} disabled={!canEdit} onChange={event => updateControl(item.id, { status: event.target.value })}>
                            {LIMEX_DIRECTION_STATUSES.map(status => <option key={status}>{status}</option>)}
                          </select>
                        </td>
                        <td><textarea rows="2" value={control.observation || ''} disabled={!canEdit} onChange={event => updateControl(item.id, { observation: event.target.value })} placeholder="Observation ou instruction…" /></td>
                        <td>
                          <select value={control.documentCode || ''} disabled={!canEdit} onChange={event => updateControl(item.id, { documentCode: event.target.value })}>
                            <option value="">—</option>
                            {context.documents.map(document => <option key={document.code} value={document.code}>{document.nom || document.code}</option>)}
                          </select>
                          {control.documentCode && <button type="button" className="limex-document-link" onClick={() => openDocument(context.documents.find(document => document.code === control.documentCode))}>Voir</button>}
                        </td>
                        <td>
                          {control.documentCode
                            ? <button type="button" className="btn mini doux" onClick={() => openDocument(context.documents.find(document => document.code === control.documentCode))}>Voir</button>
                            : <button type="button" className="btn mini" disabled={!canEdit} onClick={() => requestComplement(item)}>Demander</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <aside className="limex-side-panel">
          <section>
            <header><h3>Documents liés</h3>{peut('ajouter') && <button className="btn mini" onClick={() => setShowDocumentForm(true)}>+ Ajouter</button>}</header>
            <div className="limex-document-list">
              {context.documents.length ? context.documents.slice(0, 8).map(document => (
                <div key={document.code} className="limex-document-row">
                  <FileText size={17} /><span><b>{document.nom || document.code}</b><small>{document.type || 'Document'} · {displayDate(document.dateDocument || document.createdAt)}</small></span>{statusLabel(document.statut || 'Reçu')}
                  <button type="button" className="btn mini doux" onClick={() => openDocument(document)}>Voir</button>
                </div>
              )) : <p className="limex-empty">Aucun document lié.</p>}
            </div>
            {context.documents.length > 8 && <button className="limex-text-button" onClick={() => setActiveTab('documents')}>Voir tous les documents ({context.documents.length}) →</button>}
          </section>
          <section>
            <header><h3><AlertTriangle size={17} /> Demandes de complément</h3><button className="btn mini" disabled={!canEdit} onClick={() => updateDraft({ complements: `${draft.complements || ''}${draft.complements ? '\n' : ''}• ` })}>+ Nouvelle demande</button></header>
            <div className="limex-request-list">
              {(draft.complementRequests || []).length ? (draft.complementRequests || []).slice().reverse().map(request => (
                <button key={request.id} onClick={() => changeSection(LIMEX_DIRECTION_SECTIONS.findIndex(sectionItem => sectionItem.id === request.sectionId))}>
                  <span><b>{request.label}</b><small>{request.requestedBy || 'Direction'} · {displayDate(request.requestedAt)}</small></span>{statusLabel(request.status)}
                </button>
              )) : <p className="limex-empty">Aucune demande créée. Utilisez « Demander » sur un point de contrôle.</p>}
            </div>
          </section>
        </aside>
      </div>

      <section className="limex-missing-strip">
        <header><h3><AlertTriangle size={18} /> Informations manquantes détectées</h3><b>{missing.length}</b></header>
        <div>
          {missing.length ? missing.map(item => (
            <button key={`${item.sectionId}-${item.label}`} onClick={() => changeSection(LIMEX_DIRECTION_SECTIONS.findIndex(sectionItem => sectionItem.id === item.sectionId))}>
              <span>{item.label}</span>{statusLabel(item.status)}
            </button>
          )) : <p>Aucune information manquante détectée.</p>}
        </div>
      </section>

      <section className="limex-direction-form">
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
      </section>

      <section className="limex-validation-card">
        <h3>Contrôle & validation</h3>
        <div>
          <label>Validation Direction
            <select value={draft.directionValidation || 'En attente'} disabled={!canEdit} onChange={event => updateDraft({ directionValidation: event.target.value })}>
              {['En attente', 'Analysé', 'Complément requis', 'Validé sous réserve', 'Bloqué'].map(value => <option key={value}>{value}</option>)}
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
        <div className="limex-execution-plan">
          <h3>Plan d'exécution proposé</h3>
          <div>
            <article><b>Yasser · Approvisionnement</b><span>Confirmer production, fournisseur et documents manquants.</span></article>
            <article><b>Imane · Coordination</b><span>Centraliser les compléments et revérifier la conformité globale.</span></article>
            <article><b>Transport</b><span>Valider la cotation, la réservation, le départ et le suivi.</span></article>
            <article><b>Direction</b><span>Lever les blocages et autoriser l'engagement final.</span></article>
          </div>
        </div>
      </section>

      <div className="limex-action-bar">
        <button className="btn doux" disabled={!canEdit} onClick={() => saveAnalysis()}><Save size={17} /> Enregistrer et continuer plus tard</button>
        <div className="limex-phase-actions">
          {sectionIndex > 0 && <button className="btn doux" onClick={() => changeSection(sectionIndex - 1)}><ChevronLeft size={16} /> Phase précédente</button>}
          <button className="btn vert" disabled={!canEdit} onClick={validateSection}><Check size={17} /> Valider la phase</button>
          {sectionIndex < LIMEX_DIRECTION_SECTIONS.length - 1 && <button className="btn" onClick={() => changeSection(sectionIndex + 1)}>Phase suivante <ChevronRight size={16} /></button>}
        </div>
        <button className="btn or" disabled={!canEdit} onClick={() => submitToImane('complement')}><Send size={17} /> Demander un complément à Imane</button>
        <button className="btn" disabled={!canEdit} onClick={() => submitToImane('finish')}><Check size={17} /> Terminer l'analyse et transmettre à Imane</button>
      </div>
    </>
  );

  const renderTableTab = () => {
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
      <section className="limex-tab-card"><div className="limex-tab-title"><h3>Documents liés</h3>{peut('ajouter') && <button className="btn mini" onClick={() => setShowDocumentForm(true)}>+ Ajouter</button>}</div><table><thead><tr><th>Document</th><th>Catégorie</th><th>Commande</th><th>Date</th><th>Statut</th><th></th></tr></thead><tbody>{context.documents.map(document => <tr key={document.code}><td>{document.nom || document.code}</td><td>{document.type || '—'}</td><td>{document.commande || '—'}</td><td>{displayDate(document.dateDocument || document.createdAt)}</td><td>{statusLabel(document.statut || 'Reçu')}</td><td><button type="button" className="btn mini doux" onClick={() => openDocument(document)}>Voir</button></td></tr>)}</tbody></table></section>
    );
    return (
      <section className="limex-tab-card"><h3>Historique de l'arrivage et de l'analyse</h3><div className="limex-history">{(arrivage.circuitHistorique || []).map(entry => <div key={entry.id || `${entry.date}-${entry.action}`}><span /><p><b>{entry.libelle}</b><small>{displayDateTime(entry.date)} · {entry.auteur || '—'}</small>{entry.note && <em>{entry.note}</em>}</p></div>)}</div></section>
    );
  };

  return (
    <div className="limex-direction-page">
      <Topbar titre="Analyse LIMEX — Direction" />
      {renderHeader()}
      {activeTab === 'analysis' ? renderAnalysis() : renderTableTab()}
      {showDocumentForm && (
        <ModuleForm moduleId="documents" MODS={MODS} initialData={{ arrivage: arrivage.code }} onClose={() => setShowDocumentForm(false)} />
      )}
    </div>
  );
}
