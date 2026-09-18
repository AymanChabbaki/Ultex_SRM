import assert from 'node:assert/strict';
import test from 'node:test';

import {
  codesSansSuiviDepuis,
  clientsActifsData,
  genererAlertesData,
  genererFileDeTravail,
  leadsDuJour,
} from '../src/utils/dataPipeline.js';

const user = { nomComplet: 'Ouiam', identifiant: 'ouiam', services: ['Data'] };
const today = new Date('2026-09-18T12:00:00Z');

function database() {
  return {
    clients: [
      { code: 'L100', nom: 'Workflow Today', sourceDonnees: 'Workflow', datePremierContact: '2026-09-18', dateDerniereDemande: '2026-09-18', echeanceCode: '2026-09-18', dernierContact: '2026-09-10' },
      { code: 'L200', nom: 'Sheet Today', sourceDonnees: 'Google Sheets', datePremierContact: '2026-09-18', dateDerniereDemande: '2026-09-18' },
      { code: 'L300', nom: 'Old Code', sourceDonnees: 'Workflow', dernierSuiviData: '2026-08-01', dernierContact: '2026-08-01' },
    ],
    demandes: [
      { code: 'D1', client: 'L100', codeClientUltex: 'L100', dateDemande: '2026-09-18', sourceSynchronisation: 'Workflow', objectifGeneral: 'Produit A', responsableData: 'Data', dataTag: 'Pas réponse', statut: 'Nouvelle' },
      { code: 'D2', client: 'L200', codeClientUltex: 'L200', dateDemande: '2026-09-18', sourceSynchronisation: 'Google Sheets', objectifGeneral: 'Produit B', responsableData: 'Data', statut: 'Nouvelle' },
      { code: 'D3', client: 'L300', dateDemande: '2026-09-17', objectifGeneral: 'Ancien', responsableData: 'Data', dataTag: 'Pas réponse', statut: 'Nouvelle' },
    ],
    taches: [], demandeLignes: [],
  };
}

test('Data dashboard lists today leads from Workflow and Google Sheets', () => {
  assert.deepEqual(leadsDuJour(database(), user, today).map(item => item.code).sort(), ['D1', 'D2']);
});

test('code deadlines and one-month follow-up gaps become daily work', () => {
  const db = database();
  assert.deepEqual(codesSansSuiviDepuis(db, user, 30, today).map(item => item.code), ['L300']);
  const work = genererFileDeTravail(db, user);
  assert.ok(work.some(item => item.code === 'L100' && item.motif === 'echeance-code'));
  assert.ok(work.some(item => item.code === 'L300' && item.motif === 'sans-suivi-30j'));
});

test('historical clients do not flood new missing-action alerts or first-contact work', () => {
  const db = database();
  const work = genererFileDeTravail(db, user);
  assert.ok(work.some(item => item.code === 'L200' && item.motif === 'relance'));
  assert.ok(!work.some(item => item.code === 'L300' && item.motif === 'relance'));
  assert.ok(work.some(item => item.code === 'D1' && item.motif === 'tag-Pas réponse'));
  assert.ok(!work.some(item => item.code === 'D3' && item.motif === 'tag-Pas réponse'));
  assert.deepEqual(clientsActifsData(db, user).map(client => client.code).sort(), ['L100', 'L200']);

  const alert = genererAlertesData(db, user).find(item => item.titre === 'Clients sans prochaine action définie');
  assert.deepEqual(alert.clients.map(client => client.code).sort(), ['L100', 'L200']);
});
