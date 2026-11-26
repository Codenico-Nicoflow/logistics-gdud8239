// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../app/store';
import { ToastProvider } from '../../components/toast';
import { he } from '../../i18n/he';
import type { CompanySoldierRef, SoldierAllocationRow } from '../../lib/types';
import { calls, resetApi, respond } from '../../test/mockApi';
import { SoldierAllocationGrid } from './SoldierAllocationGrid';

const SOLDIERS: CompanySoldierRef[] = [
  { id: 's1', firstName: 'דנה', lastName: 'כהן' },
  { id: 's2', firstName: 'יוסי', lastName: 'לוי' },
];

const rifle: SoldierAllocationRow = {
  itemId: 'i1',
  item: { id: 'i1', name: 'מאג', category: 'WEAPON', unitOfMeasure: 'יח׳', isSerialized: true },
  companyQuantity: 1,
  bySoldier: { s1: 1 },
  total: 1,
};
const mags: SoldierAllocationRow = {
  itemId: 'i2',
  item: { id: 'i2', name: 'מחסנית', category: 'ACCESSORY', unitOfMeasure: 'יח׳', isSerialized: false },
  companyQuantity: 10,
  bySoldier: {},
  total: 0,
};

function show(rows: SoldierAllocationRow[] = [rifle, mags], extra: Parameters<typeof respond>[0] = {}): void {
  respond({
    '/api/service-periods/p1/soldier-allocations': { status: 200, body: rows },
    '/api/service-periods/p1/soldier-allocations/soldiers': { status: 200, body: SOLDIERS },
    'POST /api/service-periods/p1/soldier-allocations': ({ body }) => ({ status: 200, body: body }),
    ...extra,
  });
  render(
    <Provider store={store}>
      <ToastProvider>
        <SoldierAllocationGrid servicePeriodId="p1" />
      </ToastProvider>
    </Provider>,
  );
}

// The table and the phone cards both render in jsdom (no CSS), so the table's control is the first match.
const cell = (soldier: string, item: string): HTMLElement => screen.getAllByLabelText(`${soldier} — ${item}`)[0]!;
const saveButton = (): HTMLButtonElement => screen.getByRole('button', { name: he.common.save }) as HTMLButtonElement;

beforeEach(resetApi);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SoldierAllocationGrid', () => {
  it('shows every soldier as a row and every item as a column', async () => {
    show();
    expect((await screen.findAllByText('דנה כהן')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('יוסי לוי').length).toBeGreaterThan(0);
    expect(screen.getAllByText('מאג').length).toBeGreaterThan(0);
    expect(screen.getAllByText('מחסנית').length).toBeGreaterThan(0);
    expect((cell('דנה כהן', 'מאג') as HTMLInputElement).checked).toBe(true);
  });

  it('says so when the company has no items', async () => {
    show([]);
    expect(await screen.findByText(he.servicePeriods.noCompanyItems)).toBeTruthy();
  });

  it('keeps save disabled until a cell changes, then sends only the changed cell', async () => {
    show();
    await screen.findAllByText('דנה כהן');
    expect(saveButton().disabled).toBe(true);

    fireEvent.click(cell('יוסי לוי', 'מחסנית'));
    expect(saveButton().disabled).toBe(false);
    fireEvent.click(saveButton());

    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ itemId: 'i2', soldierId: 's2', quantity: 1 });
  });

  it('blocks saving when a column goes over what the company was given', async () => {
    show();
    await screen.findAllByText('דנה כהן');
    fireEvent.click(cell('יוסי לוי', 'מאג')); // company has 1 מאג and דנה already holds it
    expect(saveButton().disabled).toBe(true);
    expect(screen.getByText(new RegExp(he.servicePeriods.capExceededCannotSave(1).slice(0, 20)))).toBeTruthy();
    fireEvent.click(saveButton());
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('saves a decrease before an increase, so a swap never trips the per-soldier cap', async () => {
    show();
    await screen.findAllByText('דנה כהן');
    fireEvent.click(cell('יוסי לוי', 'מאג'));
    fireEvent.click(cell('דנה כהן', 'מאג'));
    fireEvent.click(saveButton());

    await waitFor(() => expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2));
    const quantities = calls.filter((c) => c.method === 'POST').map((c) => (c.body as { quantity: number }).quantity);
    expect(quantities).toEqual([0, 1]);
  });

  it('shows the server error under the cell that failed', async () => {
    show([rifle, mags], {
      'POST /api/service-periods/p1/soldier-allocations': { status: 409, body: { message: 'אין מספיק לפלוגה' } },
    });
    await screen.findAllByText('דנה כהן');
    fireEvent.click(cell('דנה כהן', 'מחסנית'));
    fireEvent.click(saveButton());
    expect((await screen.findAllByText('אין מספיק לפלוגה')).length).toBeGreaterThan(0);
  });

  it('keeps an edit when the search hides that soldier', async () => {
    show();
    await screen.findAllByText('דנה כהן');
    fireEvent.click(cell('דנה כהן', 'מחסנית'));
    fireEvent.change(screen.getByPlaceholderText(he.servicePeriods.searchSoldier), { target: { value: 'יוסי' } });
    await waitFor(() => expect(screen.queryAllByText('דנה כהן')).toHaveLength(0));
    fireEvent.change(screen.getByPlaceholderText(he.servicePeriods.searchSoldier), { target: { value: '' } });
    await screen.findAllByText('דנה כהן');
    expect((cell('דנה כהן', 'מחסנית') as HTMLInputElement).checked).toBe(true);
  });
});
