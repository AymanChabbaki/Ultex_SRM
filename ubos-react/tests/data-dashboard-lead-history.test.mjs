import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const dashboardSource = fs.readFileSync(new URL('../src/components/custom/TableauBordData.jsx', import.meta.url), 'utf8');
const apiSource = fs.readFileSync(new URL('../src/services/api.js', import.meta.url), 'utf8');
const serverSource = fs.readFileSync(new URL('../../server/src/index.js', import.meta.url), 'utf8');

test('Data lead table exposes queue, lifetime, and exact GMT date views', () => {
  assert.match(dashboardSource, />Voir tous<\/button>/);
  assert.match(dashboardSource, /Date précise \(GMT\)/);
  assert.match(dashboardSource, />Afficher la date<\/button>/);
  assert.match(dashboardSource, /leadView === 'queue' \? nouveauxLeads : leadsHistorique/);
});

test('lead history is loaded lazily through its own API instead of bloating the dashboard payload', () => {
  assert.match(apiSource, /dashboard\/data\/leads/);
  assert.match(dashboardSource, /if \(leadView === 'queue'\) return undefined/);
  assert.match(apiSource, /fetchCompleteCollection\('demandes'\)/);
  assert.match(apiSource, /fetchCompleteCollection\('clients'\)/);
  assert.match(serverSource, /app\.get\('\/api\/dashboard\/data\/leads'/);
  assert.match(serverSource, /dashboard-data-leads:/);
});

test('lead history excludes manual dossiers and exact-date lookup uses the GMT receipt day', () => {
  assert.match(serverSource, /createdManually/);
  assert.match(serverSource, /created_manually/);
  assert.match(serverSource, /Saisie manuelle/);
  assert.match(serverSource, /AT TIME ZONE 'UTC'/);
  assert.match(serverSource, /const dateFilter = scope === 'date'/);
});

test('a lead remains linked through its persisted client reference when compact client data is absent', () => {
  assert.match(dashboardSource, /client\?\.code \|\| demande\.client/);
  assert.match(dashboardSource, /demandesDeAgent\(\{ demandes: leadHistory\.items \|\| \[\] \}, user\)/);
  assert.match(dashboardSource, /localDay\(demande\.dateHeureReception \|\| demande\.dateDemande\) === leadDate/);
});
