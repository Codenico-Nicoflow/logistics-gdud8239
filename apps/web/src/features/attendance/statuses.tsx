import { he } from '../../i18n/he';
import type { AttendanceStatus, Gender } from '../../lib/types';

export const STATUSES: AttendanceStatus[] = [
  'PRESENT',
  'LEAVING',
  'RETURNING',
  'ON_LEAVE',
  'GIMELIM',
  'CLOSED_ORDER',
];

/** Each status gets a colour so a week reads at a glance. */
export const STATUS_STYLE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-field-wash text-field-dark',
  LEAVING: 'bg-brass-wash text-brass',
  RETURNING: 'bg-cat-optics-wash text-cat-optics',
  ON_LEAVE: 'bg-card text-graphite',
  GIMELIM: 'bg-cat-drone-wash text-cat-drone',
  CLOSED_ORDER: 'bg-oxide-wash text-oxide',
  OTHER: 'bg-card text-ink-soft',
};

export function statusLabel(status: AttendanceStatus, gender: Gender): string {
  return gender === 'F' ? he.attendance.statusesF[status] : he.attendance.statuses[status];
}

/** "12" or "12 (+3 חזרה)" — the returning count is called out only when
 *  nonzero, since "+0 חזרה" on every ordinary day would be pure noise. */
export function presentLabel(present: number, returning: number): string {
  return returning > 0 ? `${present} (+${returning} ${he.attendance.statuses.RETURNING})` : `${present}`;
}

/** One person's day — a select for the admin, plain colored text for anyone else, so a read-only
 *  viewer never sees a control that would reject their click anyway. `large` is the phone size: a
 *  44px tap target and 16px text (smaller text makes iPhone Safari zoom in on focus). */
export function StatusCell({
  status,
  gender,
  editable,
  large = false,
  onChange,
}: {
  status: AttendanceStatus | null;
  gender: Gender;
  editable: boolean;
  large?: boolean;
  onChange: (status: AttendanceStatus | null) => void;
}) {
  const size = large ? 'h-11 px-3 text-[16px]' : 'px-1 py-1.5 text-meta';
  if (!editable) {
    return (
      <div
        className={`flex w-full items-center justify-center rounded-ctl text-center font-semibold ${size} ${
          status ? STATUS_STYLE[status] : 'text-graphite'
        }`}
      >
        {status ? statusLabel(status, gender) : '–'}
      </div>
    );
  }
  return (
    <select
      value={status ?? ''}
      onChange={(e) => onChange((e.target.value || null) as AttendanceStatus | null)}
      className={`w-full cursor-pointer rounded-ctl border border-transparent text-center font-semibold focus:border-field ${size} ${
        status ? STATUS_STYLE[status] : 'bg-transparent text-graphite'
      }`}
    >
      <option value="">{he.common.none}</option>
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {statusLabel(s, gender)}
        </option>
      ))}
    </select>
  );
}
