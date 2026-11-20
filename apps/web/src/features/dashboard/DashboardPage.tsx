import { Link } from 'react-router-dom';
import {
  useCompanyMatrixQuery,
  useLatestCountQuery,
  useMeQuery,
  useNeedsAttentionQuery,
  useSummaryQuery,
  useTodayQuery,
} from '../../lib/api';
import {
  EmptyState,
  Figure,
  Panel,
  Spinner,
  TableScroll,
  Tag,
  Td,
  Th,
} from '../../components/ui';
import { he } from '../../i18n/he';
import { COMPANIES, type AttendanceStatus, type Company, type TodayMember } from '../../lib/types';

/** A distinct shade per company, so the bars are comparable and identifiable. */
const COMPANY_COLOR: Record<Company, string> = {
  A: 'var(--field)',
  B: 'var(--cat-optics)',
  C: 'var(--cat-drone)',
  SUPPORT: 'var(--field-bright)',
  HQ: 'var(--brass-bright)',
};

const STATUS_TONE: Record<AttendanceStatus, 'field' | 'brass' | 'oxide' | 'neutral'> = {
  PRESENT: 'field',
  RETURNING: 'field',
  LEAVING: 'brass',
  ON_LEAVE: 'neutral',
  GIMELIM: 'oxide',
  CLOSED_ORDER: 'oxide',
  OTHER: 'neutral',
};

/** Whole days between a count's date and today. */
function daysSince(iso: string): number {
  const then = new Date(iso);
  const now = new Date();
  const a = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b - a) / 86_400_000);
}

export function DashboardPage() {
  const summary = useSummaryQuery();
  const matrix = useCompanyMatrixQuery();
  const attention = useNeedsAttentionQuery();
  const today = useTodayQuery();
  const count = useLatestCountQuery();
  const me = useMeQuery();

  if (summary.isLoading) return <Spinner />;

  const rows = summary.data ?? [];
  const issued = rows.reduce((sum, r) => sum + r.issued, 0);
  // Only counted items contribute: a number nobody verified should not be
  // presented as if it were on the shelf.
  const countedRows = rows.filter((r) => r.inArmory !== null);
  const inArmory = countedRows.reduce((sum, r) => sum + (r.inArmory ?? 0), 0);
  const uncounted = rows.length - countedRows.length;
  const gapRows = rows
    .filter((r) => r.gap !== null && r.gap !== 0)
    .sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0));
  const attentionCount = attention.data?.issues.length ?? 0;

  const perCompany = COMPANIES.map((company) => ({
    company,
    count: (matrix.data ?? []).reduce((sum, r) => sum + r.byCompany[company], 0),
  }));
  const maxCompany = Math.max(1, ...perCompany.map((c) => c.count));

  return (
    <div className="space-y-5">
      <h1 className="text-display font-bold">{he.dashboard.title}</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label={he.dashboard.signedOut} value={issued} tone="field" />
        <Figure
          label={he.dashboard.inArmory}
          value={countedRows.length === 0 ? he.common.none : inArmory}
          hint={uncounted > 0 ? he.dashboard.uncounted(uncounted) : undefined}
        />
        <Figure
          label={he.dashboard.gaps}
          value={gapRows.length}
          tone={gapRows.length ? 'oxide' : 'ink'}
          // A gap can only be found on an item somebody counted, so the number
          // of unchecked items belongs next to it — without that, "0 gaps"
          // reads as "all clear" when most of the shelf was never looked at.
          hint={uncounted > 0 ? he.dashboard.uncounted(uncounted) : undefined}
        />
        <Figure
          label={he.dashboard.needsAttention}
          value={attentionCount}
          tone={attentionCount ? 'oxide' : 'ink'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <WhoIsHere
          data={today.data}
          isLoading={today.isLoading}
          canEdit={me.data?.user?.role !== 'viewer'}
        />
        <LastCount data={count.data} isLoading={count.isLoading} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={he.dashboard.byCompany}>
          <div className="space-y-2 px-4 py-4">
            {perCompany.map(({ company, count: total }) => (
              <div key={company} className="flex items-center gap-3">
                <span className="w-16 shrink-0 text-meta text-ink-soft">
                  {he.companies[company]}
                </span>
                {/* A plain proportional bar: the comparison is the point, so it
                    is drawn directly rather than wrapped in a chart. */}
                <span className="h-6 flex-1 overflow-hidden rounded-ctl border border-rule bg-card">
                  <span
                    className="block h-full rounded-ctl transition-all"
                    style={{
                      width: `${(total / maxCompany) * 100}%`,
                      background: COMPANY_COLOR[company],
                    }}
                  />
                </span>
                <span className="w-12 shrink-0 text-start text-meta font-semibold">{total}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title={he.dashboard.topGaps}>
          {gapRows.length === 0 ? (
            <EmptyState>{he.dashboard.noGaps}</EmptyState>
          ) : (
            <TableScroll>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>{he.summary.item}</Th>
                    <Th numeric>{he.summary.authorized}</Th>
                    <Th numeric>{he.summary.total}</Th>
                    <Th numeric>{he.summary.gap}</Th>
                  </tr>
                </thead>
                <tbody>
                  {gapRows.slice(0, 6).map((r) => (
                    <tr key={r.itemName}>
                      <Td className="font-semibold">{r.itemName}</Td>
                      <Td numeric>{r.authorized}</Td>
                      <Td numeric>{r.total ?? he.common.none}</Td>
                      <Td numeric>
                        <Tag tone="oxide">
                          {(r.gap ?? 0) > 0 ? `חסר ${r.gap}` : `עודף ${-(r.gap ?? 0)}`}
                        </Tag>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </Panel>
      </div>
    </div>
  );
}

/**
 * Today's roster, grouped by status.
 *
 * The weekly grid in ימי יציאה answers what the week looks like; the question
 * at the start of a shift is narrower — who is on base right now. People whose
 * cell is still blank are shown as such rather than counted absent, because
 * nobody has said yet.
 */
function WhoIsHere({
  data,
  isLoading,
  canEdit,
}: {
  data: import('../../lib/types').Today | undefined;
  isLoading: boolean;
  /** ימי יציאה is closed to viewers, so they are not offered a dead link. */
  canEdit: boolean;
}) {
  return (
    <Panel
      title={he.dashboard.whoIsHere}
      action={
        canEdit ? (
          <Link to="/attendance" className="text-meta font-semibold text-field hover:underline">
            {he.dashboard.fillAttendance}
          </Link>
        ) : undefined
      }
    >
      {isLoading ? (
        <Spinner />
      ) : !data || data.total === 0 ? (
        <EmptyState>{he.dashboard.noTeam}</EmptyState>
      ) : (
        <div className="space-y-3 px-4 py-4">
          <div className="flex items-baseline gap-2">
            <span className="text-figure font-bold text-field-dark">{data.present}</span>
            <span className="text-meta text-graphite">
              {he.dashboard.present} / {data.total}
            </span>
          </div>

          {data.byStatus.map(({ status, members }) => (
            <div key={status} className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 shrink-0 text-meta font-semibold text-ink-soft">
                {he.attendance.statuses[status]}
              </span>
              {members.map((m) => (
                <Tag key={m.teamMemberId} tone={STATUS_TONE[status]}>
                  {m.nickname}
                </Tag>
              ))}
            </div>
          ))}

          {data.unmarked.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-rule pt-3">
              <span className="w-16 shrink-0 text-meta font-semibold text-graphite">
                {he.dashboard.unmarked}
              </span>
              {data.unmarked.map((m: TodayMember) => (
                <Tag key={m.teamMemberId}>{m.nickname}</Tag>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

/**
 * Whether last night's count was actually done.
 *
 * An item nobody counted is reported apart from an item that was counted and
 * disagreed: the first is unfinished work, the second is a discrepancy to
 * chase. The age of the count is shown because a stale one is the easiest
 * thing to overlook.
 */
function LastCount({
  data,
  isLoading,
}: {
  data: import('../../lib/types').LatestCount | undefined;
  isLoading: boolean;
}) {
  const session = data?.session;
  const age = session ? daysSince(session.sessionDate) : null;
  const stale = age !== null && age > 0;

  return (
    <Panel
      title={he.dashboard.lastCount}
      action={
        <Link to="/counts" className="text-meta font-semibold text-field hover:underline">
          {he.counts.title}
        </Link>
      }
    >
      {isLoading ? (
        <Spinner />
      ) : !session ? (
        <EmptyState>{he.dashboard.noCount}</EmptyState>
      ) : (
        <div className="space-y-2 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-lead font-bold ${stale ? 'text-oxide' : 'text-field-dark'}`}>
              {he.dashboard.daysAgo(age ?? 0)}
            </span>
            <span className="text-meta text-graphite">
              {new Date(session.sessionDate).toLocaleDateString('he-IL')} ·{' '}
              {session.shift === 'EVENING' ? he.counts.evening : he.counts.morning}
            </span>
            <Tag tone={session.isClosed ? 'field' : 'brass'}>
              {session.isClosed ? he.dashboard.countClosed : he.dashboard.countOpen}
            </Tag>
          </div>
          {session.recordedBy && (
            <span className="text-meta text-graphite">{he.dashboard.countedBy(session.recordedBy)}</span>
          )}
        </div>
      )}
    </Panel>
  );
}
