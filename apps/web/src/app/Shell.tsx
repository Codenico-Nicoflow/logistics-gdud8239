import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6v4.2l2.8 1.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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

function SystemIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path d="M3 6h7M14 6h3M3 14h3M10 14h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="6" r="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="14" r="2" stroke="currentColor" strokeWidth="1.6" />
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
  system: <SystemIcon />,
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

  const hubsByGroup = RAIL_GROUPS.map(({ group, heading }) => ({
    group,
    heading,
    hubs: HUBS.filter((h) => h.group === group && visibleTabs(h, user.role).length > 0),
  })).filter((g) => g.hubs.length > 0);
  const activeId = hubsByGroup.flatMap((g) => g.hubs).find((h) => isInHub(pathname, h))?.id ?? null;

  // One highlight glides between rail entries instead of each entry lighting up on its own, so a move
  // between hubs reads as travel. It is measured from the live link, so it survives font loading and
  // the phone menu being closed (display: none has no geometry) when the route changes.
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<HubId, HTMLAnchorElement>());
  const [pill, setPill] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [pillMoves, setPillMoves] = useState(false);

  useLayoutEffect(() => {
    if (!activeId) {
      setPill(null);
      return;
    }
    const measure = (): void => {
      const el = itemRefs.current.get(activeId);
      if (!el || el.offsetParent === null) return;
      setPill({ top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight });
    };
    measure();
    const list = listRef.current;
    // Absent in the jsdom test environment; the placement above is already correct there.
    if (!list || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [activeId, menuOpen]);

  // The first placement must not animate in from the corner.
  useEffect(() => {
    if (!pill || pillMoves) return;
    const id = requestAnimationFrame(() => setPillMoves(true));
    return () => cancelAnimationFrame(id);
  }, [pill, pillMoves]);

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

  let railIndex = 0;

  return (
    <div className="pt-[calc(3.5rem+var(--safe-top))] lg:grid lg:h-screen lg:grid-cols-[17rem_1fr] lg:pt-0">
      {/* On a phone the rail collapses behind a toggle. The bar is fixed at a height that includes the
          notch inset, so the menu panel below starts on exactly the same line on every device. */}
      <header className="fixed inset-x-0 top-0 z-40 bg-ink pt-[var(--safe-top)] shadow-[0_1px_0_rgba(194,155,46,0.28)] lg:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Link to="/" onClick={() => setMenuOpen(false)} className="flex min-w-0 items-center gap-2.5 rounded-ctl">
            <Logo className="h-9 w-9 shrink-0" />
            <div className="min-w-0">
              <div className="truncate text-lead font-extrabold leading-none tracking-tight text-white">
                {he.app.battalion}
              </div>
              <div className="mt-1 truncate text-micro font-medium tracking-[0.04em] text-brass-bright/80">
                {he.app.name}
              </div>
            </div>
          </Link>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? he.common.close : he.nav.menu}
            aria-expanded={menuOpen}
            className="relative h-11 w-11 shrink-0 rounded-ctl border border-white/20 bg-white/5 transition-colors hover:bg-white/10"
          >
            <span
              className={`absolute inset-x-3 h-[2px] rounded-full bg-white transition-all duration-300 ease-out ${
                menuOpen ? 'top-[21px] rotate-45' : 'top-[15px]'
              }`}
            />
            <span
              className={`absolute inset-x-3 top-[21px] h-[2px] origin-center rounded-full bg-white transition-all duration-300 ease-out ${
                menuOpen ? 'scale-x-0 opacity-0' : ''
              }`}
            />
            <span
              className={`absolute inset-x-3 h-[2px] rounded-full bg-white transition-all duration-300 ease-out ${
                menuOpen ? 'top-[21px] -rotate-45' : 'top-[27px]'
              }`}
            />
          </button>
        </div>
      </header>

      {/* The rail is its own scroll container, pinned to the viewport height
          on desktop, so scrolling the page content never carries the nav or
          the sign-out footer away — only `main` below scrolls. */}
      <nav
        className={`flex flex-col border-rule bg-[linear-gradient(175deg,var(--ink)_0%,#1b2a24_100%)] text-card lg:h-screen lg:border-b-0 ${
          menuOpen
            ? 'fixed inset-x-0 top-0 z-30 h-[100dvh] overflow-y-auto overscroll-contain pt-[calc(3.5rem+var(--safe-top))] lg:static lg:h-screen lg:overflow-visible lg:pt-0'
            : 'hidden lg:flex'
        }`}
      >
        <Link
          to="/"
          className="hidden items-center gap-3 border-b border-white/10 px-5 py-5 transition-opacity hover:opacity-90 lg:flex"
        >
          <Logo className="h-12 w-12" />
          <div>
            <div className="text-head font-extrabold leading-none tracking-tight text-white">
              {he.app.battalion}
            </div>
            <div className="mt-1.5 text-micro font-medium tracking-[0.04em] text-brass-bright/80">
              {he.app.name}
            </div>
          </div>
        </Link>

        <div ref={listRef} className="scroll-slim-dark relative min-h-0 flex-1 overflow-y-auto px-3 py-4">
          {pill && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute z-0 rounded-ctl bg-white/10"
              style={{
                top: 0,
                left: 0,
                width: pill.width,
                height: pill.height,
                transform: `translate(${pill.left}px, ${pill.top}px)`,
                transition: pillMoves
                  ? 'transform 420ms cubic-bezier(0.3, 0.9, 0.2, 1), height 420ms cubic-bezier(0.3, 0.9, 0.2, 1)'
                  : 'none',
              }}
            >
              <span className="rail-pill-edge absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-brass-bright" />
            </span>
          )}
          {hubsByGroup.map(({ group, heading, hubs }) => (
            <div key={group} className="mb-5">
              {heading && (
                <div className="flex items-center gap-2 px-2.5 pb-2 text-micro font-semibold tracking-wide text-white/40">
                  <span>{heading}</span>
                  <span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/15" />
                </div>
              )}
              <div className="space-y-0.5">
                {hubs.map((hub) => {
                  const isActive = hub.id === activeId;
                  const i = railIndex++;
                  return (
                    <Link
                      key={hub.id}
                      ref={(el) => {
                        if (el) itemRefs.current.set(hub.id, el);
                        else itemRefs.current.delete(hub.id);
                      }}
                      to={hubEntryAddress(hub, user.role)}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => setMenuOpen(false)}
                      style={{ '--i': i } as CSSProperties}
                      className={`rail-item group relative flex min-h-11 items-center gap-2.5 rounded-ctl px-2.5 py-2 text-body transition-colors duration-200 ${
                        isActive ? 'font-semibold text-white' : 'text-white/65 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-ctl transition-all duration-300 ${
                          isActive
                            ? 'bg-field-bright text-white shadow-[0_0_0_1px_rgba(194,155,46,0.45)]'
                            : 'bg-white/5 text-white/60 group-hover:-translate-y-px group-hover:scale-105 group-hover:bg-white/10 group-hover:text-brass-bright'
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
          ))}
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
