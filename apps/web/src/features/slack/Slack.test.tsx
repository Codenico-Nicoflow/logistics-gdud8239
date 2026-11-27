// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../app/store';
import { ToastProvider } from '../../components/toast';
import { HUBS, visibleTabs, type Viewer } from '../../app/navConfig';
import { he } from '../../i18n/he';
import type { SlackOverview } from '../../lib/types';
import { calls, resetApi, respond } from '../../test/mockApi';
import { SlackPage } from './SlackPage';
import { useSlack } from './useSlack';

const NONE: SlackOverview = {
  botReady: true,
  configured: { snapshots: false, mesakem: false, attendance: false },
  channels: { snapshots: null, mesakem: null, attendance: null },
};

beforeEach(resetApi);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Probe() {
  const { isConfigured } = useSlack();
  return <span data-testid="p">{['snapshots', 'mesakem', 'attendance'].map((k) => `${k}:${isConfigured(k as 'snapshots')}`).join(',')}</span>;
}

describe('SlackPage', () => {
  function show(overview: SlackOverview, extra: Parameters<typeof respond>[0] = {}): void {
    respond({ '/api/slack': { status: 200, body: overview }, ...extra });
    render(
      <Provider store={store}>
        <ToastProvider>
          <SlackPage />
        </ToastProvider>
      </Provider>,
    );
  }
  const rowOf = async (name: string): Promise<HTMLElement> => {
    const li = (await screen.findByText(name)).closest('li');
    if (!li) throw new Error('no row');
    return li;
  };

  it('shows each kind as not configured and saves a channel id for one', async () => {
    show(NONE, { 'PUT /api/slack/attendance': { status: 200, body: { ...NONE, configured: { ...NONE.configured, attendance: true } } } });
    const row = await rowOf(he.slack.kinds.attendance.name);
    expect(within(row).getByText(he.slack.notConfigured)).toBeTruthy();
    fireEvent.change(within(row).getByRole('textbox'), { target: { value: 'C0HOMECHAN1' } });
    fireEvent.click(within(row).getByRole('button', { name: he.common.save }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ channelId: 'C0HOMECHAN1' });
  });

  it('can remove a channel, sending null', async () => {
    show(
      { ...NONE, configured: { ...NONE.configured, mesakem: true }, channels: { ...NONE.channels, mesakem: 'C0HOMECHAN2' } as SlackOverview['channels'] },
      { 'PUT /api/slack/mesakem': { status: 200, body: NONE } },
    );
    const row = await rowOf(he.slack.kinds.mesakem.name);
    fireEvent.click(within(row).getByRole('button', { name: he.slack.clear }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true));
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ channelId: null });
  });

  it('shows the server message for a bad id, and warns when the server has no bot', async () => {
    show({ ...NONE, botReady: false }, { 'PUT /api/slack/snapshots': { status: 400, body: { message: 'מזהה ערוץ לא תקין' } } });
    expect(await screen.findByText(he.slack.noBot)).toBeTruthy();
    const row = await rowOf(he.slack.kinds.snapshots.name);
    fireEvent.change(within(row).getByRole('textbox'), { target: { value: 'nope' } });
    fireEvent.click(within(row).getByRole('button', { name: he.common.save }));
    expect(await screen.findByText('מזהה ערוץ לא תקין')).toBeTruthy();
  });
});

describe('useSlack', () => {
  it('reports which sends can go anywhere', async () => {
    respond({ '/api/slack': { status: 200, body: { ...NONE, configured: { ...NONE.configured, snapshots: true } } } });
    render(
      <Provider store={store}>
        <Probe />
      </Provider>,
    );
    await waitFor(() => expect(screen.getByTestId('p').textContent).toBe('snapshots:true,mesakem:false,attendance:false'));
  });
});

describe('navigation', () => {
  const viewer = (isPlatformAdmin: boolean): Viewer => ({
    role: 'admin',
    isPlatformAdmin,
    modules: { companySplit: true, attendance: true, kits: true },
    canChangeModules: isPlatformAdmin,
  });
  const ids = (v: Viewer): string[] => HUBS.flatMap((h) => visibleTabs(h, v).map((t) => t.id));

  it('shows the Slack screen to the platform admin only', () => {
    expect(ids(viewer(false))).not.toContain('slack');
    expect(ids(viewer(true))).toContain('slack');
  });
});
