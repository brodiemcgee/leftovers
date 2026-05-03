import { describe, it, expect } from 'vitest';
import { parseAmexAlert } from './amex-email.js';

describe('parseAmexAlert', () => {
  it('parses a real-world Amex AU forwarded transaction-update email', () => {
    const text = `---------- Forwarded message ---------
From: American Express <AmericanExpress@welcome.americanexpress.com>
Date: Sun, May 3, 2026 at 12:26 PM
Subject: Transaction Update
To: <contact@brodiemcgee.com>


Important information about your account
*MCGEE*
Account Ending: 161000

Transaction Update

*You asked us to let you know whenever a transaction greater than A$1.00
was made on your Qantas American Express Ultimate Card.*

2 May 2026 KMART

A$16.00
View your activity
`;
    const result = parseAmexAlert({
      from: 'contact@brodiemcgee.com',
      subject: 'Fwd: Transaction Update',
      html: '',
      text,
    });
    expect(result).not.toBeNull();
    expect(result!.amountCents).toBe(1600);
    expect(result!.merchantRaw).toBe('KMART');
    expect(result!.postedAt.startsWith('2026-05-02')).toBe(true);
  });

  it('returns null for non-Amex senders', () => {
    expect(parseAmexAlert({ from: 'spam@example.com', subject: 'win!', html: '', text: 'hi' })).toBeNull();
  });
});
