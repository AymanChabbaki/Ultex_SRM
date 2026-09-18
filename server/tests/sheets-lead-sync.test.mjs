import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

test('CRM exposes an authenticated idempotent Google Sheets lead endpoint', () => {
  assert.match(source, /app\.post\('\/api\/sync\/sheets\/lead', ultexSyncAuth/);
  assert.match(source, /path: \['sheetLeadId'\], equals: sheetLeadId/);
  assert.match(source, /sourceSynchronisation: 'Google Sheets'/);
  assert.match(source, /responsableData: responsableData \|\| 'Data'/);
});

