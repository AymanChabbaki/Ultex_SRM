import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { codeClientAffiche, groupeCodeClient } from '../src/utils/clientCodeGroups.js';

test('les clients sont répartis dans les quatre pages de codes', () => {
  assert.equal(groupeCodeClient({ code: 'L4311' }), 'L');
  assert.equal(groupeCodeClient({ code: 'A446' }), 'A');
  assert.equal(groupeCodeClient({ code: 'R88' }), 'R');
  assert.equal(groupeCodeClient({ code: '7105' }), '#');
  assert.equal(groupeCodeClient({ code: 'CRM1', codeClientUltex: '8368' }), '#');
  assert.equal(codeClientAffiche({ code: 'CRM1', codeClientUltex: 'L9000' }), 'L9000');
});

test('le Darf client accepte plusieurs fichiers et les lie au client', () => {
  const source = readFileSync(new URL('../src/components/fiches/FicheClient.jsx', import.meta.url), 'utf8');
  assert.match(source, /Darf \/ Fichiers/);
  assert.match(source, /type="file" multiple/);
  assert.match(source, /client: code/);
});

test('les documents partagés notifient les membres du service', () => {
  const source = readFileSync(new URL('../src/components/custom/DocumentsPartages.jsx', import.meta.url), 'utf8');
  assert.match(source, /partageService: true/);
  assert.match(source, /servicePartage: serviceCible/);
  assert.match(source, /utilisateur\.services \|\| \[\]/);
  assert.match(source, /notifier\(/);
  assert.match(source, /Lien: #documentsPartages/);
});

test('la facturation et les reçus sont annoncés comme prochain module', () => {
  const source = readFileSync(new URL('../src/components/custom/FacturationRecus.jsx', import.meta.url), 'utf8');
  assert.match(source, /bientôt disponible/i);
});
