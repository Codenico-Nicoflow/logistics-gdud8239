// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../app/store';
import { he } from '../../i18n/he';
import type { Item, SoldierSummary } from '../../lib/types';
import { resetApi, respond } from '../../test/mockApi';
import type { BasketLine } from './BasketStep';
import { SignStep } from './SignStep';

const soldier: SoldierSummary = {
  id: 's1', firstName: 'דנה', lastName: 'כהן', personalNumber: '1234567', phone: null, receiptNo: null, company: 'A',
  isActive: true, isAttached: false, openSignatureCount: 0, isEnlisted: true,
};
const item = (category: Item['category'], isSerialized: boolean): Item => ({
  id: category, name: category === 'WEAPON' ? 'M-4' : 'רצועה', aliases: [], category, isSerialized, inSummary: true, ifsunAllowed: false,
  authorizedQty: 5, yamahQty: 0, repairQty: 0, repairSerials: [], unitPrice: null, isActive: true, defaultQty: 1, unitOfMeasure: "יח'",
});
const weapon: BasketLine = { id: 'l1', item: item('WEAPON', true), quantity: 1, serial: '943550', lineNotes: '' };
const strap: BasketLine = { id: 'l2', item: item('ACCESSORY', false), quantity: 1, serial: '', lineNotes: '' };

function show(lines: BasketLine[], receiptNo: string): void {
  respond({ '/api/soldiers/receipt-hint': { status: 200, body: { last: '37', next: '38' } } });
  render(
    <Provider store={store}>
      <SignStep
        soldier={soldier}
        lines={lines}
        receiptNo={receiptNo}
        onReceiptNo={() => {}}
        notes=""
        onNotes={() => {}}
        signature="data:image/png;base64,AAAA"
        onSignature={() => {}}
        onBack={() => {}}
        onSubmit={() => {}}
        isSubmitting={false}
        error={null}
      />
    </Provider>,
  );
}

const submit = (): HTMLButtonElement => screen.getByRole('button', { name: he.form1008.submit }) as HTMLButtonElement;

beforeEach(resetApi);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SignStep receipt number', () => {
  it('will not sign a weapon without one, and says why', async () => {
    show([weapon], '');
    expect(submit().disabled).toBe(true);
    expect(screen.getByText(he.receiptNo.requiredForWeapon)).toBeTruthy();
    expect(await screen.findByText(he.receiptNo.hint('37', '38'))).toBeTruthy();
  });

  it('signs a weapon once there is a number, e.g. the one already saved on the soldier', () => {
    show([weapon], '12');
    expect(submit().disabled).toBe(false);
    expect(screen.queryByText(he.receiptNo.requiredForWeapon)).toBeNull();
  });

  it('does not ask for one when no weapon is handed out', () => {
    show([strap], '');
    expect(submit().disabled).toBe(false);
  });
});
