// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../app/store';
import { ToastProvider } from '../../components/toast';
import { he } from '../../i18n/he';
import type { CompanyInfo } from '../../lib/types';
import { calls, resetApi, respond } from '../../test/mockApi';
import { CompaniesPage } from './CompaniesPage';
import { useCompanies } from './useCompanies';

const company = (code: string, name: string, sortOrder: number, isActive = true): CompanyInfo => ({
  id: `id-${code}`,
  code,
  name,
  sortOrder,
  isActive,
});
const LIST = [company('A', 'א', 0), company('SUPPORT', 'מסייעת', 1), company('HQ', 'מפקדה', 2, false)];

const patches = () => calls.filter((c) => c.method === 'PATCH');

function show(routes: Parameters<typeof respond>[0] = {}): void {
  respond({ '/api/companies': { status: 200, body: LIST }, ...routes });
  render(
    <Provider store={store}>
      <ToastProvider>
        <CompaniesPage />
      </ToastProvider>
    </Provider>,
  );
}

const rowOf = async (name: string): Promise<HTMLElement> => {
  const li = (await screen.findByText(name)).closest('li');
  if (!li) throw new Error(`no row for ${name}`);
  return li;
};

beforeEach(resetApi);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CompaniesPage', () => {
  it("lists every company in the battalion's order and marks a deactivated one", async () => {
    show();
    expect(await screen.findByText('א')).toBeTruthy();
    expect(screen.getByText('מסייעת')).toBeTruthy();
    const hq = await rowOf('מפקדה');
    expect(within(hq).getByText(he.companiesAdmin.inactive)).toBeTruthy();
    expect(within(hq).getByRole('button', { name: he.companiesAdmin.activate })).toBeTruthy();
  });

  it('shows the empty state for a battalion with no companies yet', async () => {
    show({ '/api/companies': { status: 200, body: [] } });
    expect(await screen.findByText(he.companiesAdmin.empty)).toBeTruthy();
  });

  it('adds a company by name and clears the box', async () => {
    show({ 'POST /api/companies': ({ body }) => ({ status: 201, body: company('c_1', (body as { name: string }).name, 3) }) });
    const input = await screen.findByLabelText(new RegExp(he.companiesAdmin.newName));
    fireEvent.change(input, { target: { value: 'פלוגה ד' } });
    fireEvent.click(screen.getByRole('button', { name: he.companiesAdmin.add }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ name: 'פלוגה ד' });
    await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
  });

  it('will not add a blank name', async () => {
    show();
    await screen.findByText('א');
    expect((screen.getByRole('button', { name: he.companiesAdmin.add }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the server message when a name is taken', async () => {
    show({ 'POST /api/companies': { status: 409, body: { message: 'פלוגה בשם "א" כבר קיימת' } } });
    fireEvent.change(await screen.findByLabelText(new RegExp(he.companiesAdmin.newName)), { target: { value: 'א' } });
    fireEvent.click(screen.getByRole('button', { name: he.companiesAdmin.add }));
    expect(await screen.findByText('פלוגה בשם "א" כבר קיימת')).toBeTruthy();
  });

  it('renames in place, sending only the name', async () => {
    show({ 'PATCH /api/companies/id-A': ({ body }) => ({ status: 200, body: { ...LIST[0], ...(body as object) } }) });
    const row = await rowOf('א');
    fireEvent.click(within(row).getByRole('button', { name: he.companiesAdmin.rename }));
    fireEvent.change(within(row).getByDisplayValue('א'), { target: { value: 'פלוגה א׳' } });
    fireEvent.click(within(row).getByRole('button', { name: he.common.save }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]?.body).toEqual({ name: 'פלוגה א׳' });
  });

  it('deactivates and reactivates', async () => {
    show({
      'PATCH /api/companies/id-A': { status: 200, body: { ...LIST[0], isActive: false } },
      'PATCH /api/companies/id-HQ': { status: 200, body: { ...LIST[2], isActive: true } },
    });
    fireEvent.click(within(await rowOf('א')).getByRole('button', { name: he.companiesAdmin.deactivate }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]?.body).toEqual({ isActive: false });

    fireEvent.click(within(await rowOf('מפקדה')).getByRole('button', { name: he.companiesAdmin.activate }));
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches()[1]?.body).toEqual({ isActive: true });
  });

  it('moves a company by swapping sort numbers with its neighbour, and cannot move the ends past themselves', async () => {
    show({
      'PATCH /api/companies/id-SUPPORT': { status: 200, body: LIST[1] },
      'PATCH /api/companies/id-A': { status: 200, body: LIST[0] },
    });
    const first = await rowOf('א');
    expect((within(first).getByRole('button', { name: he.companiesAdmin.moveUp }) as HTMLButtonElement).disabled).toBe(true);
    const last = await rowOf('מפקדה');
    expect((within(last).getByRole('button', { name: he.companiesAdmin.moveDown }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(within(await rowOf('מסייעת')).getByRole('button', { name: he.companiesAdmin.moveUp }));
    await waitFor(() => expect(patches()).toHaveLength(2));
    expect(patches().map((p) => p.body)).toEqual([{ sortOrder: 0 }, { sortOrder: 1 }]);
  });
});

describe('useCompanies', () => {
  function Probe() {
    const { nameOf, options, active } = useCompanies();
    return (
      <div>
        <span data-testid="name">{nameOf('SUPPORT')}</span>
        <span data-testid="inactive-name">{nameOf('HQ')}</span>
        <span data-testid="unknown">{nameOf('GONE')}</span>
        <span data-testid="options">{options.map((o) => `${o.value}=${o.label}`).join(',')}</span>
        <span data-testid="active">{active.length}</span>
      </div>
    );
  }

  it('turns a stored code into its current name, offers only active companies, and falls back to the code', async () => {
    respond({ '/api/companies': { status: 200, body: LIST } });
    render(
      <Provider store={store}>
        <Probe />
      </Provider>,
    );
    await waitFor(() => expect(screen.getByTestId('name').textContent).toBe('מסייעת'));
    // a deactivated company still resolves, so its history stays readable
    expect(screen.getByTestId('inactive-name').textContent).toBe('מפקדה');
    // but it is not offered for new work
    expect(screen.getByTestId('options').textContent).toBe('A=א,SUPPORT=מסייעת');
    expect(screen.getByTestId('active').textContent).toBe('2');
    expect(screen.getByTestId('unknown').textContent).toBe('GONE');
  });

  it('shows a gap rather than a raw code while the list is still loading', () => {
    respond({ '/api/companies': { status: 200, body: LIST } });
    render(
      <Provider store={store}>
        <Probe />
      </Provider>,
    );
    expect(screen.getByTestId('name').textContent).toBe('');
  });
});
