// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { store } from '../../app/store';
import { api } from '../../lib/api';
import { ToastProvider } from '../../components/toast';
import { he } from '../../i18n/he';
import type { Item, SoldierSummary } from '../../lib/types';
import { resetApi, respond } from '../../test/mockApi';
import type { BasketLine } from './BasketStep';
import { draftScope, loadDraft, saveDraft } from './issueDraft';

const ME = { id: 'u1', username: 'x', displayName: 'x', role: 'logistics', companyScope: null, battalionId: 'b1', homeBattalionId: 'b1', actorId: null, isPlatformAdmin: false };
const SCOPE = draftScope(ME);
import { IssuePage } from './IssuePage';

const soldier: SoldierSummary = {
  id: 's1', firstName: 'דנה', lastName: 'כהן', personalNumber: '1234567', phone: null, receiptNo: null, company: 'A',
  isActive: true, isAttached: false, openSignatureCount: 0, isEnlisted: true,
};
const item: Item = {
  id: 'i1', name: 'M-4', aliases: [], category: 'WEAPON', isSerialized: true, inSummary: true, ifsunAllowed: false,
  authorizedQty: 5, yamahQty: 0, repairQty: 0, repairSerials: [], unitPrice: null, isActive: true, defaultQty: 1, unitOfMeasure: "יח'",
};
const line: BasketLine = { id: 'l1', item, quantity: 1, serial: '943550', lineNotes: '' };

async function mountIssue(): Promise<void> {
  respond({
    '/api/auth/me': { status: 200, body: { user: ME } },
    '/api/soldiers/s1': { status: 200, body: { ...soldier, signatures: [] } },
    '/api/items': { status: 200, body: [item] },
  });
  // As in the app: the signed-in person is already known when this page opens, which is what names the draft's owner.
  await store.dispatch(api.endpoints.me.initiate());
  render(
    <Provider store={store}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/issue']}>
          <IssuePage />
        </MemoryRouter>
      </ToastProvider>
    </Provider>,
  );
}

beforeEach(() => {
  resetApi();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ניפוק after the page went away mid-way', () => {
  it('returns to the soldier with the basket and מסד already filled in', async () => {
    saveDraft(SCOPE, { soldier, step: 'basket', lines: [line], receiptNo: '', notes: '' });
    await mountIssue();
    expect(await screen.findByText(he.form1008.draftRestored('דנה כהן'))).toBeTruthy();
    await waitFor(() => expect(screen.getAllByDisplayValue('943550').length).toBeGreaterThan(0));
  });

  it('starts from the soldier search when nothing was in progress', async () => {
    await mountIssue();
    await waitFor(() => expect(screen.queryByText(he.form1008.draftRestored('דנה כהן'))).toBeNull());
    expect(screen.queryAllByDisplayValue('943550')).toHaveLength(0);
  });

  it('discarding the draft empties the basket and removes it from the device', async () => {
    saveDraft(SCOPE, { soldier, step: 'basket', lines: [line], receiptNo: '', notes: '' });
    await mountIssue();
    fireEvent.click(await screen.findByRole('button', { name: he.form1008.draftDiscard }));
    await waitFor(() => expect(screen.queryAllByDisplayValue('943550')).toHaveLength(0));
    expect(loadDraft(SCOPE, 's1')).toBeNull();
  });

  it("does not resume a basket saved for another battalion on this browser", async () => {
    saveDraft(draftScope({ ...ME, id: 'u2', battalionId: 'b2' }), { soldier, step: 'basket', lines: [line], receiptNo: '', notes: '' });
    await mountIssue();
    await waitFor(() => expect(screen.queryByText(he.form1008.draftRestored('דנה כהן'))).toBeNull());
    expect(screen.queryAllByDisplayValue('943550')).toHaveLength(0);
  });
});
