import { useMemo, useState } from 'react';
import {
  useAddGridItemMutation,
  useCompanyAllocationsQuery,
  useItemsQuery,
  useRemoveGridItemMutation,
  useSetCompanyAllocationMutation,
  useSetOnHandOverrideMutation,
} from '../../lib/api';
import { apiErrorMessage, Button, CategoryDot, Panel, Select, TableScroll, Td, Th } from '../../components/ui';
import { he } from '../../i18n/he';
import type { Company, CompanyAllocationRow } from '../../lib/types';
import { COMPANIES } from '../../lib/types';

/**
 * A plain number cell, editable only while the row is in edit mode. Outside
 * that mode it is text, not a control — nothing to click, nothing that looks
 * editable, so a glance at the grid can't be mistaken for an open form. This
 * is what replaced always-live inputs: every cell used to accept a keystroke
 * at any time, which read as fragile and made "did my edit actually take?"
 * a real question. Now a row has exactly two states, entering and committing,
 * and nothing in between.
 */
function EditableCell({
  value,
  draft,
  editing,
  min = 0,
  max,
  onDraftChange,
}: {
  value: number;
  draft: string;
  editing: boolean;
  min?: number;
  max?: number;
  onDraftChange: (next: string) => void;
}) {
  if (!editing) return <span className="font-semibold">{value}</span>;
  return (
    <input
      type="number"
      min={min}
      max={max}
      autoFocus
      value={draft}
      onChange={(e) => onDraftChange(e.target.value)}
      className="w-16 rounded-ctl border-2 border-field bg-card-raised px-2 py-1 text-center shadow-inset-field focus:outline-none"
    />
  );
}

/**
 * The samgad's screen: one row per item, one column per company, capped
 * against בפועל (authorizedQty − yamahQty) — never מצבה, since only what is
 * physically on hand can actually be handed out. No soldier names here; that
 * is a separate concern for whoever eventually breaks a company's number down
 * further.
 */
export function CompanyAllocationGrid({
  servicePeriodId,
  canEdit,
  isAdmin,
}: {
  servicePeriodId: string;
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const { data: rows } = useCompanyAllocationsQuery(servicePeriodId);
  const items = useItemsQuery();
  const [addItem, { isLoading: isAdding }] = useAddGridItemMutation();
  const [removeItem] = useRemoveGridItemMutation();
  const [addingItemId, setAddingItemId] = useState('');

  const onGrid = new Set((rows ?? []).map((r) => r.itemId));
  const addable = useMemo(
    () => (items.data ?? []).filter((i) => i.isActive && !onGrid.has(i.id)),
    [items.data, onGrid],
  );

  return (
    <Panel title={he.servicePeriods.companyGrid}>
      <div className="px-4 py-3">
        <p className="text-meta text-graphite">{he.servicePeriods.companyGridHint}</p>
      </div>
      <TableScroll>
        <table className="row-hover w-full">
          <thead>
            <tr>
              <Th>{he.servicePeriods.name}</Th>
              <Th numeric className="w-28">{he.servicePeriods.onHand}</Th>
              {COMPANIES.map((c) => (
                <Th key={c} numeric className="w-32">
                  {he.companies[c]}
                </Th>
              ))}
              <Th numeric className="w-20">{he.servicePeriods.total}</Th>
              {canEdit && <Th className="w-28" />}
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((row) => (
              <GridRow
                key={row.itemId}
                servicePeriodId={servicePeriodId}
                row={row}
                canEdit={canEdit}
                isAdmin={isAdmin}
                onRemove={() => void removeItem({ servicePeriodId, itemId: row.itemId })}
              />
            ))}
          </tbody>
        </table>
      </TableScroll>

      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 border-t border-rule px-4 py-3">
          <Select
            value={addingItemId}
            onChange={(v) => setAddingItemId(v)}
            options={[
              { value: '', label: he.servicePeriods.name },
              ...addable.map((i) => ({ value: i.id, label: i.name })),
            ]}
            className="w-56"
          />
          <Button
            disabled={!addingItemId || isAdding}
            onClick={() => {
              void addItem({ servicePeriodId, itemId: addingItemId });
              setAddingItemId('');
            }}
          >
            {he.servicePeriods.addItem}
          </Button>
        </div>
      )}
    </Panel>
  );
}

/**
 * One item's row, with its own edit/display toggle. Entering edit mode snapshots
 * every editable number into local drafts; שמור sends only the ones that actually
 * changed and only then exits edit mode, so a failed cell keeps the row open with
 * its error visible rather than silently reverting.
 */
function GridRow({
  servicePeriodId,
  row,
  canEdit,
  isAdmin,
  onRemove,
}: {
  servicePeriodId: string;
  row: CompanyAllocationRow;
  canEdit: boolean;
  isAdmin: boolean;
  onRemove: () => void;
}) {
  const [set] = useSetCompanyAllocationMutation();
  const [setOnHandOverride] = useSetOnHandOverrideMutation();
  const [editing, setEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [onHandDraft, setOnHandDraft] = useState(String(row.onHand));
  const [draftByCompany, setDraftByCompany] = useState<Record<Company, string>>(
    () => Object.fromEntries(COMPANIES.map((c) => [c, String(row.quantities[c])])) as Record<Company, string>,
  );
  const [errorByCell, setErrorByCell] = useState<Record<string, string>>({});
  const [onHandError, setOnHandError] = useState<string | null>(null);

  const overCap = row.total > row.onHand;
  const canEditOnHand = isAdmin;

  function startEditing(): void {
    setOnHandDraft(String(row.onHand));
    setDraftByCompany(
      Object.fromEntries(COMPANIES.map((c) => [c, String(row.quantities[c])])) as Record<Company, string>,
    );
    setErrorByCell({});
    setOnHandError(null);
    setEditing(true);
  }

  async function handleSave(): Promise<void> {
    setIsSaving(true);
    const nextErrorByCell: Record<string, string> = {};
    let nextOnHandError: string | null = null;

    if (canEditOnHand) {
      const n = Number(onHandDraft);
      if (onHandDraft.trim() !== '' && !Number.isNaN(n) && n !== row.onHand) {
        // Re-entering the real figure means "no override" rather than a cap.
        const next = n === row.realOnHand ? null : n;
        const result = await setOnHandOverride({ servicePeriodId, itemId: row.itemId, onHand: next });
        if (result.error) nextOnHandError = apiErrorMessage(result.error) ?? he.toast.failed;
      }
    }

    for (const c of COMPANIES) {
      const n = Number(draftByCompany[c]);
      if (draftByCompany[c].trim() === '' || Number.isNaN(n) || n === row.quantities[c]) continue;
      const result = await set({ servicePeriodId, itemId: row.itemId, company: c, quantity: n });
      if (result.error) nextErrorByCell[c] = apiErrorMessage(result.error) ?? he.toast.failed;
    }

    setIsSaving(false);
    setErrorByCell(nextErrorByCell);
    setOnHandError(nextOnHandError);
    // Only close the row once every change actually landed — a cell with an
    // error stays open and visible instead of silently discarding the edit.
    if (Object.keys(nextErrorByCell).length === 0 && !nextOnHandError) setEditing(false);
  }

  return (
    <tr className={editing ? 'bg-field-wash/40' : undefined}>
      <Td className="min-w-[10rem] align-top">
        <span className="flex items-center gap-2 font-semibold">
          <CategoryDot category={row.item.category} />
          {row.item.name}
        </span>
      </Td>
      <Td numeric className="w-28 align-top">
        {canEditOnHand ? (
          <div>
            <EditableCell
              value={row.onHand}
              draft={onHandDraft}
              editing={editing}
              max={row.realOnHand}
              onDraftChange={setOnHandDraft}
            />
            {onHandError && <p className="mt-0.5 text-micro text-oxide">{onHandError}</p>}
            {!editing && row.onHandOverride !== null && (
              <p className="mt-0.5 text-micro text-graphite">
                {he.servicePeriods.onHandOverrideHint(row.realOnHand)}
              </p>
            )}
          </div>
        ) : (
          <span className="font-semibold">{row.onHand}</span>
        )}
      </Td>
      {COMPANIES.map((c) => {
        const cellError = errorByCell[c];
        const issued = row.issued[c];
        const remaining = row.remaining[c];
        return (
          <Td key={c} numeric className="w-32 align-top">
            {canEdit ? (
              <EditableCell
                value={row.quantities[c]}
                draft={draftByCompany[c]}
                editing={editing}
                onDraftChange={(next) => setDraftByCompany((m) => ({ ...m, [c]: next }))}
              />
            ) : (
              <span className="font-semibold">{row.quantities[c]}</span>
            )}
            {cellError && <p className="mt-0.5 text-micro text-oxide">{cellError}</p>}
            <p className="text-micro text-graphite">
              {he.servicePeriods.issuedOfPlanned(issued)}
              <br />
              <span className={remaining < 0 ? 'font-semibold text-oxide' : undefined}>
                {he.servicePeriods.remainingOfPlanned(remaining)}
              </span>
            </p>
          </Td>
        );
      })}
      <Td numeric className="w-20 align-top">
        <span className={overCap ? 'font-semibold text-oxide' : 'font-semibold'}>{row.total}</span>
        {overCap && (
          <p className="mt-0.5 text-micro text-oxide">{he.servicePeriods.capExceeded(row.onHand)}</p>
        )}
      </Td>
      {canEdit && (
        <Td numeric className="w-28 align-top">
          {editing ? (
            <div className="flex flex-col items-end gap-1">
              <Button size="sm" onClick={() => void handleSave()} disabled={isSaving}>
                {isSaving ? he.common.saving : he.common.save}
              </Button>
              <button
                onClick={() => setEditing(false)}
                disabled={isSaving}
                className="text-meta font-semibold text-graphite hover:underline"
              >
                {he.common.cancel}
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={startEditing}
                className="text-meta font-semibold text-field-dark hover:underline"
              >
                {he.common.edit}
              </button>
              <button onClick={onRemove} className="text-meta font-semibold text-oxide hover:underline">
                {he.servicePeriods.removeItem}
              </button>
            </div>
          )}
        </Td>
      )}
    </tr>
  );
}
