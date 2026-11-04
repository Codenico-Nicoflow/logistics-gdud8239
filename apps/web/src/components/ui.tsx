import type { ReactNode } from 'react';
import { he } from '../i18n/he';

/** A titled panel. One radius for panels, another for controls, by design. */
export function Panel({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-panel border border-rule bg-card-raised shadow-panel ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
          <h2 className="text-lead font-semibold">{title}</h2>
          {action}
        </header>
      )}
      {children}
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
  const toneClass = {
    ink: 'text-ink',
    field: 'text-field',
    oxide: 'text-oxide',
    brass: 'text-brass',
  }[tone];

  return (
    <div className="rounded-panel border border-rule bg-card-raised px-4 py-3 shadow-panel">
      <div className="text-meta text-graphite">{label}</div>
      <div className={`mt-1 text-figure font-bold ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-micro text-graphite">{hint}</div>}
    </div>
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
    primary: 'bg-field text-white hover:bg-field-dark disabled:bg-graphite',
    quiet: 'border border-rule-strong bg-card-raised text-ink hover:bg-card disabled:text-graphite',
    danger: 'bg-oxide text-white hover:brightness-90 disabled:bg-graphite',
  };
  const sizes = { sm: 'px-2.5 py-1 text-meta', md: 'px-3.5 py-2 text-body' };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-ctl font-semibold transition-colors disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
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
  hint,
  error,
  className = '',
  inputClassName = '',
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  required?: boolean;
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
        className={`w-full rounded-ctl border bg-card-raised px-3 py-2 text-body placeholder:text-graphite ${
          error ? 'border-oxide' : 'border-rule-strong'
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

export function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  className = '',
}: {
  label?: string;
  value: T | '';
  onChange: (value: T | '') => void;
  options: { value: T | ''; label: string }[];
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="mb-1 block text-meta font-semibold text-ink-soft">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T | '')}
        className="w-full rounded-ctl border border-rule-strong bg-card-raised px-3 py-2 text-body"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
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
      className={`inline-block whitespace-nowrap rounded-ctl border px-1.5 py-0.5 text-micro font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Spinner({ label = he.common.loading }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-graphite">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-rule-strong border-t-field" />
      <span className="text-meta">{label}</span>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-graphite">{children}</div>;
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
      className={`whitespace-nowrap border-b border-rule-strong px-3 py-2 text-meta font-semibold text-ink-soft ${
        numeric ? 'text-center' : 'text-start'
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  numeric,
  className = '',
}: {
  children?: ReactNode;
  numeric?: boolean;
  className?: string;
}) {
  return (
    <td
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
