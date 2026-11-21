import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useLogoutMutation } from '../lib/api';
import { Logo } from '../components/Logo';
import { he } from '../i18n/he';
import type { AuthUser, Role } from '../lib/types';

type NavItem = { to: string; label: string; icon: ReactNode; roles?: Role[] };

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
function CompanyIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <circle cx="7" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="14" cy="8" r="2" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M2.5 16.5c0-2.8 2-4.5 4.5-4.5s4.5 1.7 4.5 4.5M11.5 16.5c0-2-1.3-3.5-3-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
function DailyMovementsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <rect x="3" y="3" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 8h14M7 11h6M7 14h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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
function BackupsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <ellipse cx="10" cy="5" rx="6" ry="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 5v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5" stroke="currentColor" strokeWidth="1.6" />
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
function CountsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <rect x="3.5" y="2.5" width="13" height="15" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6.5 7h7M6.5 10h7M6.5 13h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function DocumentsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M6 2.5h5.5L15 6v9.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M11 2.5V6h4M7.5 10h5M7.5 12.5h5M7.5 7.5h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
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
function IntakeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M10 3v10m0 0l-3.5-3.5M10 13l3.5-3.5M4 15.5h12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function NamingIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path d="M4 5h12M4 10h8M4 15h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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

/**
 * The side rail sits on the right, since the interface is RTL. Trimmed to the
 * screens actually in use right now — the rest of the app (reports, counts,
 * attendance, admin) still exists and works, it's just not linked from here.
 */
const NAV_GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: '',
    items: [
      { to: '/issue', label: he.nav.issue, icon: <IssueIcon />, roles: ['admin', 'logistics'] },
      {
        to: '/documents',
        label: he.nav.documents,
        icon: <DocumentsIcon />,
        roles: ['admin', 'logistics', 'viewer'],
      },
      {
        to: '/service-periods',
        label: he.nav.servicePeriods,
        icon: <PeriodsIcon />,
        roles: ['admin', 'logistics', 'SAMGAD'],
      },
      {
        to: '/company-split',
        label: he.nav.companySplit,
        icon: <CompanyIcon />,
        roles: ['admin', 'logistics', 'SAMGAD'],
      },
      {
        to: '/company-allocation',
        label: he.nav.companyAllocation,
        icon: <CompanyIcon />,
        roles: ['admin', 'COMPANY_CMDR'],
      },
      { to: '/soldiers', label: he.nav.soldiers, icon: <SoldiersIcon /> },
      {
        to: '/daily-movements',
        label: he.nav.dailyMovements,
        icon: <DailyMovementsIcon />,
        roles: ['admin', 'logistics'],
      },
      {
        to: '/attendance',
        label: he.nav.attendance,
        icon: <AttendanceIcon />,
        roles: ['admin', 'logistics'],
      },
      {
        to: '/summary',
        label: he.nav.summary,
        icon: <SummaryIcon />,
        roles: ['admin', 'logistics'],
      },
      {
        to: '/counts',
        label: he.nav.counts,
        icon: <CountsIcon />,
        roles: ['admin', 'logistics'],
      },
    ],
  },
  {
    heading: 'ניהול',
    items: [
      { to: '/catalog', label: he.nav.catalog, icon: <CatalogIcon />, roles: ['admin'] },
      { to: '/intake', label: he.nav.intake, icon: <IntakeIcon />, roles: ['admin'] },
      { to: '/naming', label: he.nav.naming, icon: <NamingIcon />, roles: ['admin'] },
      { to: '/users', label: he.nav.users, icon: <UsersIcon />, roles: ['admin'] },
      { to: '/backups', label: he.nav.backups, icon: <BackupsIcon />, roles: ['admin'] },
    ],
  },
];

export function Shell({ user }: { user: AuthUser }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logout] = useLogoutMutation();

  const groups = NAV_GROUPS;
  const initial = user.displayName.trim().charAt(0) || '?';

  return (
    <div className="lg:grid lg:h-screen lg:grid-cols-[17rem_1fr]">
      {/* On a phone the rail collapses behind a toggle. */}
      <header className="flex items-center justify-between gap-3 bg-ink px-4 py-3 lg:hidden">
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
          className="rounded-ctl border border-white/20 bg-white/5 px-3 py-1.5 text-meta font-semibold text-white transition-colors hover:bg-white/10"
          aria-expanded={menuOpen}
        >
          {menuOpen ? he.common.close : 'תפריט'}
        </button>
      </header>

      {/* The rail is its own scroll container, pinned to the viewport height
          on desktop, so scrolling the page content never carries the nav or
          the sign-out footer away — only `main` below scrolls. */}
      <nav
        className={`flex flex-col border-rule bg-[linear-gradient(175deg,var(--ink)_0%,#1b2a24_100%)] text-card lg:h-screen lg:border-b-0 ${
          menuOpen ? 'block border-b' : 'hidden lg:flex'
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
          {groups.map((group) => {
            const items = group.items.filter((i) => !i.roles || i.roles.includes(user.role));
            if (items.length === 0) return null;
            return (
              <div key={group.heading} className="mb-5">
                {group.heading && (
                  <div className="px-2.5 pb-2 text-micro font-semibold tracking-wide text-white/35">
                    {group.heading}
                  </div>
                )}
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      onClick={() => setMenuOpen(false)}
                      className={({ isActive }) =>
                        `group relative flex items-center gap-2.5 rounded-ctl px-2.5 py-2.5 text-body transition-all duration-150 ${
                          isActive
                            ? 'bg-white/10 font-semibold text-white'
                            : 'text-white/65 hover:translate-x-[-2px] hover:bg-white/5 hover:text-white'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
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
                            {item.icon}
                          </span>
                          <span>{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-white/10 px-4 py-4">
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
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-ctl text-white/55 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4.5 w-4.5">
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

      <main className="scroll-slim min-w-0 bg-card px-4 py-5 lg:h-screen lg:overflow-y-auto lg:px-8 lg:py-8">
        <Outlet />
      </main>
    </div>
  );
}
