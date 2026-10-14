import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const serverSource = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const composeSource = fs.readFileSync(new URL('../../docker-compose.prod.yml', import.meta.url), 'utf8');

test('production backends receive every OTP email environment variable', () => {
  for (const variable of [
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM',
    'SECURITY_EMAIL',
  ]) {
    assert.equal((composeSource.match(new RegExp(`\\n\\s+${variable}:`, 'g')) || []).length, 2);
  }
});

test('OTP request never reports success when email delivery fails', () => {
  assert.match(serverSource, /error\.code = 'SMTP_NOT_CONFIGURED'/);
  assert.match(serverSource, /error\.code = 'SMTP_SEND_FAILED'/);
  assert.match(serverSource, /await authPrisma\.otpCode\.delete/);
  assert.doesNotMatch(serverSource, /SMTP non configuré[^\n]*code OTP/);
});
