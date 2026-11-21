import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  codeFor,
  decryptSecret,
  encryptSecret,
  generateBackupCode,
  hashBackupCode,
  matchStep,
  normalizeBackupCode,
  otpauthUrl,
  stepAt,
} from './totp';

// RFC 6238 appendix B, SHA-1: the secret is the ASCII string "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('totp', () => {
  it('matches the RFC 6238 test vectors', () => {
    // The RFC lists 8-digit codes; the 6-digit code is their last six digits.
    const vectors: [number, string][] = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
    ];
    for (const [seconds, eight] of vectors) {
      expect(codeFor(RFC_SECRET, stepAt(seconds * 1000), 8)).toBe(eight);
      expect(codeFor(RFC_SECRET, stepAt(seconds * 1000))).toBe(eight.slice(2));
    }
  });

  it('round-trips base32', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 9, 8, 7]);
    expect(base32Decode(base32Encode(bytes))).toEqual(bytes);
  });

  it('accepts the current code and one step of clock drift, but not more', () => {
    const now = 1_700_000_000_000;
    const step = stepAt(now);
    expect(matchStep(RFC_SECRET, codeFor(RFC_SECRET, step), now, 0)).toBe(step);
    expect(matchStep(RFC_SECRET, codeFor(RFC_SECRET, step - 1), now, 0)).toBe(step - 1);
    expect(matchStep(RFC_SECRET, codeFor(RFC_SECRET, step + 1), now, 0)).toBe(step + 1);
    expect(matchStep(RFC_SECRET, codeFor(RFC_SECRET, step - 2), now, 0)).toBeNull();
    expect(matchStep(RFC_SECRET, codeFor(RFC_SECRET, step + 2), now, 0)).toBeNull();
  });

  it('refuses a code whose step was already used', () => {
    const now = 1_700_000_000_000;
    const step = stepAt(now);
    const code = codeFor(RFC_SECRET, step);
    expect(matchStep(RFC_SECRET, code, now, step)).toBeNull();
    expect(matchStep(RFC_SECRET, code, now, step - 1)).toBe(step);
  });

  it('refuses anything that is not six digits', () => {
    const now = 1_700_000_000_000;
    expect(matchStep(RFC_SECRET, '12345', now, 0)).toBeNull();
    expect(matchStep(RFC_SECRET, '1234567', now, 0)).toBeNull();
    expect(matchStep(RFC_SECRET, 'abcdef', now, 0)).toBeNull();
    expect(matchStep(RFC_SECRET, '', now, 0)).toBeNull();
  });

  it('builds a link authenticator apps understand', () => {
    const url = otpauthUrl('ABC234', 'dana', 'Logistics 8239');
    expect(url).toBe('otpauth://totp/Logistics%208239:dana?secret=ABC234&issuer=Logistics%208239&algorithm=SHA1&digits=6&period=30');
  });
});

describe('secret at rest', () => {
  it('decrypts with the same server secret and not another', () => {
    const stored = encryptSecret('JBSWY3DPEHPK3PXP', 'server-secret-one');
    expect(stored).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(stored, 'server-secret-one')).toBe('JBSWY3DPEHPK3PXP');
    expect(() => decryptSecret(stored, 'server-secret-two')).toThrow();
  });

  it('detects tampering', () => {
    const [iv, tag, body] = encryptSecret('JBSWY3DPEHPK3PXP', 's').split('.');
    expect(() => decryptSecret(`${iv}.${tag}.${body?.slice(0, -2)}AA`, 's')).toThrow();
  });
});

describe('backup codes', () => {
  it('are readable, unique and compared ignoring dashes, spaces and case', () => {
    const code = generateBackupCode();
    expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    expect(generateBackupCode()).not.toBe(code);
    expect(hashBackupCode(code)).toBe(hashBackupCode(code.toLowerCase().replace('-', ' ')));
    expect(normalizeBackupCode(' ab-cd ')).toBe('ABCD');
  });
});
