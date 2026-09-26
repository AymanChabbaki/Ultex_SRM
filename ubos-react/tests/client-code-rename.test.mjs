import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { renommerCodeClient } from '../src/data/db.js';

test('renaming a client code updates its identity and every live reference', () => {
  const db = {
    clients: [{ id: 'L100', code: 'L100', codeClientUltex: 'L100', nom: 'Client' }],
    demandes: [{ code: 'D1', client: 'L100', codeClientUltex: 'L100' }],
    commandes: [{ code: 'CMD1', client: 'L100' }],
    documents: [{ code: 'DOC1', client: 'L100' }],
    contacts: [{ code: 'CT1', codeClientAssocie: 'L100' }],
    suivisClosing: [{ code: 'SC1', client: 'L100', codeClient: 'L100' }],
  };

  const result = renommerCodeClient(db, 'L100', '9600');

  assert.deepEqual(result.db.clients[0], { id: '9600', code: '9600', codeClientUltex: '9600', nom: 'Client' });
  assert.equal(result.db.demandes[0].client, '9600');
  assert.equal(result.db.demandes[0].codeClientUltex, '9600');
  assert.equal(result.db.commandes[0].client, '9600');
  assert.equal(result.db.documents[0].client, '9600');
  assert.equal(result.db.contacts[0].codeClientAssocie, '9600');
  assert.equal(result.db.suivisClosing[0].client, '9600');
  assert.equal(result.db.suivisClosing[0].codeClient, '9600');
  assert.ok(result.count >= 8);
});

test('Data dashboard displays the canonical client code and links through the real client key', () => {
  const source = fs.readFileSync(new URL('../src/components/custom/TableauBordData.jsx', import.meta.url), 'utf8');
  assert.match(source, /\[client\.id, client\.code, client\.codeClientUltex\]/);
  assert.match(source, /client\?\.code \|\| client\?\.codeClientUltex/);
  assert.match(source, /_clientCodeAffiche: canonicalCode/);
  assert.match(source, /#ficheClient:\$\{o\._clientLienCode\}/);
});
