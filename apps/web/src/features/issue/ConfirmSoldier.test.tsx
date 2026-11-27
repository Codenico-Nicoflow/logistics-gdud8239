// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addressOf } from '../../app/navConfig';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { store } from '../../app/store';
import { ToastProvider } from '../../components/toast';
import { he } from '../../i18n/he';
import { resetApi, respond } from '../../test/mockApi';
import { ConfirmSoldier } from './ConfirmSoldier';

const SOLDIER = {
  id: 's1', firstName: 'דנה', lastName: 'כהן', company: 'A', personalNumber: '1234567', phone: '0501234567', receiptNo: null as string | null,
  isActive: true, isAttached: false, isEnlisted: true, signatures: [] as unknown[],
};
const HOLDS = { ...SOLDIER, signatures: [{ id: 'g1', quantity: 1, item: { name: 'M-4' }, itemInstance: { serial: '943550' } }] };

function Landing() {
  const { state } = useLocation();
  return <div data-testid="documents">{JSON.stringify(state)}</div>;
}

function show(soldier: unknown, onContinue = vi.fn()): void {
  respond({ '/api/soldiers/s1': { status: 200, body: soldier } });
  render(
    <Provider store={store}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/issue']}>
          <Routes>
            <Route path="/issue" element={<ConfirmSoldier soldierId="s1" onBack={() => {}} onContinue={onContinue} />} />
            <Route path={addressOf('documents')} element={<Landing />} />
          </Routes>
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

describe('ConfirmSoldier', () => {
  it('continues to the item step for a soldier who holds nothing', async () => {
    const onContinue = vi.fn();
    show(SOLDIER, onContinue);
    fireEvent.click(await screen.findByRole('button', { name: he.issue.continueToItem }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('sends a soldier who already holds items to his signatures, not to a disabled button', async () => {
    const onContinue = vi.fn();
    show(HOLDS, onContinue);
    expect(screen.queryByRole('button', { name: he.issue.continueToItem })).toBeNull();
    const go = await screen.findByRole('button', { name: he.issue.goToSignatures });
    expect((go as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(go);
    const landed = await screen.findByTestId('documents');
    // The soldier and the search that brings him into the list travel in router state, not in the address.
    expect(JSON.parse(landed.textContent ?? '')).toEqual({ soldierId: 's1', q: 'דנה כהן' });
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('still blocks a soldier who is not enlisted', async () => {
    show({ ...SOLDIER, isEnlisted: false });
    const next = await screen.findByRole('button', { name: he.issue.continueToItem });
    await waitFor(() => expect((next as HTMLButtonElement).disabled).toBe(true));
  });
});
