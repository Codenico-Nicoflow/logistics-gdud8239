// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../app/store';
import { ToastProvider } from '../../components/toast';
import { he } from '../../i18n/he';
import { calls, resetApi, respond } from '../../test/mockApi';
import { AddSoldierDialog } from './AddSoldierDialog';

const CREATED = { id: 's9', firstName: 'דנה', lastName: 'כהן', company: 'A', personalNumber: '1234567', phone: null, isActive: true, isAttached: false, openSignatureCount: 0, isEnlisted: null };

const COMPANIES = { '/api/companies': { status: 200, body: [{ id: 'id-A', code: 'A', name: 'א', sortOrder: 0, isActive: true }] } };

async function open(): Promise<void> {
  render(
    <Provider store={store}>
      <ToastProvider>
        <AddSoldierDialog onClose={() => {}} onCreated={() => {}} />
      </ToastProvider>
    </Provider>,
  );
  const [first, last, pn] = Array.from(document.querySelectorAll('input[type=text]')) as HTMLInputElement[];
  fireEvent.change(first as HTMLInputElement, { target: { value: 'דנה' } });
  fireEvent.change(last as HTMLInputElement, { target: { value: 'כהן' } });
  fireEvent.change(pn as HTMLInputElement, { target: { value: '1234567' } });
  // The company list arrives after the dialog; creating before it does is not possible.
  await waitFor(() => expect((screen.getByRole('button', { name: he.issue.createAndContinue }) as HTMLButtonElement).disabled).toBe(false));
}
const create = () => fireEvent.click(screen.getByRole('button', { name: he.issue.createAndContinue }));

beforeEach(resetApi);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AddSoldierDialog company', () => {
  it("sends the battalion's own first company, never a code that only another battalion has", async () => {
    respond({
      '/api/companies': { status: 200, body: [{ id: 'id-x', code: 'c_1a2b3c4d', name: 'פלוגה חדשה', sortOrder: 0, isActive: true }] },
      'POST /api/soldiers/check-duplicates': { status: 200, body: [] },
      'POST /api/soldiers': { status: 201, body: { ...CREATED, company: 'c_1a2b3c4d' } },
    });
    await open();
    create();
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/soldiers')).toBe(true));
    expect((calls.find((c) => c.method === 'POST' && c.path === '/api/soldiers')?.body as { company: string }).company).toBe('c_1a2b3c4d');
  });

  it('cannot create while the battalion has no company yet', async () => {
    respond({ '/api/companies': { status: 200, body: [] } });
    render(
      <Provider store={store}>
        <ToastProvider>
          <AddSoldierDialog onClose={() => {}} onCreated={() => {}} />
        </ToastProvider>
      </Provider>,
    );
    expect((screen.getByRole('button', { name: he.issue.createAndContinue }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('AddSoldierDialog duplicate check', () => {
  it('creates when the check finds nothing', async () => {
    respond({
      ...COMPANIES,
      'POST /api/soldiers/check-duplicates': { status: 200, body: [] },
      'POST /api/soldiers': { status: 201, body: CREATED },
    });
    await open();
    create();
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path === '/api/soldiers')).toBe(true));
  });

  it('does NOT create when the check itself fails; says so, and a retry runs the check again', async () => {
    respond({
      ...COMPANIES,
      'POST /api/soldiers/check-duplicates': { status: 500, body: { message: 'boom' } },
      'POST /api/soldiers': { status: 201, body: CREATED },
    });
    await open();
    create();
    expect(await screen.findByText(he.soldiers.duplicateCheckFailed)).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/soldiers')).toBe(false);
    create();
    await waitFor(() => expect(calls.filter((c) => c.path === '/api/soldiers/check-duplicates')).toHaveLength(2));
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/soldiers')).toBe(false);
  });

  it('shows a likely duplicate and waits for a second press before creating', async () => {
    respond({
      ...COMPANIES,
      'POST /api/soldiers/check-duplicates': { status: 200, body: [{ ...CREATED, id: 'old', personalNumber: '7654321' }] },
      'POST /api/soldiers': { status: 201, body: CREATED },
    });
    await open();
    create();
    await waitFor(() => expect(screen.getAllByText(/7654321/).length).toBeGreaterThan(0));
    expect(calls.some((c) => c.method === 'POST' && c.path === '/api/soldiers')).toBe(false);
  });
});
