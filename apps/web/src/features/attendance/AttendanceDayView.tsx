import { useState } from 'react';
import { Button, Panel, Tag } from '../../components/ui';
import { he } from '../../i18n/he';
import { todayIso } from '../../lib/dates';
import type { AttendanceStatus, Week, WeekRow } from '../../lib/types';
import { presentLabel, STATUS_STYLE, STATUSES, StatusCell } from './statuses';

const dd_mm = (iso: string): string =>
  new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

/**
 * ימי יציאה on a phone, organised by DAY instead of by person.
 *
 * Seven tabs across the top, each showing that day's headcount, so the totals the old layout buried in
 * one cramped row are the first thing you see. Choosing a day shows everyone on one short screen with
 * a big, tappable status control, and a breakdown of every status for that day (not just "present").
 * A card per person with seven lines each was a very long page that hid both.
 */
export function DayView({
  week,
  isAdmin,
  onChange,
  onRemove,
}: {
  week: Week;
  isAdmin: boolean;
  onChange: (teamMemberId: string, date: string, status: AttendanceStatus | null) => void;
  onRemove: (row: WeekRow) => void;
}) {
  const weekStart = week.dates[0] ?? '';
  const today = todayIso();
  const todayIndex = week.dates.indexOf(today);
  // Remembered per week: moving to another week starts again on its first day, or today if it is in it.
  const [picked, setPicked] = useState<{ weekStart: string; index: number } | null>(null);
  const selected = picked && picked.weekStart === weekStart ? picked.index : Math.max(todayIndex, 0);
  const date = week.dates[selected] as string;

  // How many people are in each status on the selected day, including the ones not filled in yet.
  const counts = new Map<AttendanceStatus | 'none', number>();
  for (const row of week.rows) {
    const status = row.cells[selected]?.status ?? 'none';
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  return (
    <div className="space-y-3 sm:hidden">
      <div role="tablist" aria-label={he.attendance.title} className="grid grid-cols-7 gap-1.5">
        {week.dates.map((d, i) => {
          const active = i === selected;
          const returning = week.returningPerDay[i] ?? 0;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPicked({ weekStart, index: i })}
              className={`relative flex min-h-[4.5rem] flex-col items-center justify-center rounded-panel border px-0.5 py-2 text-center transition-colors ${
                active
                  ? 'border-field bg-field text-white shadow-panel'
                  : 'border-rule-strong bg-card-raised text-ink active:bg-field-wash'
              }`}
            >
              <span className="text-meta font-semibold">{he.attendance.days[i]}</span>
              <span className={`text-micro ${active ? 'text-white/80' : 'text-graphite'}`}>{dd_mm(d)}</span>
              <span className={`mt-0.5 text-lead font-bold leading-6 ${active ? 'text-white' : 'text-field-dark'}`}>
                {week.presentPerDay[i] ?? 0}
              </span>
              {returning > 0 && (
                <span dir="ltr" className={`text-micro font-semibold ${active ? 'text-white/90' : 'text-cat-optics'}`}>
                  +{returning}
                </span>
              )}
              {d === today && (
                <span
                  aria-label={he.attendance.todayTag}
                  className={`absolute end-1 top-1 h-1.5 w-1.5 rounded-full ${active ? 'bg-brass-bright' : 'bg-brass'}`}
                />
              )}
            </button>
          );
        })}
      </div>

      <Panel>
        <div className="space-y-2 border-b border-rule px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lead font-semibold">{he.attendance.dayHeading(he.attendance.dayNames[selected] ?? '', dd_mm(date))}</h2>
            {date === today && <Tag tone="brass">{he.attendance.todayTag}</Tag>}
          </div>
          <p className="text-meta text-ink-soft">
            {he.attendance.present}: <span className="font-bold text-field-dark">{presentLabel(week.presentPerDay[selected] ?? 0, week.returningPerDay[selected] ?? 0)}</span>
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {[...STATUSES, 'OTHER' as const].map((s) =>
              counts.get(s) ? (
                <li key={s} className={`rounded-ctl px-2 py-1 text-meta font-semibold ${STATUS_STYLE[s]}`}>
                  {he.attendance.statuses[s]} {counts.get(s)}
                </li>
              ) : null,
            )}
            {counts.get('none') ? (
              <li className="rounded-ctl border border-dashed border-rule-strong px-2 py-1 text-meta text-graphite">
                {he.attendance.notFilled} {counts.get('none')}
              </li>
            ) : null}
          </ul>
        </div>

        <ul className="divide-y divide-rule">
          {week.rows.map((row) => (
            <li key={row.teamMemberId} className="flex items-center justify-between gap-3 px-4 py-2">
              <span className="min-w-0 flex-1 truncate font-semibold">{row.nickname}</span>
              <div className="w-40 shrink-0">
                <StatusCell
                  large
                  status={row.cells[selected]?.status ?? null}
                  gender={row.gender}
                  editable={isAdmin}
                  onChange={(s) => onChange(row.teamMemberId, date, s)}
                />
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {isAdmin && week.rows.length > 0 && (
        <details className="rounded-panel border border-rule bg-card-raised">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 text-body font-semibold">
            {he.attendance.manageTeam}
          </summary>
          <ul className="divide-y divide-rule border-t border-rule">
            {week.rows.map((row) => (
              <li key={row.teamMemberId} className="flex items-center justify-between gap-3 px-4 py-2">
                <span className="min-w-0 flex-1 truncate">{row.nickname}</span>
                <Button variant="quiet" size="sm" onClick={() => onRemove(row)}>
                  {he.attendance.removeMember}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
