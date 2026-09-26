import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { serializeCollectionRows } from '../src/dashboardRows.js';

test('database id and code override stale JSON identity on dashboard rows', () => {
  const createdAt = new Date('2026-09-25T14:21:10.000Z');
  const [row] = serializeCollectionRows([{
    id: 'L6947',
    code: 'L6947',
    createdAt,
    data: {
      id: 'L1635',
      code: 'L1635',
      codeClientUltex: 'L6947',
      nom: 'Azzeddine Bari',
    },
  }]);

  assert.equal(row.id, 'L6947');
  assert.equal(row.code, 'L6947');
  assert.equal(row.codeClientUltex, 'L6947');
  assert.equal(row.nom, 'Azzeddine Bari');
  assert.equal(row.createdAt, createdAt.toISOString());
});

test('data dashboard explicitly loads clients referenced by returned demandes', () => {
  const source = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(source, /const missingClientRefs =/);
  assert.match(source, /item\.data\?\.client, item\.data\?\.codeClientUltex/);
  assert.match(source, /const completeClientRows =/);
  assert.match(source, /clients: serializeCollectionRows\(completeClientRows\)/);
  assert.match(source, /jsonb_array_elements_text\(\$\{missingClientRefsJson\}::jsonb\)/);
  assert.match(source, /WITH refs AS MATERIALIZED/);
  assert.doesNotMatch(source, /Prisma\.join\(missingClientRefs\)/);
});

test('lifetime lead history also uses canonical database identity', () => {
  const source = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(source, /items: serializeCollectionRows\(demandeRows\)/);
  assert.match(source, /clients: serializeCollectionRows\(clientRows\)/);
});
