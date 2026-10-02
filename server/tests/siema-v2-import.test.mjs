import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve('scripts/import_siema_prospects_v2.js');

test('SIEMA importer parses the titled CSV without connecting to a database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'siema-v2-'));
  const csv = join(directory, 'prospects.csv');
  writeFileSync(csv, [
    ',,,,,,,,,',
    'Prospects ULTEx,,,,,,,,,',
    ',,,,,,,,,',
    ',,,,,,,,,',
    ',,,,,,,,,',
    'Nom de l’entreprise,Activité,Nom et prénom du contact,Fonction,Téléphone / WhatsApp,Email,Site web,Produits fabriqués ou distribués,Pays d’approvisionnement,Besoins éventuels en sourcing/importation',
    'Entreprise Test,Industrie,Contact Test,Manager,+212 600000000,test@example.com,example.com,Produit Test,Chine,Sourcing',
  ].join('\n'), 'utf8');

  try {
    const result = spawnSync(process.execPath, [script, '--file', csv, '--inspect-only'], {
      cwd: resolve('.'), encoding: 'utf8', env: { ...process.env, CRM_INSTANCE: '' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1 ligne\(s\) valide\(s\), 0 rejet\(s\)/);
    assert.match(result.stdout, /aucune connexion et aucune écriture/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('SIEMA importer is V2-only and requires explicit apply confirmation', () => {
  const source = readFileSync(script, 'utf8');
  assert.match(source, /process\.env\.CRM_INSTANCE !== 'v2'/);
  assert.match(source, /--confirm import-siema-prospects-v2/);
  assert.match(source, /importSourceId/);
  assert.match(source, /reserveNextNumericClientCode/);
});
