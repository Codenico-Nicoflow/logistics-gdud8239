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

const NAV_BY_ROLE: Record<Role, string[]> = {
  admin: ['issue', 'documents', 'servicePeriods', 'companySplit', 'companyAllocation', 'ifsun', 'soldiers', 'dailyMovements', 'attendance', 'summary', 'counts', 'catalog', 'intake', 'kits', 'naming', 'users', 'backups', 'help', 'security'],
  logistics: ['issue', 'documents', 'servicePeriods', 'companySplit', 'ifsun', 'soldiers', 'dailyMovements', 'attendance', 'summary', 'counts', 'help', 'security'],
  viewer: ['documents', 'soldiers', 'security'],
  SHLISHUT: ['soldiers', 'security'],
  SAMGAD: ['servicePeriods', 'companySplit', 'soldiers', 'security'],
  COMPANY_CMDR: ['companyAllocation', 'soldiers', 'security'],
};

describe('navigation per role', () => {
  for (const [role, expected] of Object.entries(NAV_BY_ROLE) as [Role, string[]][]) {
    it(`${role} sees exactly its own menu entries`, async () => {
      signedInAs(user(role));
      mount('/security');
      await screen.findAllByText(he.nav.security);
      for (const key of Object.keys(he.nav) as (keyof typeof he.nav)[]) {
        if (key === 'myAccount') continue;
        const present = screen.queryAllByText(he.nav[key]).length > 0;
        expect(present, `${role} / ${key}`).toBe(expected.includes(key));
      }
    });
  }
});

describe('where each role lands', () => {
  const LANDING: [Role, string][] = [
    ['admin', '/issue'],
    ['logistics', '/issue'],
    ['SHLISHUT', '/soldiers'],
    ['SAMGAD', '/service-periods'],
    ['COMPANY_CMDR', '/company-allocation'],
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
    expect(['/documents', '/soldiers', '/security']).toContain(window.location.pathname);
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
    ['SHLISHUT', '/documents'],
    ['SAMGAD', '/users'],
    ['COMPANY_CMDR', '/users'],
    ['COMPANY_CMDR', '/service-periods'],
  ];
  for (const [role, path] of FORBIDDEN) {
    it(`${role} cannot open ${path}`, async () => {
      signedInAs(user(role, role === 'COMPANY_CMDR' ? { companyScope: 'A' } : {}));
      mount(path);
      await waitFor(() => expect(window.location.pathname).not.toBe(path));
    });
  }
});
