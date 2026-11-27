// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../app/store';
import { ToastProvider } from '../../components/toast';
import { HUBS, defaultPathFor, visibleHubs, visibleTabs, type Viewer } from '../../app/navConfig';
import { he } from '../../i18n/he';
import type { ModuleState, Role } from '../../lib/types';
import { calls, resetApi, respond } from '../../test/mockApi';
import { ModulesPage } from './ModulesPage';

const ALL: ModuleState = { companySplit: true, attendance: true, kits: true };
const viewer = (role: Role, modules: Partial<ModuleState> = {}, canChangeModules = false): Viewer => ({
  role,
  isPlatformAdmin: false,
  modules: { ...ALL, ...modules },
  canChangeModules,
});
const tabIds = (v: Viewer): string[] => HUBS.flatMap((h) => visibleTabs(h, v).map((t) => t.id));

describe('navigation with modules', () => {
  it('shows every module screen while all are on', () => {
    expect(tabIds(viewer('admin'))).toEqual(expect.arrayContaining(['companySplit', 'companyAllocation', 'kits', 'attendance']));
  });

  it('hides exactly the screens of a module that is off, and a hub left empty disappears from the rail', () => {
    const off = viewer('admin', { companySplit: false, attendance: false, kits: false });
    expect(tabIds(off)).not.toEqual(expect.arrayContaining(['companySplit']));
    for (const id of ['companySplit', 'companyAllocation', 'kits', 'attendance']) expect(tabIds(off)).not.toContain(id);
    expect(visibleHubs(off).map((h) => h.id)).not.toContain('attendance');
    expect(tabIds(off)).toContain('catalog');
  });

  it('shows the modules screen only to a super admin', () => {
    expect(tabIds(viewer('admin'))).not.toContain('modules');
    expect(tabIds(viewer('admin', {}, true))).toContain('modules');
    expect(tabIds(viewer('logistics', {}, true))).not.toContain('modules');
  });

  it("sends a company commander somewhere that exists when their only screen's module is off", () => {
    expect(defaultPathFor(viewer('COMPANY_CMDR'))).toBe('/periods/by-soldier');
    const off = viewer('COMPANY_CMDR', { companySplit: false });
    expect(defaultPathFor(off)).toBe('/security');
  });
});

describe('ModulesPage', () => {
  beforeEach(resetApi);
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function show(canChange: boolean, enabled: ModuleState = ALL, extra: Parameters<typeof respond>[0] = {}): void {
    respond({ '/api/modules': { status: 200, body: { enabled, canChange } }, ...extra });
    render(
      <Provider store={store}>
        <ToastProvider>
          <ModulesPage />
        </ToastProvider>
      </Provider>,
    );
  }

  it('lists the three modules with their state and flips one', async () => {
    show(true, ALL, { 'PUT /api/modules/kits': { status: 200, body: { enabled: { ...ALL, kits: false }, canChange: true } } });
    expect(await screen.findByText(he.modules.items.kits.name)).toBeTruthy();
    expect(screen.getByText(he.modules.items.attendance.name)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: he.modules.turnOff })[2] as HTMLElement);
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ enabled: false });
  });

  it('shows the server message when a switch is refused', async () => {
    show(true, ALL, { 'PUT /api/modules/kits': { status: 409, body: { message: 'לא ניתן לכבות' } } });
    fireEvent.click((await screen.findAllByRole('button', { name: he.modules.turnOff }))[2] as HTMLElement);
    expect(await screen.findByText('לא ניתן לכבות')).toBeTruthy();
  });

  it('is read-only for anyone who may not change it', async () => {
    show(false);
    const buttons = await screen.findAllByRole('button', { name: he.modules.turnOff });
    expect(buttons.every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.getByText(he.modules.onlySuperAdmin)).toBeTruthy();
  });
});
