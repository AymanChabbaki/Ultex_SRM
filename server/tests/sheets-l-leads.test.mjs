import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { normalizeLeadPhone, validateSheetLead } from '../src/sheetsLLeads.js';

const indexSource = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

test('the lead-l route is registered, authenticated, and wired to lLeadHandler', () => {
  assert.match(indexSource, /import \{ lLeadHandler \} from '\.\/sheetsLLeads\.js';/);
  assert.match(indexSource, /app\.post\('\/api\/sync\/sheets\/lead-l', ultexSyncAuth, lLeadHandler\(prisma\)\)/);
});

test('normalizeLeadPhone: Moroccan local format (0X) becomes 212X', () => {
  assert.equal(normalizeLeadPhone('0661865993'), '212661865993');
  assert.equal(normalizeLeadPhone('0707767778'), '212707767778');
});

test('normalizeLeadPhone: bare 9-digit mobile gets the 212 prefix', () => {
  assert.equal(normalizeLeadPhone('661865993'), '212661865993');
});

test('normalizeLeadPhone: 00-international prefix is stripped, not converted', () => {
  assert.equal(normalizeLeadPhone('00212661865993'), '212661865993');
});

test('normalizeLeadPhone: already-normalized numbers pass through unchanged', () => {
  assert.equal(normalizeLeadPhone('212661865993'), '212661865993');
});

test('normalizeLeadPhone: strips non-digit formatting (spaces, dashes, +)', () => {
  assert.equal(normalizeLeadPhone('+212 661-86-59-93'), '212661865993');
});

test('normalizeLeadPhone: a foreign number is left as digits-only, never forced to 212', () => {
  // A French number must not be mistaken for a Moroccan local one.
  assert.equal(normalizeLeadPhone('+33612345678'), '33612345678');
});

test('normalizeLeadPhone: idempotent -- running it twice gives the same result', () => {
  const once = normalizeLeadPhone('0661865993');
  assert.equal(normalizeLeadPhone(once), once);
});

function baseLead(overrides = {}) {
  return {
    sheetLeadId: 'sheet1!row2', nom: 'Souhail chakrouf', telephone: '0707767778',
    dateReception: '2026-07-30T00:24:16+01:00', produit: 'Produit agricole',
    societe: 'Golden servancia', email: 'souhail.chakrouf15@gmail.com',
    ...overrides,
  };
}

test('validateSheetLead: accepts a well-formed sheet-1 style lead and normalizes its phone/date', () => {
  const lead = validateSheetLead(baseLead());
  assert.equal(lead.telephone, '212707767778');
  assert.equal(lead.dateReception, new Date('2026-07-30T00:24:16+01:00').toISOString());
  assert.equal(lead.nom, 'Souhail chakrouf');
});

test('validateSheetLead: accepts a well-formed sheet-2 (landing page) style lead', () => {
  const lead = validateSheetLead({
    sheetLeadId: 'sheet2!abc123', nom: 'Ayman', telephone: '212661865993',
    dateReception: '2026-09-10T09:00:00Z', produit: 'Marchandises',
    pays: 'Maroc', browserId: 'abc-123-def',
  });
  assert.equal(lead.telephone, '212661865993');
  assert.equal(lead.pays, 'Maroc');
  assert.equal(lead.browserId, 'abc-123-def');
});

test('validateSheetLead: rejects a missing sheetLeadId, nom, or produit', () => {
  assert.throws(() => validateSheetLead(baseLead({ sheetLeadId: '' })), /Identifiant, nom et produit requis/);
  assert.throws(() => validateSheetLead(baseLead({ nom: '' })), /Identifiant, nom et produit requis/);
  assert.throws(() => validateSheetLead(baseLead({ produit: '' })), /Identifiant, nom et produit requis/);
});

test('validateSheetLead: rejects an unparseable phone number', () => {
  assert.throws(() => validateSheetLead(baseLead({ telephone: 'not-a-phone' })), /Téléphone invalide/);
});

test('validateSheetLead: rejects a date without an explicit timezone', () => {
  // A naive "2026-07-30 00:24:16" is ambiguous across the sheet's and the
  // server's timezone -- reject rather than silently misdating the lead.
  assert.throws(() => validateSheetLead(baseLead({ dateReception: '2026-07-30 00:24:16' })), /Date de réception ISO/);
});

test('validateSheetLead: rejects an oversized field (basic payload hardening)', () => {
  assert.throws(() => validateSheetLead(baseLead({ nom: 'x'.repeat(10001) })), /trop long/);
});

test('validateSheetLead: rejects a non-string/number field type', () => {
  assert.throws(() => validateSheetLead(baseLead({ nom: { evil: true } })), /invalide/);
});
