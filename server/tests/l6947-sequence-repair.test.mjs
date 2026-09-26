import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../scripts/repair_l6947_sequence.js', import.meta.url), 'utf8');

test('repair merges accidental L6947 into established L1635 then shifts L6948-L6956 down', () => {
  assert.match(source, /const MERGE_FROM = 'L6947'/);
  assert.match(source, /const MERGE_INTO = 'L1635'/);
  for (let code = 6948; code <= 6956; code += 1) {
    assert.match(source, new RegExp(`\\['L${code}', 'L${code - 1}'\\]`));
  }
});

test('repair preserves demandes and repoints all structured client references', () => {
  assert.match(source, /REFERENCE_FIELDS = \['client', 'codeClientAssocie', 'codeClient', 'clientCode', 'codeClientUltex'\]/);
  assert.match(source, /referenceMetier/);
  assert.doesNotMatch(source, /collectionItem\.(?:delete|deleteMany)\(\{[\s\S]{0,200}collection:\s*'demandes'/);
  assert.match(source, /collectionItem\.delete\(\{\s*where: \{ collection_id: \{ collection: 'clients'/);
  assert.match(source, /Toutes les demandes historiques ont été conservées/);
});

test('repair accepts the exact stale demande identity bridge shown by the dashboard', () => {
  assert.match(source, /async function demandeIdentityBridgeCount/);
  assert.match(source, /path: \['client'\], equals: MERGE_FROM/);
  assert.match(source, /path: \['codeClientUltex'\], equals: MERGE_INTO/);
  assert.match(source, /demandeIdentityBridges === 0/);
});

test('repair is preview-only by default, atomic, guarded, and idempotent', () => {
  assert.match(source, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(source, /--confirm shift-L6947-L6956/);
  assert.match(source, /prisma\.\$transaction/);
  assert.match(source, /pg_advisory_xact_lock\(6947, 6956\)/);
  assert.match(source, /REPAIR_L6947_SHIFT_20260926/);
});
