// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { store } from '../../app/store';
import { ToastProvider } from '../../components/toast';
import { he } from '../../i18n/he';
import type { AuthUser, Role } from '../../lib/types';
import { calls, resetApi, respond } from '../../test/mockApi';
import { ServicePeriodsPage } from './ServicePeriodsPage';

const PERIOD = { id: 'p1', name: 'תעסוקת חורף', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-12-01T00:00:00.000Z', status: 'PLANNING' };
const user = (role: Role): AuthUser => ({ id: 'u', username: 'x', displayName: 'x', role, companyScope: null, battalionId: 'b1', isPlatformAdmin: false });

function show(role: Role, periods: unknown[] = [PERIOD]): void {
  respond({
    '/api/service-periods': { status: 200, body: periods },
    'POST /api/service-periods': ({ body }) => ({ status: 201, body: { id: 'p2', status: 'PLANNING', ...(body as object) } }),
    'PATCH /api/service-periods/p1': ({ body }) => ({ status: 200, body: { ...PERIOD, ...(body as object) } }),
    '/api/service-periods/p1/company-allocations': { status: 200, body: [] },
  });
  render(
    <Provider store={store}>
      <ToastProvider>
        <MemoryRouter>
          <ServicePeriodsPage user={user(role)} />
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

describe('ServicePeriodsPage', () => {
  it('says so when no period exists', async () => {
    show('admin', []);
    expect(await screen.findByText(he.servicePeriods.noPeriods)).toBeTruthy();
  });

  it('lists periods with their status and dates', async () => {
    show('admin');
    expect((await screen.findAllByText(PERIOD.name)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(he.servicePeriods.statusLabels.PLANNING).length).toBeGreaterThan(0);
    expect(screen.getByText(/2026-11-01 – 2026-12-01/)).toBeTruthy();
  });

  it('only an admin can create or edit a period; the samgad just plans', async () => {
    show('SAMGAD');
    await screen.findAllByText(PERIOD.name);
    expect(screen.queryByRole('button', { name: he.servicePeriods.newPeriod })).toBeNull();
    expect(screen.queryByRole('button', { name: he.servicePeriods.editPeriod })).toBeNull();
  });

  it('refuses an end date before the start, and sends nothing', async () => {
    show('admin');
    fireEvent.click(await screen.findByRole('button', { name: he.servicePeriods.newPeriod }));
    const [name, from, to] = Array.from(document.querySelectorAll('[role=dialog] input')) as HTMLInputElement[];
    fireEvent.change(name as HTMLInputElement, { target: { value: 'חדשה' } });
    fireEvent.change(from as HTMLInputElement, { target: { value: '2026-12-10' } });
    fireEvent.change(to as HTMLInputElement, { target: { value: '2026-12-01' } });
    expect(screen.getByText(he.servicePeriods.endBeforeStart)).toBeTruthy();
    const create = screen.getByRole('button', { name: he.servicePeriods.create }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.click(create);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('trims the name and posts the dates as typed', async () => {
    show('admin');
    fireEvent.click(await screen.findByRole('button', { name: he.servicePeriods.newPeriod }));
    const [name, from, to] = Array.from(document.querySelectorAll('[role=dialog] input')) as HTMLInputElement[];
    fireEvent.change(name as HTMLInputElement, { target: { value: '  חדשה  ' } });
    fireEvent.change(from as HTMLInputElement, { target: { value: '2026-12-01' } });
    fireEvent.change(to as HTMLInputElement, { target: { value: '2026-12-01' } });
    fireEvent.click(screen.getByRole('button', { name: he.servicePeriods.create }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ name: 'חדשה', startsAt: '2026-12-01', endsAt: '2026-12-01' }));
  });

  it('changing the status sends only the status', async () => {
    show('admin');
    await screen.findAllByText(PERIOD.name);
    fireEvent.change(screen.getAllByRole('combobox')[0] as HTMLSelectElement, { target: { value: 'ACTIVE' } });
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ status: 'ACTIVE' }));
  });

  it('shows the server\'s message when saving an edit fails', async () => {
    respond({
      '/api/service-periods': { status: 200, body: [PERIOD] },
      'PATCH /api/service-periods/p1': { status: 400, body: { message: 'כבר קיימת תקופה פעילה' } },
      '/api/service-periods/p1/company-allocations': { status: 200, body: [] },
    });
    render(
      <Provider store={store}>
        <ToastProvider>
          <MemoryRouter>
            <ServicePeriodsPage user={user('admin')} />
          </MemoryRouter>
        </ToastProvider>
      </Provider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: he.servicePeriods.editPeriod }));
    fireEvent.click(screen.getByRole('button', { name: he.common.save }));
    expect(await screen.findByText('כבר קיימת תקופה פעילה')).toBeTruthy();
  });
});
