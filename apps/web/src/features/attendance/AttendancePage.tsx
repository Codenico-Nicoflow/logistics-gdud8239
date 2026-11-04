import { useState } from 'react';
import {
  useCreateTeamMemberMutation,
  useSetAttendanceMutation,
  useWeekQuery,
} from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  Panel,
  Spinner,
  TableScroll,
  Td,
  Th,
  TextField,
} from '../../components/ui';
import { he } from '../../i18n/he';
import type { AttendanceStatus, Gender } from '../../lib/types';

const STATUSES: AttendanceStatus[] = [
  'PRESENT',
  'LEAVING',
  'RETURNING',
  'ON_LEAVE',
  'GIMELIM',
  'CLOSED_ORDER',
];

/** Each status gets a colour so a week reads at a glance. */
const STATUS_STYLE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-field-wash text-field-dark',
  LEAVING: 'bg-brass-wash text-brass',
  RETURNING: 'bg-cat-optics-wash text-cat-optics',
  ON_LEAVE: 'bg-card text-graphite',
  GIMELIM: 'bg-cat-drone-wash text-cat-drone',
  CLOSED_ORDER: 'bg-oxide-wash text-oxide',
  OTHER: 'bg-card text-ink-soft',
};

function label(status: AttendanceStatus, gender: Gender): string {
  return gender === 'F' ? he.attendance.statusesF[status] : he.attendance.statuses[status];
}

function shiftWeek(iso: string, weeks: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

/**
 * `ימי יציאה` — the weekly grid, laid out the way the original sheet is: a row
 * per person, a column per day, and a present count along the bottom. Status is
 * chosen from a fixed list rather than typed, which removes the spelling drift
 * the spreadsheet accumulated.
 */
export function AttendancePage() {
  const [anchor, setAnchor] = useState(new Date().toISOString().slice(0, 10));
  const [adding, setAdding] = useState(false);
  const { data, isLoading, isFetching } = useWeekQuery(anchor);
  const [setCells] = useSetAttendanceMutation();

  async function setCell(
    teamMemberId: string,
    date: string,
    status: AttendanceStatus | null,
  ): Promise<void> {
    await setCells({ cells: [{ teamMemberId, date, status }] });
  }

  if (isLoading) return <Spinner />;

  const dates = data?.dates ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display font-bold">{he.attendance.title}</h1>
          <p className="mt-1 text-ink-soft">{he.attendance.subtitle}</p>
        </div>
        <Button variant="quiet" onClick={() => setAdding(true)}>
          {he.attendance.addMember}
        </Button>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <Button variant="quiet" size="sm" onClick={() => setAnchor((a) => shiftWeek(a, -1))}>
            {he.attendance.prevWeek}
          </Button>
          <Button
            variant="quiet"
            size="sm"
            onClick={() => setAnchor(new Date().toISOString().slice(0, 10))}
          >
            {he.attendance.thisWeek}
          </Button>
          <Button variant="quiet" size="sm" onClick={() => setAnchor((a) => shiftWeek(a, 1))}>
            {he.attendance.nextWeek}
          </Button>
          {dates.length > 0 && (
            <span className="ms-2 text-meta text-graphite">
              {new Date(dates[0] as string).toLocaleDateString('he-IL')} –{' '}
              {new Date(dates[6] as string).toLocaleDateString('he-IL')}
            </span>
          )}
          {isFetching && <span className="text-meta text-graphite">{he.common.loading}</span>}
        </div>
      </Panel>

      <Panel>
        <TableScroll>
          <table className="w-full">
            <thead>
              <tr>
                <Th>{he.attendance.member}</Th>
                {dates.map((d, i) => (
                  <Th key={d} numeric>
                    <div>{he.attendance.days[i]}</div>
                    <div className="font-normal text-graphite">
                      {new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}
                    </div>
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.rows ?? []).map((row) => (
                <tr key={row.teamMemberId}>
                  <Td className="whitespace-nowrap font-semibold">{row.nickname}</Td>
                  {row.cells.map((cell, i) => (
                    <Td key={dates[i]} numeric className="p-1">
                      <select
                        value={cell.status ?? ''}
                        onChange={(e) =>
                          void setCell(
                            row.teamMemberId,
                            dates[i] as string,
                            (e.target.value || null) as AttendanceStatus | null,
                          )
                        }
                        className={`w-full cursor-pointer rounded-ctl border border-transparent px-1 py-1.5 text-center text-meta font-semibold focus:border-field ${
                          cell.status ? STATUS_STYLE[cell.status] : 'bg-transparent text-graphite'
                        }`}
                      >
                        <option value="">{he.common.none}</option>
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {label(s, row.gender)}
                          </option>
                        ))}
                      </select>
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-card">
                <Td className="font-semibold">{he.attendance.present}</Td>
                {(data?.presentPerDay ?? []).map((count, i) => (
                  <Td key={dates[i]} numeric className="font-bold text-field-dark">
                    {count}
                  </Td>
                ))}
              </tr>
            </tfoot>
          </table>
        </TableScroll>
      </Panel>

      {adding && <AddMemberDialog onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddMemberDialog({ onClose }: { onClose: () => void }) {
  const [nickname, setNickname] = useState('');
  const [gender, setGender] = useState<Gender>('M');
  const [create, { isLoading, error }] = useCreateTeamMemberMutation();

  async function submit(): Promise<void> {
    const result = await create({ nickname: nickname.trim(), gender });
    if (result.data) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-panel border border-rule bg-card-raised shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="rounded-t-panel border-b border-rule bg-card px-4 py-3">
          <h2 className="text-lead font-semibold">{he.attendance.addMember}</h2>
        </header>
        <div className="space-y-3 px-4 py-4">
          <TextField
            label={he.attendance.nickname}
            value={nickname}
            onChange={setNickname}
            autoFocus
            required
          />
          <div className="flex overflow-hidden rounded-ctl border border-rule-strong">
            {(['M', 'F'] as Gender[]).map((g) => (
              <button
                key={g}
                onClick={() => setGender(g)}
                className={`flex-1 px-3 py-2 text-body font-semibold ${
                  gender === g ? 'bg-field text-white' : 'bg-card-raised text-ink-soft'
                }`}
              >
                {g === 'M' ? he.attendance.male : he.attendance.female}
              </button>
            ))}
          </div>
          {apiErrorMessage(error) && (
            <p className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
              {apiErrorMessage(error)}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={() => void submit()} disabled={isLoading || !nickname.trim()}>
              {he.common.save}
            </Button>
            <Button variant="quiet" onClick={onClose}>
              {he.common.cancel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
