import { useMemo, useState } from 'react';
import { useMovementsQuery } from '../../lib/api';
import {
  EmptyState,
  Panel,
  Select,
  Serial,
  Spinner,
  Tag,
  TextField,
} from '../../components/ui';
import { he } from '../../i18n/he';
import { addDays, todayIso } from '../../lib/dates';
import { type Company, type MovementAction, type MovementRow } from '../../lib/types';
import { useCompanies } from '../companies/useCompanies';

function buildExportUrl(params: URLSearchParams): string {
  return `/api/movements/export/daily?${params.toString()}`;
}

/** Israel-timezone day key (YYYY-MM-DD), not UTC — `occurredAt` is an ISO UTC
 *  string, so a plain `.slice(0, 10)` puts anything after ~22:00 Israel time
 *  under the wrong, earlier day. `en-CA` is the one locale whose date format
 *  is already YYYY-MM-DD, so no manual padding/reassembly is needed. */
function localDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

const PAGE_SIZE = 500;

type RangeKey = 'today' | 'yesterday' | 'week' | 'custom';
const RANGES: RangeKey[] = ['today', 'yesterday', 'week', 'custom'];

/**
 * דוח תנועות יומי — every signature-related event (ניפוק, זיכוי, or the
 * issue/return pair a reissue writes when items on a signed form change),
 * grouped by the day it actually happened, newest day first. Answers "what
 * happened today" at a glance — who did what, to whom, and when within the
 * day — instead of making the operator scroll a flat table and do the
 * grouping in their head. Admin/logistics only; a separate screen from the
 * flat דוח תנועות table, which stays for when a plain filterable list is
 * what's actually wanted.
 */
export function DailyMovementsPage() {
  const { options: companyOptions } = useCompanies();
  const [q, setQ] = useState('');
  const [action, setAction] = useState<MovementAction | ''>('');
  const [company, setCompany] = useState<Company | ''>('');
  const [range, setRange] = useState<RangeKey>('today');
  const [customFrom, setCustomFrom] = useState(todayIso());
  const [customTo, setCustomTo] = useState('');

  // Today by default. "Today" is recomputed on every render so a page left
  // open past midnight rolls over instead of showing yesterday.
  const today = todayIso();
  const { from, to } = useMemo(() => {
    if (range === 'yesterday') return { from: addDays(today, -1), to: addDays(today, -1) };
    if (range === 'week') return { from: addDays(today, -6), to: today };
    if (range === 'custom') return { from: customFrom, to: customTo || customFrom };
    return { from: today, to: today };
  }, [range, today, customFrom, customTo]);

  const { data, isLoading } = useMovementsQuery({
    ...(q ? { q } : {}),
    ...(action ? { action } : {}),
    ...(company ? { company } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    take: PAGE_SIZE,
  });

  const visibleRows = useMemo(() => data?.rows ?? [], [data]);

  const days = useMemo(() => {
    const byDay = new Map<string, MovementRow[]>();
    for (const row of visibleRows) {
      const day = localDayKey(row.occurredAt);
      const list = byDay.get(day) ?? [];
      list.push(row);
      byDay.set(day, list);
    }
    return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [visibleRows]);

  const exportUrl = buildExportUrl(
    new URLSearchParams({
      ...(q ? { q } : {}),
      ...(action ? { action } : {}),
      ...(company ? { company } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    }),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display font-bold">{he.dailyMovements.title}</h1>
          <p className="mt-1 text-ink-soft">{he.dailyMovements.subtitle}</p>
        </div>
        <a
          href={exportUrl}
          className="inline-flex h-11 shrink-0 items-center rounded-ctl bg-field px-4 text-body font-semibold text-white transition-colors hover:bg-field-bright"
        >
          {he.dailyMovements.export}
        </a>
      </div>

      <Panel>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-rule px-4 py-4">
          <div>
            <span className="mb-1 block text-meta font-semibold text-ink-soft">{he.dailyMovements.range}</span>
            <div className="flex overflow-hidden rounded-ctl border border-rule-strong">
              {RANGES.map((key) => (
                <button
                  key={key}
                  onClick={() => setRange(key)}
                  className={`h-11 px-4 text-body font-semibold transition-colors ${
                    range === key ? 'bg-field text-white' : 'bg-card-raised text-ink-soft hover:bg-card'
                  }`}
                >
                  {he.dailyMovements[key === 'week' ? 'lastWeek' : key === 'custom' ? 'pickDate' : key]}
                </button>
              ))}
            </div>
          </div>
          {range === 'custom' && (
            <>
              <TextField
                label={he.dailyMovements.date}
                value={customFrom}
                onChange={setCustomFrom}
                type="date"
                required
                className="w-44"
              />
              <TextField
                label={he.dailyMovements.untilDate}
                value={customTo}
                onChange={setCustomTo}
                type="date"
                className="w-44"
              />
            </>
          )}
        </div>
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField label={he.common.search} value={q} onChange={setQ} className="lg:col-span-2" />
          <Select
            label={he.movements.action}
            value={action}
            onChange={setAction}
            options={[
              { value: '', label: he.movements.allActions },
              { value: 'ISSUE', label: he.actions.ISSUE },
              { value: 'RETURN', label: he.actions.RETURN },
              { value: 'STORE', label: he.actions.STORE },
              { value: 'COLLECT', label: he.actions.COLLECT },
            ]}
          />
          <Select
            label={he.signatures.company}
            value={company}
            onChange={setCompany}
            options={[
              { value: '', label: he.signatures.allCompanies },
              ...companyOptions,
            ]}
          />
        </div>
      </Panel>

      {isLoading ? (
        <Panel>
          <Spinner />
        </Panel>
      ) : days.length === 0 ? (
        <Panel>
          <EmptyState>{he.movements.none}</EmptyState>
        </Panel>
      ) : (
        <div className="space-y-4">
          {days.map(([day, rows]) => (
            <DayCard key={day} day={day} rows={rows} />
          ))}
        </div>
      )}
    </div>
  );
}

function DayCard({ day, rows }: { day: string; rows: MovementRow[] }) {
  const { nameOf } = useCompanies();
  const sorted = [...rows].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  return (
    <Panel
      title={formatDay(day)}
      action={<span className="text-meta text-graphite">{he.dailyMovements.eventCount(rows.length)}</span>}
    >
      <ul className="divide-y divide-rule">
        {sorted.map((m) => (
          <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-2.5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Tag tone={m.action === 'ISSUE' ? 'field' : m.action === 'RETURN' ? 'neutral' : 'brass'}>
                {he.actions[m.action as MovementAction]}
              </Tag>
              <span className="font-semibold">{m.soldierName}</span>
              <span className="text-meta text-graphite">
                {m.company ? nameOf(m.company as Company) : ''}
              </span>
              <span className="text-meta">
                {m.itemName}
                {m.serial && (
                  <>
                    {' · '}
                    <Serial value={m.serial} />
                  </>
                )}
                {m.quantity > 1 && ` ×${m.quantity}`}
              </span>
              {m.notes && (
                <span className="text-meta text-graphite" title={m.notes}>
                  · {m.notes}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 text-meta text-graphite">
              <span className="whitespace-nowrap">{formatTime(m.occurredAt)}</span>
              <span>·</span>
              <span className="font-semibold text-ink-soft">{m.performedBy}</span>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function formatDay(day: string): string {
  // `day` is a bare YYYY-MM-DD local-day key — parsed with explicit
  // year/month/day (not `new Date(day)`, which reads it as UTC midnight and
  // can roll back a day once re-rendered in a timezone behind UTC).
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString('he-IL', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}
