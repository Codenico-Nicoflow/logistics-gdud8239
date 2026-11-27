import type { ReactNode } from 'react';
import { Logo } from '../../components/Logo';
import { he } from '../../i18n/he';

/**
 * The frame for every screen a person sees before they are signed in (login, the one-time setup link).
 * It deliberately names no battalion: nobody has said which one they belong to yet, and one address serves
 * them all, so the mark here is the platform's own. The signed-in app takes over with that battalion's own.
 *
 * Wide screens split in two (the dark brand field, then the form); a phone gets the brand as a band on top
 * with the form card sliding up over it. Motion is entrance and ambient only, and `prefers-reduced-motion`
 * turns all of it off in index.css.
 */
export function AuthLayout({ title, subtitle, children }: { title?: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="min-h-screen lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <section className="auth-brand relative isolate overflow-hidden px-6 pb-16 pt-[calc(2.5rem+var(--safe-top))] text-center lg:flex lg:min-h-screen lg:flex-col lg:items-center lg:justify-center lg:pb-10 lg:pt-10">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <span className="liquid-blob liquid-blob-a" />
          <span className="liquid-blob liquid-blob-b" />
          <span className="liquid-blob liquid-blob-c" />
          <span className="auth-grid" />
        </div>

        <div className="auth-rise relative mx-auto grid h-28 w-28 place-items-center lg:h-52 lg:w-52" style={{ '--i': 0 } as React.CSSProperties}>
          <span aria-hidden="true" className="auth-dial absolute inset-0 rounded-full" />
          <span aria-hidden="true" className="auth-dial auth-dial-slow absolute inset-3 rounded-full lg:inset-5" />
          <Logo className="relative h-16 w-16 drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)] lg:h-32 lg:w-32" />
        </div>

        <h1
          className="auth-rise mt-5 text-head font-extrabold tracking-tight text-white lg:mt-8 lg:text-figure"
          style={{ '--i': 1 } as React.CSSProperties}
        >
          {he.app.name}
        </h1>
        <div
          aria-hidden="true"
          className="auth-rise mx-auto mt-3 h-[2px] w-14 rounded-full bg-gradient-to-l from-transparent via-brass-bright to-transparent"
          style={{ '--i': 2 } as React.CSSProperties}
        />
      </section>

      <section className="relative -mt-8 flex items-start justify-center px-4 pb-12 lg:mt-0 lg:items-center lg:py-10">
        <div
          className="auth-rise w-full max-w-sm rounded-panel border border-rule bg-card-raised p-6 shadow-lift sm:p-8 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
          style={{ '--i': 3 } as React.CSSProperties}
        >
          {title && (
            <div className="mb-6">
              <h2 className="text-head font-bold">{title}</h2>
              {subtitle && <p className="mt-1 text-ink-soft">{subtitle}</p>}
            </div>
          )}
          {children}
        </div>
      </section>
    </main>
  );
}
