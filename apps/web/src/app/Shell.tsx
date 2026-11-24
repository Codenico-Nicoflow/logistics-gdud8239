import { useEffect, useState, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useLogoutMutation } from '../lib/api';
import { Logo } from '../components/Logo';
import { he } from '../i18n/he';
import type { AuthUser } from '../lib/types';
import { HUBS, hubEntryAddress, visibleTabs, type HubDef, type HubGroup, type HubId } from './navConfig';

function IssueIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M4 10.5l4 4L16.5 5.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function PeriodsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <rect x="3" y="4.5" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 8h14M7 2.5v3M13 2.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function AttendanceIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.5 17c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
function SummaryIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path d="M4 3h12v14l-3-2-3 2-3-2-3 2V3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7 7.5h6M7 10.5h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function SoldiersIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 17c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function CatalogIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function HelpIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.9 8a2.2 2.2 0 1 1 3.3 1.9c-.8.5-1.2.9-1.2 1.6M10 14h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function SecurityIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path d="M10 2.5 4 5v4.5c0 3.6 2.5 6.3 6 8 3.5-1.7 6-4.4 6-8V5l-6-2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m7.5 10 1.8 1.8L13 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <circle cx="7.5" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="14.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M2.5 17c0-2.8 2.2-4.8 5-4.8s5 2 5 4.8M12.5 17c0-1.9-.8-3.5-2.3-4.4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

const HUB_ICONS: Record<HubId, ReactNode> = {
  issue: <IssueIcon />,
  periods: <PeriodsIcon />,
  soldiers: <SoldiersIcon />,
  attendance: <AttendanceIcon />,
  reports: <SummaryIcon />,
  equipment: <CatalogIcon />,
  system: <UsersIcon />,
  help: <HelpIcon />,
  security: <SecurityIcon />,
};

/**
 * The side rail sits on the right, since the interface is RTL. One entry per hub (see navConfig): a hub
 * groups related screens as tabs, so the rail stays short enough to read on a phone.
 */
const RAIL_GROUPS: { group: HubGroup; heading: string }[] = [
  { group: 'work', heading: '' },
  { group: 'admin', heading: he.nav.adminHeading },
  { group: 'account', heading: he.nav.myAccount },
];

function isInHub(pathname: string, hub: HubDef): boolean {
  return pathname === hub.path || pathname.startsWith(`${hub.path}/`);
}

export function Shell({ user }: { user: AuthUser }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logout] = useLogoutMutation();

  const { pathname } = useLocation();
  const initial = user.displayName.trim().charAt(0) || '?';

  // The open menu covers the screen on a phone, so the page behind it must not scroll under the
  // finger, and Escape (a keyboard on a tablet) closes it.
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div className="lg:grid lg:h-screen lg:grid-cols-[17rem_1fr]">
      {/* On a phone the rail collapses behind a toggle. */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 bg-ink px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] lg:hidden">
        <Link to="/" className="flex items-center gap-2.5 rounded-ctl transition-opacity hover:opacity-85">
          <Logo className="h-9 w-9" />
          <div>
            <div className="text-lead font-extrabold leading-none tracking-tight text-white">
              {he.app.battalion}
            </div>
            <div className="mt-0.5 text-micro font-medium tracking-[0.04em] text-brass-bright/80">
              {he.app.name}
            </div>
          </div>
        </Link>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="h-11 min-w-[5rem] shrink-0 rounded-ctl border border-white/20 bg-white/5 px-4 text-body font-semibold text-white transition-colors hover:bg-white/10"
          aria-expanded={menuOpen}
        >
          {menuOpen ? he.common.close : he.nav.menu}
        </button>
      </header>

      {/* The rail is its own scroll container, pinned to the viewport height
          on desktop, so scrolling the page content never carries the nav or
          the sign-out footer away — only `main` below scrolls. */}
      <nav
        className={`flex flex-col border-rule bg-[linear-gradient(175deg,var(--ink)_0%,#1b2a24_100%)] text-card lg:h-screen lg:border-b-0 ${
          menuOpen
            ? 'fixed inset-0 z-30 overflow-y-auto overscroll-contain pt-[calc(4.5rem+env(safe-area-inset-top))] lg:static lg:overflow-visible lg:pt-0'
            : 'hidden lg:flex'
        }`}
      >
        <Link
          to="/"
          className="hidden items-center gap-3 border-b border-white/10 px-5 py-5 transition-opacity hover:opacity-85 lg:flex"
        >
          <Logo className="h-11 w-11" />
          <div>
            <div className="text-head font-extrabold leading-none tracking-tight text-white">
              {he.app.battalion}
            </div>
            <div className="mt-1.5 text-micro font-medium tracking-[0.04em] text-brass-bright/80">
              {he.app.name}
            </div>
          </div>
        </Link>

        <div className="scroll-slim-dark min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {RAIL_GROUPS.map(({ group, heading }) => {
            const hubs = HUBS.filter((h) => h.group === group && visibleTabs(h, user.role).length > 0);
            if (hubs.length === 0) return null;
            return (
              <div key={group} className="mb-5">
                {heading && (
                  <div className="px-2.5 pb-2 text-micro font-semibold tracking-wide text-white/35">{heading}</div>
                )}
                <div className="space-y-0.5">
                  {hubs.map((hub) => {
                    const isActive = isInHub(pathname, hub);
                    return (
                      <Link
                        key={hub.id}
                        to={hubEntryAddress(hub, user.role)}
                        aria-current={isActive ? 'page' : undefined}
                        onClick={() => setMenuOpen(false)}
                        className={`group relative flex items-center gap-2.5 rounded-ctl px-2.5 py-2.5 text-body transition-all duration-150 ${
                          isActive
                            ? 'bg-white/10 font-semibold text-white'
                            : 'text-white/65 hover:translate-x-[-2px] hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <span
                          className={`absolute inset-y-1 start-0 w-[3px] rounded-full bg-brass-bright transition-transform duration-150 ${
                            isActive ? 'scale-y-100' : 'scale-y-0'
                          }`}
                        />
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-ctl transition-colors ${
                            isActive ? 'bg-field-bright text-white' : 'bg-white/5 text-white/60 group-hover:text-white'
                          }`}
                        >
                          {HUB_ICONS[hub.id]}
                        </span>
                        <span>{hub.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-white/10 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
          <div className="flex items-center gap-2.5 rounded-ctl bg-white/5 px-3 py-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass-bright text-body font-bold text-ink">
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              {user.username === 'admin' ? (
                <>
                  <div
                    className="bg-[linear-gradient(90deg,var(--brass),var(--brass-bright),var(--brass))] bg-clip-text text-lead font-black tracking-wide text-transparent"
                    style={{ backgroundSize: '200% auto', animation: 'shimmer 2.5s linear infinite' }}
                  >
                    {user.displayName}
                  </div>
                  <div
                    className="font-bold text-brass-bright"
                    style={{
                      fontSize: '11px',
                      lineHeight: '14px',
                      animation: 'pulse-glow 1.8s ease-in-out infinite',
                      filter: 'drop-shadow(0 0 3px var(--brass-bright))',
                    }}
                  >
                    👑 מפקד מחלקת הלוגיסטיקה 👑
                  </div>
                </>
              ) : (
                <>
                  <div className="truncate text-body font-semibold text-white">{user.displayName}</div>
                  <div className="text-micro text-white/45">
                    {user.username === 'shunem' ? 'חייל של אפי' : he.roles[user.role]}
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => void logout()}
              aria-label={he.auth.logout}
              title={he.auth.logout}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ctl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
                <path
                  d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M13 7l3.5 3-3.5 3M7.5 10H16"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      <main className="scroll-slim min-w-0 bg-card px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 lg:h-screen lg:overflow-y-auto lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}
