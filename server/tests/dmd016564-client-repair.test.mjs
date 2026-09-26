import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../scripts/repair_dmd016564_client.js', import.meta.url), 'utf8');
const supersededSource = fs.readFileSync(new URL('../scripts/repair_l6947_sequence.js', import.meta.url), 'utf8');

test('repair targets the exact Thermostat Sheet demande and established client', () => {
  assert.match(source, /const DEMANDE_CODE = 'DMD016564'/);
  assert.match(source, /5290da31-b832-4f0b-ac74-9588c6a9c5a0/);
  assert.match(source, /const WRONG_CLIENT = 'L6947'/);
  assert.match(source, /const CORRECT_CLIENT = 'L1635'/);
  assert.match(source, /submittedPhone !== correctPhone/);
});

test('repair updates only the demande, its lines, and matching-phone contacts', () => {
  assert.match(source, /collection: 'demandeLignes'/);
  assert.match(source, /collection: 'contacts'/);
  assert.match(source, /normalizePhone\(item\.data\?\.telephone\) === submittedPhone/);
  assert.match(source, /client: CORRECT_CLIENT, codeClientUltex: CORRECT_CLIENT/);
  assert.match(source, /referenceMetier\?\.endsWith/);
});

test('repair preserves occupied L6947 and never renumbers or deletes clients', () => {
  assert.match(source, /Client \$\{WRONG_CLIENT\} préservé/);
  assert.doesNotMatch(source, /collectionItem\.delete/);
  assert.doesNotMatch(source, /L6948/);
  assert.doesNotMatch(source, /renameClient/);
});

test('repair is preview-only, transactional, confirmed, and idempotent', () => {
  assert.match(source, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(source, /--confirm move-DMD016564-to-L1635/);
  assert.match(source, /prisma\.\$transaction/);
  assert.match(source, /pg_advisory_xact_lock\(1654, 16564\)/);
  assert.match(source, /REPAIR_DMD016564_CLIENT_20260926/);
});

test('the disproven L6947 client merge script is permanently disabled', () => {
  assert.match(supersededSource, /Script annulé: L6947 est un client légitime/);
  assert.match(supersededSource, /repair_dmd016564_client\.js/);
  assert.match(supersededSource, /process\.exit\(1\)/);
});
