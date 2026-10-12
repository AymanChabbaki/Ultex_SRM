import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  countryFromMetaExportPhone,
  normalizeMetaExportPhone,
  validateMetaExportV2Lead,
} from '../src/metaExportV2Leads.js';

const frenchLead = (changes = {}) => ({
  sheetName: 'Formulaire export',
  sheetRow: 2,
  leadId: 'meta-123',
  createdTime: '2026-10-12T09:30:00+00:00',
  fullName: 'Client Export',
  phone: '06 64 80 83 50',
  email: 'client@example.com',
  product: 'huile_d’olive',
  volume: 'moins_de_5_conteneurs',
  partners: 'oui,_partenaire_fiable',
  frustration: 'retards',
  platform: 'ig',
  formName: 'Formulaire export',
  ...changes,
});

test('V2 export validation normalizes the French Meta form without losing its source ID', () => {
  const lead = validateMetaExportV2Lead(frenchLead());
  assert.equal(lead.importSourceId, 'meta-export:meta-123');
  assert.equal(lead.phone, '212664808350');
  assert.equal(lead.country, 'Maroc');
  assert.equal(lead.product, 'huile d’olive');
  assert.equal(lead.platform, 'Instagram');
  assert.equal(lead.language, 'fr');
  assert.equal(lead.createdAt.toISOString(), '2026-10-12T09:30:00.000Z');
});

test('V2 export validation accepts the Arabic v4 questionnaire and preserves ONSSA experience', () => {
  const lead = validateMetaExportV2Lead(frenchLead({
    sheetName: 'Formulaire export (v4)',
    leadId: 'meta-ar-1',
    phone: '+34 631 619 498',
    product: 'زيت الزيتون',
    volume: '',
    exportExperience: 'نعم، عندي لونصا',
  }));
  assert.equal(lead.language, 'ar');
  assert.equal(lead.exportExperience, 'نعم، عندي لونصا');
  assert.equal(lead.country, 'Espagne');
});

test('V2 export validation ignores Meta dummy rows and rejects unknown sheet names', () => {
  assert.equal(validateMetaExportV2Lead(frenchLead({ email: 'test@meta.com' })).ignored, true);
  assert.throws(() => validateMetaExportV2Lead(frenchLead({ sheetName: 'Other tab' })), /Feuille non autorisée/);
});

test('phone helpers support Moroccan local numbers and international country inference', () => {
  assert.equal(normalizeMetaExportPhone('0664-808-350'), '212664808350');
  assert.equal(countryFromMetaExportPhone('21622123456'), 'Tunisie');
});

test('server exposes an authenticated V2-only Meta export endpoint and invalidates Data dashboard cache', () => {
  const server = readFileSync(resolve('src/index.js'), 'utf8');
  const module = readFileSync(resolve('src/metaExportV2Leads.js'), 'utf8');
  assert.match(server, /app\.post\('\/api\/sync\/sheets\/meta-export-v2', ultexSyncAuth, metaExportV2LeadHandler\(prisma, CRM_INSTANCE\)\)/);
  assert.match(server, /req\.path\.startsWith\('\/api\/sync\/sheets\/'\)/);
  assert.match(module, /crmInstance !== 'v2'/);
  assert.match(module, /pg_advisory_xact_lock\(6900, 5\)/);
  assert.match(module, /const code = `E\$\{number\}`/);
  assert.match(module, /importSourceId: `meta-export:\$\{leadId\}`/);
});

test('the bound Apps Script handles both tabs and posts only to the V2 API', () => {
  const script = readFileSync(resolve('integrations/google_sheets_meta_export_v2.gs'), 'utf8');
  assert.match(script, /'Formulaire export', 'Formulaire export \(v4\)'/);
  assert.match(script, /https:\/\/crm\.ultex\.ma\/api-v2\/sync\/sheets\/meta-export-v2/);
  assert.match(script, /رقم_الهاتف/);
  assert.match(script, /ما_نوع_المنتج_الذي_ترغب_في_استيراده_أو_تصديره/);
  assert.match(script, /CRM_CLIENT_CODE/);
  assert.match(script, /everyMinutes\(1\)/);
});
