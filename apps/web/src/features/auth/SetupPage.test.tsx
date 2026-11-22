// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { he } from '../../i18n/he';
import { calls, mount, resetApi, respond } from '../../test/mockApi';

const INFO = { status: 200, body: { username: 'dana', displayName: 'דנה לוי', kind: 'INVITE' } };
const replace = vi.fn();

function fill(first: string, second: string): void {
  const boxes = document.querySelectorAll('input[type=password]');
  fireEvent.change(boxes[0] as HTMLInputElement, { target: { value: first } });
  fireEvent.change(boxes[1] as HTMLInputElement, { target: { value: second } });
}
const submit = () => screen.getByRole('button', { name: he.setup.submit }) as HTMLButtonElement;

beforeEach(() => {
  resetApi();
  replace.mockClear();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...window.location, replace, pathname: '/setup/tok', assign: vi.fn() },
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('setup page', () => {
  it('keeps the button off until both boxes hold the same text', async () => {
    respond({ '/api/auth/setup/tok': INFO });
    mount('/setup/tok');
    await screen.findByText(he.setup.titleInvite);
    expect(submit().disabled).toBe(true);
    fill('a-long-enough-password', 'a-long-enough-passwor');
    expect(screen.getByText(he.setup.mismatch)).toBeTruthy();
    expect(submit().disabled).toBe(true);
    fill('a-long-enough-password', 'a-long-enough-password');
    expect(screen.queryByText(he.setup.mismatch)).toBeNull();
    expect(submit().disabled).toBe(false);
  });

  it('sends the token and the password, never the confirmation', async () => {
    respond({
      '/api/auth/setup/tok': INFO,
      'POST /api/auth/setup/tok': { status: 200, body: { user: { id: 'u', username: 'dana', displayName: 'דנה', role: 'viewer', companyScope: null } } },
    });
    mount('/setup/tok');
    await screen.findByText(he.setup.titleInvite);
    fill('a-long-enough-password', 'a-long-enough-password');
    fireEvent.click(submit());
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toEqual({ password: 'a-long-enough-password' });
  });

  it('shows the server\'s refusal of a weak password and stays on the form', async () => {
    respond({
      '/api/auth/setup/tok': INFO,
      'POST /api/auth/setup/tok': { status: 400, body: { message: 'הסיסמה נפוצה מדי' } },
    });
    mount('/setup/tok');
    await screen.findByText(he.setup.titleInvite);
    fill('password1234567', 'password1234567');
    fireEvent.click(submit());
    expect(await screen.findByText('הסיסמה נפוצה מדי')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('goes on to the authenticator step instead of the app when the server asks for it', async () => {
    respond({
      '/api/auth/setup/tok': INFO,
      'POST /api/auth/setup/tok': { status: 200, body: { step: 'enroll', mfaToken: 'm' } },
      'POST /api/auth/mfa/enrol/start': { status: 200, body: { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP' } },
    });
    mount('/setup/tok');
    await screen.findByText(he.setup.titleInvite);
    fill('a-long-enough-password', 'a-long-enough-password');
    fireEvent.click(submit());
    expect(await screen.findByRole('heading', { name: he.mfa.enrolTitle })).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('a dead link shows the neutral message and no form at all', async () => {
    respond({ '/api/auth/setup/tok': { status: 404, body: { message: 'x' } } });
    mount('/setup/tok');
    expect(await screen.findByText(he.setup.invalid)).toBeTruthy();
    expect(document.querySelector('input[type=password]')).toBeNull();
  });
});
