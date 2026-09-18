import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/components/fiches/FicheClient.jsx', import.meta.url), 'utf8');

test('la fiche client modifie directement le Data Tag et son échéance', () => {
  assert.match(source, /DATA_TAGS_WORKFLOW/);
  assert.match(source, /handleChangeSuiviData\('dataTag'/);
  assert.match(source, /handleChangeSuiviData\('echeanceCode'/);
  assert.match(source, /value=\{client\.dataTag \|\| ''\}/);
  assert.match(source, /value=\{client\.echeanceCode \|\| ''\}/);
  assert.match(source, /audit\('Clients', `\$\{label\} modifié\(e\)`/);
});
