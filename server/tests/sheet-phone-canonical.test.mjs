import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { chooseCanonicalPhoneClient } from '../src/sheetsLLeads.js';

test('duplicate phone reuses the established lower code in the same series', () => {
  const selected = chooseCanonicalPhoneClient([
    { id: 'L6947', code: 'L6947', createdAt: new Date('2026-09-25'), data: { sourceDonnees: 'Google Sheets' } },
    { id: 'L1635', code: 'L1635', createdAt: new Date('2025-01-01'), data: { sourceDonnees: 'Workflow' } },
  ]);
  assert.equal(selected.code, 'L1635');
});

test('duplicate phone prefers the oldest client across different code families', () => {
  const selected = chooseCanonicalPhoneClient([
    { id: 'L7000', code: 'L7000', createdAt: new Date('2026-01-01'), data: {} },
    { id: 'A200', code: 'A200', createdAt: new Date('2024-01-01'), data: {} },
  ]);
  assert.equal(selected.code, 'A200');
});

test('L sync merges duplicate-phone clients instead of rejecting the lead', () => {
  const source = fs.readFileSync(new URL('../src/sheetsLLeads.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Plusieurs clients ont ce téléphone/);
  assert.match(source, /await mergePhoneClients\(tx, matches\)/);
  assert.match(source, /\['client', 'codeClientAssocie', 'codeClient', 'codeClientUltex'\]/);
  assert.match(source, /collection: 'clients', id: duplicate\.id/);
});
