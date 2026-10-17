import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, '..');
const repoRoot = path.resolve(frontendRoot, '..');
const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

test('arrival chat is persistent, authenticated and streamed in real time', () => {
  const server = read('server/src/index.js');
  assert.match(server, /collection:\s*'arrivageMessages'/);
  assert.match(server, /\/api\/arrivages\/:code\/chat\/stream/);
  assert.match(server, /requireArrivageChatAccess/);
  assert.match(server, /ARRIVAGE_CHAT_CHANNEL/);
  assert.match(server, /Discussion réservée à Imane, Oumaima et Yasser/);
});

test('Imane, Oumaima and Yasser can use the same arrival conversation UI', () => {
  const chat = read('ubos-react/src/components/arrivages/ArrivageChat.jsx');
  const arrival = read('ubos-react/src/components/fiches/FicheArrivage.jsx');
  const direction = read('ubos-react/src/components/fiches/AnalyseArrivageDirection.jsx');
  const api = read('ubos-react/src/services/api.js');

  assert.match(chat, /identity\.includes\('imane'\)/);
  assert.match(chat, /identity\.includes\('oumaima'\)/);
  assert.match(chat, /identity\.includes\('yasser'\)/);
  assert.match(arrival, /<ArrivageChat arrivageCode=\{code\}/);
  assert.match(direction, /\['chat', 'Discussion'\]/);
  assert.match(api, /text\/event-stream/);
  assert.match(api, /sendArrivageChatMessage/);
});
