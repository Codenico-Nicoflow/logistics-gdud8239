import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useActiveServicePeriodQuery,
  useAvailableInstancesQuery,
  useCompanyAllocationsQuery,
  useItemsQuery,
  useLazyIssueBundleQuery,
  useLazyItemPairingsQuery,
  useSoldierEntitlementQuery,
} from '../../lib/api';
import { Button, CategoryDot, Modal, Panel, Serial, Tag, TextField } from '../../components/ui';
import { he } from '../../i18n/he';
import type { Item, SoldierSummary } from '../../lib/types';

/** One row of the handover, as it is being assembled on screen. */
export type BasketLine = {
  item: Item;
  quantity: number;
  serial: string;
  lineNotes: string;
};

/**
 * How much rides along automatically with a just-added item:
 * - `full`: search-box add — always load + eligible accessories + pairings.
 * - `entitlement`: row ticked from the entitlement list — always load (for a
 *   personal rifle) + its hard pairing (e.g. מטולון → M-203), but never the
 *   optional accessories, since those are already their own separate rows
 *   in that same list for the operator to tick on their own.
 */
type AddMode = 'full' | 'entitlement';

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
  const [itemQuery, setItemQuery] = useState('');
  const [overAllocationPick, setOverAllocationPick] = useState<
    { item: Item; mode: AddMode; quantity?: number } | null
  >(null);
  const [notEnlistedBlock, setNotEnlistedBlock] = useState<Item | null>(null);
  const [fetchBundle] = useLazyIssueBundleQuery();
  const [fetchPairings] = useLazyItemPairingsQuery();

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

  const matches = useMemo(() => {
    const q = itemQuery.trim();
    if (!q) return [];
    const taken = new Set(lines.map((l) => l.item.id));
    return catalog
      .filter((i) => i.name.includes(q) || i.aliases.some((a) => a.includes(q)))
      .filter((i) => !taken.has(i.id))
      .slice(0, 8);
  }, [catalog, itemQuery, lines]);

  /** Remaining headroom for this soldier's company on this item, or `null`
   *  when there's nothing to check against (no active period, or the item
   *  isn't on its grid at all). */
  function remainingForCompany(item: Item): number | null {
    const row = allocations.data?.find((r) => r.itemId === item.id);
    if (!row) return null;
    return row.remaining[soldier.company];
  }

  async function reallyAddItem(item: Item, mode: AddMode, quantity?: number): Promise<void> {
    const base: BasketLine = { item, quantity: quantity ?? item.defaultQty, serial: '', lineNotes: '' };
    setItemQuery('');

    let extra: { item: Item; quantity: number }[] = [];
    if (mode === 'full') {
      // Added via the search box: the full bundle rides along — standard
      // load always, plus anything the soldier's own חלוקה לפי חייל makes
      // him eligible for (מטולון, מכפל, שחמ, …), plus hard pairings chained
      // off whichever of those got included (מטולון → M-203). The server
      // already folds pairings into this response.
      const result = await fetchBundle({ itemName: item.name, soldierId: soldier.id });
      extra = result.data ?? [];
    } else {
      // Checked as a row in the entitlement list: only the non-optional load
      // comes along automatically (`bundleRuleFor` is null for anything that
      // isn't a personal rifle, so this is a no-op there) — every optional
      // accessory is already its own separate row in that same list for the
      // operator to tick on its own. Then always layer the item's own hard
      // pairing on top regardless of what kind of item it is: a personal
      // rifle has none, מטולון always pulls M-203, and so on — this must not
      // be gated on category, since מטולון's own catalog category is
      // WEAPON too despite not being a bundleRuleFor base item.
      const [bundleResult, pairingResult] = await Promise.all([
        fetchBundle({ itemName: item.name, soldierId: soldier.id, alwaysOnly: true }),
        fetchPairings(item.name),
      ]);
      extra = [...(bundleResult.data ?? []), ...(pairingResult.data ?? [])];
    }

    const taken = new Set([item.id, ...lines.map((l) => l.item.id)]);
    const extraLines: BasketLine[] = extra
      .filter((b) => !taken.has(b.item.id))
      .map((b) => ({ item: b.item, quantity: b.quantity, serial: '', lineNotes: '' }));

    onChange([...lines, base, ...extraLines]);
  }

  function addItem(item: Item, mode: AddMode = 'full', quantity?: number): void {
    if (item.category === 'WEAPON') {
      // Hard block, not a confirmable warning like the over-allocation
      // dialog below: the server rejects a weapon line for a soldier who
      // isn't מחויל outright, so letting the operator build a basket around
      // one first only wastes the trip — stop it here instead.
      if (soldier.isEnlisted === false) {
        setNotEnlistedBlock(item);
        return;
      }
      const remaining = remainingForCompany(item);
      if (remaining !== null && remaining <= 0) {
        setOverAllocationPick({ item, mode, quantity });
        return;
      }
    }
    void reallyAddItem(item, mode, quantity);
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
      {!entitlement.isLoading && (entitlement.data?.length ?? 0) > 0 && (
        <EntitlementPanel
          entitlement={entitlement.data ?? []}
          lines={lines}
          onToggle={(item, quantity) => {
            const already = lines.some((l) => l.item.id === item.id);
            if (already) {
              removeLine(item.id);
              return;
            }
            addItem(item, 'entitlement', quantity);
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
                  key={line.item.id}
                  line={line}
                  soldierId={soldier.id}
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
              className="h-11 w-full rounded-ctl border border-rule-strong bg-card-raised px-3 text-body"
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

      {overAllocationPick && (
        <OverAllocationDialog
          item={overAllocationPick.item}
          company={soldier.company}
          onCancel={() => setOverAllocationPick(null)}
          onConfirm={() => {
            void reallyAddItem(overAllocationPick.item, overAllocationPick.mode, overAllocationPick.quantity);
            setOverAllocationPick(null);
          }}
        />
      )}

      {notEnlistedBlock && (
        <NotEnlistedDialog
          item={notEnlistedBlock}
          soldierName={`${soldier.firstName} ${soldier.lastName}`}
          onClose={() => setNotEnlistedBlock(null)}
        />
      )}
    </div>
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
              className="text-meta font-semibold text-field-dark hover:underline"
            >
              {optedIntoSerial ? he.form1008.removeSerial : he.form1008.addSerial}
            </button>
          )}
          <button
            onClick={onRemove}
            className="text-meta font-semibold text-oxide hover:underline"
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
                    className={`inline-flex items-center gap-1 rounded-ctl border px-2 py-1 text-meta ${
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
