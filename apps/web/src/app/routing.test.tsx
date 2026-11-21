// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { he } from '../i18n/he';
import { mount, resetApi, respond } from '../test/mockApi';

/**
 * The setup page is opened from a one-time link by someone who is NOT logged in, so it must render
 * without a session, while every other address still asks for one. The router wraps both.
 */
beforeEach(resetApi);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('routing around the setup page', () => {
  it('shows the setup form for a valid link without any login', async () => {
    respond({
      '/api/auth/me': { status: 401, body: { message: 'unauthorized' } },
      '/api/auth/refresh': { status: 401, body: { message: 'unauthorized' } },
      '/api/auth/setup/validtoken': { status: 200, body: { username: 'dana', displayName: 'דנה לוי', kind: 'INVITE' } },
    });
    mount('/setup/validtoken');
    expect(await screen.findByText(he.setup.titleInvite)).toBeTruthy();
    expect(screen.getByText('dana')).toBeTruthy();
    // Two password boxes: the choice and its confirmation.
    expect(document.querySelectorAll('input[type=password]')).toHaveLength(2);
  });

  it('shows one neutral message for an invalid or used link', async () => {
    respond({ '/api/auth/setup/deadtoken': { status: 404, body: { message: 'x' } } });
    mount('/setup/deadtoken');
    expect(await screen.findByText(he.setup.invalid)).toBeTruthy();
  });

  it('announces a reset link as a new password, not a welcome', async () => {
    respond({ '/api/auth/setup/resettoken': { status: 200, body: { username: 'dana', displayName: 'דנה', kind: 'RESET' } } });
    mount('/setup/resettoken');
    expect(await screen.findByText(he.setup.titleReset)).toBeTruthy();
  });

  it('keeps every other address behind the login', async () => {
    respond({
      '/api/auth/me': { status: 401, body: { message: 'unauthorized' } },
      '/api/auth/refresh': { status: 401, body: { message: 'unauthorized' } },
    });
    mount('/users');
    await waitFor(() => expect(screen.getByRole('button', { name: he.auth.submit })).toBeTruthy());
  });
});
