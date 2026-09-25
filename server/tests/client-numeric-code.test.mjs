import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  FIRST_AUTOMATIC_NUMERIC_CLIENT_CODE,
  nextNumericClientNumber,
} from '../src/clientCodes.js';

const server = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');

test('automatic numeric client codes start at 9600', () => {
  assert.equal(FIRST_AUTOMATIC_NUMERIC_CLIENT_CODE, 9600);
  assert.equal(nextNumericClientNumber(['9598', '9599']), 9600);
});

test('automatic numeric client code continues after the highest existing numeric code', () => {
  assert.equal(nextNumericClientNumber(['9599', '9600', 'L6927', 'A446']), 9601);
});

test('reserved counter prevents concurrent browser allocations from reusing a code', () => {
  assert.equal(nextNumericClientNumber(['9599'], 9604), 9605);
});

test('server exposes the authenticated numeric client-code allocator', () => {
  assert.match(server, /app\.post\('\/api\/clients\/next-numeric-code', authMiddleware/);
  assert.match(server, /reserveNextNumericClientCode\(prisma\)/);
});

test('server-side client fallbacks no longer generate generic C codes', () => {
  assert.doesNotMatch(server, /genererCodeAtomique\('C'\)/);
});

test('editing a client code uses an authenticated atomic rename endpoint', () => {
  assert.match(server, /app\.patch\('\/api\/clients\/:currentCode\/code', authMiddleware/);
  assert.match(server, /adopterCodeUltex\(client, newCode, client\.data, \{ throwOnFailure: true \}\)/);
});

test('client renames repoint demande snapshots and all primary client links', () => {
  assert.match(server, /\['client', 'codeClientAssocie', 'codeClient', 'codeClientUltex'\]/);
  assert.match(server, /req\.path\.startsWith\('\/api\/clients\/'\)/);
});
