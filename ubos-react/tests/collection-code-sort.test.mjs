import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const genericModule = readFileSync(new URL('../src/components/modules/GenericModule.jsx', import.meta.url), 'utf8');
const filterTable = readFileSync(new URL('../src/components/common/FilterTable.jsx', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../server/src/index.js', import.meta.url), 'utf8');

test('le clic sur Code demande un tri global au serveur', () => {
  assert.match(genericModule, /sortKey: remoteSort\.key/);
  assert.match(genericModule, /index === 0 \? 'code'/);
  assert.match(genericModule, /setRemotePage\(1\)/);
  assert.match(filterTable, /onSortChange\(nextSort\)/);
  assert.match(filterTable, /!remoteSort && sort\.index >= 0/);
});

test('le serveur trie les codes par préfixe puis par numéro avant la pagination', () => {
  assert.match(backend, /function collectionOrderExpression/);
  assert.match(backend, /collection === 'clients'[\s\S]*data->>'codeClientUltex'[\s\S]*NULLIF\(code, ''\)/);
  assert.match(backend, /collectionOrderExpression\(collection, sortKey, sortDir\)/);
  assert.match(backend, /substring\(\$\{code\} from '\(\[0-9\]\+\)'\)/);
  assert.match(backend, /ORDER BY \$\{orderBy\}[\s\S]*LIMIT \$\{pageSize\}/);
  assert.match(backend, /sortKey, sortDir/);
});
