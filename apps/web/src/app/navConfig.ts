import { he } from '../i18n/he';
import type { Role } from '../lib/types';

/**
 * The one place that says which screens exist, how they are grouped into rail entries ("hubs") with
 * tabs, and which roles may open each. The rail (Shell) and the router (App) both derive from this, so
 * a role list can never say one thing in the menu and another in the routes.
 *
 * SHLISHUT/SAMGAD/COMPANY_CMDR are narrow by design: each sees only the screens built for it, nothing
 * else — not even by typing a URL. They must be listed explicitly on every tab they may reach.
 */
export const ALL_ROLES: readonly Role[] = ['admin', 'logistics', 'viewer', 'SHLISHUT', 'SAMGAD', 'COMPANY_CMDR'];
const OLD_ROLES: readonly Role[] = ['admin', 'logistics', 'viewer'];
const STAFF: readonly Role[] = ['admin', 'logistics'];
const ADMIN: readonly Role[] = ['admin'];

export type HubId = 'issue' | 'periods' | 'soldiers' | 'attendance' | 'reports' | 'equipment' | 'system' | 'help' | 'security';
export type TabId =
  | 'issue'
  | 'documents'
  | 'ifsun'
  | 'servicePeriods'
  | 'companyAllocation'
  | 'soldiers'
  | 'attendance'
  | 'summary'
  | 'companySplit'
  | 'counts'
  | 'dailyMovements'
  | 'catalog'
  | 'intake'
  | 'kits'
  | 'naming'
  | 'companies'
  | 'users'
  | 'backups'
  | 'help'
  | 'security';

export type TabDef = {
  id: TabId;
  /** Relative to the hub; '' is the hub's own address (its index tab). */
  path: string;
  label: string;
  roles: readonly Role[];
};

export type HubGroup = 'work' | 'admin' | 'account';

export type HubDef = {
  id: HubId;
  path: string;
  label: string;
  group: HubGroup;
  tabs: readonly TabDef[];
};

export const HUBS: readonly HubDef[] = [
  {
    id: 'issue',
    path: '/issue',
    label: he.nav.hubs.issue,
    group: 'work',
    tabs: [
      { id: 'issue', path: '', label: he.nav.issue, roles: STAFF },
      { id: 'documents', path: 'documents', label: he.nav.documents, roles: OLD_ROLES },
      { id: 'ifsun', path: 'ifsun', label: he.nav.ifsun, roles: STAFF },
    ],
  },
  {
    id: 'periods',
    path: '/periods',
    label: he.nav.hubs.periods,
    group: 'work',
    tabs: [
      { id: 'servicePeriods', path: '', label: he.nav.servicePeriods, roles: ['admin', 'logistics', 'SAMGAD'] },
      { id: 'companyAllocation', path: 'by-soldier', label: he.nav.companyAllocation, roles: ['admin', 'COMPANY_CMDR'] },
    ],
  },
  {
    id: 'soldiers',
    path: '/soldiers',
    label: he.nav.soldiers,
    group: 'work',
    tabs: [{ id: 'soldiers', path: '', label: he.nav.soldiers, roles: ALL_ROLES }],
  },
  {
    id: 'reports',
    path: '/reports',
    label: he.nav.hubs.reports,
    group: 'work',
    tabs: [
      { id: 'summary', path: '', label: he.nav.summary, roles: STAFF },
      { id: 'companySplit', path: 'companies', label: he.nav.companySplit, roles: ['admin', 'logistics', 'SAMGAD'] },
      { id: 'counts', path: 'counts', label: he.nav.counts, roles: STAFF },
      { id: 'dailyMovements', path: 'movements', label: he.nav.dailyMovements, roles: STAFF },
    ],
  },
  {
    id: 'equipment',
    path: '/equipment',
    label: he.nav.hubs.equipment,
    group: 'admin',
    tabs: [
      { id: 'catalog', path: '', label: he.nav.catalog, roles: ADMIN },
      { id: 'intake', path: 'intake', label: he.nav.intake, roles: ADMIN },
      { id: 'kits', path: 'kits', label: he.nav.kits, roles: ADMIN },
      { id: 'naming', path: 'naming', label: he.nav.naming, roles: ADMIN },
    ],
  },
  {
    id: 'system',
    path: '/system',
    label: he.nav.hubs.system,
    group: 'admin',
    tabs: [
      { id: 'users', path: '', label: he.nav.users, roles: ADMIN },
      { id: 'companies', path: 'companies', label: he.nav.companies, roles: ADMIN },
      { id: 'backups', path: 'backups', label: he.nav.backups, roles: ADMIN },
    ],
  },
  {
    // The logistics staff's own days, unrelated to the day-to-day issuing work and not about reserve
    // soldiers: it sits under ניהול, where admin manages it and logistics can open it to view.
    id: 'attendance',
    path: '/attendance',
    label: he.nav.attendance,
    group: 'admin',
    tabs: [{ id: 'attendance', path: '', label: he.nav.attendance, roles: STAFF }],
  },
  {
    id: 'help',
    path: '/help',
    label: he.nav.help,
    group: 'account',
    tabs: [{ id: 'help', path: '', label: he.nav.help, roles: STAFF }],
  },
  {
    id: 'security',
    path: '/security',
    label: he.nav.security,
    group: 'account',
    tabs: [{ id: 'security', path: '', label: he.nav.security, roles: ALL_ROLES }],
  },
];

export function tabAddress(hub: HubDef, tab: TabDef): string {
  return tab.path ? `${hub.path}/${tab.path}` : hub.path;
}

/** Full address of a screen, for code that links to one (e.g. ניפוק → the soldier's signatures). */
export function addressOf(tabId: TabId): string {
  for (const hub of HUBS) {
    const tab = hub.tabs.find((t) => t.id === tabId);
    if (tab) return tabAddress(hub, tab);
  }
  throw new Error(`No screen registered for tab "${tabId}"`);
}

export function visibleTabs(hub: HubDef, role: Role): TabDef[] {
  return hub.tabs.filter((t) => t.roles.includes(role));
}

/** A hub with no tab the role may open is not offered at all. */
export function visibleHubs(role: Role): HubDef[] {
  return HUBS.filter((h) => visibleTabs(h, role).length > 0);
}

/** Where a hub's rail link goes: the first tab this role may open. */
export function hubEntryAddress(hub: HubDef, role: Role): string {
  const [first] = visibleTabs(hub, role);
  return first ? tabAddress(hub, first) : hub.path;
}

export function defaultPathFor(role: Role): string {
  if (role === 'SHLISHUT') return addressOf('soldiers');
  if (role === 'SAMGAD') return addressOf('servicePeriods');
  if (role === 'COMPANY_CMDR') return addressOf('companyAllocation');
  // A viewer has no ניפוק; sending it there bounced between the catch-all and the index forever.
  if (role === 'viewer') return addressOf('documents');
  return addressOf('issue');
}

/**
 * Addresses from before screens were grouped under hubs. Bookmarks, the printed guide and old links
 * keep working; whoever lands on a new address they may not open is bounced by the catch-all as before.
 */
export const LEGACY_REDIRECTS: Record<string, TabId> = {
  '/documents': 'documents',
  '/ifsun': 'ifsun',
  '/service-periods': 'servicePeriods',
  '/company-allocation': 'companyAllocation',
  '/summary': 'summary',
  '/company-split': 'companySplit',
  '/counts': 'counts',
  '/daily-movements': 'dailyMovements',
  '/catalog': 'catalog',
  '/intake': 'intake',
  '/kits': 'kits',
  '/naming': 'naming',
  '/users': 'users',
  '/backups': 'backups',
};
