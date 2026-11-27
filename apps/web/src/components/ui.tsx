import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** A number that rolls to its new value instead of jumping, so a changed count is noticed. Never on first paint. */
function useRolling(target: number): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (from.current === target) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / 600);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(origin + (target - origin) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return typeof target === 'number' ? shown : target;
}

import { NavLink } from 'react-router-dom';
import { he } from '../i18n/he';
import type { ItemCategory } from '../lib/types';

/** Open dialogs, oldest first; Escape only reaches the last. */
const openModals: object[] = [];

/**
 * A modal backdrop + panel. Closes on a genuine click of the backdrop, but
 * not when the mousedown that started the click began inside the panel —
 * e.g. selecting text in an input by dragging the mouse past the panel's
 * edge before releasing. A plain `onClick={onClose}` on the backdrop fires
 * in exactly that case (the click's target is wherever the mouse came up),
 * closing the dialog out from under whoever was mid-selection. Tracking
 * where the *mousedown* happened, not just the click, fixes it.
 */
export function Modal({
  onClose,
  role = 'dialog',
  className = 'w-full max-w-md',
  children,
}: {
  onClose: () => void;
  role?: 'dialog' | 'alertdialog';
  className?: string;
  children: ReactNode;
}) {
  const downOnBackdrop = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Escape closes the dialog, like a click on the backdrop. Only the topmost one: a confirmation opened over
  // another dialog must not take the dialog underneath with it.
  useEffect(() => {
    const me = {};
    openModals.push(me);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented || openModals[openModals.length - 1] !== me) return;
      e.preventDefault();
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openModals.splice(openModals.indexOf(me), 1);
    };
  }, []);

  // Rendered at the top of the page, not where it was written: a dialog opened from inside another dialog is
  // `position: fixed` inside an ancestor with a blur and animation, which makes that ancestor its frame
  // instead of the screen. The inner dialog was then sized to, and scrolled with, the outer one, and its
  // buttons ended up below the fold of a box that was itself scrolling.
  return createPortal(
    <div
      // `!m-0`: a page's `space-y-*` would otherwise push this fixed backdrop down and leave a strip uncovered.
      // Padded by the safe areas, so a dialog never sits under the notch or the home bar.
      className="!m-0 fixed inset-0 z-50 flex items-end justify-center modal-backdrop bg-[#0f1a16]/55 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:items-center"
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnBackdrop.current) onClose();
      }}
    >
      <div
        role={role}
        aria-modal="true"
        // Never taller than the screen, and scrollable: with the keyboard open a phone has very little
        // height, and a form that cannot scroll leaves its buttons unreachable.
        className={`${className} max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-panel border border-white/60 bg-[rgba(255,255,255,0.94)] shadow-lift backdrop-blur-xl modal-sheet`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Wraps results that are being reloaded after a search or filter changed: dims them and shows a spinner
 * on top, so stale rows never look like the answer. Wrap only the results, not the controls that
 * triggered the reload — it blocks pointer input while active.
 */
export function Refreshing({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div className="relative" aria-busy={active}>
      <div className={active ? 'pointer-events-none opacity-50 transition-opacity' : 'transition-opacity'}>{children}</div>
      {active && (
        <div role="status" className="pointer-events-none absolute inset-x-0 top-10 flex justify-center">
          <span className="flex items-center gap-2 rounded-ctl border border-rule bg-card-raised px-3 py-1.5 text-meta text-graphite shadow-panel">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rule-strong border-t-field" />
            {he.common.loading}
          </span>
        </div>
      )}
    </div>
  );
}

/** A titled panel. One radius for panels, another for controls, by design. */
export function Panel({
  title,
  action,
  children,
  className = '',
  busy,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** A search or filter is reloading what the panel shows: dim it and say so, instead of leaving stale rows looking final. */
  busy?: boolean;
}) {
  return (
    <section
      className={`glass-card rounded-panel ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between gap-3 rounded-t-panel border-b border-rule/70 bg-[linear-gradient(180deg,var(--field-wash)_0%,rgba(255,255,255,0)_100%)] px-4 py-3">
          <h2 className="text-lead font-semibold text-ink">{title}</h2>
          {action}
        </header>
      )}
      {busy === undefined ? children : <Refreshing active={busy}>{children}</Refreshing>}
    </section>
  );
}

/**
 * A single number with its label. Used sparingly — four at the top of the
 * dashboard — because the rest of the interface is tables.
 */
export function Figure({
  label,
  value,
  tone = 'ink',
  hint,
}: {
  label: string;
  value: number | string;
  tone?: 'ink' | 'field' | 'oxide' | 'brass';
  hint?: string;
}) {
  const tones = {
    ink: { text: 'text-ink', rule: 'from-graphite to-ink-soft', glow: 'rgba(60,74,68,0.35)' },
    field: { text: 'text-field-dark', rule: 'from-field-bright to-field', glow: 'rgba(61,138,107,0.55)' },
    oxide: { text: 'text-oxide', rule: 'from-[#c4503a] to-oxide', glow: 'rgba(166,61,38,0.5)' },
    brass: { text: 'text-brass', rule: 'from-brass-bright to-brass', glow: 'rgba(194,155,46,0.55)' },
  }[tone];
  const rolling = useRolling(typeof value === 'number' ? value : 0);

  return (
    <div
      className="glass-card overflow-hidden rounded-panel"
    >
      <div className={`h-1 bg-gradient-to-l ${tones.rule}`} style={{ boxShadow: `0 2px 14px ${tones.glow}` }} />
      <div className="px-4 py-3">
        <div className="text-meta font-semibold text-graphite">{label}</div>
        <div className={`mt-0.5 text-figure font-bold ${tones.text}`}>{typeof value === 'number' ? rolling : value}</div>
        {hint && <div className="mt-0.5 text-micro text-graphite">{hint}</div>}
      </div>
    </div>
  );
}

/**
 * Each item category gets its own hue, so a long table can be scanned by colour
 * rather than read line by line.
 */
export function CategoryTag({ category }: { category: ItemCategory }) {
  const tones: Record<ItemCategory, string> = {
    WEAPON: 'bg-cat-weapon-wash text-cat-weapon border-cat-weapon/25',
    OPTICS: 'bg-cat-optics-wash text-cat-optics border-cat-optics/25',
    DRONE: 'bg-cat-drone-wash text-cat-drone border-cat-drone/25',
    ACCESSORY: 'bg-cat-accessory-wash text-cat-accessory border-cat-accessory/25',
    GEAR: 'bg-cat-gear-wash text-cat-gear border-cat-gear/25',
    AMMO: 'bg-cat-ammo-wash text-cat-ammo border-cat-ammo/25',
  };
  return (
    <span
      className={`chip inline-block whitespace-nowrap rounded-ctl border px-1.5 py-0.5 text-micro font-semibold ${tones[category]}`}
    >
      {he.categories[category]}
    </span>
  );
}

/**
 * Marks an item's category inside a dense row. A short coloured bar rather than
 * a dot: at table scale a 2px dot disappears, and the bar is still legible when
 * the eye is moving quickly down a column of item names.
 */
export function CategoryDot({ category }: { category: ItemCategory }) {
  const tones: Record<ItemCategory, string> = {
    WEAPON: 'bg-cat-weapon',
    OPTICS: 'bg-cat-optics',
    DRONE: 'bg-cat-drone',
    ACCESSORY: 'bg-cat-accessory',
    GEAR: 'bg-cat-gear',
    AMMO: 'bg-cat-ammo',
  };
  return (
    <span
      aria-hidden
      title={he.categories[category]}
      className={`inline-flex h-4 w-1.5 shrink-0 rounded-sm ${tones[category]}`}
    />
  );
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled,
  size = 'md',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'quiet' | 'danger';
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const variants = {
    primary:
      'btn-primary text-white disabled:bg-none disabled:bg-graphite disabled:shadow-none',
    quiet:
      'btn-quiet text-ink hover:text-field-dark disabled:text-graphite disabled:hover:shadow-none',
    danger:
      'btn-danger text-white disabled:bg-none disabled:bg-graphite disabled:shadow-none',
  };
  // Matches TextField/Select's own height (h-11 / h-10) exactly, so a button
  // next to an input never looks squat — padding alone drifted out of sync
  // with the inputs' border + line-height and made `sm` buttons visibly short.
  // `md` is 44px, the accessible minimum touch target; `sm` is for dense rows
  // (table action cells) where every control on the row is already compact.
  const sizes = { sm: 'h-10 px-3 text-meta', md: 'h-11 px-4 text-body' };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-ctl font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[0.96] active:duration-75 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:active:scale-100 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoFocus,
  required,
  disabled,
  hint,
  error,
  className = '',
  inputClassName = '',
  autoComplete,
  inputMode,
  maxLength,
  dir,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  /** e.g. `one-time-code`, so a phone offers the code from the authenticator or a text message. */
  autoComplete?: string;
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'search' | 'url' | 'none';
  maxLength?: number;
  /** `ltr` for codes and keys, which must not be reordered inside a right-to-left page. */
  dir?: 'ltr' | 'rtl';
  autoFocus?: boolean;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-1 block text-meta font-semibold text-ink-soft">
          {label}
          {!required && (
            <span className="ms-1 font-normal text-graphite">{he.issue.optional}</span>
          )}
        </span>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        dir={dir}
        className={`h-11 w-full rounded-ctl border bg-card-raised px-3 text-[16px] sm:text-body placeholder:text-graphite shadow-inset-field field-ring focus:outline-none disabled:cursor-not-allowed disabled:bg-card disabled:text-graphite ${
          error ? 'field-invalid border-oxide' : 'border-rule-strong'
        } ${inputClassName}`}
      />
      {error ? (
        <span className="mt-1 block text-meta text-oxide">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-meta text-graphite">{hint}</span>
      )}
    </label>
  );
}

/** How long typing must pause before a search runs on its own. */
export const SEARCH_DEBOUNCE_MS = 350;

/**
 * A search box that searches when typing pauses, or at once on Enter or the button.
 *
 * Searching per character issued a request for every letter typed, which both wasted the rate-limit
 * budget and made results flicker mid-word. The visible text is local; `onSearch` fires after a short
 * pause (`debounceMs`, 0 for a filter that runs in the browser and can follow every key), on Enter, or
 * on the button.
 */
export function SearchField({
  value,
  onSearch,
  placeholder,
  autoFocus,
  className = '',
  debounceMs = SEARCH_DEBOUNCE_MS,
}: {
  value: string;
  onSearch: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  debounceMs?: number;
}) {
  const [draft, setDraft] = useState(value);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;

  // Keep in step when the committed value is changed elsewhere, e.g. cleared. Not when it is merely the
  // trimmed echo of what is being typed, or a trailing space ("דנה ") would be eaten mid-name.
  useEffect(() => {
    setDraft((current) => (current.trim() === value ? current : value));
  }, [value]);

  useEffect(() => {
    const next = draft.trim();
    if (next === value) return;
    const timer = setTimeout(() => onSearchRef.current(next), debounceMs);
    return () => clearTimeout(timer);
  }, [draft, value, debounceMs]);

  function commit(): void {
    onSearch(draft.trim());
  }

  return (
    <div className={`flex gap-2 ${className}`}>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setDraft('');
            onSearch('');
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="h-11 w-full rounded-ctl border border-rule-strong bg-card-raised px-3 text-[16px] sm:text-body placeholder:text-graphite shadow-inset-field field-ring focus:outline-none"
      />
      <Button variant="quiet" onClick={commit}>
        {he.common.search}
      </Button>
      {value && (
        <Button
          variant="quiet"
          onClick={() => {
            setDraft('');
            onSearch('');
          }}
        >
          {he.common.clear}
        </Button>
      )}
    </div>
  );
}

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  className = '',
  disabled = false,
}: {
  label?: string;
  value: T | '';
  onChange: (value: T | '') => void;
  options: { value: T | ''; label: string }[];
  className?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="mb-1 block text-meta font-semibold text-ink-soft">{label}</span>}
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as T | '')}
          disabled={disabled}
          className="h-11 w-full appearance-none rounded-ctl border border-rule-strong bg-card-raised px-3 pe-9 text-[16px] sm:text-body shadow-inset-field field-ring focus:outline-none disabled:opacity-50"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 end-3 m-auto h-4 w-4 text-ink-soft"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </label>
  );
}

/**
 * A status mark. Flagged rows use oxide so they are findable by scanning a long
 * table, which is the whole point of the דרוש טיפול list.
 */
export function Tag({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'field' | 'oxide' | 'brass';
}) {
  const tones = {
    neutral: 'bg-card text-ink-soft border-rule',
    field: 'bg-field-wash text-field-dark border-field/30',
    oxide: 'bg-oxide-wash text-oxide border-oxide/30',
    brass: 'bg-brass-wash text-brass border-brass/30',
  };
  return (
    <span
      className={`chip inline-block whitespace-nowrap rounded-ctl border px-1.5 py-0.5 text-micro font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Switches between sibling screens of one hub. Each tab is a real route, so the address, back button and
 * a refresh all keep the person where they were. It scrolls sideways on a phone rather than wrapping:
 * it is navigation, not a data-entry surface, and the labels are short.
 */
export function TabBar({ tabs }: { tabs: { to: string; label: string; end: boolean }[] }) {
  return (
    <nav aria-label={he.common.tabs} className="mb-5 border-b border-rule">
      <ul className="flex gap-0.5 sm:gap-1">
        {tabs.map((tab) => (
          <li key={tab.to} className="min-w-0 flex-1 sm:flex-none">
            <NavLink
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `-mb-px flex min-h-11 items-center justify-center rounded-t-ctl border-b-2 px-2 py-1.5 text-center text-body leading-tight transition-all duration-300 sm:px-4 ${
                  isActive
                    ? 'tab-active border-brass-bright font-semibold text-ink'
                    : 'border-transparent text-graphite hover:bg-field-wash/60 hover:text-ink'
                }`
              }
            >
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Spinner({ label = he.common.loading }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-graphite">
      <span className="liquid-spinner h-4 w-4" />
      <span className="text-meta">{label}</span>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="mx-4 my-6 flex flex-col items-center gap-2 rounded-panel border border-dashed border-rule-strong bg-[linear-gradient(180deg,rgba(255,255,255,0.6),rgba(226,239,233,0.4))] px-4 py-9 text-center text-graphite">
      <span aria-hidden className="empty-orb h-9 w-9" />
      {children}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-oxide">{he.common.error}</p>
      {onRetry && (
        <Button variant="quiet" size="sm" onClick={onRetry} className="mt-3">
          {he.common.retry}
        </Button>
      )}
    </div>
  );
}

/** A horizontally scrollable wrapper, so wide reports stay usable on a phone. */
/** Placeholder rows while data loads, so the layout does not jump when it arrives. */
export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-hidden role="presentation">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-9 rounded-ctl" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

export function TableScroll({ children }: { children: ReactNode }) {
  return <div className="scroll-slim overflow-x-auto">{children}</div>;
}

export function Th({
  children,
  numeric,
  className = '',
}: {
  children?: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <th
      className={`th-glass whitespace-nowrap px-3 py-2.5 text-meta font-semibold text-ink-soft ${
        numeric ? 'text-center' : 'text-start'
      } ${className}`}
    >
      {children}
    </th>
  );
}

/** A column header that sorts when clicked; same look as `Th`, with an arrow marking the active column. */
export function SortableTh({
  children,
  active,
  onClick,
  className = '',
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th
      aria-sort={active ? 'ascending' : 'none'}
      className={`th-glass whitespace-nowrap px-3 py-2.5 text-start text-meta font-semibold text-ink-soft ${className}`}
    >
      <button onClick={onClick} className="inline-flex items-center gap-1 rounded-ctl transition-colors hover:text-field-dark">
        {children}
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={`h-3.5 w-3.5 transition-all duration-300 ${active ? 'text-field-dark opacity-100' : 'opacity-30'}`}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </th>
  );
}

export function Td({
  children,
  numeric,
  colSpan,
  className = '',
}: {
  children?: ReactNode;
  numeric?: boolean;
  colSpan?: number;
  className?: string;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border-b border-rule px-3 py-2 ${numeric ? 'text-center' : 'text-start'} ${className}`}
    >
      {children}
    </td>
  );
}

export function Serial({ value }: { value: string | null }) {
  if (!value) return <span className="text-graphite">{he.common.none}</span>;
  return <span className="serial">{value}</span>;
}

/**
 * Pulls the Hebrew message out of an RTK Query error. The error union includes
 * a serialized shape without `data`, so the narrowing is done once here rather
 * than with an unsafe `in` check on each page.
 */
export function apiErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const message = (data as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.filter((m) => typeof m === 'string').join(', ');
  return null;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The app's one checkbox. The native input stays (screen readers, keyboard, form semantics) but is
 * visually replaced: a 24px box with a white face and a strong border when off, solid field green with
 * a white tick that draws itself when on. The browser default is a 13px grey square whose white tick
 * disappears on our pale cards. The whole row is the tap target (44px), not just the box.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  hint,
  disabled,
  ariaLabel,
  invalid,
  className = '',
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <label
      className={`group flex min-h-11 items-center gap-3 text-meta ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${className}`}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${invalid ? 'border-oxide' : 'border-rule-strong'} bg-card-raised shadow-inset-field transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out group-hover:border-field peer-checked:border-field peer-checked:bg-field peer-checked:shadow-none peer-focus-visible:ring-2 peer-focus-visible:ring-field/40 peer-focus-visible:ring-offset-2 group-active:scale-90 motion-reduce:transition-none [&_path]:[stroke-dasharray:24] [&_path]:[stroke-dashoffset:24] [&_path]:transition-[stroke-dashoffset] [&_path]:duration-200 peer-checked:[&_path]:[stroke-dashoffset:0] motion-reduce:[&_path]:transition-none`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      {(label || hint) && (
        <span className="min-w-0">
          {label && <span className="block font-semibold text-ink">{label}</span>}
          {hint && <span className="block text-graphite">{hint}</span>}
        </span>
      )}
    </label>
  );
}
