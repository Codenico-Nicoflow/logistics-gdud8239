// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../app/store';
import { ToastProvider } from '../../components/toast';
import { he } from '../../i18n/he';
import type { AuthUser, PlatformBattalion } from '../../lib/types';
import { calls, resetApi, respond } from '../../test/mockApi';
import { ActingBanner } from './ActingBanner';
import { BattalionSwitcher } from './BattalionSwitcher';
import { BattalionsPage } from './BattalionsPage';

const assign = vi.fn();

const operator = (over: Partial<AuthUser> = {}): AuthUser => ({
  id: 'p1',
  username: 'owner',
  displayName: 'מפעיל',
  role: 'admin',
  companyScope: null,
  battalionId: 'b8239',
  homeBattalionId: 'b8239',
  actorId: null,
  isPlatformAdmin: true,
  ...over,
});

const battalion = (id: string, number: string, over: Partial<PlatformBattalion> = {}): PlatformBattalion => ({
  id,
  name: `גדוד ${number}`,
  number,
  createdAt: '2026-11-01T00:00:00Z',
  userCount: 3,
  adminCount: 1,
  hasLogo: false,
  ...over,
});
const LIST = [battalion('b8239', '8239'), battalion('b5033', '5033', { userCount: 1, adminCount: 0 })];

const posts = (path: string) => calls.filter((c) => c.method === 'POST' && c.path === path);

function ui(node: React.ReactNode): void {
  render(
    <Provider store={store}>
      <ToastProvider>{node}</ToastProvider>
    </Provider>,
  );
}

beforeEach(() => {
  resetApi();
  assign.mockClear();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BattalionsPage', () => {
  it('lists every battalion, marks the current one, and flags one with nobody able to run it', async () => {
    respond({ '/api/platform/battalions': { status: 200, body: LIST } });
    ui(<BattalionsPage user={operator()} />);
    expect(await screen.findByText('גדוד 5033')).toBeTruthy();
    expect(screen.getByText(he.platform.current)).toBeTruthy();
    expect(screen.getByText(he.platform.noAdmin)).toBeTruthy();
    // You are already in your own battalion.
    const mine = (await screen.findByText('גדוד 8239')).closest('li') as HTMLElement;
    expect((within(mine).getByRole('button', { name: he.platform.enter }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('creates a battalion with its first admin and shows the one-time link', async () => {
    respond({
      '/api/platform/battalions': { status: 200, body: LIST },
      'POST /api/platform/battalions': ({ body }) => ({
        status: 201,
        body: {
          battalion: battalion('b9', (body as { number: string }).number),
          admin: { id: 'a1', username: 'admin9999' },
          setup: { url: 'https://app.example/setup/tok123', expiresAt: '2026-12-01T00:00:00Z' },
        },
      }),
    });
    ui(<BattalionsPage user={operator()} />);
    await screen.findByText('גדוד 5033');
    const create = screen.getByRole('button', { name: he.platform.create }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(new RegExp(he.platform.name)), { target: { value: 'גדוד 9999' } });
    fireEvent.change(screen.getByLabelText(new RegExp(he.platform.number)), { target: { value: '9999' } });
    fireEvent.change(screen.getByLabelText(new RegExp(he.platform.adminDisplayName)), { target: { value: 'דנה' } });
    fireEvent.change(screen.getByLabelText(new RegExp(he.platform.adminUsername)), { target: { value: 'admin9999' } });
    fireEvent.click(create);
    await waitFor(() => expect(posts('/api/platform/battalions')).toHaveLength(1));
    expect(posts('/api/platform/battalions')[0]?.body).toEqual({
      name: 'גדוד 9999',
      number: '9999',
      adminDisplayName: 'דנה',
      adminUsername: 'admin9999',
    });
    expect(((await screen.findByDisplayValue('https://app.example/setup/tok123')) as HTMLInputElement).readOnly).toBe(true);
  });

  it('shows the server message when the number is taken', async () => {
    respond({
      '/api/platform/battalions': { status: 200, body: LIST },
      'POST /api/platform/battalions': { status: 409, body: { message: 'כבר קיים גדוד עם המספר 5033' } },
    });
    ui(<BattalionsPage user={operator()} />);
    await screen.findByText('גדוד 5033');
    for (const [label, value] of [
      [he.platform.name, 'גדוד'],
      [he.platform.number, '5033'],
      [he.platform.adminDisplayName, 'דנה'],
      [he.platform.adminUsername, 'x_admin'],
    ] as const) {
      fireEvent.change(screen.getByLabelText(new RegExp(label)), { target: { value } });
    }
    fireEvent.click(screen.getByRole('button', { name: he.platform.create }));
    expect(await screen.findByText('כבר קיים גדוד עם המספר 5033')).toBeTruthy();
  });

  it('enters another battalion and reloads, so nothing from the old one stays in memory', async () => {
    respond({
      '/api/platform/battalions': { status: 200, body: LIST },
      'POST /api/platform/act-as': { status: 200, body: { user: operator({ battalionId: 'b5033', actorId: 'p1' }) } },
    });
    ui(<BattalionsPage user={operator()} />);
    const row = (await screen.findByText('גדוד 5033')).closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: he.platform.enter }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/'));
    expect(posts('/api/platform/act-as')[0]?.body).toEqual({ battalionId: 'b5033' });
  });

  it('stays put and does not reload when the switch is refused', async () => {
    respond({
      '/api/platform/battalions': { status: 200, body: LIST },
      'POST /api/platform/act-as': { status: 404, body: { message: 'הגדוד לא נמצא' } },
    });
    ui(<BattalionsPage user={operator()} />);
    const row = (await screen.findByText('גדוד 5033')).closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: he.platform.enter }));
    await waitFor(() => expect(posts('/api/platform/act-as')).toHaveLength(1));
    expect(assign).not.toHaveBeenCalled();
  });

  it('renames a battalion, sending only the name', async () => {
    respond({
      '/api/platform/battalions': { status: 200, body: LIST },
      'PATCH /api/platform/battalions/b5033': ({ body }) => ({ status: 200, body: { ...LIST[1], ...(body as object) } }),
    });
    ui(<BattalionsPage user={operator()} />);
    const row = (await screen.findByText('גדוד 5033')).closest('li') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: he.platform.rename }));
    fireEvent.change(within(row).getByDisplayValue('גדוד 5033'), { target: { value: 'גדוד חמש' } });
    fireEvent.click(within(row).getByRole('button', { name: he.common.save }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ name: 'גדוד חמש' });
  });
});

describe('ActingBanner', () => {
  const BATTALION = { '/api/battalion': { status: 200, body: { id: 'b5033', name: 'גדוד 5033', number: '5033', hasLogo: false, logoVersion: 0 } } };

  it('says which battalion you are inside, and takes you home', async () => {
    respond({ ...BATTALION, 'POST /api/platform/act-as': { status: 200, body: { user: operator() } } });
    ui(<ActingBanner user={operator({ battalionId: 'b5033', actorId: 'p1' })} />);
    expect(await screen.findByText(he.platform.acting('גדוד 5033'))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: he.platform.backHome }));
    await waitFor(() => expect(posts('/api/platform/act-as')).toHaveLength(1));
    // Home is the account's own battalion, not the one being left.
    expect(posts('/api/platform/act-as')[0]?.body).toEqual({ battalionId: 'b8239' });
  });

  it('is not there at all for an ordinary session', () => {
    respond(BATTALION);
    ui(<ActingBanner user={operator()} />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('BattalionSwitcher', () => {
  it('offers the platform operator every battalion, current one selected', async () => {
    respond({ '/api/platform/battalions': { status: 200, body: LIST } });
    ui(<BattalionSwitcher user={operator()} />);
    const select = (await screen.findByRole('combobox')) as HTMLSelectElement;
    expect(select.value).toBe('b8239');
    expect(within(select).getAllByRole('option')).toHaveLength(2);
  });

  it('asks nothing of the API and shows nothing to anyone else', () => {
    respond({ '/api/platform/battalions': { status: 200, body: LIST } });
    ui(<BattalionSwitcher user={operator({ isPlatformAdmin: false })} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(calls.some((c) => c.path === '/api/platform/battalions')).toBe(false);
  });
});
