import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useActiveServicePeriodQuery,
  useAvailableInstancesQuery,
  useCompanyAllocationsQuery,
  useItemsQuery,
  useLazyIssueBundleQuery,
  useSoldierEntitlementQuery,
} from '../../lib/api';
import { Button, CategoryDot, Modal, Panel, Serial, Tag, TextField } from '../../components/ui';
import { he } from '../../i18n/he';
import { itemMatches, normalizeSearch } from '../../lib/search';
import type { Item, SoldierSummary } from '../../lib/types';

/** One row of the handover, as it is being assembled on screen. */
export type BasketLine = {
  /** Identifies the row, not the item: the same serialized item can appear on more than one line (two M-4s, each with its own מסד). */
  id: string;
  item: Item;
  quantity: number;
  serial: string;
  lineNotes: string;
};

type AddRequest = { item: Item; quantity?: number };

/** A pause in adding an item that needs the operator's yes before it continues. */
type Prompt =
  | { kind: 'notEnlisted'; item: Item }
  | { kind: 'duplicate'; item: Item; existing: BasketLine[] }
  | { kind: 'overAllocation'; item: Item };

export function newLine(item: Item, quantity: number, serial = '', lineNotes = ''): BasketLine {
  return { id: crypto.randomUUID(), item, quantity, serial, lineNotes };
}

/**
 * Step 3 — what is going out.
 *
 * The paper 1008 is a list, so this is a list: one row per item, with its
 * quantity and its מסד where it has one.
 */
export function BasketStep({
  soldier,
  lines,
  onChange,
  onBack,
  onContinue,
}: {
  soldier: SoldierSummary;
  lines: BasketLine[];
  onChange: (lines: BasketLine[]) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const items = useItemsQuery();
  const entitlement = useSoldierEntitlementQuery(soldier.id);
  // Adding can pause for a confirmation (not enlisted, already on the list,
  // over the company's allocation). `ask` turns that pause into a promise so a
  // multi-select add can walk its items one by one and wait at each warning.
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const answer = useRef<((ok: boolean) => void) | null>(null);
  // Lines as of the latest add: several items are added in a row before React
  // re-renders, so each one must build on the previous result, not on the prop.
  const latest = useRef(lines);
  latest.current = lines;
  const [fetchBundle] = useLazyIssueBundleQuery();

  // A weapon's cap comes from the active תקופת שרות's חלוקה לפלוגות, not
  // anything on this screen — so the check only ever applies while a period
  // is actually open and the item has been added to its grid. Nothing to warn
  // about otherwise, same as before this existed.
  const activePeriod = useActiveServicePeriodQuery();
  const allocations = useCompanyAllocationsQuery(activePeriod.data?.id ?? '', {
    skip: !activePeriod.data,
  });

  const catalog = useMemo(
    () => (items.data ?? []).filter((i) => i.isActive && i.name !== 'לא מזוהה'),
    [items.data],
  );

  /** Remaining headroom for this soldier's company on this item, or `null`
   *  when there's nothing to check against (no active period, or the item
   *  isn't on its grid at all). */
  function remainingForCompany(item: Item): number | null {
    const row = allocations.data?.find((r) => r.itemId === item.id);
    if (!row) return null;
    return row.remaining[soldier.company];
  }

  function ask(next: Prompt): Promise<boolean> {
    return new Promise((resolve) => {
      answer.current = resolve;
      setPrompt(next);
    });
  }

  function resolvePrompt(ok: boolean): void {
    answer.current?.(ok);
    answer.current = null;
    setPrompt(null);
  }

  /** The lines to add for one item: the row itself plus whatever rides along with it. */
  async function build(req: AddRequest, current: BasketLine[]): Promise<BasketLine[]> {
    const { item, quantity } = req;
    const base = newLine(item, quantity ?? item.defaultQty);

    // Whatever always goes out with this item — its kit from the ערכות screen, nested kits included
    // (M-4 → מחסניות, רצועה…; מטולון → M-203). Optics and the like are not kit: the soldier's own
    // entitlement list offers those as separate rows.
    const extra = (await fetchBundle(item.name)).data ?? [];

    const taken = new Set(current.map((l) => l.item.id));
    taken.add(item.id);
    const extraLines = extra
      .filter((b) => !taken.has(b.item.id))
      .map((b) => newLine(b.item, b.quantity));
    return [...current, base, ...extraLines];
  }

  /** Adds items one by one, stopping at each warning for the operator's answer. */
  async function addItems(requests: AddRequest[]): Promise<void> {
    for (const req of requests) {
      const { item } = req;
      if (item.category === 'WEAPON') {
        // Hard block, not a confirmable warning like the over-allocation
        // dialog below: the server rejects a weapon line for a soldier who
        // isn't מחויל outright, so letting the operator build a basket around
        // one first only wastes the trip — stop it here instead.
        if (soldier.isEnlisted === false) {
          await ask({ kind: 'notEnlisted', item });
          continue;
        }
      }

      // A second unit of the same serialized item is legitimate (two M-4s,
      // each with its own מסד) but unusual enough to confirm. A non-serialized
      // item would collapse into one signature server-side, so its quantity
      // is edited on the existing row instead.
      const existing = latest.current.filter((l) => l.item.id === item.id);
      if (existing.length > 0) {
        if (!item.isSerialized) continue;
        if (!(await ask({ kind: 'duplicate', item, existing }))) continue;
      }

      if (item.category === 'WEAPON') {
        const remaining = remainingForCompany(item);
        if (remaining !== null && remaining <= 0) {
          if (!(await ask({ kind: 'overAllocation', item }))) continue;
        }
      }

      const next = await build(req, latest.current);
      latest.current = next;
      onChange(next);
    }
  }

  function addItem(item: Item, quantity?: number): void {
    void addItems([{ item, quantity }]);
  }

  function patch(lineId: string, changes: Partial<BasketLine>): void {
    onChange(lines.map((l) => (l.id === lineId ? { ...l, ...changes } : l)));
  }

  function removeLine(lineId: string): void {
    onChange(lines.filter((l) => l.id !== lineId));
  }

  /** Unticking an entitlement row drops every line of that item. */
  function removeItemLines(itemId: string): void {
    onChange(lines.filter((l) => l.item.id !== itemId));
  }

  // A serialized line without a מסד cannot be signed; the API refuses it and
  // so does this step, so the soldier is never asked to sign an invalid form.
  const missingSerialLines = lines.filter((l) => l.item.isSerialized && !l.serial.trim());
  const missingSerial = missingSerialLines.length > 0;
  // Named, with a count when the same item is on more than one row, so the
  // operator sees exactly which rows to fill rather than scanning for a red one.
  const missingSerialNames = [
    ...missingSerialLines
      .reduce((counts, l) => counts.set(l.item.name, (counts.get(l.item.name) ?? 0) + 1), new Map<string, number>())
      .entries(),
  ]
    .map(([name, n]) => (n > 1 ? `${name} ×${n}` : name))
    .join(', ');
  const ready = lines.length > 0 && !missingSerial;

  return (
    <div className="space-y-4">
      {!entitlement.isLoading && (entitlement.data?.length ?? 0) > 0 && (
        <EntitlementPanel
          entitlement={entitlement.data ?? []}
          lines={lines}
          onToggle={(item, quantity) => {
            const already = lines.some((l) => l.item.id === item.id);
            if (already) {
              removeItemLines(item.id);
              return;
            }
            addItem(item, quantity);
          }}
        />
      )}

      <Panel title={he.form1008.basket}>
        <div className="space-y-3 px-4 py-4">
          {lines.length === 0 ? (
            <p className="text-graphite">{he.form1008.basketEmpty}</p>
          ) : (
            <ul className="space-y-3">
              {lines.map((line) => (
                <BasketRow
                  key={line.id}
                  line={line}
                  soldierId={soldier.id}
                  onPatch={(changes) => patch(line.id, changes)}
                  onRemove={() => removeLine(line.id)}
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
            <ItemPicker
              catalog={catalog}
              lines={lines}
              onAdd={(picked) => void addItems(picked.map((item) => ({ item })))}
            />
          </div>

          {missingSerial && (
            <p className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
              {he.issue.serialRequired(missingSerialNames)}
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

      {prompt?.kind === 'overAllocation' && (
        <OverAllocationDialog
          item={prompt.item}
          company={soldier.company}
          onCancel={() => resolvePrompt(false)}
          onConfirm={() => resolvePrompt(true)}
        />
      )}

      {prompt?.kind === 'duplicate' && (
        <DuplicateDialog
          item={prompt.item}
          existing={prompt.existing}
          onCancel={() => resolvePrompt(false)}
          onConfirm={() => resolvePrompt(true)}
        />
      )}

      {prompt?.kind === 'notEnlisted' && (
        <NotEnlistedDialog
          item={prompt.item}
          soldierName={`${soldier.firstName} ${soldier.lastName}`}
          onClose={() => resolvePrompt(false)}
        />
      )}
    </div>
  );
}

/**
 * Not a block: a second M-4 or מאג for one soldier is sometimes right, and
 * only the operator knows. It is a deliberate extra step, naming what is
 * already on the list so a double-tap is not mistaken for intent.
 */
function DuplicateDialog({
  item,
  existing,
  onConfirm,
  onCancel,
}: {
  item: Item;
  existing: BasketLine[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const serials = existing.map((l) => l.serial.trim()).filter(Boolean);
  return (
    <Modal onClose={onCancel} role="alertdialog" className="w-full max-w-sm">
      <div className="space-y-3 px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass-wash text-brass">
            <span className="h-2.5 w-2.5 rounded-full bg-brass" />
          </span>
          <h2 className="text-lead font-semibold">{he.issue.duplicateTitle(item.name)}</h2>
        </div>
        <p className="text-meta text-ink-soft">{he.issue.duplicateBody(item.name, existing.length, serials)}</p>
        <div className="flex gap-2 pt-1">
          <Button onClick={onConfirm}>{he.issue.duplicateAction}</Button>
          <Button variant="quiet" onClick={onCancel}>
            {he.common.cancel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Pick items from the whole catalog, filtered as you type, ticking as many as
 * needed and adding them in one go. Case does not matter ("m-4" finds "M-4").
 *
 * A modal rather than a dropdown under the field: the field sits at the bottom
 * of a long basket, so a dropdown's own add button landed below the visible
 * area. Here the search is pinned at the top and the add button at the bottom,
 * and only the list between them scrolls.
 *
 * An item already on the list stays tickable: a second serialized unit is
 * allowed (after a warning). Only a non-serialized one is greyed out, since
 * its quantity is edited on its existing row.
 */
function ItemPicker({
  catalog,
  lines,
  onAdd,
}: {
  catalog: Item[];
  lines: BasketLine[];
  onAdd: (items: Item[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const q = normalizeSearch(query);
  const results = useMemo(() => catalog.filter((i) => itemMatches(i, q)), [catalog, q]);
  const inBasket = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of lines) counts.set(l.item.id, (counts.get(l.item.id) ?? 0) + 1);
    return counts;
  }, [lines]);

  function close(): void {
    setOpen(false);
    setQuery('');
    setPicked([]);
  }

  function toggle(id: string): void {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function commit(): void {
    const chosen = catalog.filter((i) => picked.includes(i.id));
    close();
    if (chosen.length > 0) onAdd(chosen);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center rounded-ctl border border-rule-strong bg-card-raised px-3 text-start text-body text-graphite hover:border-field"
      >
        {he.form1008.searchItem}
      </button>

      {open && (
        <Modal onClose={close} className="flex max-h-[85dvh] w-full max-w-lg flex-col">
          <div
            className="flex min-h-0 flex-1 flex-col"
            onKeyDown={(e) => e.key === 'Escape' && close()}
          >
            <header className="space-y-2 border-b border-rule px-4 py-3">
              <h2 className="text-lead font-semibold">{he.form1008.addItem}</h2>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={he.form1008.searchItem}
                role="combobox"
                aria-expanded="true"
                aria-controls="item-picker-list"
                className="h-11 w-full rounded-ctl border border-rule-strong bg-card-raised px-3 text-body"
              />
            </header>

            <ul
              id="item-picker-list"
              role="listbox"
              aria-multiselectable="true"
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {results.length === 0 && (
                <li className="px-3 py-6 text-center text-meta text-graphite">{he.common.noResults}</li>
              )}
              {results.map((i) => {
                const on = picked.includes(i.id);
                const count = inBasket.get(i.id) ?? 0;
                const blocked = count > 0 && !i.isSerialized;
                return (
                  <li key={i.id} role="option" aria-selected={on} aria-disabled={blocked}>
                    <button
                      disabled={blocked}
                      onClick={() => toggle(i.id)}
                      className={`flex w-full items-center gap-2.5 px-4 py-3 text-start transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        on ? 'bg-field-wash' : 'hover:bg-card'
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border-2 ${
                          on ? 'border-field bg-field text-white' : 'border-rule-strong bg-card-raised'
                        }`}
                      >
                        {on && (
                          <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none">
                            <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <CategoryDot category={i.category} />
                      <span className="min-w-0 flex-1 truncate font-semibold">{i.name}</span>
                      {count > 0 && <Tag tone="brass">{he.issue.inList(count)}</Tag>}
                      {i.isSerialized && <Tag tone="brass">{he.signatures.serial}</Tag>}
                    </button>
                  </li>
                );
              })}
            </ul>

            <footer className="flex items-center gap-2 border-t border-rule bg-card px-4 py-3">
              <Button onClick={commit} disabled={picked.length === 0}>
                {he.issue.addPicked(picked.length)}
              </Button>
              {picked.length > 0 && (
                <button onClick={() => setPicked([])} className="inline-flex min-h-10 items-center px-1 text-meta font-semibold text-field hover:underline">
                  {he.issue.clearPicked}
                </button>
              )}
              <Button variant="quiet" className="ms-auto" onClick={close}>
                {he.common.cancel}
              </Button>
            </footer>
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * Unlike the over-allocation dialog, there is no "issue anyway" here — the
 * server rejects a weapon line for a soldier שלישות hasn't marked מחויל no
 * matter what, so the only useful action is closing this and going to fix
 * the enlistment status first.
 */
function NotEnlistedDialog({
  item,
  soldierName,
  onClose,
}: {
  item: Item;
  soldierName: string;
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} role="alertdialog" className="w-full max-w-sm">
        <div className="space-y-3 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-oxide-wash text-oxide">
              <span className="h-2.5 w-2.5 rounded-full bg-oxide" />
            </span>
            <h2 className="text-lead font-semibold">{he.issue.notEnlistedTitle(item.name)}</h2>
          </div>
          <p className="text-meta text-ink-soft">{he.issue.notEnlistedBody(soldierName)}</p>
          <div className="flex gap-2 pt-1">
            <Button variant="quiet" onClick={onClose}>
              {he.common.close}
            </Button>
          </div>
        </div>
    </Modal>
  );
}

/**
 * The plan said this company already has everything it was allocated for
 * this weapon — not a hard block, since the samgad's plan can be wrong or
 * stale, but a deliberate extra step before going over it.
 */
function OverAllocationDialog({
  item,
  company,
  onConfirm,
  onCancel,
}: {
  item: Item;
  company: SoldierSummary['company'];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal onClose={onCancel} role="alertdialog" className="w-full max-w-sm">
        <div className="space-y-3 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-oxide-wash text-oxide">
              <span className="h-2.5 w-2.5 rounded-full bg-oxide" />
            </span>
            <h2 className="text-lead font-semibold">{he.issue.overAllocationTitle(item.name)}</h2>
          </div>
          <p className="text-meta text-ink-soft">
            {he.issue.overAllocationBody(he.companies[company])}
          </p>
          <div className="flex gap-2 pt-1">
            <Button variant="danger" onClick={onConfirm}>
              {he.issue.overAllocationAction}
            </Button>
            <Button variant="quiet" onClick={onCancel}>
              {he.common.cancel}
            </Button>
          </div>
        </div>
    </Modal>
  );
}

/**
 * What this soldier is entitled to this period, straight from his own
 * חלוקה לפי חייל — shown before the search box so the operator starts from
 * "here's everything he's supposed to get" and picks what to actually hand
 * out, rather than hunting for each item by name. Toggling a line off just
 * removes it from the basket; it doesn't touch the entitlement itself, so
 * re-checking it later brings it right back. Each row is added on its own —
 * no accessory bundle expansion here, since a weapon's accessories are
 * already their own separate rows in this same list for the operator to
 * check individually. A weapon row still goes through the normal
 * over-allocation check.
 */
function EntitlementPanel({
  entitlement,
  lines,
  onToggle,
}: {
  entitlement: { item: Item; quantity: number }[];
  lines: BasketLine[];
  onToggle: (item: Item, quantity: number) => void;
}) {
  const takenIds = new Set(lines.map((l) => l.item.id));

  return (
    <Panel title={he.form1008.entitlementTitle}>
      <div className="space-y-2 px-4 py-4">
        <p className="text-meta text-graphite">{he.form1008.entitlementHint}</p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {entitlement.map(({ item, quantity }) => {
            const checked = takenIds.has(item.id);
            return (
              <li key={item.id}>
                <button
                  onClick={() => onToggle(item, quantity)}
                  aria-pressed={checked}
                  className={`flex w-full items-center gap-2.5 rounded-ctl border px-3 py-2.5 text-start transition-colors ${
                    checked
                      ? 'border-field bg-field-wash'
                      : 'border-rule-strong bg-card-raised hover:border-field'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] border-2 transition-colors ${
                      checked ? 'border-field bg-field text-white' : 'border-rule-strong bg-card-raised'
                    }`}
                  >
                    {checked && (
                      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none">
                        <path
                          d="M3.5 8.5l3 3 6-6.5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <CategoryDot category={item.category} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{item.name}</span>
                  {!item.isSerialized && quantity > 1 && (
                    <span className="shrink-0 text-meta text-graphite">×{quantity}</span>
                  )}
                  {item.isSerialized && <Tag tone="brass">{he.signatures.serial}</Tag>}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Panel>
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
  soldierId,
  onPatch,
  onRemove,
}: {
  line: BasketLine;
  soldierId: string;
  onPatch: (changes: Partial<BasketLine>) => void;
  onRemove: () => void;
}) {
  const { item } = line;
  // A non-serialized נשק/אופטיקה item (e.g. מטולון) can still happen to carry
  // its own מסד — not every unit of these is tracked that way, so it's
  // offered rather than required. Toggled on, it replaces the quantity field
  // the same way a catalog-serialized item's always does; off, it's a plain
  // quantity row. Bulk accessories (מחסניות, מק פורק, …) never get this
  // option — a מסד on a box of magazines makes no sense.
  const canOptIntoSerial =
    !item.isSerialized && (item.category === 'WEAPON' || item.category === 'OPTICS');
  const [optedIntoSerial, setOptedIntoSerial] = useState(false);
  const usesSerialField = item.isSerialized || optedIntoSerial;

  const available = useAvailableInstancesQuery(
    { itemId: item.id, soldierId },
    { skip: !usesSerialField },
  );
  const isNewSerial =
    line.serial.trim().length > 0 &&
    available.data !== undefined &&
    !available.data.some((i) => i.serial === line.serial.trim());

  // His own last-held serial for this item, if he had one and it's still
  // free — offered as a default, not forced: the operator can still pick
  // any other free serial or type a new one (the weapon was swapped, is
  // faulty, etc). Prefilled once per row rather than every render, so
  // clearing the field by hand doesn't bounce straight back.
  const previouslyHeld = available.data?.find((i) => i.isPreviouslyHeld);
  const prefilledFromMemory = useRef(false);
  useEffect(() => {
    if (previouslyHeld && !line.serial.trim() && !prefilledFromMemory.current) {
      prefilledFromMemory.current = true;
      onPatch({ serial: previouslyHeld.serial, quantity: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previouslyHeld]);

  return (
    <li className="rounded-ctl border border-rule bg-card-raised px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 font-semibold">
          <CategoryDot category={item.category} />
          {item.name}
          {item.isSerialized && <Tag tone="brass">{he.form1008.serialNeeded}</Tag>}
        </span>
        <div className="flex shrink-0 items-center gap-3">
          {canOptIntoSerial && (
            <button
              onClick={() => {
                if (optedIntoSerial) onPatch({ serial: '', quantity: item.defaultQty });
                else onPatch({ quantity: 1 });
                setOptedIntoSerial((v) => !v);
              }}
              className="inline-flex min-h-10 items-center text-meta font-semibold text-field-dark hover:underline"
            >
              {optedIntoSerial ? he.form1008.removeSerial : he.form1008.addSerial}
            </button>
          )}
          <button
            onClick={onRemove}
            className="inline-flex min-h-10 items-center px-1 text-meta font-semibold text-oxide hover:underline"
          >
            {he.form1008.remove}
          </button>
        </div>
      </div>

      <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_1fr]">
        {usesSerialField ? (
          <div className="sm:col-span-2">
            <label className="block">
              <span className="mb-1 block text-meta font-semibold text-ink-soft">
                {he.issue.serialLabel}
              </span>
              <input
                value={line.serial}
                onChange={(e) => onPatch({ serial: e.target.value, quantity: 1 })}
                className="serial h-11 w-full rounded-ctl border-2 border-brass bg-brass-wash px-3 text-lead"
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
                    title={inst.isPreviouslyHeld ? he.issue.previouslyHeldHint : undefined}
                    className={`inline-flex min-h-10 items-center gap-1 rounded-ctl border px-3 text-meta ${
                      line.serial === inst.serial
                        ? 'border-brass bg-brass text-white'
                        : inst.isPreviouslyHeld
                          ? 'border-field bg-field-wash'
                          : 'border-rule-strong hover:border-brass'
                    }`}
                  >
                    {inst.isPreviouslyHeld && line.serial !== inst.serial && (
                      <span aria-hidden>↺</span>
                    )}
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
          className="h-11 w-11 shrink-0 rounded-ctl border border-rule-strong bg-card text-lead font-semibold hover:bg-field-wash"
        >
          −
        </button>
        <input
          type="number"
          min={0}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="serial h-11 w-full rounded-ctl border border-rule-strong bg-card-raised px-3 text-center text-body"
        />
        <button
          onClick={() => onChange(value + 1)}
          aria-label="+"
          className="h-11 w-11 shrink-0 rounded-ctl border border-rule-strong bg-card text-lead font-semibold hover:bg-field-wash"
        >
          +
        </button>
      </div>
      <p className="mt-1 text-micro text-graphite">{he.form1008.quantityZeroHint}</p>
    </div>
  );
}
