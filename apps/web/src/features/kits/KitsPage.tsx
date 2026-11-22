import { useMemo, useState } from 'react';
import {
  useItemKitHistoryQuery,
  useItemKitQuery,
  useItemKitsQuery,
  useItemsQuery,
  useSaveItemKitMutation,
} from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  CategoryDot,
  EmptyState,
  formatDateTime,
  Panel,
  SearchField,
  Select,
  Spinner,
  Tag,
  TextField,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import { itemMatches, normalizeSearch } from '../../lib/search';
import type { Item, ItemKitDetail, KitSnapshotLine } from '../../lib/types';

type DraftLine = { item: Item; quantity: string };

function quantityOf(line: DraftLine): number | null {
  const n = Number(line.quantity);
  return Number.isInteger(n) && n >= 1 && n <= 99 ? n : null;
}

/**
 * ערכות — what rides along into the 1008 basket when an item is issued. The whole kit is edited as a
 * draft and saved in one step, so a kit is never half-edited when someone issues in the meantime, and
 * each save is one history entry.
 */
export function KitsPage() {
  const items = useItemsQuery();
  const kits = useItemKitsQuery();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const lineCountById = useMemo(
    () => new Map((kits.data ?? []).map((k) => [k.baseItem.id, k.lineCount])),
    [kits.data],
  );

  const catalog = useMemo(() => {
    const all = (items.data ?? []).filter((i) => i.isActive);
    if (!query.trim()) return all;
    const q = normalizeSearch(query);
    return all.filter((i) => itemMatches(i, q));
  }, [items.data, query]);

  if (items.isLoading || kits.isLoading) return <Spinner />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-display font-bold">{he.kits.title}</h1>
        <p className="mt-1 text-ink-soft">{he.kits.subtitle}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="space-y-3">
          <SearchField value={query} onSearch={setQuery} placeholder={he.kits.searchPlaceholder} debounceMs={0} />
          <Panel>
            <ul className="max-h-[60vh] divide-y divide-rule overflow-y-auto">
              {catalog.map((item) => {
                const count = lineCountById.get(item.id);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      aria-current={item.id === selectedId}
                      className={`flex min-h-11 w-full items-center gap-2 px-3 py-2 text-start transition-colors hover:bg-card-raised ${
                        item.id === selectedId ? 'bg-card-raised font-semibold' : ''
                      }`}
                    >
                      <CategoryDot category={item.category} />
                      <span className="flex-1">{item.name}</span>
                      {count ? <Tag>{he.kits.hasKit(count)}</Tag> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>

        {selectedId ? <KitEditor key={selectedId} baseItemId={selectedId} allItems={items.data ?? []} /> : (
          <Panel>
            <EmptyState>{he.kits.pickPrompt}</EmptyState>
          </Panel>
        )}
      </div>
    </div>
  );
}

function KitEditor({ baseItemId, allItems }: { baseItemId: string; allItems: Item[] }) {
  const kit = useItemKitQuery(baseItemId);
  if (kit.isLoading || !kit.data) return <Spinner />;
  // Re-keyed on the saved version so the draft resets to what the server now holds.
  return <KitDraft key={kit.data.updatedAt ?? 'none'} kit={kit.data} allItems={allItems} />;
}

function KitDraft({ kit, allItems }: { kit: ItemKitDetail; allItems: Item[] }) {
  const toast = useToast();
  const [save, { isLoading, error }] = useSaveItemKitMutation();
  const initial = useMemo<DraftLine[]>(
    () => kit.lines.map((l) => ({ item: l.item, quantity: String(l.quantity) })),
    [kit.lines],
  );
  const [lines, setLines] = useState<DraftLine[]>(initial);

  const dirty = JSON.stringify(lines.map((l) => [l.item.id, l.quantity])) !==
    JSON.stringify(initial.map((l) => [l.item.id, l.quantity]));
  const valid = lines.every((l) => quantityOf(l) !== null);

  const taken = new Set(lines.map((l) => l.item.id));
  const addable = allItems.filter((i) => i.isActive && i.id !== kit.baseItem.id && !taken.has(i.id));

  function setQuantity(id: string, quantity: string): void {
    setLines((cur) => cur.map((l) => (l.item.id === id ? { ...l, quantity } : l)));
  }

  async function submit(): Promise<void> {
    const result = await save({
      baseItemId: kit.baseItem.id,
      lines: lines.map((l) => ({ itemId: l.item.id, quantity: quantityOf(l) ?? 1 })),
    });
    if (result.data) {
      toast.success({ title: lines.length === 0 ? he.kits.removed : he.kits.saved, detail: kit.baseItem.name });
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  return (
    <div className="space-y-5">
      <Panel>
        <div className="space-y-4 p-4">
          <h2 className="text-title font-bold">{he.kits.editing(kit.baseItem.name)}</h2>

          {lines.length === 0 ? (
            <p className="text-ink-soft">{he.kits.empty}</p>
          ) : (
            <ul className="divide-y divide-rule">
              {lines.map((l) => (
                <li key={l.item.id} className="grid items-end gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_6rem_auto]">
                  <div className="font-semibold">{l.item.name}</div>
                  <TextField
                    label={he.kits.quantity}
                    value={l.quantity}
                    inputMode="numeric"
                    required
                    onChange={(v) => setQuantity(l.item.id, v)}
                    error={quantityOf(l) === null ? ' ' : undefined}
                  />
                  <Button
                    variant="quiet"
                    onClick={() => setLines((cur) => cur.filter((x) => x.item.id !== l.item.id))}
                  >
                    <span aria-hidden="true">✕</span>
                    <span className="sr-only">{he.kits.removeLine(l.item.name)}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <Select<string>
            label={he.kits.addLine}
            value=""
            onChange={(id) => {
              const item = allItems.find((i) => i.id === id);
              if (item) setLines((cur) => [...cur, { item, quantity: '1' }]);
            }}
            options={[{ value: '', label: he.kits.addPlaceholder }, ...addable.map((i) => ({ value: i.id, label: i.name }))]}
          />
          <p className="text-meta text-graphite">{he.kits.nestedHint}</p>

          {error ? <p role="alert" className="text-oxide">{apiErrorMessage(error)}</p> : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void submit()} disabled={!dirty || !valid || isLoading}>
              {he.kits.save}
            </Button>
            <Button variant="quiet" onClick={() => setLines(initial)} disabled={!dirty || isLoading}>
              {he.kits.discard}
            </Button>
            {dirty && <span className="text-meta text-graphite">{he.kits.unsaved}</span>}
          </div>
        </div>
      </Panel>

      <KitHistory baseItemId={kit.baseItem.id} />
    </div>
  );
}

function KitHistory({ baseItemId }: { baseItemId: string }) {
  const history = useItemKitHistoryQuery(baseItemId);
  const rows = history.data ?? [];
  const describe = (lines: KitSnapshotLine[]): string =>
    lines.length === 0
      ? he.kits.historyNone
      : lines.map((l) => he.kits.historyLine(l.itemName, l.quantity)).join('، ');

  return (
    <Panel>
      <div className="space-y-3 p-4">
        <h2 className="text-title font-bold">{he.kits.history}</h2>
        {history.isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <p className="text-ink-soft">{he.kits.historyEmpty}</p>
        ) : (
          <ul className="divide-y divide-rule">
            {rows.map((r) => (
              <li key={r.id} className="space-y-1 py-3">
                <div className="text-meta text-graphite">
                  {formatDateTime(r.at)} · {he.kits.historyBy(r.actorName)}
                </div>
                <div className="text-meta text-ink-soft">
                  <span className="font-semibold">{he.kits.before}</span> {describe(r.before)}
                </div>
                <div className="text-meta">
                  <span className="font-semibold">{he.kits.after}</span> {describe(r.after)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
