import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const modules = fs.readFileSync(new URL('../src/data/modules.js', import.meta.url), 'utf8');

test('the Sourcing profile no longer asks for or displays an obsolete dossier', () => {
  const start = modules.indexOf('sourcings:{label:');
  const end = modules.indexOf('\netudes:{label:', start);
  assert.ok(start >= 0 && end > start);
  const sourcing = modules.slice(start, end);
  assert.doesNotMatch(sourcing, /k:"dossier"/);
  assert.doesNotMatch(sourcing, /\["dossier","Dossier"/);
  assert.match(sourcing, /\["fournisseur","Fournisseur"/);
});
