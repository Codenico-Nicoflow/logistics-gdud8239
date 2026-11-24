// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../app/store';
import { ToastProvider } from '../../components/toast';
import { he } from '../../i18n/he';
import { calls, resetApi, respond } from '../../test/mockApi';
import { StoreDialog } from './StoreDialog';
import type { SignerValue } from './SignerFields';

// The pad needs a real canvas; the dialog only cares that a valid signature arrives.
vi.mock('./SignerFields', () => ({
  SignerFields: ({ onChange }: { onChange: (v: SignerValue) => void }) => {
    useEffect(() => onChange({ signatureImage: 'data:image/png;base64,AAAA', signerName: undefined, valid: true }), [onChange]);
    return null;
  },
}));

function show(quantity: number, serial: string | null = null): void {
  respond({ 'POST /api/ifsun': { status: 201, body: { id: 'r1' } } });
  render(
    <Provider store={store}>
      <ToastProvider>
        <StoreDialog signature={{ id: 's1', itemName: 'מתפסים', quantity, serial }} soldierName="דנה כהן" onClose={() => {}} />
      </ToastProvider>
    </Provider>,
  );
}

beforeEach(resetApi);
afterEach(cleanup);

describe('StoreDialog', () => {
  it('lets him leave only some of what he holds, e.g. 2 of 3', async () => {
    show(3);
    const qty = screen.getByLabelText(new RegExp(he.ifsun.storeQty(3).replace(/[()]/g, '\\$&')));
    expect((qty as HTMLInputElement).value).toBe('3');
    fireEvent.change(qty, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: he.ifsun.storeAction }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.path.endsWith('/ifsun'))).toBe(true));
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ signatureId: 's1', quantity: 2 });
  });

  it('refuses more than he holds, or none', () => {
    show(3);
    const qty = screen.getByLabelText(new RegExp(he.ifsun.storeQty(3).replace(/[()]/g, '\\$&')));
    const send = screen.getByRole('button', { name: he.ifsun.storeAction }) as HTMLButtonElement;
    fireEvent.change(qty, { target: { value: '4' } });
    expect(send.disabled).toBe(true);
    fireEvent.change(qty, { target: { value: '0' } });
    expect(send.disabled).toBe(true);
  });

  it('asks for no quantity for a single unit or a מסד item', () => {
    show(1);
    expect(screen.queryByLabelText(/כמה לאפסן/)).toBeNull();
    cleanup();
    show(1, '12345');
    expect(screen.queryByLabelText(/כמה לאפסן/)).toBeNull();
  });
});
