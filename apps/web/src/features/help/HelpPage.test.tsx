// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { HUBS, tabAddress } from '../../app/navConfig';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { he } from '../../i18n/he';
import { GUIDE_DAY, GUIDE_GROUPS, GUIDE_TOPICS, topicsFor } from '../../i18n/guide';
import type { AuthUser, Role } from '../../lib/types';
import { HelpPage } from './HelpPage';

afterEach(cleanup);

const user = (role: Role): AuthUser => ({ id: 'u', username: 'x', displayName: 'x', role, companyScope: null, battalionId: 'b1', isPlatformAdmin: false });

function show(role: Role, at = '/help'): void {
  render(
    <MemoryRouter initialEntries={[at]}>
      <HelpPage user={user(role)} />
    </MemoryRouter>,
  );
}

const header = (title: string) => screen.getByRole('button', { name: new RegExp(title) });

describe('the guide content', () => {
  it('has unique ids, a known group, a route and at least one step for every topic', () => {
    const ids = GUIDE_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const groups = new Set(GUIDE_GROUPS.map((g) => g.id));
    for (const t of GUIDE_TOPICS) {
      expect(groups.has(t.group), t.id).toBe(true);
      expect(t.to.startsWith('/'), t.id).toBe(true);
      expect(t.steps.length, t.id).toBeGreaterThan(0);
      expect(t.title.trim(), t.id).not.toBe('');
      expect(t.summary.trim(), t.id).not.toBe('');
    }
  });

  it('the typical day only points at topics that exist', () => {
    const ids = new Set(GUIDE_TOPICS.map((t) => t.id));
    for (const d of GUIDE_DAY) expect(ids.has(d.topicId), d.topicId).toBe(true);
  });

  it('every screen an admin can open has a topic', () => {
    // Derived from the nav config so a screen added there without a guide topic fails here.
    const routes = HUBS.flatMap((h) => h.tabs.filter((t) => t.id !== 'help').map((t) => tabAddress(h, t)));
    const covered = new Set(GUIDE_TOPICS.map((t) => t.to));
    for (const r of routes) expect(covered.has(r), r).toBe(true);
  });

  it('logistics only gets topics about screens it can open', () => {
    const adminOnlyScreens = new Set(
      HUBS.flatMap((h) => h.tabs.filter((t) => !t.roles.includes('logistics')).map((t) => tabAddress(h, t))),
    );
    for (const t of topicsFor('logistics')) expect(adminOnlyScreens.has(t.to), t.id).toBe(false);
    expect(topicsFor('admin').length).toBeGreaterThan(topicsFor('logistics').length);
  });
});

describe('HelpPage', () => {
  it('shows the topics collapsed, and opens one with its steps on click', () => {
    show('logistics');
    expect(screen.queryByText(he.help.stepsLabel)).toBeNull();
    fireEvent.click(header('ניפוק וחתימה'));
    expect(screen.getByText(he.help.stepsLabel)).toBeTruthy();
    expect(screen.getByRole('link', { name: new RegExp(he.help.openScreen) }).getAttribute('href')).toBe('/issue');
    fireEvent.click(header('ניפוק וחתימה'));
    expect(screen.queryByText(he.help.stepsLabel)).toBeNull();
  });

  it('hides admin-only topics from logistics and shows them to an admin, tagged', () => {
    show('logistics');
    expect(screen.queryByRole('button', { name: /ערכות/ })).toBeNull();
    expect(screen.queryByText(he.help.adminOnly)).toBeNull();
    cleanup();
    show('admin');
    expect(screen.getByRole('button', { name: /^ערכות/ })).toBeTruthy();
    expect(screen.getAllByText(he.help.adminOnly).length).toBeGreaterThan(0);
  });

  it('opens the topic named in the address (/help#kits)', () => {
    show('admin', '/help#kits');
    expect(header('^ערכות').getAttribute('aria-expanded')).toBe('true');
  });

  // Role queries walk the whole accessibility tree, which is slow with every matching topic open; text
  // queries and a roomy timeout keep this from flaking when the whole suite runs in parallel.
  it('search narrows the topics, opens the matches, and says so when nothing matches', async () => {
    show('admin');
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: 'תיקון טופס' } });
    await waitFor(() => expect(screen.queryByText('גיבויים')).toBeNull(), { timeout: 8000 });
    expect(screen.getByText(/זיכוי, תיקון טופס/)).toBeTruthy();
    expect(screen.getAllByText(he.help.stepsLabel).length).toBeGreaterThan(0);
    expect(screen.queryByText(he.help.dayTitle)).toBeNull();
    fireEvent.change(box, { target: { value: 'zzzzqqq' } });
    expect(await screen.findByText(he.help.none, {}, { timeout: 8000 })).toBeTruthy();
  }, 20000);

  it('lists the typical day, linking to topics', () => {
    show('logistics');
    const day = screen.getByText(he.help.dayTitle).closest('section') as HTMLElement;
    expect(within(day).getAllByRole('link').length).toBe(GUIDE_DAY.length);
  });
});
