// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { he } from '../i18n/he';
import type { AuthUser, Role } from '../lib/types';
import { mount, resetApi, respond } from '../test/mockApi';

/**
 * Every role gets exactly the screens built for it, including when it types an address by hand.
 * The server is the real gate; this proves the client never offers (or lands on) a screen the role cannot use.
 */
function user(role: Role, extra: Partial<AuthUser> = {}): AuthUser {
  return { id: 'u1', username: 'tester', displayName: 'בודק', role, companyScope: null, ...extra };
}

function signedInAs(u: AuthUser): void {
  respond({ '/api/auth/me': { status: 200, body: { user: u } } });
}

beforeEach(resetApi);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const HUB = he.nav.hubs;
const NAV_BY_ROLE: Record<Role, string[]> = {
  admin: [HUB.issue, HUB.periods, he.nav.soldiers, he.nav.attendance, HUB.reports, HUB.equipment, HUB.system, he.nav.help, he.nav.security],
  logistics: [HUB.issue, HUB.periods, he.nav.soldiers, he.nav.attendance, HUB.reports, he.nav.help, he.nav.security],
  viewer: [HUB.issue, he.nav.soldiers, he.nav.security],
  SHLISHUT: [he.nav.soldiers, he.nav.security],
  SAMGAD: [HUB.periods, he.nav.soldiers, HUB.reports, he.nav.security],
  COMPANY_CMDR: [HUB.periods, he.nav.soldiers, he.nav.security],
};
const EVERY_RAIL_LABEL = [HUB.issue, HUB.periods, he.nav.soldiers, he.nav.attendance, HUB.reports, HUB.equipment, HUB.system, he.nav.help, he.nav.security];

describe('navigation per role', () => {
  for (const [role, expected] of Object.entries(NAV_BY_ROLE) as [Role, string[]][]) {
    it(`${role} sees exactly its own rail entries`, async () => {
      signedInAs(user(role));
      mount('/security');
      await screen.findAllByRole('link', { name: he.nav.security });
      for (const label of EVERY_RAIL_LABEL) {
        const present = screen.queryAllByRole('link', { name: label }).length > 0;
        expect(present, `${role} / ${label}`).toBe(expected.includes(label));
      }
    });
  }
});

describe('tabs inside a hub', () => {
  it('admin gets every tab of דוחות', async () => {
    signedInAs(user('admin'));
    mount('/reports');
    for (const label of [he.nav.summary, he.nav.companySplit, he.nav.counts, he.nav.dailyMovements]) {
      expect((await screen.findAllByRole('link', { name: label })).length).toBeGreaterThan(0);
    }
  });

  it('a role with a single tab in a hub gets no tab bar', async () => {
    signedInAs(user('SAMGAD'));
    mount('/reports');
    await waitFor(() => expect(window.location.pathname).toBe('/reports/companies'));
    expect(screen.queryByRole('navigation', { name: he.common.tabs })).toBeNull();
  });

  it('logistics does not get the admin-only tabs of ציוד', async () => {
    signedInAs(user('logistics'));
    mount('/equipment');
    await waitFor(() => expect(window.location.pathname).toBe('/issue'));
  });
});

describe('addresses from before the hubs', () => {
  const MOVED: [Role, string, string][] = [
    ['admin', '/documents', '/issue/documents'],
    ['admin', '/ifsun', '/issue/ifsun'],
    ['admin', '/summary', '/reports'],
    ['admin', '/counts', '/reports/counts'],
    ['admin', '/kits', '/equipment/kits'],
    ['admin', '/backups', '/system/backups'],
    ['SAMGAD', '/service-periods', '/periods'],
    ['SAMGAD', '/company-split', '/reports/companies'],
    ['COMPANY_CMDR', '/company-allocation', '/periods/by-soldier'],
  ];
  for (const [role, from, to] of MOVED) {
    it(`${role}: ${from} → ${to}`, async () => {
      signedInAs(user(role, role === 'COMPANY_CMDR' ? { companyScope: 'A' } : {}));
      mount(from);
      await waitFor(() => expect(window.location.pathname).toBe(to));
    });
  }
});

describe('where each role lands', () => {
  const LANDING: [Role, string][] = [
    ['admin', '/issue'],
    ['logistics', '/issue'],
    ['SHLISHUT', '/soldiers'],
    ['SAMGAD', '/periods'],
    ['COMPANY_CMDR', '/periods/by-soldier'],
  ];
  for (const [role, path] of LANDING) {
    it(`${role} lands on ${path}`, async () => {
      signedInAs(user(role, role === 'COMPANY_CMDR' ? { companyScope: 'A' } : {}));
      mount('/');
      await waitFor(() => expect(window.location.pathname).toBe(path));
    });
  }

  it('viewer lands on a screen it may actually open (not a redirect loop)', async () => {
    signedInAs(user('viewer'));
    mount('/');
    // A viewer has no ניפוק; the default must be one of its own screens.
    await new Promise((r) => setTimeout(r, 300));
    expect(['/issue/documents', '/soldiers', '/security']).toContain(window.location.pathname);
  });
});

describe('typing a forbidden address', () => {
  const FORBIDDEN: [Role, string][] = [
    ['viewer', '/users'],
    ['viewer', '/catalog'],
    ['viewer', '/backups'],
    ['viewer', '/help'],
    ['SHLISHUT', '/help'],
    ['SAMGAD', '/help'],
    ['logistics', '/users'],
    ['logistics', '/catalog'],
    ['logistics', '/backups'],
    ['SHLISHUT', '/users'],
    ['SHLISHUT', '/issue/documents'],
    ['viewer', '/system'],
    ['viewer', '/equipment/kits'],
    ['logistics', '/system/backups'],
    ['logistics', '/equipment/intake'],
    ['SAMGAD', '/reports/counts'],
    ['SAMGAD', '/users'],
    ['COMPANY_CMDR', '/users'],
    ['COMPANY_CMDR', '/periods'],
  ];
  for (const [role, path] of FORBIDDEN) {
    it(`${role} cannot open ${path}`, async () => {
      signedInAs(user(role, role === 'COMPANY_CMDR' ? { companyScope: 'A' } : {}));
      mount(path);
      await waitFor(() => expect(window.location.pathname).not.toBe(path));
    });
  }
});
