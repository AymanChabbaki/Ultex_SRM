import assert from 'node:assert/strict';
import test from 'node:test';

const moduleUrl = new URL('../scripts/import_numeric_clients_9601_9634.js', import.meta.url);
const imported = await import(moduleUrl);

test('numeric Data import contains the complete supplied 9601..9634 sequence', () => {
  assert.equal(imported.LEADS.length, 34);
  assert.deepEqual(imported.LEADS.map(item => item.code), Array.from({ length: 34 }, (_, index) => String(9601 + index)));
});

test('numeric Data import normalizes phones, countries and CRM data tags', () => {
  const france = imported.LEADS.find(item => item.code === '9602');
  const tunisia = imported.LEADS.find(item => item.code === '9612');
  const canada = imported.LEADS.find(item => item.code === '9616');
  const ireland = imported.LEADS.find(item => item.code === '9631');
  assert.deepEqual([france.phone, france.country], ['33615172255', 'France']);
  assert.deepEqual([tunisia.phone, tunisia.country], ['21655270592', 'Tunisie']);
  assert.deepEqual([canada.phone, canada.country], ['16132527652', 'Canada']);
  assert.deepEqual([ireland.phone, ireland.country], ['353871761079', 'Irlande']);
  assert.equal(imported.LEADS.find(item => item.code === '9601').currentTag, 'En cours de traitement');
  assert.equal(imported.LEADS.find(item => item.code === '9604').currentTag, 'Faible qualité');
  assert.equal(imported.LEADS.find(item => item.code === '9628').currentTag, 'Pas prêt');
});

test('numeric Data import preserves status history and source deadlines', () => {
  const lead = imported.LEADS.find(item => item.code === '9603');
  assert.equal(lead.history.length, 2);
  assert.equal(lead.history[0].etat, 'En cours de traitement');
  assert.equal(lead.history[1].etat, 'En cours de traitement');
  assert.equal(lead.firstAt.toISOString(), '2026-09-25T12:00:00.000Z');
  assert.equal(lead.secondAt.toISOString(), '2026-10-02T12:00:00.000Z');
});

test('French date parser rejects invalid dates', () => {
  assert.equal(imported.parseFrenchDate('31/02/26'), null);
  assert.equal(imported.parseFrenchDate(''), null);
});

