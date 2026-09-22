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
  assert.match(server, /Boolean\(client\.data\?\.sheetLeadId\)/);
});

test('test-client deletion removes linked lines before demandes and client', () => {
  const lines = server.indexOf("['demandeLignes', lines]");
  const demandes = server.indexOf("['demandes', sheetDemandes]");
  const clients = server.indexOf("['clients', [client]]");
  assert.ok(lines > -1 && demandes > lines && clients > demandes);
  assert.match(server, /Suppression refusée : ce client possède une demande/);
});
