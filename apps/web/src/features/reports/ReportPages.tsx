import { useAllocationsQuery, useCompanyMatrixQuery, useSummaryQuery } from '../../lib/api';
import {
  EmptyState,
  Panel,
  Spinner,
  TableScroll,
  Tag,
  Td,
  Th,
} from '../../components/ui';

import { he } from '../../i18n/he';
import { COMPANIES } from '../../lib/types';

/** `מסכם` — computed, so it cannot drift from the signatures the way the sheet did. */
export function SummaryPage() {
  const { data, isLoading } = useSummaryQuery();
  if (isLoading) return <Spinner />;

  const rows = (data ?? []).filter((r) => r.issued > 0 || r.authorized > 0);

  return (
    <div className="space-y-5">
      <h1 className="text-display font-bold">{he.summary.title}</h1>
      <Panel>
        <TableScroll>
          <table className="row-hover w-full">
            <thead>
              <tr>
                <Th>{he.summary.item}</Th>
                <Th numeric>{he.summary.issued}</Th>
                <Th numeric>{he.summary.inArmory}</Th>
                <Th numeric>{he.summary.faulty}</Th>
                <Th numeric>{he.summary.total}</Th>
                <Th numeric>{he.summary.authorized}</Th>
                <Th numeric>{he.summary.gap}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.itemName}>
                  <Td className="font-semibold">{r.itemName}</Td>
                  <Td numeric>{r.issued}</Td>
                  <Td numeric>{r.inArmory}</Td>
                  <Td numeric className={r.faulty ? 'text-oxide' : undefined}>
                    {r.faulty}
                  </Td>
                  <Td numeric>{r.total}</Td>
                  <Td numeric>{r.authorized}</Td>
                  <Td numeric>
                    {r.gap === 0 ? (
                      <span className="text-graphite">0</span>
                    ) : (
                      <Tag tone="oxide">{r.gap}</Tag>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Panel>
    </div>
  );
}

/** `פלוגות` — the item x company matrix. */
export function CompaniesPage() {
  const { data, isLoading } = useCompanyMatrixQuery();
  if (isLoading) return <Spinner />;

  const rows = (data ?? []).filter((r) => r.total > 0);

  return (
    <div className="space-y-5">
      <h1 className="text-display font-bold">{he.companiesReport.title}</h1>
      <Panel>
        <TableScroll>
          <table className="row-hover w-full">
            <thead>
              <tr>
                <Th>{he.companiesReport.item}</Th>
                {COMPANIES.map((c) => (
                  <Th key={c} numeric>
                    {he.companies[c]}
                  </Th>
                ))}
                <Th numeric>{he.companiesReport.total}</Th>
                <Th numeric>{he.companiesReport.inArmory}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.itemName}>
                  <Td className="font-semibold">{r.itemName}</Td>
                  {COMPANIES.map((c) => (
                    <Td
                      key={c}
                      numeric
                      className={
                        r.byCompany[c] === 0 ? 'text-graphite/60' : 'font-semibold text-field-dark'
                      }
                    >
                      {r.byCompany[c]}
                    </Td>
                  ))}
                  <Td numeric className="font-semibold">
                    {r.total}
                  </Td>
                  <Td numeric className="text-graphite">
                    {r.inArmory}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Panel>
    </div>
  );
}

/** `הקצאות` — targets with `נשאר לחתום` computed rather than typed in. */
export function AllocationsPage() {
  const { data, isLoading } = useAllocationsQuery();
  if (isLoading) return <Spinner />;
  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-display font-bold">{he.allocations.title}</h1>
      {rows.length === 0 ? (
        <Panel>
          <EmptyState>{he.common.noResults}</EmptyState>
        </Panel>
      ) : (
        <Panel>
          <TableScroll>
            <table className="row-hover w-full">
              <thead>
                <tr>
                  <Th>{he.allocations.item}</Th>
                  <Th />
                  {COMPANIES.map((c) => (
                    <Th key={c} numeric>
                      {he.companies[c]}
                    </Th>
                  ))}
                  <Th numeric>{he.allocations.totalTarget}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <>
                    <tr key={`${r.itemName}-t`}>
                      <Td className="font-semibold" >{r.itemName}</Td>
                      <Td className="text-meta text-graphite">{he.allocations.target}</Td>
                      {COMPANIES.map((c) => (
                        <Td key={c} numeric>
                          {r.targets[c]}
                        </Td>
                      ))}
                      <Td numeric className="font-semibold">
                        {r.totalTarget}
                      </Td>
                    </tr>
                    <tr key={`${r.itemName}-r`} className="bg-card">
                      <Td />
                      <Td className="text-meta text-graphite">{he.allocations.remaining}</Td>
                      {COMPANIES.map((c) => {
                        const value = r.remaining[c];
                        return (
                          <Td key={c} numeric>
                            {value === 0 ? (
                              <span className="text-graphite">0</span>
                            ) : (
                              <span className={value > 0 ? 'font-semibold text-oxide' : 'text-field'}>
                                {value}
                              </span>
                            )}
                          </Td>
                        );
                      })}
                      <Td />
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Panel>
      )}
    </div>
  );
}
