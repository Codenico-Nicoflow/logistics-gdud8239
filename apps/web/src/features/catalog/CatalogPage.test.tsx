// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { store } from '../../app/store';
import { ToastProvider } from '../../components/toast';
import { he } from '../../i18n/he';
import type { Item } from '../../lib/types';
import { calls, resetApi, respond } from '../../test/mockApi';
import { CatalogPage } from './CatalogPage';

const item = (id: string, name: string, extra: Partial<Item>): Item => ({
  id, name, aliases: [], category: 'GEAR', isSerialized: false, inSummary: true, authorizedQty: 10, yamahQty: 0,
  repairQty: 0, repairSerials: [], defaultQty: 1, unitOfMeasure: "יח'", unitPrice: null, isActive: true, ...extra,
});
const BULK = item('bulk', 'מכשיר קשר', { repairQty: 3, repairSerials: ['K-1'] });
const SERIAL = item('ser', 'M-16', { isSerialized: true, category: 'WEAPON', authorizedQty: 3, repairQty: 2, repairSerials: ['100', '300'] });

function show(): void {
  respond({
    '/api/items': { status: 200, body: [BULK, SERIAL] },
    '/api/reports/summary': { status: 200, body: [] },
    'PATCH /api/items/bulk': ({ body }) => ({ status: 200, body: { ...BULK, ...(body as object) } }),
    'PATCH /api/items/ser': ({ body }) => ({ status: 200, body: { ...SERIAL, ...(body as object) } }),
  });
  render(
    <Provider store={store}>
      <ToastProvider>
        <MemoryRouter>
          <CatalogPage />
        </MemoryRouter>
      </ToastProvider>
    </Provider>,
  );
}

async function openEdit(name: string): Promise<HTMLElement> {
  const row = (await screen.findAllByText(name))[0]?.closest('li, tr') as HTMLElement;
  fireEvent.click(within(row).getAllByRole('button', { name: he.catalog.edit })[0] as HTMLElement);
  return await screen.findByRole('dialog');
}

const patches = () => calls.filter((c) => c.method === 'PATCH');

beforeEach(resetApi);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('catalog: what is in repair', () => {
  it('shows the מסדים in repair under the count, for a bulk and for a serialized item', async () => {
    show();
    expect((await screen.findAllByText(he.catalog.inRepairSerials('K-1'))).length).toBeGreaterThan(0);
    expect(screen.getAllByText(he.catalog.inRepairSerials('100, 300')).length).toBeGreaterThan(0);
  });

  it('a bulk item gets the list editor, stops adding at the count, and refuses a repeat', async () => {
    show();
    const dialog = await openEdit('מכשיר קשר');
    const box = within(dialog).getByPlaceholderText(he.catalog.repairSerialPlaceholder);
    const add = within(dialog).getByRole('button', { name: he.catalog.addRepairSerial });

    expect(within(dialog).getByText(he.catalog.repairSerialsHint(1, 3))).toBeTruthy();
    fireEvent.change(box, { target: { value: 'k-1' } });
    expect(within(dialog).getByText(he.catalog.repairSerialDuplicate)).toBeTruthy();
    expect((add as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(box, { target: { value: 'K-2' } });
    fireEvent.click(add);
    fireEvent.change(box, { target: { value: 'K-3' } });
    fireEvent.click(add);
    expect(within(dialog).getByText(he.catalog.repairLimitReached)).toBeTruthy();
    expect((box as HTMLInputElement).disabled).toBe(true);
  });

  it('saves the count together with the list for a bulk item', async () => {
    show();
    const dialog = await openEdit('מכשיר קשר');
    const box = within(dialog).getByPlaceholderText(he.catalog.repairSerialPlaceholder);
    fireEvent.change(box, { target: { value: 'K-2' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.click(within(dialog).getByRole('button', { name: he.catalog.removeRepairSerial('K-1') }));
    fireEvent.click(within(dialog).getByRole('button', { name: he.common.save }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]?.body).toMatchObject({ repairQty: 3, repairSerials: ['K-2'] });
  });

  it('raising the count lets another מסד be added', async () => {
    show();
    const dialog = await openEdit('מכשיר קשר');
    fireEvent.change(within(dialog).getByLabelText(new RegExp(he.catalog.repairQty)), { target: { value: '1' } });
    expect(within(dialog).getByText(he.catalog.repairLimitReached)).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(new RegExp(he.catalog.repairQty)), { target: { value: '4' } });
    expect(within(dialog).getByText(he.catalog.repairSerialsHint(1, 4))).toBeTruthy();
  });

  it('a serialized item shows its repair count as derived, with no editor, and sends neither field', async () => {
    show();
    const dialog = await openEdit('M-16');
    expect(within(dialog).getByText(he.catalog.repairDerived(2))).toBeTruthy();
    expect(within(dialog).queryByPlaceholderText(he.catalog.repairSerialPlaceholder)).toBeNull();
    expect(within(dialog).queryByLabelText(new RegExp(he.catalog.repairQty))).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: he.common.save }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]?.body).not.toHaveProperty('repairQty');
    expect(patches()[0]?.body).not.toHaveProperty('repairSerials');
  });
});
