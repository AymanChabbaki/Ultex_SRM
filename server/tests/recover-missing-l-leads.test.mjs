import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(new URL('../scripts/recover_missing_l_leads_20260928.js', import.meta.url), 'utf8');

test('recovery contains the three requested authoritative lead codes and products', () => {
  assert.match(source, /code: 'L6964'[\s\S]*produit: 'Freeze dryer'/);
  assert.match(source, /code: 'L6969'[\s\S]*produit: 'اكسسوارات الالومنيوم'/);
  assert.match(source, /code: 'L6970'[\s\S]*produit: 'Machine rotative automatique/);
});

test('recovery creates client, contact, demande, and demande line idempotently', () => {
  assert.match(source, /collection: 'clients'/);
  assert.match(source, /createItem\(tx, 'contacts'/);
  assert.match(source, /createItem\(tx, 'demandes'/);
  assert.match(source, /createItem\(tx, 'demandeLignes'/);
  assert.match(source, /data: \{ path: \['sheetLeadId'\], equals: lead\.sheetLeadId \}/);
});

test('recovery refuses code or phone ownership conflicts and requires explicit confirmation', () => {
  assert.match(source, /Sécurité: \$\{lead\.code\} appartient déjà/);
  assert.match(source, /Sécurité: le téléphone \$\{lead\.telephone\} appartient déjà/);
  assert.match(source, /--apply --confirm recover-L6964-L6969-L6970/);
  assert.match(source, /pg_advisory_xact_lock\(6912, 2026\)/);
});

test('recovery never lowers the durable L-code high-water mark', () => {
  assert.match(source, /else if \(counter\.val < highest\)/);
});
