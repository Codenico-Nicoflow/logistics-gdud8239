import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../app/store';
import { App } from '../app/App';
import { ToastProvider } from '../components/toast';

type Reply = { status: number; body: unknown };

/**
 * Stands in for the API: `/api/...` paths answer from `routes`, anything else 404s. The app calls
 * relative URLs, which a browser resolves and Node's `Request` does not, so those are given a base.
 */
export function respond(routes: Record<string, Reply>): void {
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
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const { status, body } = routes[new URL(raw, 'http://localhost').pathname] ?? { status: 404, body: { message: 'not found' } };
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }),
  );
}

export function mount(path: string): void {
  window.history.pushState({}, '', path);
  render(
    <Provider store={store}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </Provider>,
  );
}

export function resetApi(): void {
  store.dispatch({ type: 'api/resetApiState' });
}
