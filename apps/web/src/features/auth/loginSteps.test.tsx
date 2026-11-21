// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { he } from '../../i18n/he';
import { mount, resetApi, respond } from '../../test/mockApi';

/**
 * Signing in is two steps now: the password, then (for anyone with a device, or everyone once passkeys
 * are required) a confirmation on the person's own device. The server answers the first step with
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
  it('asks for the device when the person has one', async () => {
    respond({ ...NOT_SIGNED_IN, '/api/auth/login': { status: 200, body: { step: 'passkey', mfaToken: 'tok' } } });
    mount('/');
    await submitPassword();
    expect(await screen.findByText(he.passkey.stepTitle)).toBeTruthy();
    // No password box any more: the token is all the next step needs.
    expect(document.querySelector('input[type=password]')).toBeNull();
  });

  it('asks for a first device when passkeys are required and there is none', async () => {
    respond({ ...NOT_SIGNED_IN, '/api/auth/login': { status: 200, body: { step: 'enroll', mfaToken: 'tok' } } });
    mount('/');
    await submitPassword();
    expect(await screen.findByText(he.passkey.enrolTitle)).toBeTruthy();
    expect(screen.getByDisplayValue(/./)).toBeTruthy(); // a suggested device name is pre-filled
  });

  it('says so, and does not offer a button that cannot work, in a browser without passkey support', async () => {
    respond({ ...NOT_SIGNED_IN, '/api/auth/login': { status: 200, body: { step: 'passkey', mfaToken: 'tok' } } });
    mount('/');
    await submitPassword();
    expect(await screen.findByText(he.passkey.unsupported)).toBeTruthy();
    const button = screen.getByRole('button', { name: he.passkey.stepButton }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('goes back to the password box', async () => {
    respond({ ...NOT_SIGNED_IN, '/api/auth/login': { status: 200, body: { step: 'passkey', mfaToken: 'tok' } } });
    mount('/');
    await submitPassword();
    fireEvent.click(await screen.findByRole('button', { name: he.passkey.back }));
    await waitFor(() => expect(document.querySelector('input[type=password]')).not.toBeNull());
  });

  it('a wrong password still just says it failed', async () => {
    respond({ ...NOT_SIGNED_IN, '/api/auth/login': { status: 401, body: { message: 'x' } } });
    mount('/');
    await submitPassword();
    expect(await screen.findByText(he.auth.failed)).toBeTruthy();
  });
});
