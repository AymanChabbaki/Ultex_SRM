import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
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

test('Direction arrival screen persists analysis and returns the workflow to Imane', () => {
  const source = fs.readFileSync(new URL('../src/components/fiches/AnalyseArrivageDirection.jsx', import.meta.url), 'utf8');
  const arrivalSource = fs.readFileSync(new URL('../src/components/fiches/FicheArrivage.jsx', import.meta.url), 'utf8');
  const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(source, /analysesLimex: replaceAnalysis\(record\)/);
  assert.match(source, /ACTIONS_REVUE_ARRIVAGE\.RETOUR_IMANE/);
  assert.match(source, /destinataireImane\(db\)/);
  assert.match(source, /Terminer l'analyse et transmettre à Imane/);
  assert.match(arrivalSource, /roleCircuit === 'Direction'/);
  assert.match(appSource, /\['analysesLimex', 'arrivages'/);
});
