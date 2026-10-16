import assert from 'node:assert/strict';
import { LEADS, normalizePhone, planImport } from './import_numeric_clients_9630_9684.js';

const client = (code, phone, name = code) => ({ id: code, code, data: { nom: name, telephone: phone, codeClientUltex: code } });

assert.equal(LEADS.length, 55);
assert.equal(new Set(LEADS.map(item => item.code)).size, 55);
assert.equal(Math.min(...LEADS.map(item => Number(item.code))), 9630);
assert.equal(Math.max(...LEADS.map(item => Number(item.code))), 9684);
assert.equal(normalizePhone('06 41 42 67 47'), '212641426747');

{
  const leads = LEADS.filter(item => ['9630', '9631', '9632', '9633'].includes(item.code));
  const existing = [
    client('9630', leads[0].phone),
    client('L4017', leads[1].phone),
    client('9632', '212600000000', 'Wrong occupant'),
    client('9700', leads[2].phone, 'Correct phone owner'),
  ];
  const plan = planImport(leads, existing);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.actions.find(item => item.lead.code === '9630').type, 'skip_exact');
  assert.equal(plan.actions.find(item => item.lead.code === '9631').type, 'skip_l_code');
  assert.equal(plan.actions.find(item => item.lead.code === '9632').type, 'move_existing_phone');
  assert.equal(plan.actions.find(item => item.lead.code === '9633').type, 'create');
  assert(plan.moves.some(move => move.from === '9700' && move.to === '9632'));
  assert(plan.moves.some(move => move.from === '9632' && Number(move.to) > 9684));
}

console.info('import_numeric_clients_9630_9684 planner tests: OK');
