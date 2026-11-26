import { useMemo, useState } from 'react';
import {
  useCompanySoldiersQuery,
  useSetSoldierAllocationMutation,
  useSoldierAllocationsQuery,
} from '../../lib/api';
import { apiErrorMessage, Button, CategoryDot, Checkbox, EmptyState, Panel, SearchField, Spinner } from '../../components/ui';
import { he } from '../../i18n/he';
import type { Company, CompanySoldierRef, SoldierAllocationRow } from '../../lib/types';

const cellKey = (soldierId: string, itemId: string): string => `${soldierId}:${itemId}`;

/**
 * A company commander's (סגן מפקד פלוגה) own screen: one row per soldier, one
 * column per item the samgad allocated to the company, a count in each cell,
 * and a single שמור for the whole matrix. Planning only — capped per column
 * against the company's own quantity from חלוקה לפלוגות, never against anything
 * a real 1008 can issue. Scoped server-side to the commander's own
 * companyScope; `company` is only meaningful when an admin looks in on a
 * specific company — the server requires it then.
 */
export function SoldierAllocationGrid({
  servicePeriodId,
  company,
}: {
  servicePeriodId: string;
  company?: Company;
}) {
  const { data: rows, isLoading: rowsLoading } = useSoldierAllocationsQuery({ servicePeriodId, company });
  const { data: soldiers, isLoading: soldiersLoading } = useCompanySoldiersQuery({ servicePeriodId, company });

  if (rowsLoading || soldiersLoading) return <Spinner />;

  const items = rows ?? [];
  const soldierList = soldiers ?? [];

  return (
    <Panel title={he.servicePeriods.soldierGrid}>
      <div className="px-4 py-3">
        <p className="text-meta text-graphite">{he.servicePeriods.soldierGridHint}</p>
      </div>

      {items.length === 0 ? (
        <EmptyState>{he.servicePeriods.noCompanyItems}</EmptyState>
      ) : soldierList.length === 0 ? (
        <EmptyState>{he.servicePeriods.noCompanySoldiers}</EmptyState>
      ) : (
        <AllocationMatrix servicePeriodId={servicePeriodId} items={items} soldiers={soldierList} />
      )}
    </Panel>
  );
}

/**
 * One soldier's allocation of one item: a checkbox, so at most one each — the
 * plan is "does this soldier get one", never a count. Shared by the table and
 * the phone cards so neither render carries its own copy of the rules.
 */
function AllocationCell({
  value,
  label,
  invalid,
  onChange,
}: {
  value: number;
  label: string;
  invalid: boolean;
  onChange: (next: number) => void;
}) {
  return <Checkbox checked={value > 0} ariaLabel={label} invalid={invalid} onChange={(on) => onChange(on ? 1 : 0)} />;
}

function AllocationMatrix({
  servicePeriodId,
  items,
  soldiers,
}: {
  servicePeriodId: string;
  items: SoldierAllocationRow[];
  soldiers: CompanySoldierRef[];
}) {
  const [set] = useSetSoldierAllocationMutation();
  const [isSaving, setIsSaving] = useState(false);
  // Only what the operator changed, layered over the server's values — a
  // refetch after save can never clobber an untouched cell, and "dirty" is
  // simply "edit differs from server".
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');

  const serverValue = (soldierId: string, row: SoldierAllocationRow): number => row.bySoldier[soldierId] ?? 0;
  const valueOf = (soldierId: string, row: SoldierAllocationRow): number =>
    edits[cellKey(soldierId, row.itemId)] ?? serverValue(soldierId, row);

  // Filters what's shown only — edits for soldiers hidden by the search stay
  // in state, so clearing the search never drops a value already set.
  const visibleSoldiers = useMemo(() => {
    if (!query) return soldiers;
    return soldiers.filter((s) => `${s.firstName} ${s.lastName}`.includes(query));
  }, [soldiers, query]);

  const totals = useMemo(() => {
    const byItem: Record<string, number> = {};
    for (const row of items) {
      byItem[row.itemId] = soldiers.reduce(
        (sum, s) => sum + (edits[cellKey(s.id, row.itemId)] ?? row.bySoldier[s.id] ?? 0),
        0,
      );
    }
    return byItem;
  }, [items, soldiers, edits]);

  const overItems = items.filter((r) => (totals[r.itemId] ?? 0) > r.companyQuantity);
  const dirtyCells = soldiers.flatMap((s) =>
    items
      .filter((r) => valueOf(s.id, r) !== serverValue(s.id, r))
      .map((r) => ({ soldierId: s.id, itemId: r.itemId, quantity: valueOf(s.id, r), previous: serverValue(s.id, r) })),
  );
  const hasOverCap = overItems.length > 0;

  function patch(soldierId: string, itemId: string, value: number): void {
    setEdits((m) => ({ ...m, [cellKey(soldierId, itemId)]: value }));
    setErrors((m) => {
      const key = cellKey(soldierId, itemId);
      if (!(key in m)) return m;
      const { [key]: _dropped, ...rest } = m;
      return rest;
    });
  }

  async function handleSave(): Promise<void> {
    if (hasOverCap) return; // the button is disabled for this, but never trust only that
    setIsSaving(true);
    const nextErrors: Record<string, string> = {};

    // The server checks the cap one soldier at a time, so apply decreases
    // first: a column that is within cap overall never trips a 409 mid-batch.
    const ordered = [...dirtyCells].sort((a, b) => a.quantity - a.previous - (b.quantity - b.previous));
    for (const cell of ordered) {
      const result = await set({ servicePeriodId, itemId: cell.itemId, soldierId: cell.soldierId, quantity: cell.quantity });
      if (result.error) nextErrors[cellKey(cell.soldierId, cell.itemId)] = apiErrorMessage(result.error) ?? he.toast.failed;
    }

    setIsSaving(false);
    setErrors(nextErrors);
  }

  const cellProps = (soldier: CompanySoldierRef, row: SoldierAllocationRow) => ({
    value: valueOf(soldier.id, row),
    label: `${soldier.firstName} ${soldier.lastName} — ${row.item.name}`,
    invalid: (totals[row.itemId] ?? 0) > row.companyQuantity || cellKey(soldier.id, row.itemId) in errors,
    onChange: (next: number) => patch(soldier.id, row.itemId, next),
  });

  return (
    <div className="border-t border-rule">
      {hasOverCap && (
        <ul className="border-b border-rule bg-oxide-wash px-4 py-2 text-meta text-oxide">
          {overItems.map((r) => (
            <li key={r.itemId}>
              {r.item.name}: {he.servicePeriods.capExceededCannotSave(r.companyQuantity)}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
        <SearchField
          value={query}
          onSearch={setQuery}
          placeholder={he.servicePeriods.searchSoldier}
          debounceMs={0}
          className="w-full max-w-xs"
        />
        <span className="text-meta text-graphite">
          {query
            ? he.servicePeriods.soldierCountFiltered(visibleSoldiers.length, soldiers.length)
            : he.servicePeriods.soldierCount(soldiers.length)}
        </span>
      </div>

      {visibleSoldiers.length === 0 ? (
        <p className="px-4 py-6 text-center text-graphite">{he.servicePeriods.noSoldierMatch}</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full border-collapse text-body">
              <thead>
                <tr className="border-y border-rule bg-card text-start">
                  <th className="sticky start-0 z-10 bg-card px-4 py-2 text-start font-semibold">
                    {he.servicePeriods.soldierColumn}
                  </th>
                  {items.map((r) => {
                    const over = (totals[r.itemId] ?? 0) > r.companyQuantity;
                    return (
                      <th key={r.itemId} className="min-w-28 px-3 py-2 text-center align-bottom font-semibold">
                        <span className="flex items-center justify-center gap-1.5">
                          <CategoryDot category={r.item.category} />
                          {r.item.name}
                        </span>
                        <span
                          className={`block text-meta font-semibold transition-colors ${over ? 'text-oxide' : 'text-ink-soft'}`}
                        >
                          {he.servicePeriods.totalOfCompany(totals[r.itemId] ?? 0, r.companyQuantity)}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {visibleSoldiers.map((s) => (
                  <tr key={s.id}>
                    <td className="sticky start-0 z-10 bg-card-raised px-4 py-2 font-semibold">
                      {s.firstName} {s.lastName}
                    </td>
                    {items.map((r) => {
                      const error = errors[cellKey(s.id, r.itemId)];
                      return (
                        <td key={r.itemId} className="px-3 py-2 text-center align-top">
                          <div className="flex flex-col items-center gap-0.5">
                            <AllocationCell {...cellProps(s, r)} />
                            {error && <p className="max-w-28 text-micro text-oxide">{error}</p>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-rule border-t border-rule sm:hidden">
            {visibleSoldiers.map((s) => (
              <li key={s.id} className="space-y-2 px-4 py-3">
                <p className="font-semibold">
                  {s.firstName} {s.lastName}
                </p>
                <ul className="space-y-2">
                  {items.map((r) => {
                    const error = errors[cellKey(s.id, r.itemId)];
                    return (
                      <li key={r.itemId} className="flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-1.5 text-meta">
                          <CategoryDot category={r.item.category} />
                          <span className="truncate">{r.item.name}</span>
                          <span
                            className={`shrink-0 ${(totals[r.itemId] ?? 0) > r.companyQuantity ? 'text-oxide' : 'text-graphite'}`}
                          >
                            ({he.servicePeriods.totalOfCompany(totals[r.itemId] ?? 0, r.companyQuantity)})
                          </span>
                        </span>
                        <div className="flex flex-col items-end gap-0.5">
                          <AllocationCell {...cellProps(s, r)} />
                          {error && <p className="text-micro text-oxide">{error}</p>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="flex justify-end border-t border-rule px-4 py-3">
        <Button onClick={() => void handleSave()} disabled={isSaving || dirtyCells.length === 0 || hasOverCap}>
          {isSaving ? he.common.saving : he.common.save}
        </Button>
      </div>
    </div>
  );
}
