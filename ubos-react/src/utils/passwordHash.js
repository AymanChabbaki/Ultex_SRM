import bcrypt from 'bcryptjs';

const BCRYPT_HASH_RE = /^\$2[aby]\$/;

export function estDejaHache(valeur) {
  return BCRYPT_HASH_RE.test(String(valeur || ''));
}

export function hashPassword(plain) {
  return bcrypt.hashSync(String(plain || ''), 10);
}

export function verifyPassword(plain, hashOrPlain) {
  if (!hashOrPlain) return false;
  if (estDejaHache(hashOrPlain)) {
    return bcrypt.compareSync(String(plain || ''), hashOrPlain);
  }
  // Legacy pre-migration row stored in plaintext.
  return String(plain || '') === String(hashOrPlain);
}
