import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const server = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const sheetLeads = fs.readFileSync(new URL('../src/sheetsLLeads.js', import.meta.url), 'utf8');

test('the shared L sequence is permanently reserved through L6912', () => {
  assert.match(sheetLeads, /pg_advisory_xact_lock\(6912, 2026\)/);
  assert.match(sheetLeads, /}, 6912\);/);
});

test('test-client deletion is elevation-gated and limited to L codes created by Google Sheets', () => {
  assert.match(server, /app\.delete\('\/api\/security\/sheet-test-clients\/:code', authMiddleware, requireElevation/);
  assert.match(server, /if \(!\/\^L\\d\+\$\/\.test\(code\)\)/);
  assert.match(server, /sourceDonnees === 'Google Sheets'/);
  assert.match(server, /Boolean\(client\?\.data\?\.sheetLeadId\)/);
});

test('test-client deletion removes linked lines before demandes and client', () => {
  const lines = server.indexOf("['demandeLignes', lines]");
  const demandes = server.indexOf("['demandes', sheetDemandes]");
  const clients = server.indexOf("['clients', client ? [client] : []]");
  assert.ok(lines > -1 && demandes > lines && clients > demandes);
  assert.match(server, /Suppression refusée : ce client possède une demande/);
});

test('orphaned Sheet demandes can be cleaned after the client row was already deleted', () => {
  assert.match(server, /if \(!client && sheetDemandes\.length === 0\)/);
  assert.match(server, /\['clients', client \? \[client\] : \[\]\]/);
});

test('generic client deletion cannot orphan another Google Sheets test lead', () => {
  assert.match(server, /Utilisez « Supprimer ce code test » pour retirer aussi les demandes et produits liés/);
});

test('dashboard cleanup deletes by demande code and preserves a real client that reused the displayed L code', () => {
  assert.match(server, /app\.delete\('\/api\/security\/sheet-test-demandes\/:demandeCode', authMiddleware, requireElevation/);
  assert.match(server, /const sheetDemande = demande\.data\?\.sourceSynchronisation === 'Google Sheets'/);
  assert.match(server, /if \(client && sheetClient && remainingDemandes\.length === 0\)/);
  assert.match(server, /Suppression demande test Google Sheets/);
});

test('numeric Workflow test cleanup is elevation-gated and rooted at the demande', () => {
  assert.match(server, /app\.delete\('\/api\/security\/workflow-test-demandes\/:demandeCode', authMiddleware, requireElevation/);
  assert.match(server, /demande\.data\?\.sourceSynchronisation !== 'Workflow'/);
  assert.match(server, /confirmationClient !== clientCode/);
  assert.match(server, /Suppression demande test Workflow/);
});

test('Workflow cleanup preserves a client that still has demandes or business references', () => {
  assert.match(server, /else if \(remainingDemandes\.length\) clientPreservedReason/);
  assert.match(server, /else if \(protectedRefs\.length\) clientPreservedReason/);
  assert.match(server, /collection: \{ notIn: \['clients', 'contacts', 'documents', 'demandes', 'demandeLignes'\] \}/);
});

test('returning L leads normalize stale JSON identity to the canonical row code', () => {
  assert.match(sheetLeads, /data\.id = client\.code/);
  assert.match(sheetLeads, /data\.code = client\.code/);
  assert.match(sheetLeads, /data\.codeClientUltex = client\.code/);
});

test('server startup repairs existing Google Sheets L identity mismatches', () => {
  assert.match(server, /async function reparerIdentitesClientsLGoogleSheets/);
  assert.match(server, /SET data = data \|\| jsonb_build_object\('id', code, 'code', code, 'codeClientUltex', code\)/);
  assert.match(server, /COALESCE\(NULLIF\(code, ''\), NULLIF\(data->>'codeClientUltex', ''\), id\)/);
  assert.match(server, /await reparerIdentitesClientsLGoogleSheets\(\)/);
});
