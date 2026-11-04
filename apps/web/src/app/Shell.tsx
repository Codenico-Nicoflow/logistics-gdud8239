import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useLogoutMutation, useNeedsAttentionQuery } from '../lib/api';
import { he } from '../i18n/he';
import type { AuthUser, Role } from '../lib/types';

type NavItem = { to: string; label: string; roles?: Role[]; badge?: number };

/**
 * The side rail sits on the right, since the interface is RTL. Grouping follows
 * the shift: daily work first, the reports that get checked next, admin last.
 */
function navGroups(attentionCount: number): { heading: string; items: NavItem[] }[] {
  return [
    {
      heading: 'עבודה יומית',
      items: [
        { to: '/', label: he.nav.dashboard },
        { to: '/issue', label: he.nav.issue, roles: ['admin', 'logistics'] },
        { to: '/signatures', label: he.nav.signatures },
        { to: '/attention', label: he.nav.attention, badge: attentionCount },
      ],
    },
    {
      heading: 'דוחות',
      items: [
        { to: '/summary', label: he.nav.summary },
        { to: '/companies', label: he.nav.companies },
        { to: '/allocations', label: he.nav.allocations },
        { to: '/movements', label: he.nav.movements },
      ],
    },
    {
      heading: 'ניהול',
      items: [{ to: '/backups', label: he.nav.backups, roles: ['admin'] }],
    },
  ];
}

export function Shell({ user }: { user: AuthUser }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [logout] = useLogoutMutation();
  const { data: attention } = useNeedsAttentionQuery();
  const attentionCount = attention?.issues.length ?? 0;

  const groups = navGroups(attentionCount);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1fr_15rem]">
      {/* On a phone the rail collapses behind a toggle; the attention count
          stays visible on the closed toggle because it is the thing worth
          interrupting someone for. */}
      <header className="flex items-center justify-between gap-3 border-b border-rule bg-card-raised px-4 py-3 lg:hidden">
        <div>
          <div className="text-body font-bold text-field">{he.app.battalion}</div>
          <div className="text-micro text-graphite">{he.app.name}</div>
        </div>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-ctl border border-rule-strong px-3 py-1.5 text-meta font-semibold"
          aria-expanded={menuOpen}
        >
          {menuOpen ? he.common.close : 'תפריט'}
          {attentionCount > 0 && !menuOpen && (
            <span className="ms-2 inline-block rounded-ctl bg-oxide px-1.5 text-micro text-white">
              {attentionCount}
            </span>
          )}
        </button>
      </header>

      <main className="order-1 min-w-0 px-4 py-5 lg:px-7 lg:py-7">
        <Outlet />
      </main>

      <nav
        className={`border-rule bg-card-raised lg:order-2 lg:block lg:border-s lg:border-b-0 ${
          menuOpen ? 'block border-b' : 'hidden'
        }`}
      >
        <div className="hidden border-b border-rule px-5 py-4 lg:block">
          <div className="text-head font-bold leading-none text-field">{he.app.battalion}</div>
          <div className="mt-0.5 text-micro text-graphite">{he.app.name}</div>
        </div>

        <div className="px-3 py-3">
          {groups.map((group) => {
            const items = group.items.filter((i) => !i.roles || i.roles.includes(user.role));
            if (items.length === 0) return null;
            return (
              <div key={group.heading} className="mb-4">
                <div className="px-2 pb-1 text-micro font-semibold text-graphite">
                  {group.heading}
                </div>
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center justify-between rounded-ctl px-2 py-1.5 text-body ${
                        isActive
                          ? 'bg-field-wash font-semibold text-field-dark'
                          : 'text-ink-soft hover:bg-card'
                      }`
                    }
                  >
                    <span>{item.label}</span>
                    {item.badge ? (
                      <span className="rounded-ctl bg-oxide px-1.5 text-micro font-semibold text-white">
                        {item.badge}
                      </span>
                    ) : null}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </div>

        <div className="border-t border-rule px-5 py-3">
          <div className="text-body font-semibold">{user.displayName}</div>
          <div className="text-micro text-graphite">{he.roles[user.role]}</div>
          <button
            onClick={() => void logout()}
            className="mt-2 text-meta font-semibold text-oxide hover:underline"
          >
            {he.auth.logout}
          </button>
        </div>
      </nav>
    </div>
  );
}
