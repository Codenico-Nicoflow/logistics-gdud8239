// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../app/store';
import { BattalionMark } from '../../components/BattalionMark';
import { ToastProvider } from '../../components/toast';
import { he } from '../../i18n/he';
import type { BattalionInfo } from '../../lib/types';
import { calls, resetApi, respond } from '../../test/mockApi';
import { IdentityPage, MAX_LOGO_BYTES } from './IdentityPage';

const battalion = (over: Partial<BattalionInfo> = {}): BattalionInfo => ({
  id: 'b1',
  name: 'גדוד 5033',
  number: '5033',
  hasLogo: false,
  logoVersion: 0,
  ...over,
});

const puts = () => calls.filter((c) => c.method === 'PUT');
const fileInput = () => screen.getByLabelText(he.identity.choose) as HTMLInputElement;

function show(routes: Parameters<typeof respond>[0]): void {
  respond(routes);
  render(
    <Provider store={store}>
      <ToastProvider>
        <IdentityPage />
      </ToastProvider>
    </Provider>,
  );
}

beforeEach(resetApi);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('IdentityPage', () => {
  it('shows the name and number as they are printed, and says no logo has been uploaded', async () => {
    show({ '/api/battalion': { status: 200, body: battalion() } });
    expect(await screen.findByText('גדוד 5033')).toBeTruthy();
    expect(screen.getByText(he.identity.noLogo('5033'))).toBeTruthy();
    // Nothing to remove yet.
    expect(screen.queryByRole('button', { name: he.identity.remove })).toBeNull();
  });

  it('sends a chosen PNG as the raw file', async () => {
    // The list is refetched after the upload, so the server's answer has to change with it.
    let stored = battalion();
    show({
      '/api/battalion': () => ({ status: 200, body: stored }),
      'PUT /api/battalion/logo': () => {
        stored = battalion({ hasLogo: true, logoVersion: 1 });
        return { status: 200, body: stored };
      },
    });
    await screen.findByText('גדוד 5033');
    // The mock reads bodies as JSON, so the stand-in file's bytes are valid JSON.
    fireEvent.change(fileInput(), { target: { files: [new File(['{}'], 'logo.png', { type: 'image/png' })] } });
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(await screen.findByText(he.identity.hasLogo)).toBeTruthy();
    expect(screen.getByRole('button', { name: he.identity.remove })).toBeTruthy();
  });

  it('turns a non-image or oversized file away without sending it', async () => {
    show({ '/api/battalion': { status: 200, body: battalion() } });
    await screen.findByText('גדוד 5033');
    fireEvent.change(fileInput(), { target: { files: [new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })] } });
    expect(await screen.findByText(he.identity.wrongType)).toBeTruthy();
    const big = new File([new Uint8Array(MAX_LOGO_BYTES + 1)], 'big.png', { type: 'image/png' });
    fireEvent.change(fileInput(), { target: { files: [big] } });
    expect(await screen.findByText(he.identity.tooBig)).toBeTruthy();
    expect(puts()).toHaveLength(0);
  });

  it('shows the server message when the upload is refused', async () => {
    show({
      '/api/battalion': { status: 200, body: battalion() },
      'PUT /api/battalion/logo': { status: 400, body: { message: 'הלוגו חייב להיות PNG או JPEG' } },
    });
    await screen.findByText('גדוד 5033');
    fireEvent.change(fileInput(), { target: { files: [new File(['{}'], 'logo.png', { type: 'image/png' })] } });
    expect(await screen.findByText('הלוגו חייב להיות PNG או JPEG')).toBeTruthy();
  });

  it('removes the logo', async () => {
    show({
      '/api/battalion': { status: 200, body: battalion({ hasLogo: true, logoVersion: 3 }) },
      'DELETE /api/battalion/logo': { status: 200, body: battalion({ logoVersion: 4 }) },
    });
    fireEvent.click(await screen.findByRole('button', { name: he.identity.remove }));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
  });
});

describe('BattalionMark', () => {
  const mark = () =>
    render(
      <Provider store={store}>
        <BattalionMark />
      </Provider>,
    );

  it("draws the battalion's own number when it has no logo", async () => {
    respond({ '/api/battalion': { status: 200, body: battalion() } });
    const { container } = mark();
    await waitFor(() => expect(container.querySelectorAll('text').length).toBeGreaterThan(0));
    expect(container.textContent).toContain('5033');
    expect(container.querySelector('img')).toBeNull();
  });

  it('shows the uploaded picture, versioned so a replaced logo is fetched again', async () => {
    respond({ '/api/battalion': { status: 200, body: battalion({ hasLogo: true, logoVersion: 7 }) } });
    const { container } = mark();
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/api/battalion/logo?v=7');
  });

  it('shows no mark at all until the battalion is known, rather than another unit’s', () => {
    respond({ '/api/battalion': { status: 200, body: battalion() } });
    const { container } = mark();
    expect(container.textContent).toBe('');
    expect(container.querySelector('svg')).toBeNull();
  });
});
