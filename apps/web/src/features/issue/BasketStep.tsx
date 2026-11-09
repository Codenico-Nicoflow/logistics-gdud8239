import { useMemo, useState } from 'react';
import { useAvailableInstancesQuery, useItemsQuery, useKitsQuery } from '../../lib/api';
import { Button, CategoryDot, Panel, Serial, Tag, TextField } from '../../components/ui';
import { he } from '../../i18n/he';
import type { Item, Kit } from '../../lib/types';

/** One row of the handover, as it is being assembled on screen. */
export type BasketLine = {
  item: Item;
  quantity: number;
  serial: string;
  lineNotes: string;
};

/**
 * Step 3 — what is going out.
 *
 * The paper 1008 is a list, so this is a list: one row per item, with its
 * quantity and its מסד where it has one. A kit fills the rows with the usual
 * quantities and then gets out of the way — a soldier who does not take a
 * magazine sets it to 0, which removes the row rather than signing for zero.
 */
export function BasketStep({
  lines,
  onChange,
  onBack,
  onContinue,
}: {
  lines: BasketLine[];
  onChange: (lines: BasketLine[]) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const items = useItemsQuery();
  const kits = useKitsQuery();
  const [itemQuery, setItemQuery] = useState('');

  const catalog = useMemo(
    () => (items.data ?? []).filter((i) => i.isActive && i.name !== 'לא מזוהה'),
    [items.data],
  );

  const matches = useMemo(() => {
    const q = itemQuery.trim();
    if (!q) return [];
    const taken = new Set(lines.map((l) => l.item.id));
    return catalog
      .filter((i) => i.name.includes(q) || i.aliases.some((a) => a.includes(q)))
      .filter((i) => !taken.has(i.id))
      .slice(0, 8);
  }, [catalog, itemQuery, lines]);

  /** A kit replaces the basket wholesale: it describes a complete handover. */
  function applyKit(kit: Kit): void {
    const byId = new Map(catalog.map((i) => [i.id, i]));
    const next: BasketLine[] = [];
    for (const line of kit.lines) {
      const item = byId.get(line.itemId);
      if (!item) continue;
      next.push({ item, quantity: line.quantity, serial: '', lineNotes: '' });
    }
    onChange(next);
  }

  function addItem(item: Item): void {
    onChange([
      ...lines,
      { item, quantity: item.defaultQty, serial: '', lineNotes: '' },
    ]);
    setItemQuery('');
  }

  function patch(itemId: string, changes: Partial<BasketLine>): void {
    onChange(lines.map((l) => (l.item.id === itemId ? { ...l, ...changes } : l)));
  }

  function removeLine(itemId: string): void {
    onChange(lines.filter((l) => l.item.id !== itemId));
  }

  // A serialized line without a מסד cannot be signed; the API refuses it and
  // so does this step, so the soldier is never asked to sign an invalid form.
  const missingSerial = lines.some((l) => l.item.isSerialized && !l.serial.trim());
  const ready = lines.length > 0 && !missingSerial;

  return (
    <div className="space-y-4">
      <Panel title={he.form1008.kits}>
        <div className="px-4 py-4">
          <p className="text-meta text-graphite">{he.form1008.kitHint}</p>
          {(kits.data ?? []).length === 0 ? (
            <p className="mt-2 text-meta text-graphite">{he.form1008.noKits}</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              {kits.data?.map((kit) => (
                <button
                  key={kit.id}
                  onClick={() => applyKit(kit)}
                  className="rounded-ctl border border-rule-strong bg-card-raised px-3 py-2 text-start transition-colors hover:border-field hover:bg-field-wash"
                >
                  <span className="block font-semibold">{kit.name}</span>
                  <span className="block text-micro text-graphite">
                    {he.form1008.linesCount(kit.lines.length)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel title={he.form1008.basket}>
        <div className="space-y-3 px-4 py-4">
          {lines.length === 0 ? (
            <p className="text-graphite">{he.form1008.basketEmpty}</p>
          ) : (
            <ul className="space-y-3">
              {lines.map((line) => (
                <BasketRow
                  key={line.item.id}
                  line={line}
                  onPatch={(changes) => patch(line.item.id, changes)}
                  onRemove={() => removeLine(line.item.id)}
                />
              ))}
            </ul>
          )}

          <div className="border-t border-rule pt-3">
            {/* No "רשות" marker here: this is a way to add a row, not a
                field on the form, and labelling it optional reads as though
                the item itself were. */}
            <span className="mb-1 block text-meta font-semibold text-ink-soft">
              {he.form1008.addItem}
            </span>
            <input
              value={itemQuery}
              onChange={(e) => setItemQuery(e.target.value)}
              placeholder={he.form1008.searchItem}
              className="w-full rounded-ctl border border-rule-strong bg-card-raised px-3 py-2 text-body"
            />
            {matches.length > 0 && (
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {matches.map((i) => (
                  <li key={i.id}>
                    <button
                      onClick={() => addItem(i)}
                      className="flex w-full items-center justify-between gap-2 rounded-ctl border border-rule bg-card-raised px-3 py-2 text-start transition-colors hover:border-field hover:bg-field-wash"
                    >
                      <span className="flex items-center gap-2 font-semibold">
                        <CategoryDot category={i.category} />
                        {i.name}
                      </span>
                      {i.isSerialized && <Tag tone="brass">{he.signatures.serial}</Tag>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {missingSerial && (
            <p className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
              {he.issue.serialRequired}
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={onContinue} disabled={!ready}>
              {he.form1008.stepSign}
            </Button>
            <Button variant="quiet" onClick={onBack}>
              {he.issue.back}
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

/**
 * One row of the basket.
 *
 * A serialized item is one physical unit, so its quantity is fixed at 1 and
 * the מסד takes the space the quantity would have had — it is the field that
 * matters, and it is framed in brass everywhere in this app.
 */
function BasketRow({
  line,
  onPatch,
  onRemove,
}: {
  line: BasketLine;
  onPatch: (changes: Partial<BasketLine>) => void;
  onRemove: () => void;
}) {
  const { item } = line;
  const available = useAvailableInstancesQuery(item.id, { skip: !item.isSerialized });
  const isNewSerial =
    line.serial.trim().length > 0 &&
    available.data !== undefined &&
    !available.data.some((i) => i.serial === line.serial.trim());

  return (
    <li className="rounded-ctl border border-rule bg-card-raised px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 font-semibold">
          <CategoryDot category={item.category} />
          {item.name}
          {item.isSerialized && <Tag tone="brass">{he.form1008.serialNeeded}</Tag>}
        </span>
        <button
          onClick={onRemove}
          className="shrink-0 text-meta font-semibold text-oxide hover:underline"
        >
          {he.form1008.remove}
        </button>
      </div>

      <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_1fr]">
        {item.isSerialized ? (
          <div className="sm:col-span-2">
            <label className="block">
              <span className="mb-1 block text-meta font-semibold text-ink-soft">
                {he.issue.serialLabel}
              </span>
              <input
                value={line.serial}
                onChange={(e) => onPatch({ serial: e.target.value, quantity: 1 })}
                className="serial w-full rounded-ctl border-2 border-brass bg-brass-wash px-3 py-2.5 text-lead"
              />
            </label>
            {/* The register of serials is still being built from the signatures
                as they are entered, so this list is a shortcut to what is
                already known — never a restriction. */}
            {available.data && available.data.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {available.data.slice(0, 16).map((inst) => (
                  <button
                    key={inst.id}
                    onClick={() => onPatch({ serial: inst.serial, quantity: 1 })}
                    className={`rounded-ctl border px-2 py-1 text-meta ${
                      line.serial === inst.serial
                        ? 'border-brass bg-brass text-white'
                        : 'border-rule-strong hover:border-brass'
                    }`}
                  >
                    <Serial value={inst.serial} />
                  </button>
                ))}
              </div>
            )}
            {isNewSerial && <p className="mt-1.5 text-meta text-brass">{he.issue.newSerial}</p>}
          </div>
        ) : (
          <QuantityField
            value={line.quantity}
            unit={item.unitOfMeasure}
            onChange={(quantity) => {
              // 0 means "he is not taking this", which is a row that should
              // not be on the form at all rather than a line reading zero.
              if (quantity <= 0) onRemove();
              else onPatch({ quantity });
            }}
          />
        )}

        <TextField
          label={he.form1008.lineNotes}
          value={line.lineNotes}
          onChange={(lineNotes) => onPatch({ lineNotes })}
        />
      </div>
    </li>
  );
}

/** Stepper plus a number input, because a quantity gets nudged more than typed. */
function QuantityField({
  value,
  unit,
  onChange,
}: {
  value: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-meta font-semibold text-ink-soft">
        {he.issue.quantityLabel} ({unit})
      </span>
      <div className="flex items-stretch gap-1">
        <button
          onClick={() => onChange(value - 1)}
          aria-label="−"
          className="w-10 shrink-0 rounded-ctl border border-rule-strong bg-card text-lead font-semibold hover:bg-field-wash"
        >
          −
        </button>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="serial w-full rounded-ctl border border-rule-strong bg-card-raised px-3 py-2 text-center text-body"
        />
        <button
          onClick={() => onChange(value + 1)}
          aria-label="+"
          className="w-10 shrink-0 rounded-ctl border border-rule-strong bg-card text-lead font-semibold hover:bg-field-wash"
        >
          +
        </button>
      </div>
      <p className="mt-1 text-micro text-graphite">{he.form1008.quantityZeroHint}</p>
    </div>
  );
}
