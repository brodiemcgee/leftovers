import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { env } from '@leftovers/shared';

/**
 * Symmetric AES-256-GCM encryption for tokens at rest.
 * Key is derived from ENCRYPTION_KEY env var via scrypt.
 *
 * Format on disk: `<iv-hex>:<authtag-hex>:<ciphertext-hex>`.
 */

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const SALT = Buffer.from('leftovers-token-salt-v1', 'utf8');

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (cachedKey) return cachedKey;
  cachedKey = scryptSync(env.encryptionKey, SALT, 32);
  return cachedKey;
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ct.toString('hex')}`;
}

export function decryptToken(stored: string): string {
  const parts = stored.split(':');
  if (parts.length !== 3) throw new Error('encryptToken: malformed ciphertext');
  const [ivHex, tagHex, ctHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const ct = Buffer.from(ctHex, 'hex');
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}
