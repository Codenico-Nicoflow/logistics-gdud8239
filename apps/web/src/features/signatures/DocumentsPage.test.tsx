// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { store } from '../../app/store';
import { ToastProvider } from '../../components/toast';
import { he } from '../../i18n/he';
import type { AuthUser } from '../../lib/types';
import { calls, resetApi, respond } from '../../test/mockApi';
import { DocumentsPage } from './DocumentsPage';

const admin: AuthUser = { id: 'u', username: 'x', displayName: 'x', role: 'admin', companyScope: null, battalionId: 'b1', isPlatformAdmin: false };
const HOLDER = {
  id: 's1', firstName: 'דנה', lastName: 'כהן', personalNumber: '1234567', phone: null, company: 'A', itemCount: 1,
  signatures: [], forms: [],
};

function show(entry: string | { pathname: string; state: unknown }): void {
  respond({
    '/api/signatures/holders': { status: 200, body: { rows: [HOLDER], total: 1 } },
    '/api/items': { status: 200, body: [] },
    '/api/issue-forms': { status: 200, body: { rows: [], total: 0 } },
  });
  render(
    <Provider store={store}>
      <ToastProvider>
        <MemoryRouter initialEntries={[entry]}>
          <DocumentsPage user={admin} />
        </MemoryRouter>
      </ToastProvider>
    </Provider>,
  );
}

beforeEach(resetApi);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DocumentsPage', () => {
  it('opens on the list with nobody selected', async () => {
    show('/documents');
    expect(await screen.findByText(he.documents.pickSoldier)).toBeTruthy();
  });

  it('opens the soldier ניפוק sent us, and searches for him by name', async () => {
    show({ pathname: '/documents', state: { soldierId: 's1', q: 'דנה כהן' } });
    expect(await screen.findByRole('button', { name: he.documents.tabItems })).toBeTruthy();
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('דנה כהן');
    await waitFor(() => expect(calls.some((c) => c.path === '/api/signatures/holders')).toBe(true));
    expect(screen.queryByText(he.documents.pickSoldier)).toBeNull();
  });

  it('ignores router state that is not what ניפוק sends', async () => {
    show({ pathname: '/documents', state: { soldierId: 5 } });
    expect(await screen.findByText(he.documents.pickSoldier)).toBeTruthy();
  });
});
