import { describe, expect, it } from 'vitest';
import { checkPassword, PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from './password-policy';

const own = { username: 'dana.levi', displayName: 'דנה לוי' };

describe('checkPassword', () => {
  it('accepts a long, unrelated passphrase', () => {
    expect(checkPassword('violet-anchor-pelican-drumbeat-47', own)).toBeNull();
    expect(checkPassword('שולחן-ירוק-מטריה-גשם-עננים-12', own)).toBeNull();
  });

  it(`refuses anything shorter than ${PASSWORD_MIN_LENGTH} characters`, () => {
    expect(checkPassword('Xq9!zT', own)).toMatch(/12/);
    expect(checkPassword('a'.repeat(PASSWORD_MIN_LENGTH - 1), own)).toMatch(/12/);
  });

  it('counts characters, not bytes: twelve Hebrew letters are long enough', () => {
    expect(checkPassword('אבגדהוזחטיכל', own)).not.toMatch(/12/);
  });

  it('refuses a password longer than bcrypt would honestly use', () => {
    expect(checkPassword('Aq7!'.repeat(PASSWORD_MAX_BYTES), own)).toMatch(/ארוכה/);
  });

  it('refuses the usual weak choices even when they are long enough', () => {
    for (const weak of ['passwordpassword', '123456789012', 'qwertyuiopas', 'aaaaaaaaaaaa', 'iloveyouiloveyou', '111111111111']) {
      expect(checkPassword(weak, own), weak).not.toBeNull();
    }
  });

  it('refuses a password that contains the username, in any case', () => {
    expect(checkPassword('prefix-DANA.LEVI-suffix-9', own)).toMatch(/שם המשתמש/);
  });

  it('refuses passwords built from the person\'s own name', () => {
    expect(checkPassword('Dana.levi1990!!', { username: 'dl', displayName: 'Dana Levi' })).not.toBeNull();
  });
});
