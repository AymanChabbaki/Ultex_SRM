import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  applyImaneComplementResponses,
  LIMEX_DIRECTION_SECTIONS,
  buildDirectionAnalysisContext,
  createDirectionAnalysisDraft,
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
    'general', 'technique', 'fournisseur', 'commercial', 'origine-valeur', 'douane', 'paiements',
    'production', 'transport', 'chargement', 'transit', 'declaration', 'livraison', 'risques',
  ]);
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
  assert.equal(draft.controls.commercial['packing-list'].status, 'À recevoir');
  assert.ok(missingDirectionInformation(draft).some(item => item.label === 'Packing List'));

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
    id: 'CMP1', sectionId: 'commercial', itemId: 'packing-list', section: 'Documents commerciaux',
    label: 'Packing List', detail: 'Ajouter la Packing List définitive', status: 'En attente',
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
  assert.equal(result.record.controls.commercial['packing-list'].current, 'Packing List reçue et contrôlée.');
  assert.equal(result.record.controls.commercial['packing-list'].documentCode, 'DOC1');
  assert.equal(result.record.controls.commercial['packing-list'].status, 'À vérifier');
});

test('Direction arrival screen persists analysis and returns the workflow to Imane', () => {
  const source = fs.readFileSync(new URL('../src/components/fiches/AnalyseArrivageDirection.jsx', import.meta.url), 'utf8');
  const apiSource = fs.readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8');
  const arrivalSource = fs.readFileSync(new URL('../src/components/fiches/FicheArrivage.jsx', import.meta.url), 'utf8');
  const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /analysesLimex: replaceAnalysis\(record\)/);
  assert.match(source, /ACTIONS_REVUE_ARRIVAGE\.RETOUR_IMANE/);
  assert.match(source, /destinataireImane\(db\)/);
  assert.match(source, /Terminer l'analyse et transmettre à Imane/);
  assert.match(source, /VÉRIFICATION PAR PRODUIT/);
  assert.match(source, /<th>Action<\/th>/);
  assert.match(source, /Demandes de complément/);
  assert.match(source, /Réponse générale d'Imane/);
  assert.match(source, /Réponse Imane :/);
  assert.match(source, /Contrôle & validation/);
  assert.match(source, /Plan d'exécution proposé/);
  assert.match(source, /openDocument\(document\)/);
  assert.doesNotMatch(source, /href=\{`#ficheDocument:/);
  assert.doesNotMatch(source, /<aside/);
  assert.match(source, /sectionMissing\.slice\(0, 10\)/);
  assert.match(apiSource, /export async function openStoredDocument/);
  assert.match(arrivalSource, /roleCircuit === 'Direction'/);
  assert.match(arrivalSource, /Informations demandées par la Direction/);
  assert.match(arrivalSource, /Transmettre les compléments à la Direction/);
  assert.match(appSource, /\['analysesLimex', 'arrivages'/);
});
