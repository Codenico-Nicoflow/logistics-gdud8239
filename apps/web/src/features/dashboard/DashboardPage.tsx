import { Link } from 'react-router-dom';
import {
  useCompanyMatrixQuery,
  useMovementsQuery,
  useNeedsAttentionQuery,
  useSummaryQuery,
} from '../../lib/api';
import {
  EmptyState,
  Figure,
  Panel,
  Serial,
  Spinner,
  TableScroll,
  Tag,
  Td,
  Th,
  formatDateTime,
} from '../../components/ui';
import { he } from '../../i18n/he';
import { COMPANIES, type Company } from '../../lib/types';

/** A distinct shade per company, so the bars are comparable and identifiable. */
const COMPANY_COLOR: Record<Company, string> = {
  A: 'var(--field)',
  B: 'var(--cat-optics)',
  C: 'var(--cat-drone)',
  SUPPORT: 'var(--field-bright)',
  HQ: 'var(--brass-bright)',
};

export function DashboardPage() {
  const summary = useSummaryQuery();
  const matrix = useCompanyMatrixQuery();
  const movements = useMovementsQuery({ take: 8 });
  const attention = useNeedsAttentionQuery();

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
        <Figure label={he.dashboard.gaps} value={gapRows.length} tone={gapRows.length ? 'oxide' : 'ink'} />
        <Figure
          label={he.dashboard.needsAttention}
          value={attentionCount}
          tone={attentionCount ? 'oxide' : 'ink'}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={he.dashboard.byCompany}>
          <div className="space-y-2 px-4 py-4">
            {perCompany.map(({ company, count }) => (
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
                      width: `${(count / maxCompany) * 100}%`,
                      background: COMPANY_COLOR[company],
                    }}
                  />
                </span>
                <span className="w-12 shrink-0 text-start text-meta font-semibold">{count}</span>
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

      <Panel
        title={he.dashboard.recentActivity}
        action={
          <Link to="/movements" className="text-meta font-semibold text-field hover:underline">
            {he.movements.title}
          </Link>
        }
      >
        {movements.isLoading ? (
          <Spinner />
        ) : (movements.data?.rows.length ?? 0) === 0 ? (
          <EmptyState>{he.dashboard.noActivity}</EmptyState>
        ) : (
          <TableScroll>
            <table className="row-hover w-full">
              <thead>
                <tr>
                  <Th>{he.movements.when}</Th>
                  <Th>{he.movements.action}</Th>
                  <Th>{he.movements.soldier}</Th>
                  <Th>{he.movements.item}</Th>
                  <Th>{he.movements.serial}</Th>
                  <Th>{he.movements.performedBy}</Th>
                </tr>
              </thead>
              <tbody>
                {movements.data?.rows.map((m) => (
                  <tr key={m.id}>
                    <Td className="whitespace-nowrap text-meta text-graphite">
                      {formatDateTime(m.occurredAt)}
                    </Td>
                    <Td>
                      <Tag tone={m.action === 'ISSUE' ? 'field' : m.action === 'RETURN' ? 'neutral' : 'brass'}>
                        {he.actions[m.action]}
                      </Tag>
                    </Td>
                    <Td>{m.soldierName}</Td>
                    <Td>{m.itemName}</Td>
                    <Td>
                      <Serial value={m.serial} />
                    </Td>
                    <Td className="text-meta text-graphite">{m.performedBy}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>
    </div>
  );
}
