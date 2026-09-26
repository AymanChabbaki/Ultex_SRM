import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../scripts/rotate_l6947_l6956.js', import.meta.url), 'utf8');

test('rotation matches the authoritative Data-sheet products', () => {
  for (const value of [
    "{ code: 'L6947', product: 'planche de surf' }",
    "{ code: 'L6948', product: 'repeter wifi' }",
    "{ code: 'L6949', product: 'quad 100' }",
    "{ code: 'L6950', product: 'mugs 3d' }",
    "{ code: 'L6951', product: 'chaussures de sport' }",
    "{ code: 'L6952', product: 'pop corn' }",
    "{ code: 'L6953', product: 'dashcam' }",
    "{ code: 'L6954', product: 'led' }",
    "{ code: 'L6955', product: '2 طن' }",
    "{ code: 'L6956', product: 'sac pour femme' }",
  ]) assert.ok(source.includes(value));
});

test('old L6947 is protected in a temporary code then becomes L6956', () => {
  assert.match(source, /renameClient\(tx, 'L6947', TEMP_CODE\)/);
  assert.match(source, /renameClient\(tx, TEMP_CODE, 'L6956'\)/);
  assert.match(source, /EXPECTED\.slice\(1\).*Number\(code\.slice\(1\)\) - 1/);
});

test('rotation repoints all known client references without deleting records', () => {
  assert.match(source, /REFERENCE_FIELDS = \['client', 'codeClientAssocie', 'codeClient', 'clientCode', 'codeClientUltex'\]/);
  assert.match(source, /referenceMetier/);
  assert.match(source, /auditLog\.updateMany/);
  assert.doesNotMatch(source, /collectionItem\.delete/);
});

test('rotation is preview-only, atomic, guarded, and idempotent', () => {
  assert.match(source, /const APPLY = process\.argv\.includes\('--apply'\)/);
  assert.match(source, /--confirm rotate-L6947-L6956/);
  assert.match(source, /prisma\.\$transaction/);
  assert.match(source, /pg_advisory_xact_lock\(6947, 6956\)/);
  assert.match(source, /REPAIR_L6947_L6956_ROTATION_20260926_V2/);
  assert.match(source, /products\.some\(product => normalized\(product\)\.includes/);
});
