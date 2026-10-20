import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  applyImaneComplementResponses,
  LIMEX_DIRECTION_SECTIONS,
  buildDirectionAnalysisContext,
  createDirectionAnalysisDraft,
  directionFinalCheck,
  freezeDirectionAnalysisVersion,
  missingDirectionInformation,
  sectionProgress,
  summarizeDirectionAnalysis,
} from '../src/utils/arrivageDirectionAnalysis.js';

const arrivage = {
  code: 'ARR2026-000001', commandes: ['CMD1'], paysOrigine: 'Chine', portArrivee: 'Casablanca',
  modeTransport: 'Maritime', etaPrevue: '2026-11-25', circuitValidation: 'À analyser par Direction',
};

const db = {
  clients: [{ code: 'L7001', nom: 'Client Test' }],
  commandes: [{
    code: 'CMD1', referenceMetier: 'C-7001', client: 'L7001', condition: 'Acompte reçu',
    lignes: [{ nomProduit: 'Machine test', designationTechnique: 'Machine automatique', quantite: 2, unite: 'pcs', fournisseur: 'F1', hsCode: '8479.89' }],
  }],
  fournisseurs: [{ code: 'F1', nom: 'Supplier Co.', pays: 'Chine', telephone: '+86 100' }],
  documents: [{ code: 'DOC1', arrivage: 'ARR2026-000001', nom: 'Proforma.pdf', type: 'Proforma Invoice' }],
  paiements: [],
};

test('Direction analysis contains the complete 14-phase LIMEX structure', () => {
  assert.equal(LIMEX_DIRECTION_SECTIONS.length, 14);
  assert.deepEqual(LIMEX_DIRECTION_SECTIONS.map(section => section.id), [
    'general', 'technique', 'fournisseur', 'production', 'commercial', 'origine-valeur', 'douane',
    'paiements', 'transport', 'chargement', 'transit', 'declaration', 'livraison', 'risques',
  ]);
  assert.equal(LIMEX_DIRECTION_SECTIONS.find(section => section.id === 'fournisseur').items.length, 1);
  assert.ok(LIMEX_DIRECTION_SECTIONS.find(section => section.id === 'technique').productScoped);
  assert.ok(LIMEX_DIRECTION_SECTIONS.find(section => section.id === 'douane').productScoped);
});

test('arrival data is consolidated from linked commandes, clients, suppliers and documents', () => {
  const context = buildDirectionAnalysisContext(db, arrivage);
  assert.equal(context.commandReferences, 'C-7001');
  assert.equal(context.clientNames, 'Client Test');
  assert.equal(context.productNames, 'Machine test');
  assert.equal(context.supplierNames, 'Supplier Co.');
  assert.equal(context.documents.length, 1);
});

test('draft highlights missing information and computes progress and summary', () => {
  const draft = createDirectionAnalysisDraft(db, arrivage);
  assert.equal(draft.controls.commercial.proforma.status, 'À vérifier');
  assert.equal(draft.controls.chargement['packing-list'].status, 'Pas encore disponible');
  assert.ok(missingDirectionInformation(draft).some(item => item.label === 'Packing List définitive'));

  draft.controls.general.commandes.status = 'Conforme';
  const progress = sectionProgress(draft, 'general');
  const summary = summarizeDirectionAnalysis(draft);
  assert.equal(progress.completed, 1);
  assert.ok(summary.manquants > 0);
  assert.equal(summary.total, LIMEX_DIRECTION_SECTIONS.reduce((total, section) => total + section.items.length, 0));
});

test('Imane can answer every Direction request and return it for verification', () => {
  const draft = createDirectionAnalysisDraft(db, arrivage);
  draft.complementRequests = [{
    id: 'CMP1', sectionId: 'chargement', itemId: 'packing-list', section: 'Chargement et expédition',
    label: 'Packing List définitive', detail: 'Ajouter la Packing List définitive', status: 'En attente de complément',
  }];
  const result = applyImaneComplementResponses(
    draft,
    { CMP1: { text: 'Packing List reçue et contrôlée.', documentCode: 'DOC1' } },
    'Le fournisseur a confirmé la version finale.',
    { author: 'Imane', date: '2026-10-10T11:00:00.000Z', sent: true },
  );

  assert.deepEqual(result.missingRequestIds, []);
  assert.equal(result.record.status, 'Complément fourni');
  assert.equal(result.record.directionValidation, 'À revérifier');
  assert.equal(result.record.complementRequests[0].status, 'Reçu');
  assert.equal(result.record.complementRequests[0].response, 'Packing List reçue et contrôlée.');
  assert.equal(result.record.controls.chargement['packing-list'].current, 'Packing List reçue et contrôlée.');
  assert.equal(result.record.controls.chargement['packing-list'].documentCode, 'DOC1');
  assert.equal(result.record.controls.chargement['packing-list'].status, 'À vérifier');
});

test('final transmission is gated and freezes an immutable version', () => {
  const draft = createDirectionAnalysisDraft(db, arrivage);
  assert.equal(directionFinalCheck(draft).canSubmit, false);
  const frozen = freezeDirectionAnalysisVersion({ ...draft, status: 'Analyse transmise' }, 'Oumaima', '2026-10-19T12:00:00.000Z');
  assert.equal(frozen.lastFrozenVersion, 1);
  assert.equal(frozen.versionNumber, 2);
  assert.equal(frozen.versions[0].frozenBy, 'Oumaima');
});

test('Direction arrival screen persists analysis and returns the workflow to Imane', () => {
  const source = fs.readFileSync(new URL('../src/components/fiches/AnalyseArrivageDirection.jsx', import.meta.url), 'utf8');
  const apiSource = fs.readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8');
  const arrivalSource = fs.readFileSync(new URL('../src/components/fiches/FicheArrivage.jsx', import.meta.url), 'utf8');
  const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /analysesLimex: replaceAnalysis\(record\)/);
  assert.match(source, /ACTIONS_REVUE_ARRIVAGE\.RETOUR_IMANE/);
  assert.match(source, /destinataireImane\(db\)/);
  assert.match(source, /Analyse terminée → Transmettre à Imane/);
  assert.match(source, /VÉRIFICATION PRODUIT PAR PRODUIT/);
  assert.match(source, /<th>Action<\/th>/);
  assert.match(source, /Demandes de complément/);
  assert.match(source, /Réponse générale d'Imane/);
  assert.match(source, /Réponse Imane :/);
  assert.match(source, /Contrôle & validation/);
  assert.match(source, /Instructions transmises à Imane/);
  assert.doesNotMatch(source, /Plan d'exécution proposé/);
  assert.match(source, /Enregistrement automatique/);
  assert.match(source, /freezeDirectionAnalysisVersion/);
  assert.match(source, /limex-current-value/);
  assert.doesNotMatch(source, /onChange=\{event => updateControl\(item\.id, \{ current:/);
  assert.match(source, /openDocument\(document\)/);
  assert.doesNotMatch(source, /href=\{`#ficheDocument:/);
  assert.doesNotMatch(source, /<aside/);
  assert.match(source, /sectionMissing\.slice\(0, 10\)/);
  assert.match(apiSource, /export async function openStoredDocument/);
  assert.match(arrivalSource, /roleCircuit === 'Direction'/);
  assert.match(arrivalSource, /Informations demandées par la Direction/);
  assert.match(arrivalSource, /Transmettre les compléments à la Direction/);
  assert.match(arrivalSource, /handleUploadComplementDocument/);
  assert.match(arrivalSource, /Téléverser depuis WhatsApp/);
  assert.match(arrivalSource, /arrivage: code/);
  assert.match(arrivalSource, /documentCode: document\.code/);
  assert.match(appSource, /\['analysesLimex', 'arrivages'/);
});

test('Imane has a coordinated editable LIMEX workspace and owns execution planning', () => {
  const source = fs.readFileSync(new URL('../src/components/fiches/AnalyseArrivageImane.jsx', import.meta.url), 'utf8');
  const arrivalSource = fs.readFileSync(new URL('../src/components/fiches/FicheArrivage.jsx', import.meta.url), 'utf8');
  assert.match(arrivalSource, /<AnalyseArrivageImane arrivage=\{arrivage\}/);
  assert.match(source, /Information actuelle — Imane \/ équipe/);
  assert.match(source, /Analyse Direction/);
  assert.match(source, /Enregistrement automatique/);
  assert.match(source, /applyImaneComplementResponses/);
  assert.match(source, /Enregistrer et transmettre à la Direction/);
  assert.match(source, /Plan d'exécution — Imane/);
  assert.match(source, /executionPlan/);
  assert.match(source, /Sélectionner un document existant/);
  assert.match(source, /Téléverser/);
  assert.match(source, /linkDocument/);
  assert.match(source, /TRANSPORT_MODES/);
  assert.match(source, /PAYMENT_METHODS/);
});
