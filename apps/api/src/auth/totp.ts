import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * RFC 6238 time-based one-time passwords (SHA-1, 6 digits, 30 s) — what Google Authenticator,
 * Microsoft Authenticator, Authy, 1Password and iOS Passwords all speak. Written against node:crypto
 * on purpose: the algorithm is small and fixed by the RFC, and verifying it against the RFC's own
 * test vectors (totp.spec.ts) is stronger than trusting a wrapper.
 */
export const STEP_SECONDS = 30;
export const DIGITS = 6;
/** Codes from one step either side are accepted: phone clocks drift by seconds. */
const WINDOW = 1;

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text.replace(/=+$/, '').toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('not base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160 random bits, the size the RFC recommends for SHA-1. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function stepAt(nowMs: number): number {
  return Math.floor(nowMs / 1000 / STEP_SECONDS);
}

export function codeFor(secretBase32: string, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
  const offset = (hmac[hmac.length - 1] as number) & 0x0f;
  const binary =
    (((hmac[offset] as number) & 0x7f) << 24) |
    (((hmac[offset + 1] as number) & 0xff) << 16) |
    (((hmac[offset + 2] as number) & 0xff) << 8) |
    ((hmac[offset + 3] as number) & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

const safeEqual = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * The step a code belongs to, or null. Steps at or before `lastStep` are refused, so a code (or a
 * code someone watched being typed) can be used only once. Every candidate is compared, with no
 * early exit, so timing does not reveal how close a guess was.
 */
export function matchStep(secretBase32: string, code: string, nowMs: number, lastStep: number): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = stepAt(nowMs);
  let found: number | null = null;
  for (let step = now - WINDOW; step <= now + WINDOW; step++) {
    if (safeEqual(codeFor(secretBase32, step), code) && step > lastStep) found = found === null ? step : Math.max(found, step);
  }
  return found;
}

/** The `otpauth://` link a QR code carries. */
export function otpauthUrl(secretBase32: string, account: string, issuer: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

// ---- secrets at rest ----

/** AES-256-GCM under a key derived from a server secret that is not stored in the database. */
function keyFrom(serverSecret: string): Buffer {
  return createHmac('sha256', serverSecret).update('logistics-totp-at-rest').digest();
}

export function encryptSecret(plain: string, serverSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(serverSecret), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(stored: string, serverSecret: string): string {
  const [iv, tag, body] = stored.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !body) throw new Error('bad secret');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(serverSecret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

// ---- backup codes ----

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export const BACKUP_CODE_COUNT = 8;

/** `XXXXX-XXXXX`: 50 bits, shown once. */
export function generateBackupCode(): string {
  const bytes = randomBytes(10);
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length] as string);
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
}

export function normalizeBackupCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

export function hashBackupCode(input: string): string {
  return createHash('sha256').update(normalizeBackupCode(input)).digest('hex');
}
