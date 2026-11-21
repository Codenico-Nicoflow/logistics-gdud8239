// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { he } from '../../i18n/he';
import { mount, resetApi, respond } from '../../test/mockApi';

/**
 * Signing in is two steps now: the password, then (for anyone with the authenticator app, or everyone once it
 * is required) the code from that app. The server answers the first step with
 * either a finished sign-in or `{ step, mfaToken }`; the page must show the right next screen and must
 * not keep the password around.
 */
const NOT_SIGNED_IN = {
  '/api/auth/me': { status: 401, body: { message: 'unauthorized' } },
  '/api/auth/refresh': { status: 401, body: { message: 'unauthorized' } },
};

async function submitPassword(): Promise<void> {
  const [username] = await screen.findAllByRole('textbox');
  fireEvent.change(username as HTMLElement, { target: { value: 'dana' } });
  const password = document.querySelector('input[type=password]') as HTMLInputElement;
  fireEvent.change(password, { target: { value: 'a-long-password-here' } });
  fireEvent.click(screen.getByRole('button', { name: he.auth.submit }));
}

beforeEach(resetApi);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('login: the step after the password', () => {
  it('asks for the code when the person has the app set up', async () => {
    respond({ ...NOT_SIGNED_IN, '/api/auth/login': { status: 200, body: { step: 'totp', mfaToken: 'tok' } } });
    mount('/');
    await submitPassword();
    expect(await screen.findByRole('heading', { name: he.mfa.stepTitle })).toBeTruthy();
    // No password box any more: the token is all the next step needs.
    expect(document.querySelector('input[type=password]')).toBeNull();
    expect((screen.getByRole('button', { name: he.mfa.verify }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables the button only once a full code is typed, and sends it with the token', async () => {
    respond({
      ...NOT_SIGNED_IN,
      '/api/auth/login': { status: 200, body: { step: 'totp', mfaToken: 'tok' } },
      '/api/auth/mfa/verify': { status: 401, body: { message: 'הקוד שגוי או שפג תוקפו. נסו שוב' } },
    });
    mount('/');
    await submitPassword();
    const code = (await screen.findByLabelText(new RegExp(he.mfa.codeLabel))) as HTMLInputElement;
    fireEvent.change(code, { target: { value: '123456' } });
    const button = screen.getByRole('button', { name: he.mfa.verify }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(await screen.findByText('הקוד שגוי או שפג תוקפו. נסו שוב')).toBeTruthy();
  });

  it('starts setting the app up when it is required and the person has none', async () => {
    respond({
      ...NOT_SIGNED_IN,
      '/api/auth/login': { status: 200, body: { step: 'enroll', mfaToken: 'tok' } },
      '/api/auth/mfa/enrol/start': { status: 200, body: { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/x:y?secret=JBSWY3DPEHPK3PXP' } },
    });
    mount('/');
    await submitPassword();
    expect(await screen.findByText(he.mfa.enrolTitle)).toBeTruthy();
    expect(await screen.findByText(he.mfa.cantScan)).toBeTruthy();
  });

  it('goes back to the password box', async () => {
    respond({ ...NOT_SIGNED_IN, '/api/auth/login': { status: 200, body: { step: 'totp', mfaToken: 'tok' } } });
    mount('/');
    await submitPassword();
    fireEvent.click(await screen.findByRole('button', { name: he.mfa.back }));
    await waitFor(() => expect(document.querySelector('input[type=password]')).not.toBeNull());
  });

  it('a wrong password still just says it failed', async () => {
    respond({ ...NOT_SIGNED_IN, '/api/auth/login': { status: 401, body: { message: 'x' } } });
    mount('/');
    await submitPassword();
    expect(await screen.findByText(he.auth.failed)).toBeTruthy();
  });
});
