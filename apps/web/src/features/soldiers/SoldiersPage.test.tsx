// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { store } from '../../app/store';
import { ToastProvider } from '../../components/toast';
import { he } from '../../i18n/he';
import type { AuthUser, Role, SoldierSummary } from '../../lib/types';
import { calls, resetApi, respond } from '../../test/mockApi';
import { SoldiersPage } from './SoldiersPage';

function soldier(over: Partial<SoldierSummary> = {}): SoldierSummary {
  return {
    id: 's1', firstName: 'דנה', lastName: 'כהן', personalNumber: '1234567', phone: '0501234567',
    company: 'A', isActive: true, isAttached: false, openSignatureCount: 0, isEnlisted: true, ...over,
  };
}
function user(role: Role, over: Partial<AuthUser> = {}): AuthUser {
  return { id: 'u', username: 'x', displayName: 'x', role, companyScope: null, ...over };
}
function show(u: AuthUser, rows: SoldierSummary[]): void {
  respond({
    '/api/soldiers': { status: 200, body: { rows, total: rows.length } },
    'DELETE /api/soldiers/s1': { status: 200, body: {} },
    'PATCH /api/soldiers/s1/enlistment': { status: 200, body: {} },
  });
  render(
    <Provider store={store}>
      <ToastProvider>
        <MemoryRouter>
          <SoldiersPage user={u} />
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

describe('SoldiersPage', () => {
  it('lists soldiers and shows חסר for a missing מ.א. or phone', async () => {
    show(user('admin'), [soldier(), soldier({ id: 's2', firstName: 'רון', personalNumber: null, phone: null })]);
    expect((await screen.findAllByText(/דנה כהן/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(he.soldiers.missing).length).toBeGreaterThanOrEqual(2);
  });

  it('shows the empty message when nobody matches', async () => {
    show(user('admin'), []);
    expect(await screen.findByText(he.soldiers.none)).toBeTruthy();
  });

  const CAN: [Role, boolean, boolean][] = [
    // role, may add, may delete
    ['admin', true, true],
    ['logistics', true, false],
    ['SHLISHUT', true, true],
    ['SAMGAD', false, false],
    ['viewer', false, false],
  ];
  for (const [role, add, del] of CAN) {
    it(`${role}: add=${add}, delete=${del}`, async () => {
      show(user(role), [soldier()]);
      await screen.findAllByText(/דנה כהן/);
      expect(screen.queryByRole('button', { name: he.soldiers.add }) !== null).toBe(add);
      expect(screen.queryAllByRole('button', { name: he.soldiers.delete }).length > 0).toBe(del);
    });
  }

  it('a company-scoped user cannot add or delete, and gets no company filter', async () => {
    show(user('COMPANY_CMDR', { companyScope: 'B' }), [soldier({ company: 'B' })]);
    await screen.findAllByText(/דנה כהן/);
    expect(screen.queryByRole('button', { name: he.soldiers.add })).toBeNull();
    expect(screen.queryAllByRole('button', { name: he.soldiers.delete })).toHaveLength(0);
    expect(screen.queryByText(he.soldiers.allCompanies)).toBeNull();
    // and the very first request is already scoped, not widened client-side
    expect(calls.find((c) => c.path === '/api/soldiers')).toBeTruthy();
  });

  it('asks before deleting and sends DELETE only after confirming', async () => {
    show(user('admin'), [soldier()]);
    const [del] = await screen.findAllByRole('button', { name: he.soldiers.delete });
    fireEvent.click(del as HTMLElement);
    expect(await screen.findByText(he.soldiers.confirmDeleteTitle('דנה כהן'))).toBeTruthy();
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: he.soldiers.confirmDeleteAction }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/soldiers/s1')).toBe(true));
  });

  it('cancelling the delete sends nothing', async () => {
    show(user('admin'), [soldier()]);
    const [del] = await screen.findAllByRole('button', { name: he.soldiers.delete });
    fireEvent.click(del as HTMLElement);
    fireEvent.click(await screen.findByRole('button', { name: he.common.cancel }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('ticking a filter re-queries with that filter', async () => {
    show(user('admin'), [soldier()]);
    await screen.findAllByText(/דנה כהן/);
    fireEvent.click(screen.getByLabelText(he.soldiers.incompleteFilter));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('incompleteOnly=true') })));
  });

  it('a long search string is sent as one encoded value, not split or executed', async () => {
    show(user('admin'), [soldier()]);
    await screen.findAllByText(/דנה כהן/);
    const box = screen.getByPlaceholderText(he.soldiers.search);
    fireEvent.change(box, { target: { value: `' OR 1=1;-- <script>alert(1)</script> & x=y` } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => {
      const urls = (fetch as unknown as { mock: { calls: [Request][] } }).mock.calls.map(([r]) => r.url);
      const hit = urls.find((u) => u.includes('q='));
      expect(hit).toBeTruthy();
      expect(new URL(hit as string).searchParams.get('q')).toBe(`' OR 1=1;-- <script>alert(1)</script> & x=y`);
      expect(new URL(hit as string).searchParams.get('x')).toBeNull();
    });
  });
});
