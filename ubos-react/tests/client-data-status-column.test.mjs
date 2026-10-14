import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const modules = fs.readFileSync(new URL('../src/data/modules.js', import.meta.url), 'utf8');

test('Clients table shows the canonical Data Tag with its current version', () => {
  const start = modules.indexOf('clients:{label:');
  const end = modules.indexOf('\nleads:{label:', start);
  assert.ok(start >= 0 && end > start);
  const clients = modules.slice(start, end);
  assert.match(clients, /\["dataTag","État Data"/);
  assert.match(clients, /o\.etatVersion/);
  assert.match(clients, /V\$\{Number\(o\.etatVersion\)\} ·/);
});
