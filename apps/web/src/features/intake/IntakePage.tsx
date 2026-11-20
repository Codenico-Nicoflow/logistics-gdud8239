import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useItemsQuery, useSubmitIntakeMutation } from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  CategoryDot,
  Panel,
  Select,
  Spinner,
  TableScroll,
  Td,
  Th,
  TextField,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import type { Item, IntakeRow } from '../../lib/types';

/** One row being typed into the grid, before it is sent. */
type DraftRow = {
  key: string;
  query: string;
  item: Item | null;
  kind: 'serial' | 'bulk';
  serial: string;
  quantity: string;
  notes: string;
};

function emptyRow(): DraftRow {
  return {
    key: Math.random().toString(36).slice(2),
    query: '',
    item: null,
    kind: 'serial',
    serial: '',
    quantity: '',
    notes: '',
  };
}

/**
 * קליטת ציוד — what actually arrived at the armory, typed in row by row from
 * the source sheet. Not necessarily ימ"ח — it can equally be a חטיבה
 * delivery, so the screen and its name stay source-agnostic. Every row is
 * matched to a real catalog item before it can be submitted: the sheet's own
 * names ("MMX3", "לאור 3*") are not assumed to match ours, so an unresolved
 * row blocks the submit rather than guessing.
 */
export function IntakePage() {
  const items = useItemsQuery();
  const [rows, setRows] = useState<DraftRow[]>([emptyRow()]);
  const [submit, { isLoading, error }] = useSubmitIntakeMutation();
  const toast = useToast();

  const catalog = useMemo(() => (items.data ?? []).filter((i) => i.isActive), [items.data]);

  function patch(key: string, changes: Partial<DraftRow>): void {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  }

  function removeRow(key: string): void {
    setRows((rs) => rs.filter((r) => r.key !== key));
  }

  function addRow(): void {
    setRows((rs) => [...rs, emptyRow()]);
  }

  const resolvedCount = rows.filter((r) => r.item).length;
  const unresolvedCount = rows.filter((r) => r.query.trim() && !r.item).length;
  const ready =
    rows.length > 0 &&
    rows.every(
      (r) =>
        r.item &&
        (r.kind === 'serial' ? r.serial.trim().length > 0 : Number(r.quantity) > 0),
    );

  async function handleSubmit(): Promise<void> {
    const payload: IntakeRow[] = rows.map((r) => ({
      itemId: r.item!.id,
      kind: r.kind,
      ...(r.kind === 'serial' ? { serial: r.serial.trim() } : { quantity: Number(r.quantity) }),
      ...(r.notes.trim() ? { notes: r.notes.trim() } : {}),
    }));

    const result = await submit({ rows: payload });
    if (result.data) {
      toast.success({
        title: he.intake.submitted,
        detail: he.intake.submittedDetail(result.data.serialsCreated, result.data.bulkItemsUpdated),
      });
      setRows([emptyRow()]);
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  if (items.isLoading) return <Spinner />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-display font-bold">{he.intake.title}</h1>
        <p className="mt-1 text-ink-soft">{he.intake.subtitle}</p>
        <p className="mt-1 text-meta text-graphite">{he.intake.kindHint}</p>
      </div>

      <Panel title={he.intake.rows}>
        {/* Four columns (search / kind / value / remove) never fit a phone
            width, so below sm each row renders as a stacked card instead of
            forcing horizontal scroll on what is a form, not a report. */}
        <div className="hidden sm:block">
          <TableScroll>
            <table className="row-hover w-full">
              <thead>
                <tr>
                  <Th>{he.intake.itemSearch}</Th>
                  <Th>{he.intake.kind}</Th>
                  <Th>{he.intake.value}</Th>
                  <Th>{he.intake.notes}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <IntakeRowEditor
                    key={row.key}
                    row={row}
                    catalog={catalog}
                    onPatch={(changes) => patch(row.key, changes)}
                    onRemove={() => removeRow(row.key)}
                  />
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>

        <ul className="space-y-3 p-3 sm:hidden">
          {rows.map((row) => (
            <IntakeRowCard
              key={row.key}
              row={row}
              catalog={catalog}
              onPatch={(changes) => patch(row.key, changes)}
              onRemove={() => removeRow(row.key)}
            />
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-4 py-3">
          <Button variant="quiet" onClick={addRow}>
            {he.intake.addRow}
          </Button>
          <div className="flex items-center gap-3 text-meta text-graphite">
            {unresolvedCount > 0 && (
              <span className="text-oxide">{he.intake.unresolvedCount(unresolvedCount)}</span>
            )}
            <span>{he.intake.resolvedCount(resolvedCount, rows.length)}</span>
          </div>
        </div>
      </Panel>

      {apiErrorMessage(error) && (
        <p className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
          {apiErrorMessage(error)}
        </p>
      )}

      <Button onClick={() => void handleSubmit()} disabled={!ready || isLoading}>
        {isLoading ? he.intake.submitting : he.intake.submit}
      </Button>
    </div>
  );
}

/** The item-search combobox, shared by the desktop table row and mobile card. */
function ItemSearchField({
  row,
  catalog,
  onPatch,
  inputClassName,
}: {
  row: DraftRow;
  catalog: Item[];
  onPatch: (changes: Partial<DraftRow>) => void;
  inputClassName: string;
}) {
  const matches = useMemo(() => {
    const q = row.query.trim().toLowerCase();
    if (!q || row.item) return [];
    return catalog
      .filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.aliases.some((a) => a.toLowerCase().includes(q)),
      )
      .slice(0, 6);
  }, [catalog, row.query, row.item]);

  const inputRef = useRef<HTMLInputElement>(null);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (matches.length === 0 || !inputRef.current) {
      setMenuRect(null);
      return;
    }
    const r = inputRef.current.getBoundingClientRect();
    setMenuRect({ top: r.bottom, left: r.left, width: r.width });
  }, [matches.length, row.query]);

  if (row.item) {
    return (
      <span className="flex items-center gap-2">
        <span className="flex items-center gap-2 font-semibold">
          <CategoryDot category={row.item.category} />
          {row.item.name}
        </span>
        <button
          onClick={() => onPatch({ item: null, query: '' })}
          className="text-meta text-graphite hover:underline"
        >
          {he.intake.change}
        </button>
      </span>
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={row.query}
        onChange={(e) => onPatch({ query: e.target.value })}
        placeholder={he.intake.itemSearchPlaceholder}
        className={inputClassName}
      />
      {menuRect &&
        matches.length > 0 &&
        createPortal(
          <ul
            style={{
              position: 'fixed',
              top: menuRect.top,
              left: menuRect.left,
              width: Math.max(menuRect.width, 256),
            }}
            className="z-50 mt-1 rounded-ctl border border-rule-strong bg-card-raised shadow-lift"
          >
            {matches.map((i) => (
              <li key={i.id}>
                <button
                  onClick={() =>
                    onPatch({ item: i, query: i.name, kind: i.isSerialized ? 'serial' : 'bulk' })
                  }
                  className="flex w-full items-center gap-2 px-3 py-2 text-start hover:bg-field-wash"
                >
                  <CategoryDot category={i.category} />
                  {i.name}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
      {row.query.trim() && matches.length === 0 && (
        <p className="mt-1 text-micro text-oxide">{he.intake.noMatch}</p>
      )}
    </div>
  );
}

/** The kind selector (serial/bulk) — a fixed label once an item is picked. */
function KindField({ row, onPatch }: { row: DraftRow; onPatch: (changes: Partial<DraftRow>) => void }) {
  if (row.item?.isSerialized) {
    return <span className="text-meta text-graphite">{he.intake.kindSerial}</span>;
  }
  return (
    <Select
      value={row.kind}
      onChange={(v) => v && onPatch({ kind: v })}
      options={[
        { value: 'serial', label: he.intake.kindSerial },
        { value: 'bulk', label: he.intake.kindBulk },
      ]}
      className="w-32"
    />
  );
}

/** The serial or quantity input, depending on `row.kind`. */
function ValueField({
  row,
  onPatch,
  inputClassName,
}: {
  row: DraftRow;
  onPatch: (changes: Partial<DraftRow>) => void;
  inputClassName: string;
}) {
  return row.kind === 'serial' ? (
    <input
      value={row.serial}
      onChange={(e) => onPatch({ serial: e.target.value })}
      placeholder={he.intake.serialPlaceholder}
      className={`serial rounded-ctl border-2 border-brass bg-brass-wash px-2.5 py-1.5 ${inputClassName}`}
    />
  ) : (
    <input
      type="number"
      min={1}
      value={row.quantity}
      onChange={(e) => onPatch({ quantity: e.target.value })}
      placeholder={he.intake.quantityPlaceholder}
      className={`serial rounded-ctl border border-rule-strong bg-card-raised px-2.5 py-1.5 text-center ${inputClassName}`}
    />
  );
}

function IntakeRowEditor({
  row,
  catalog,
  onPatch,
  onRemove,
}: {
  row: DraftRow;
  catalog: Item[];
  onPatch: (changes: Partial<DraftRow>) => void;
  onRemove: () => void;
}) {
  return (
    <tr>
      <Td>
        <ItemSearchField
          row={row}
          catalog={catalog}
          onPatch={onPatch}
          inputClassName="w-full min-w-[12rem] rounded-ctl border border-rule-strong bg-card-raised px-2.5 py-1.5 text-body"
        />
      </Td>
      <Td>
        <KindField row={row} onPatch={onPatch} />
      </Td>
      <Td>
        <ValueField row={row} onPatch={onPatch} inputClassName="w-full" />
      </Td>
      <Td>
        <input
          value={row.notes}
          onChange={(e) => onPatch({ notes: e.target.value })}
          placeholder={he.intake.notesPlaceholder}
          className="w-full min-w-[10rem] rounded-ctl border border-rule-strong bg-card-raised px-2.5 py-1.5 text-body shadow-inset-field"
        />
      </Td>
      <Td>
        <button onClick={onRemove} className="text-meta font-semibold text-oxide hover:underline">
          {he.form1008.remove}
        </button>
      </Td>
    </tr>
  );
}

/**
 * The same row, stacked as a labeled card for phones — one field per line,
 * full width, no horizontal scroll. Shown instead of the table below `sm`.
 */
function IntakeRowCard({
  row,
  catalog,
  onPatch,
  onRemove,
}: {
  row: DraftRow;
  catalog: Item[];
  onPatch: (changes: Partial<DraftRow>) => void;
  onRemove: () => void;
}) {
  return (
    <li className="space-y-3 rounded-ctl border border-rule bg-card-raised px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-meta font-semibold text-ink-soft">{he.intake.itemSearch}</span>
        <button
          onClick={onRemove}
          className="shrink-0 text-meta font-semibold text-oxide hover:underline"
        >
          {he.form1008.remove}
        </button>
      </div>

      <ItemSearchField
        row={row}
        catalog={catalog}
        onPatch={onPatch}
        inputClassName="h-11 w-full rounded-ctl border border-rule-strong bg-card-raised px-3 text-body"
      />

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-meta font-semibold text-ink-soft">{he.intake.kind}</span>
          <KindField row={row} onPatch={onPatch} />
        </label>
        <label className="block">
          <span className="mb-1 block text-meta font-semibold text-ink-soft">{he.intake.value}</span>
          <ValueField row={row} onPatch={onPatch} inputClassName="h-11 w-full text-body" />
        </label>
      </div>

      <TextField
        label={he.intake.notes}
        value={row.notes}
        onChange={(notes) => onPatch({ notes })}
        placeholder={he.intake.notesPlaceholder}
      />
    </li>
  );
}
