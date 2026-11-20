import { useMemo, useState } from 'react';
import {
  useCompanySoldiersQuery,
  useSetSoldierAllocationMutation,
  useSoldierAllocationsQuery,
} from '../../lib/api';
import { apiErrorMessage, Button, CategoryDot, EmptyState, Panel, Select, Spinner } from '../../components/ui';
import { he } from '../../i18n/he';
import type { Company, CompanySoldierRef, SoldierAllocationRow } from '../../lib/types';

/**
 * A company commander's (סגן מפקד פלוגה) own screen. Not a grid: once a
 * company has dozens of soldiers, one column per soldier stops fitting any
 * screen and turns into horizontal scrolling for a form. Instead, pick one
 * item at a time, then a plain vertical list — one row per soldier, one
 * control each — with a single שמור for the whole item. Planning only —
 * "מאג מ-4 למטולון, מכפל, מפרו" — capped against the company's own quantity
 * from חלוקה לפלוגות, never against anything a real 1008 can issue.
 * Scoped server-side to the commander's own companyScope; a COMPANY_CMDR can
 * never pass `company` to see another one. `company` is only meaningful when
 * an admin is looking in on a specific company — the server requires it then.
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
  const [selectedItemId, setSelectedItemId] = useState('');

  if (rowsLoading || soldiersLoading) return <Spinner />;

  const items = rows ?? [];
  const soldierList = soldiers ?? [];
  const selectedRow = items.find((r) => r.itemId === selectedItemId) ?? items[0] ?? null;

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
        <div className="space-y-4 border-t border-rule px-4 py-4">
          <Select
            label={he.servicePeriods.chooseItem}
            value={selectedRow?.itemId ?? ''}
            onChange={setSelectedItemId}
            options={items.map((r) => ({
              value: r.itemId,
              label: `${r.item.name} (${he.servicePeriods.companyQuantity}: ${r.companyQuantity})`,
            }))}
            className="max-w-md"
          />
          {selectedRow && (
            <SoldierList
              key={selectedRow.itemId}
              servicePeriodId={servicePeriodId}
              row={selectedRow}
              soldiers={soldierList}
            />
          )}
        </div>
      )}
    </Panel>
  );
}

/**
 * A soldier's quantity for one item. Almost every item here is serialized —
 * one weapon, one soldier — so it's a binary "does he get one", not a number
 * to type. A real two-state switch reads that at a glance and animates the
 * change, instead of a number input whose only sane values are 0 and 1.
 * Non-serialized items (bulk accessories) keep a small stepper, since a
 * soldier can legitimately hold more than one of those.
 */
function QuantityControl({
  isSerialized,
  value,
  onChange,
}: {
  isSerialized: boolean;
  value: number;
  onChange: (next: number) => void;
}) {
  if (isSerialized) {
    const on = value > 0;
    return (
      <button
        role="switch"
        aria-checked={on}
        onClick={() => onChange(on ? 0 : 1)}
        className={`inline-flex h-9 w-16 items-center rounded-full border px-1 transition-colors duration-200 ${
          on ? 'justify-end border-field bg-field' : 'justify-start border-rule-strong bg-card-raised'
        }`}
      >
        <span className="h-7 w-7 rounded-full bg-white shadow-panel transition-transform duration-200 ease-out" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label="−"
        className="flex h-8 w-8 items-center justify-center rounded-ctl border border-rule-strong bg-card text-lead font-semibold transition-colors hover:bg-field-wash active:scale-95"
      >
        −
      </button>
      <span className="w-8 text-center text-body font-semibold tabular-nums">{value}</span>
      <button
        onClick={() => onChange(value + 1)}
        aria-label="+"
        className="flex h-8 w-8 items-center justify-center rounded-ctl border border-rule-strong bg-card text-lead font-semibold transition-colors hover:bg-field-wash active:scale-95"
      >
        +
      </button>
    </div>
  );
}

function SoldierList({
  servicePeriodId,
  row,
  soldiers,
}: {
  servicePeriodId: string;
  row: SoldierAllocationRow;
  soldiers: CompanySoldierRef[];
}) {
  const [set] = useSetSoldierAllocationMutation();
  const [isSaving, setIsSaving] = useState(false);
  const [draftBySoldier, setDraftBySoldier] = useState<Record<string, number>>(() =>
    Object.fromEntries(soldiers.map((s) => [s.id, row.bySoldier[s.id] ?? 0])),
  );
  const [errorBySoldier, setErrorBySoldier] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState('');

  // Filters what's shown only — drafts for soldiers hidden by the search stay
  // in state, so clearing the search never drops a value already set.
  const visibleSoldiers = useMemo(() => {
    const q = query.trim();
    if (!q) return soldiers;
    return soldiers.filter((s) => `${s.firstName} ${s.lastName}`.includes(q));
  }, [soldiers, query]);

  const draftTotal = useMemo(
    () => soldiers.reduce((sum, s) => sum + (draftBySoldier[s.id] ?? 0), 0),
    [draftBySoldier, soldiers],
  );
  const overCap = draftTotal > row.companyQuantity;

  function patch(soldierId: string, value: number): void {
    setDraftBySoldier((m) => ({ ...m, [soldierId]: value }));
    setDirty(true);
  }

  async function handleSave(): Promise<void> {
    if (overCap) return; // the button is disabled for this, but never trust only that
    setIsSaving(true);
    const nextErrors: Record<string, string> = {};

    for (const s of soldiers) {
      const n = draftBySoldier[s.id] ?? 0;
      const current = row.bySoldier[s.id] ?? 0;
      if (n === current) continue;
      const result = await set({ servicePeriodId, itemId: row.itemId, soldierId: s.id, quantity: n });
      if (result.error) nextErrors[s.id] = apiErrorMessage(result.error) ?? he.toast.failed;
    }

    setIsSaving(false);
    setErrorBySoldier(nextErrors);
    if (Object.keys(nextErrors).length === 0) setDirty(false);
  }

  return (
    <div className="rounded-panel border border-rule">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-card px-4 py-3">
        <span className="flex items-center gap-2 font-semibold">
          <CategoryDot category={row.item.category} />
          {row.item.name}
        </span>
        <span
          className={`text-meta font-semibold transition-colors ${overCap ? 'text-oxide' : 'text-ink-soft'}`}
        >
          {he.servicePeriods.totalOfCompany(draftTotal, row.companyQuantity)}
        </span>
      </div>

      {overCap && (
        <p className="border-b border-rule bg-oxide-wash px-4 py-2 text-meta text-oxide">
          {he.servicePeriods.capExceededCannotSave(row.companyQuantity)}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-2.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={he.servicePeriods.searchSoldier}
          className="h-10 w-full max-w-xs rounded-ctl border border-rule-strong bg-card-raised px-3 text-body shadow-inset-field focus:outline-none focus-visible:ring-2 focus-visible:ring-field/40"
        />
        <span className="text-meta text-graphite">
          {query.trim()
            ? he.servicePeriods.soldierCountFiltered(visibleSoldiers.length, soldiers.length)
            : he.servicePeriods.soldierCount(soldiers.length)}
        </span>
      </div>

      {visibleSoldiers.length === 0 ? (
        <p className="px-4 py-6 text-center text-graphite">{he.servicePeriods.noSoldierMatch}</p>
      ) : (
        <ul className="divide-y divide-rule">
          {visibleSoldiers.map((s) => {
            const cellError = errorBySoldier[s.id];
            return (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="font-semibold">
                  {s.firstName} {s.lastName}
                </span>
                <div className="flex flex-col items-end gap-0.5">
                  <QuantityControl
                    isSerialized={row.item.isSerialized}
                    value={draftBySoldier[s.id] ?? 0}
                    onChange={(v) => patch(s.id, v)}
                  />
                  {cellError && <p className="text-micro text-oxide">{cellError}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex justify-end border-t border-rule px-4 py-3">
        <Button onClick={() => void handleSave()} disabled={isSaving || !dirty || overCap}>
          {isSaving ? he.common.saving : he.common.save}
        </Button>
      </div>
    </div>
  );
}
