import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../app/store';
import { App } from '../app/App';
import { ToastProvider } from '../components/toast';

type Reply = { status: number; body: unknown };
type Handler = Reply | ((call: { method: string; body: unknown; search: URLSearchParams }) => Reply);

/** Every request the app made since the last `respond`, so a test can assert what was (not) sent. */
export const calls: { method: string; path: string; body: unknown }[] = [];

/**
 * Stands in for the API: `/api/...` paths answer from `routes`, anything else 404s. The app calls
 * relative URLs, which a browser resolves and Node's `Request` does not, so those are given a base.
 */
export function respond(routes: Record<string, Handler>): void {
  calls.length = 0;
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
      const url = new URL(raw, 'http://localhost');
      const method = input instanceof Request ? input.method : 'GET';
      const text = input instanceof Request ? await input.clone().text() : '';
      const body: unknown = text ? JSON.parse(text) : undefined;
      calls.push({ method, path: url.pathname, body });
      // `"POST /api/x"` beats `"/api/x"`, so one path can answer differently per verb.
      const hit = routes[`${method} ${url.pathname}`] ?? routes[url.pathname];
      const reply: Reply = typeof hit === 'function' ? hit({ method, body, search: url.searchParams }) : hit ?? { status: 404, body: { message: 'not found' } };
      return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
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
