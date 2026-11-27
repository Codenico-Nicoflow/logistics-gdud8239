// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../app/store';
import { he } from '../../i18n/he';
import { resetApi, respond } from '../../test/mockApi';
import { ReceiptNoField } from './ReceiptNoField';

function Host({ company = 'A', initial = '' }: { company?: string; initial?: string }) {
  const [value, setValue] = useState(initial);
  return <ReceiptNoField company={company} value={value} onChange={setValue} />;
}

const asked: (string | null)[] = [];

function show(hint: { last: string | null; next: string }, initial = ''): void {
  respond({
    '/api/soldiers/receipt-hint': ({ search }) => {
      asked.push(search.get('company'));
      return { status: 200, body: hint };
    },
  });
  render(
    <Provider store={store}>
      <Host initial={initial} />
    </Provider>,
  );
}

beforeEach(() => {
  resetApi();
  asked.length = 0;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ReceiptNoField', () => {
  it("names the company's last number and fills in the next one on a tap", async () => {
    show({ last: '37', next: '38' });
    expect(await screen.findByText(he.receiptNo.hint('37', '38'))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: he.receiptNo.useNext('38') }));
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('38');
    // Once there is a number the suggestion is no longer offered over it.
    expect(screen.queryByRole('button', { name: he.receiptNo.useNext('38') })).toBeNull();
  });

  it('asks the API about the soldier\'s own company', async () => {
    show({ last: null, next: '1' });
    expect(await screen.findByText(he.receiptNo.hintNone)).toBeTruthy();
    expect(asked).toEqual(['A']);
  });

  it('does not offer the suggestion when a number is already there', async () => {
    show({ last: '37', next: '38' }, '12');
    await screen.findByText(he.receiptNo.hint('37', '38'));
    expect(screen.queryByRole('button', { name: he.receiptNo.useNext('38') })).toBeNull();
  });
});
