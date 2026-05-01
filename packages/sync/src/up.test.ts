import { describe, expect, it } from 'vitest';
import { verifyUpWebhook } from './up.js';
import { createHmac } from 'node:crypto';

describe('verifyUpWebhook', () => {
  it('accepts a correct HMAC-SHA256 signature', () => {
    const body = JSON.stringify({ data: { type: 'webhook-events' } });
    const secret = 'shh-this-is-a-test-secret';
    const sig = createHmac('sha256', secret).update(body, 'utf8').digest('hex');
    expect(verifyUpWebhook(body, sig, secret)).toBe(true);
  });

  it('rejects a bad signature', () => {
    expect(verifyUpWebhook('hello', 'deadbeef', 'secret')).toBe(false);
  });

  it('rejects a body tampered with', () => {
    const secret = 'secret';
    const sig = createHmac('sha256', secret).update('original', 'utf8').digest('hex');
    expect(verifyUpWebhook('tampered', sig, secret)).toBe(false);
  });
});
