import { useMemo, useState } from 'react';
import {
  useActiveServicePeriodQuery,
  useCompanyAllocationsQuery,
  useCompanyMatrixQuery,
} from '../../lib/api';
import {
  CategoryDot,
  EmptyState,
  Figure,
  Panel,
  Select,
  Spinner,
  TableScroll,
  Td,
  TextField,
  Th,
} from '../../components/ui';
import { he } from '../../i18n/he';
import { COMPANIES, type Company, type ItemCategory, type MatrixRow } from '../../lib/types';

/** What a company holds of one item. A zero is a dash, so the counts stand out. */
function Held({ value }: { value: number }) {
  return value === 0 ? (
    <span className="text-graphite">{he.companySplit.none}</span>
  ) : (
    <span className="text-lead font-bold">{value}</span>
  );
}

/**
 * `חלוקה לפלוגות` — read-only. What each company holds right now, from the open
 * signatures of its soldiers: no plan, no "what is left". Lists the same items
 * as מסכם (the catalog's `מופיע במסכם` flag), in the catalog's order, so an item
 * nobody holds yet still shows with a dash.
 */
export function CompanySplitPage() {
  const { data, isLoading } = useCompanyMatrixQuery();
  const period = useActiveServicePeriodQuery();
  const periodId = period.data?.id ?? '';
  const allocations = useCompanyAllocationsQuery(periodId, { skip: !periodId });
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<ItemCategory | ''>('');

  const rows = useMemo(() => (data ?? []).filter((r) => r.inSummary), [data]);

  const totals = useMemo(() => {
    const t = Object.fromEntries(COMPANIES.map((c) => [c, 0])) as Record<Company, number>;
    for (const r of rows) for (const c of COMPANIES) t[c] += r.byCompany[c];
    return t;
  }, [rows]);

  // Allocation use, per company, over the items on the תקופת שרות grid: how
  // much of what was allocated has actually been handed out. Capped per item,
  // so one item issued past its share cannot hide another that is untouched.
  const usage = useMemo(() => {
    const u = Object.fromEntries(
      COMPANIES.map((c) => [c, { allocated: 0, used: 0, over: 0 }]),
    ) as Record<Company, { allocated: number; used: number; over: number }>;
    for (const row of allocations.data ?? []) {
      for (const c of COMPANIES) {
        const planned = row.quantities[c];
        const issued = row.issued[c];
        u[c].allocated += planned;
        u[c].used += Math.min(issued, planned);
        u[c].over += Math.max(issued - planned, 0);
      }
    }
    return u;
  }, [allocations.data]);
  const grand = COMPANIES.reduce((sum, c) => sum + totals[c], 0);

  const categories = useMemo(() => [...new Set(rows.map((r) => r.category))], [rows]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r: MatrixRow) =>
        (!category || r.category === category) &&
        (!needle || r.itemName.toLowerCase().includes(needle)),
    );
  }, [rows, q, category]);

  if (isLoading || period.isLoading) return <Spinner />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-display font-bold">{he.companySplit.title}</h1>
        <p className="mt-1 text-ink-soft">{he.companySplit.subtitle}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {COMPANIES.map((c) => {
          const u = usage[c];
          const pct = u.allocated === 0 ? null : Math.round((u.used / u.allocated) * 100);
          return (
            <div
              key={c}
              className="space-y-2 rounded-panel border border-rule bg-card-raised p-4 shadow-panel"
            >
              <div className="text-meta font-semibold text-ink-soft">
                {he.companySplit.company} {he.companies[c]}
              </div>
              <div>
                <div className="text-figure font-bold text-field-dark">{totals[c]}</div>
                <div className="text-micro text-graphite">{he.companySplit.heldLabel}</div>
              </div>
              <div className="border-t border-rule pt-2">
                {pct === null ? (
                  <span className="text-meta text-graphite">{he.companySplit.noAllocation}</span>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between">
                      <span className="text-micro text-graphite">{he.companySplit.usage}</span>
                      <span className="text-lead font-bold">{pct}%</span>
                    </div>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-card">
                      <span
                        className="block h-full rounded-full bg-field transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <div className="mt-1 text-micro text-graphite">
                      {he.companySplit.usedOf(u.used, u.allocated)}
                    </div>
                    {u.over > 0 && (
                      <div className="text-micro font-semibold text-oxide">
                        {he.companySplit.overBy(u.over)}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="-mt-2 text-meta text-graphite">{he.companySplit.percentHint}</p>

      <div className="grid grid-cols-2 gap-3">
        <Figure label={he.companySplit.items} value={rows.length} />
        <Figure label={he.companySplit.heldTotal} value={grand} tone="field" />
      </div>

      <Panel>
        <div className="flex flex-wrap items-end gap-3 border-b border-rule px-4 py-3">
          <TextField
            label={he.companySplit.search}
            value={q}
            onChange={setQ}
            placeholder={he.companySplit.searchPlaceholder}
            className="w-64"
          />
          <Select
            label={he.companySplit.category}
            value={category}
            onChange={(v) => setCategory(v)}
            options={[
              { value: '', label: he.companySplit.allCategories },
              ...categories.map((c) => ({ value: c, label: he.categories[c] })),
            ]}
            className="w-44"
          />
        </div>

        {visible.length === 0 ? (
          <EmptyState>{he.common.noResults}</EmptyState>
        ) : (
          <>
            <div className="hidden sm:block">
              <TableScroll>
                <table className="row-hover w-full">
                  <thead>
                    <tr>
                      <Th>{he.companySplit.item}</Th>
                      {COMPANIES.map((c) => (
                        <Th key={c} numeric>
                          {he.companies[c]}
                        </Th>
                      ))}
                      <Th numeric>{he.companySplit.rowTotal}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => (
                      <tr key={row.itemId}>
                        <Td>
                          <span className="flex items-center gap-2 font-semibold">
                            <CategoryDot category={row.category} />
                            {row.itemName}
                          </span>
                        </Td>
                        {COMPANIES.map((c) => (
                          <Td key={c} numeric>
                            <Held value={row.byCompany[c]} />
                          </Td>
                        ))}
                        <Td numeric>
                          <span className="font-bold text-field-dark">{row.total}</span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </div>

            <ul className="divide-y divide-rule sm:hidden">
              {visible.map((row) => (
                <li key={row.itemId} className="space-y-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-semibold">
                      <CategoryDot category={row.category} />
                      {row.itemName}
                    </span>
                    <span className="font-bold text-field-dark">{row.total}</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1 text-center">
                    {COMPANIES.map((c) => (
                      <div key={c}>
                        <div className="text-micro text-graphite">{he.companies[c]}</div>
                        <Held value={row.byCompany[c]} />
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}
