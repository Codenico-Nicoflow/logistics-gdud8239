// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from './store';
import { App } from './App';
import { ToastProvider } from '../components/toast';
import { he } from '../i18n/he';

/**
 * The setup page is opened from a one-time link by someone who is NOT logged in, so it must render
 * without a session, while every other address still asks for one. The router wraps both.
 */
function respond(routes: Record<string, { status: number; body: unknown }>): void {
  // The app calls relative `/api/...` URLs, which a browser resolves and Node's Request does not.
  const NativeRequest = globalThis.Request;
  vi.stubGlobal(
    'Request',
    class extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' && input.startsWith('/') ? `http://localhost${input}` : input, init);
      }
    },
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://localhost');
      const hit = routes[url.pathname];
      const { status, body } = hit ?? { status: 404, body: { message: 'not found' } };
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }),
  );
}

function mount(path: string): void {
  window.history.pushState({}, '', path);
  render(
    <Provider store={store}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </Provider>,
  );
}

beforeEach(() => {
  store.dispatch({ type: 'api/resetApiState' });
});
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
