import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const script = resolve('scripts/import_meta_export_leads_v2.js');
const header = [
  'id', 'created_time', 'ad_id', 'ad_name', 'adset_id', 'adset_name',
  'campaign_id', 'campaign_name', 'form_id', 'form_name', 'is_organic', 'platform',
  "quel_est_votre_volume_d'exportation_actuel_?",
  'avez-vous_déjà_des_partenaires_(fournisseurs_ou_acheteurs)_fiables_?',
  "quelle_est_votre_plus_grande_frustration_logistique_aujourd'hui_?",
  'quel_type_de_produit_souhaitez-vous_importer_ou_exporter_?',
  'email', 'phone_number', 'full_name', 'lead_status', '', '', '',
].join(',');

test('Meta export importer inspects valid rows, skips test leads and preserves country/owner metadata', () => {
  const directory = mkdtempSync(join(tmpdir(), 'meta-export-v2-'));
  const csv = join(directory, 'meta.csv');
  const report = join(directory, 'report.json');
  writeFileSync(csv, [
    header,
    'l:test,2026-10-05T12:52:37-05:00,,,,,,,f:test,Formulaire export,true,,<test lead: dummy data>,<test lead: dummy data>,<test lead: dummy data>,<test lead: dummy data>,test@meta.com,p:<test lead: dummy data>,<test lead: dummy data>,confirmed,,,',
    'l:1,2026-10-05T14:26:49-05:00,ag:1,Ad 1,as:1,Set 1,c:1,Campaign 1,f:1,Formulaire export,false,ig,moins_de_5,"oui,_partenaire",retards,huile,test1@example.com,p:+212664808350,Client Maroc,CREATED,zoubida,note interne,',
    'l:2,2026-10-06T10:31:14-05:00,ag:2,Ad 2,as:1,Set 1,c:1,Campaign 1,f:1,Formulaire export,false,fb,5_a_20,non,couts,olive,test2@example.com,p:+34631619498,Client Espagne,CREATED,oumaima,,',
  ].join('\n'), 'utf8');

  try {
    const result = spawnSync(process.execPath, [script, '--file', csv, '--inspect-only', '--report', report], {
      cwd: resolve('.'), encoding: 'utf8', env: { ...process.env, CRM_INSTANCE: '' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /2 ligne\(s\) valide\(s\), 0 rejet\(s\), 1 test\(s\) ignoré\(s\)/);
    assert.match(result.stdout, /aucune connexion et aucune écriture/);
    const parsed = JSON.parse(readFileSync(report, 'utf8'));
    assert.deepEqual(parsed.countries, { Maroc: 1, Espagne: 1 });
    assert.deepEqual(parsed.owners, { Zoubida: 1, Oumaima: 1 });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Meta export importer is V2-only, idempotent and allocates only E client codes', () => {
  const source = readFileSync(script, 'utf8');
  assert.match(source, /process\.env\.CRM_INSTANCE !== 'v2'/);
  assert.match(source, /--confirm import-meta-export-v2/);
  assert.match(source, /importSourceId: `meta-export:\$\{leadId\}`/);
  assert.match(source, /async function reserveNextEClientCode/);
  assert.match(source, /const code = `E\$\{number\}`/);
  assert.match(source, /const counterKey = 'CLIENT_E'/);
  assert.match(source, /action: 'conflict_non_e_match'/);
  assert.match(source, /sourceSynchronisation: SOURCE_NAME/);
  assert.match(source, /sensOperation: 'Export'/);
  assert.doesNotMatch(source, /reserveNextNumericClientCode/);
});

