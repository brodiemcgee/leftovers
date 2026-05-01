/**
 * Generate the Sign-In-With-Apple client_secret JWT.
 * Apple max validity: 6 months (15777000 seconds).
 *
 * Usage:
 *   node scripts/gen-apple-jwt.mjs <KEY_ID> <TEAM_ID> <SERVICE_ID> <PATH_TO_P8>
 */
import { readFileSync } from 'node:fs';
import { createPrivateKey, createSign } from 'node:crypto';

const [, , keyId, teamId, serviceId, p8Path] = process.argv;
if (!keyId || !teamId || !serviceId || !p8Path) {
  console.error('Usage: node gen-apple-jwt.mjs <KEY_ID> <TEAM_ID> <SERVICE_ID> <PATH_TO_P8>');
  process.exit(1);
}

const pem = readFileSync(p8Path, 'utf8');
const privateKey = createPrivateKey({ key: pem, format: 'pem' });

const now = Math.floor(Date.now() / 1000);
const exp = now + 15_777_000;

const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
const payload = {
  iss: teamId,
  iat: now,
  exp,
  aud: 'https://appleid.apple.com',
  sub: serviceId,
};

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj))
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const signingInput = `${b64url(header)}.${b64url(payload)}`;

// Sign with ES256 — Node returns DER, we need raw r||s
const signer = createSign('SHA256');
signer.update(signingInput);
const der = signer.sign(privateKey);

// Convert DER ECDSA signature → raw 64-byte (r||s)
function derToRaw(der) {
  let offset = 2; // skip 0x30 + total length
  if (der[1] & 0x80) offset = 2 + (der[1] & 0x7f);
  if (der[offset] !== 0x02) throw new Error('expected INTEGER for r');
  const rLen = der[offset + 1];
  let r = der.slice(offset + 2, offset + 2 + rLen);
  if (r[0] === 0x00) r = r.slice(1);
  while (r.length < 32) r = Buffer.concat([Buffer.from([0x00]), r]);
  offset = offset + 2 + rLen;
  if (der[offset] !== 0x02) throw new Error('expected INTEGER for s');
  const sLen = der[offset + 1];
  let s = der.slice(offset + 2, offset + 2 + sLen);
  if (s[0] === 0x00) s = s.slice(1);
  while (s.length < 32) s = Buffer.concat([Buffer.from([0x00]), s]);
  return Buffer.concat([r, s]);
}

const sig = derToRaw(der)
  .toString('base64')
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

console.log(`${signingInput}.${sig}`);
console.error(`\nKey ID:     ${keyId}`);
console.error(`Team ID:    ${teamId}`);
console.error(`Service ID: ${serviceId}`);
console.error(`Issued:     ${new Date(now * 1000).toISOString()}`);
console.error(`Expires:    ${new Date(exp * 1000).toISOString()}  (~6 months)`);
