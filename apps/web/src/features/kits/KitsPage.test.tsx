// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../app/store';
import { ToastProvider } from '../../components/toast';
import { he } from '../../i18n/he';
import type { Item } from '../../lib/types';
import { calls, resetApi, respond } from '../../test/mockApi';
import { KitsPage } from './KitsPage';

const literal = (s: string): RegExp => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

const item = (id: string, name: string, extra: Partial<Item> = {}): Item => ({
  id, name, aliases: [], category: 'GEAR', isSerialized: false, inSummary: true, authorizedQty: 0, yamahQty: 0,
  repairQty: 0, repairSerials: [], defaultQty: 1, unitOfMeasure: "יח'", unitPrice: null, isActive: true, ...extra,
});
const RIFLE = item('rifle', 'M-4', { category: 'WEAPON' });
const MAG = item('mag', 'מחסנית');
const SLING = item('sling', 'רצועה');
const SCOPE = item('scope', 'מכפל');

const KIT = {
  baseItem: RIFLE,
  lines: [
    { item: MAG, quantity: 5 },
    { item: SCOPE, quantity: 1 },
  ],
  updatedAt: '2026-11-22T10:00:00.000Z',
};

function show(over: Record<string, unknown> = {}): void {
  respond({
    '/api/items': { status: 200, body: [RIFLE, MAG, SLING, SCOPE] },
    '/api/item-kits': { status: 200, body: [{ baseItem: { id: 'rifle', name: 'M-4', category: 'WEAPON' }, lineCount: 2, updatedAt: KIT.updatedAt }] },
    '/api/item-kits/rifle': { status: 200, body: KIT },
    '/api/item-kits/sling': { status: 200, body: { baseItem: SLING, lines: [], updatedAt: null } },
    '/api/item-kits/rifle/history': {
      status: 200,
      body: [
        {
          id: 'h1', at: '2026-11-22T10:00:00.000Z', baseItemName: 'M-4', actorName: 'שונם',
          before: [{ itemName: 'מחסנית', quantity: 4 }],
          after: [{ itemName: 'מחסנית', quantity: 5 }],
        },
      ],
    },
    'PUT /api/item-kits/rifle': ({ body }) => ({ status: 200, body: { ...KIT, ...(body as object) } }),
    ...over,
  });
  render(
    <Provider store={store}>
      <ToastProvider>
        <KitsPage />
      </ToastProvider>
    </Provider>,
  );
}

const pick = async (name: string) => fireEvent.click(await screen.findByRole('button', { name: new RegExp(name) }));
const puts = () => calls.filter((c) => c.method === 'PUT');

beforeEach(resetApi);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('KitsPage', () => {
  it('lists the active items, marking the ones that already have a kit', async () => {
    show();
    const row = await screen.findByRole('button', { name: /M-4/ });
    expect(within(row).getByText(he.kits.hasKit(2))).toBeTruthy();
    expect(screen.getByText(he.kits.pickPrompt)).toBeTruthy();
  });

  it('shows the lines of the picked kit, with their quantity', async () => {
    show();
    await pick('M-4');
    expect(await screen.findByText(he.kits.editing('M-4'))).toBeTruthy();
    expect((screen.getAllByLabelText(he.kits.quantity) as HTMLInputElement[]).map((i) => i.value)).toEqual(['5', '1']);
    expect(screen.queryByLabelText(/מתי מתווסף/)).toBeNull();
  });

  it('keeps save disabled until something changes, and discard puts it back', async () => {
    show();
    await pick('M-4');
    const saveBtn = await screen.findByRole('button', { name: he.kits.save });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
    const [qty] = screen.getAllByLabelText(he.kits.quantity) as HTMLInputElement[];
    fireEvent.change(qty as HTMLInputElement, { target: { value: '6' } });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: he.kits.discard }));
    expect((screen.getAllByLabelText(he.kits.quantity) as HTMLInputElement[])[0]?.value).toBe('5');
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('saves the whole kit in one request when a quantity is edited', async () => {
    show();
    await pick('M-4');
    const [qty] = await screen.findAllByLabelText(he.kits.quantity);
    fireEvent.change(qty as HTMLInputElement, { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: he.kits.save }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0]?.body).toEqual({
      lines: [
        { itemId: 'mag', quantity: 6 },
        { itemId: 'scope', quantity: 1 },
      ],
    });
    expect(await screen.findByText(he.kits.saved)).toBeTruthy();
  });

  it('adds a line from the picker and removes another', async () => {
    show();
    await pick('M-4');
    const adder = (await screen.findByLabelText(he.kits.addLine)) as HTMLSelectElement;
    // The base item and the items already in the kit are not offered.
    expect(Array.from(adder.options).map((o) => o.text)).toEqual([he.kits.addPlaceholder, 'רצועה']);
    fireEvent.change(adder, { target: { value: 'sling' } });
    fireEvent.click(screen.getByRole('button', { name: he.kits.removeLine('מכפל') }));
    fireEvent.click(screen.getByRole('button', { name: he.kits.save }));
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(puts()[0]?.body).toEqual({
      lines: [
        { itemId: 'mag', quantity: 5 },
        { itemId: 'sling', quantity: 1 },
      ],
    });
  });

  it('refuses to save a quantity that is not 1–99', async () => {
    show();
    await pick('M-4');
    const [qty] = await screen.findAllByLabelText(he.kits.quantity);
    for (const bad of ['0', '100', '', '1.5', 'x']) {
      fireEvent.change(qty as HTMLInputElement, { target: { value: bad } });
      expect((screen.getByRole('button', { name: he.kits.save }) as HTMLButtonElement).disabled, bad).toBe(true);
    }
    expect(puts()).toHaveLength(0);
  });

  it('shows the server message when a save is refused and keeps the draft', async () => {
    show({ 'PUT /api/item-kits/rifle': { status: 400, body: { message: 'הערכה יוצרת מעגל: M-4 ← מחסנית ← M-4' } } });
    await pick('M-4');
    const [qty] = await screen.findAllByLabelText(he.kits.quantity);
    fireEvent.change(qty as HTMLInputElement, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: he.kits.save }));
    expect((await screen.findAllByText(/הערכה יוצרת מעגל/)).length).toBeGreaterThan(0);
    expect((screen.getAllByLabelText(he.kits.quantity) as HTMLInputElement[])[0]?.value).toBe('7');
  });

  it('says an item with no kit is empty, and saving an empty kit is allowed once something was removed', async () => {
    show();
    await pick('רצועה');
    expect(await screen.findByText(he.kits.empty)).toBeTruthy();
    expect((screen.getByRole('button', { name: he.kits.save }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the history of the kit: who, and the lines before and after', async () => {
    show();
    await pick('M-4');
    expect(await screen.findByText(he.kits.history)).toBeTruthy();
    expect(await screen.findByText(literal(he.kits.historyBy('שונם')))).toBeTruthy();
    expect(screen.getByText(literal(he.kits.historyLine('מחסנית', 4)))).toBeTruthy();
    expect(screen.getByText(literal(he.kits.historyLine('מחסנית', 5)))).toBeTruthy();
  });
});
