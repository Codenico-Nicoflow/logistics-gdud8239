import { useState } from 'react';
import {
  useCreateTeamMemberMutation,
  useSendAttendanceWeekMutation,
  useSetAttendanceMutation,
  useDeleteTeamMemberMutation,
  useWeekQuery,
} from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  Modal,
  Panel,
  Spinner,
  TableScroll,
  Td,
  Th,
  TextField,
} from '../../components/ui';
import { DeleteDialog } from '../../components/DeleteDialog';
import { useToast } from '../../components/toast';
import { useSlack } from '../slack/useSlack';
import { he } from '../../i18n/he';
import { todayIso } from '../../lib/dates';
import type { AttendanceStatus, AuthUser, Gender, WeekRow } from '../../lib/types';
import { DayView } from './AttendanceDayView';
import { presentLabel, StatusCell } from './statuses';

function shiftWeek(iso: string, weeks: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

/** How many whole weeks `anchor`'s Sunday is from this week's Sunday — 0 is
 *  the current week, -1 is last week, 1 is next week. Used to clamp
 *  לוגיסטיקה to ±1 without hardcoding date arithmetic twice. */
function weeksFromToday(anchor: string): number {
  const toSunday = (iso: string) => {
    const d = new Date(iso);
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return d.getTime();
  };
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.round((toSunday(anchor) - toSunday(todayIso())) / msPerWeek);
}

/**
 * `ימי יציאה` — the weekly grid, laid out the way the original sheet is: a row
 * per person, a column per day, and a present count along the bottom. Status is
 * chosen from a fixed list rather than typed, which removes the spelling drift
 * the spreadsheet accumulated.
 *
 * Only admin edits — חייל לוגיסטיקה sees the same grid read-only, and is
 * boxed into the week before/current/after so the screen stays about "what's
 * happening around now", not a free-roam archive. Admin can navigate and
 * jump to any week without that limit.
 */
export function AttendancePage({ user }: { user: AuthUser }) {
  const isAdmin = user.role === 'admin';
  const slack = useSlack();
  const [anchor, setAnchor] = useState(todayIso());
  const [adding, setAdding] = useState(false);
  const [sending, setSending] = useState(false);
  const [removing, setRemoving] = useState<WeekRow | null>(null);
  const { data, isLoading, isFetching } = useWeekQuery(anchor);
  const [setCells] = useSetAttendanceMutation();

  const offset = weeksFromToday(anchor);
  const canGoPrev = isAdmin || offset > -1;
  const canGoNext = isAdmin || offset < 1;

  async function setCell(
    teamMemberId: string,
    date: string,
    status: AttendanceStatus | null,
  ): Promise<void> {
    if (!isAdmin) return;
    await setCells({ cells: [{ teamMemberId, date, status }] });
  }

  if (isLoading) return <Spinner />;

  const dates = data?.dates ?? [];
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display font-bold">{he.attendance.title}</h1>
          <p className="mt-1 text-ink-soft">{he.attendance.subtitle}</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            {slack.isConfigured('attendance') && (
              <Button variant="quiet" onClick={() => setSending(true)} disabled={!data}>
                {he.attendance.sendToSlack}
              </Button>
            )}
            <Button variant="quiet" onClick={() => setAdding(true)}>
              {he.attendance.addMember}
            </Button>
          </div>
        )}
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <Button
            variant="quiet"
            size="sm"
            disabled={!canGoPrev}
            onClick={() => setAnchor((a) => shiftWeek(a, -1))}
          >
            {he.attendance.prevWeek}
          </Button>
          <Button variant="quiet" size="sm" onClick={() => setAnchor(todayIso())}>
            {he.attendance.thisWeek}
          </Button>
          <Button
            variant="quiet"
            size="sm"
            disabled={!canGoNext}
            onClick={() => setAnchor((a) => shiftWeek(a, 1))}
          >
            {he.attendance.nextWeek}
          </Button>
          {dates.length > 0 && (
            <span className="ms-2 text-meta text-graphite">
              {new Date(dates[0] as string).toLocaleDateString('he-IL')} –{' '}
              {new Date(dates[6] as string).toLocaleDateString('he-IL')}
            </span>
          )}
          {isFetching && <span className="text-meta text-graphite">{he.common.loading}</span>}
          {!isAdmin && (
            <span className="ms-auto text-meta text-graphite">{he.attendance.viewOnly}</span>
          )}
        </div>
      </Panel>

      {/* Desktop: the full grid. Hidden below `sm` — seven status cells per
       *  row has no honest way to fit a phone width. */}
      <Panel className="hidden sm:block">
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
                {isAdmin && <Th />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.teamMemberId}>
                  <Td className="whitespace-nowrap font-semibold">
                    {row.nickname}
                  </Td>
                  {row.cells.map((cell, i) => (
                    <Td key={dates[i]} numeric className="p-1">
                      <StatusCell
                        status={cell.status}
                        gender={row.gender}
                        editable={isAdmin}
                        onChange={(s) => void setCell(row.teamMemberId, dates[i] as string, s)}
                      />
                    </Td>
                  ))}
                  {isAdmin && (
                    <Td className="w-px whitespace-nowrap">
                      <Button variant="quiet" size="sm" onClick={() => setRemoving(row)}>
                        {he.attendance.removeMember}
                      </Button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-card">
                <Td className="font-semibold">{he.attendance.present}</Td>
                {(data?.presentPerDay ?? []).map((count, i) => (
                  <Td key={dates[i]} numeric className="font-bold text-field-dark">
                    {presentLabel(count, data?.returningPerDay[i] ?? 0)}
                  </Td>
                ))}
              </tr>
            </tfoot>
          </table>
        </TableScroll>
      </Panel>

      {/* Phone: day first. Seven day tabs (each with its headcount) and the chosen day's whole list —
       *  the grid's own shape has no honest way to fit a phone width, and a card per person with seven
       *  lines each is a very long page that hides the totals. */}
      {data && <DayView week={data} isAdmin={isAdmin} onChange={setCell} onRemove={setRemoving} />}

      {adding && <AddMemberDialog onClose={() => setAdding(false)} />}
      {sending && data && (
        <SendWeekDialog anchor={anchor} dates={data.dates} onClose={() => setSending(false)} />
      )}
      {removing && <DeleteMemberDialog row={removing} onClose={() => setRemoving(null)} />}
    </div>
  );
}

function DeleteMemberDialog({ row, onClose }: { row: WeekRow; onClose: () => void }) {
  const [deleteMember, { isLoading }] = useDeleteTeamMemberMutation();
  const toast = useToast();

  async function submit(): Promise<void> {
    const result = await deleteMember(row.teamMemberId);
    if ('error' in result) {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
      return;
    }
    toast.success({ title: he.attendance.memberRemoved, detail: row.nickname });
    onClose();
  }

  return (
    <DeleteDialog
      title={he.attendance.removeTitle}
      body={he.attendance.removeBody(row.nickname)}
      isLoading={isLoading}
      onConfirm={() => void submit()}
      onCancel={onClose}
    />
  );
}

/**
 * Posts the week on screen to Slack. Outward-facing — the whole channel sees it — so it asks
 * first, naming the week, rather than firing on a single click.
 */
function SendWeekDialog({ anchor, dates, onClose }: { anchor: string; dates: string[]; onClose: () => void }) {
  const [send, { isLoading }] = useSendAttendanceWeekMutation();
  const toast = useToast();
  const label = `${new Date(dates[0] as string).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })} – ${new Date(
    dates[6] as string,
  ).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })}`;

  async function submit(): Promise<void> {
    const result = await send({ date: anchor });
    if ('error' in result) {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
      return;
    }
    if (!result.data.sent) {
      toast.error({ title: he.toast.failed, detail: result.data.error });
      return;
    }
    toast.success({ title: he.attendance.sent, detail: label });
    onClose();
  }

  return (
    <Modal onClose={onClose} className="w-full max-w-sm">
      <div className="space-y-3 px-5 py-5">
        <h2 className="text-lead font-semibold">{he.attendance.sendTitle}</h2>
        <p className="text-meta text-ink-soft">{he.attendance.sendBody(label)}</p>
        <div className="flex gap-2 pt-1">
          <Button onClick={() => void submit()} disabled={isLoading}>
            {he.attendance.sendAction}
          </Button>
          <Button variant="quiet" onClick={onClose} disabled={isLoading}>
            {he.common.cancel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AddMemberDialog({ onClose }: { onClose: () => void }) {
  const [nickname, setNickname] = useState('');
  const [gender, setGender] = useState<Gender>('M');
  const [create, { isLoading, error }] = useCreateTeamMemberMutation();
  const toast = useToast();

  async function submit(): Promise<void> {
    // Only the roster change is announced. Setting a cell is a single click
    // that shows its own result in the grid, and a toast per cell would bury
    // the screen while a week is filled in.
    const result = await create({ nickname: nickname.trim(), gender });
    if (result.data) {
      toast.success({ title: he.attendance.memberAdded, detail: nickname.trim() });
      onClose();
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  return (
    <Modal onClose={onClose} className="w-full max-w-sm">
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
    </Modal>
  );
}
