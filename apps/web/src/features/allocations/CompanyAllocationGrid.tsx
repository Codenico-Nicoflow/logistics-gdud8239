import { useMemo, useState, type ReactNode } from 'react';
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
import { useCompanies } from '../companies/useCompanies';

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
      inputMode="numeric"
      className="h-11 w-20 rounded-ctl border-2 border-field bg-card-raised px-2 text-center shadow-inset-field focus:outline-none sm:h-auto sm:w-16 sm:py-1"
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
  const { active: companies } = useCompanies();
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
      {/* Phone: a card per item. Eight columns cannot fit, and cutting the grid off inside its card hid
          most of the companies and the row actions. */}
      <ul className="divide-y divide-rule sm:hidden">
        {(rows ?? []).map((row) => (
          <GridRow
            key={row.itemId}
            layout="card"
            servicePeriodId={servicePeriodId}
            row={row}
            canEdit={canEdit}
            isAdmin={isAdmin}
            onRemove={() => void removeItem({ servicePeriodId, itemId: row.itemId })}
          />
        ))}
      </ul>

      <div className="hidden sm:block">
      <TableScroll>
        <table className="row-hover w-full">
          <thead>
            <tr>
              <Th>{he.servicePeriods.name}</Th>
              <Th numeric className="w-28">{he.servicePeriods.onHand}</Th>
              {companies.map((c) => (
                <Th key={c.code} numeric className="w-32">
                  {c.name}
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
                layout="row"
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
      </div>

      {canEdit && (
        <div className="flex flex-wrap items-end gap-2 border-t border-rule px-4 py-3">
          <Select
            value={addingItemId}
            onChange={(v) => setAddingItemId(v)}
            options={[
              { value: '', label: he.servicePeriods.name },
              ...addable.map((i) => ({ value: i.id, label: i.name })),
            ]}
            className="w-full sm:w-56"
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
  layout,
  servicePeriodId,
  row,
  canEdit,
  isAdmin,
  onRemove,
}: {
  /** `row` is a table row for a desktop; `card` is the same item laid out for a phone. */
  layout: 'row' | 'card';
  servicePeriodId: string;
  row: CompanyAllocationRow;
  canEdit: boolean;
  isAdmin: boolean;
  onRemove: () => void;
}) {
  const { active, nameOf } = useCompanies();
  const codes = active.map((c) => c.code);
  // A company created after this row was built has no entry yet: that is 0 planned, nothing issued.
  const planned = (c: Company): number => row.quantities[c] ?? 0;
  const issuedTo = (c: Company): number => row.issued[c] ?? 0;
  const leftFor = (c: Company): number => row.remaining[c] ?? 0;
  const [set] = useSetCompanyAllocationMutation();
  const [setOnHandOverride] = useSetOnHandOverrideMutation();
  const [editing, setEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [onHandDraft, setOnHandDraft] = useState(String(row.onHand));
  const [draftByCompany, setDraftByCompany] = useState<Record<Company, string>>(
    () => Object.fromEntries(codes.map((c) => [c, String(planned(c))])) as Record<Company, string>,
  );
  const [errorByCell, setErrorByCell] = useState<Record<string, string>>({});
  const [onHandError, setOnHandError] = useState<string | null>(null);

  const overCap = row.total > row.onHand;
  const canEditOnHand = isAdmin;

  function startEditing(): void {
    setOnHandDraft(String(row.onHand));
    setDraftByCompany(
      Object.fromEntries(codes.map((c) => [c, String(planned(c))])) as Record<Company, string>,
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

    for (const c of codes) {
      const draft = draftByCompany[c] ?? '';
      const n = Number(draft);
      if (draft.trim() === '' || Number.isNaN(n) || n === planned(c)) continue;
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

  if (layout === 'card') {
    const fields: { key: string; label: string; node: ReactNode; note?: ReactNode }[] = [
      {
        key: 'onHand',
        label: he.servicePeriods.onHand,
        node: canEditOnHand ? (
          <EditableCell value={row.onHand} draft={onHandDraft} editing={editing} max={row.realOnHand} onDraftChange={setOnHandDraft} />
        ) : (
          <span className="font-semibold">{row.onHand}</span>
        ),
        note: (
          <>
            {onHandError && <span className="block text-micro text-oxide">{onHandError}</span>}
            {!editing && row.onHandOverride !== null && (
              <span className="block text-micro text-graphite">{he.servicePeriods.onHandOverrideHint(row.realOnHand)}</span>
            )}
          </>
        ),
      },
      ...codes.map((c) => ({
        key: c,
        label: nameOf(c),
        node: canEdit ? (
          <EditableCell
            value={planned(c)}
            draft={draftByCompany[c] ?? ''}
            editing={editing}
            onDraftChange={(next) => setDraftByCompany((m) => ({ ...m, [c]: next }))}
          />
        ) : (
          <span className="font-semibold">{planned(c)}</span>
        ),
        note: (
          <>
            {errorByCell[c] && <span className="block text-micro text-oxide">{errorByCell[c]}</span>}
            <span className="block text-micro text-graphite">{he.servicePeriods.issuedOfPlanned(issuedTo(c))}</span>
            <span className={`block text-micro ${leftFor(c) < 0 ? 'font-semibold text-oxide' : 'text-graphite'}`}>
              {he.servicePeriods.remainingOfPlanned(leftFor(c))}
            </span>
          </>
        ),
      })),
    ];
    return (
      <li className={`space-y-3 px-4 py-3 ${editing ? 'bg-field-wash/40' : ''}`}>
        <div className="flex items-start justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2 text-body font-semibold">
            <CategoryDot category={row.item.category} />
            {row.item.name}
          </span>
          <span className={`shrink-0 text-meta ${overCap ? 'font-semibold text-oxide' : 'text-graphite'}`}>
            {he.servicePeriods.total}: <b className="text-body">{row.total}</b>
          </span>
        </div>
        {overCap && <p className="text-meta text-oxide">{he.servicePeriods.capExceeded(row.onHand)}</p>}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
          {fields.map((f) => (
            <div key={f.key} className="min-w-0 rounded-ctl bg-card px-3 py-2">
              <dt className="text-meta text-graphite">{f.label}</dt>
              <dd className="mt-0.5 text-body">{f.node}</dd>
              {f.note}
            </div>
          ))}
        </dl>
        {canEdit && (
          <div className="grid grid-cols-2 gap-2">
            {editing ? (
              <>
                <Button size="sm" onClick={() => void handleSave()} disabled={isSaving}>
                  {isSaving ? he.common.saving : he.common.save}
                </Button>
                <Button variant="quiet" size="sm" onClick={() => setEditing(false)} disabled={isSaving}>
                  {he.common.cancel}
                </Button>
              </>
            ) : (
              <>
                <Button variant="quiet" size="sm" onClick={startEditing}>
                  {he.common.edit}
                </Button>
                <Button variant="quiet" size="sm" onClick={onRemove} className="text-oxide">
                  {he.servicePeriods.removeItem}
                </Button>
              </>
            )}
          </div>
        )}
      </li>
    );
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
      {codes.map((c) => {
        const cellError = errorByCell[c];
        const issued = issuedTo(c);
        const remaining = leftFor(c);
        return (
          <Td key={c} numeric className="w-32 align-top">
            {canEdit ? (
              <EditableCell
                value={planned(c)}
                draft={draftByCompany[c] ?? ''}
                editing={editing}
                onDraftChange={(next) => setDraftByCompany((m) => ({ ...m, [c]: next }))}
              />
            ) : (
              <span className="font-semibold">{planned(c)}</span>
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
