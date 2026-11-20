import { useMemo, useState } from 'react';
import { useItemsQuery, useUpdateItemMutation } from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  CategoryDot,
  Panel,
  SearchField,
  Spinner,
  Tag,
  TableScroll,
  Td,
  Th,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import type { Item } from '../../lib/types';

/**
 * מיפוי שמות — reference only, not used anywhere else in the app's logic.
 * ימ"ח sheets and other paper sources name things their own way ("MMX3",
 * "לאור 3*"); this records what that name turned out to mean, so the next
 * person reading a scan does not have to re-derive it from scratch.
 *
 * Writes directly to the catalog's existing `aliases` field — no separate
 * table — so an alias saved here also helps Excel-import matching, same as
 * any other alias.
 */
export function NamingPage() {
  const items = useItemsQuery();
  const [query, setQuery] = useState('');

  const catalog = useMemo(() => {
    const all = (items.data ?? []).filter((i) => i.isActive);
    if (!query.trim()) return all;
    const q = query.trim();
    return all.filter((i) => i.name.includes(q) || i.aliases.some((a) => a.includes(q)));
  }, [items.data, query]);

  if (items.isLoading) return <Spinner />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-display font-bold">{he.naming.title}</h1>
        <p className="mt-1 text-ink-soft">{he.naming.subtitle}</p>
      </div>

      <SearchField value={query} onSearch={setQuery} placeholder={he.naming.searchPlaceholder} />

      <Panel>
        <TableScroll>
          <table className="row-hover w-full">
            <thead>
              <tr>
                <Th>{he.naming.catalogName}</Th>
                <Th>{he.naming.aliases}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {catalog.map((item) => (
                <NamingRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Panel>
    </div>
  );
}

function NamingRow({ item }: { item: Item }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [update, { isLoading, error }] = useUpdateItemMutation();
  const toast = useToast();

  async function addAlias(): Promise<void> {
    const alias = draft.trim();
    if (!alias || item.aliases.includes(alias)) return;
    const result = await update({ id: item.id, aliases: [...item.aliases, alias] });
    if (result.data) {
      setDraft('');
      setAdding(false);
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  async function removeAlias(alias: string): Promise<void> {
    await update({ id: item.id, aliases: item.aliases.filter((a) => a !== alias) });
  }

  return (
    <tr>
      <Td>
        <span className="flex items-center gap-2 font-semibold">
          <CategoryDot category={item.category} />
          {item.name}
        </span>
      </Td>
      <Td>
        <div className="flex flex-wrap items-center gap-1.5">
          {item.aliases.length === 0 && !adding && (
            <span className="text-graphite">{he.naming.noAliases}</span>
          )}
          {item.aliases.map((alias) => (
            <Tag key={alias}>
              <span className="inline-flex items-center gap-1.5">
                {alias}
                <button
                  onClick={() => void removeAlias(alias)}
                  aria-label={he.naming.removeAlias}
                  className="text-oxide hover:underline"
                >
                  ×
                </button>
              </span>
            </Tag>
          ))}
          {adding ? (
            <span className="flex items-center gap-1.5">
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void addAlias();
                  if (e.key === 'Escape') {
                    setAdding(false);
                    setDraft('');
                  }
                }}
                placeholder={he.naming.aliasPlaceholder}
                className="rounded-ctl border border-rule-strong bg-card-raised px-2 py-1 text-meta"
              />
              <Button size="sm" onClick={() => void addAlias()} disabled={isLoading}>
                {he.naming.save}
              </Button>
            </span>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="rounded-ctl border border-dashed border-rule-strong px-2 py-1 text-meta text-graphite hover:border-field hover:text-field-dark"
            >
              {he.naming.addAlias}
            </button>
          )}
        </div>
        {apiErrorMessage(error) && (
          <p className="mt-1 text-micro text-oxide">{apiErrorMessage(error)}</p>
        )}
      </Td>
      <Td />
    </tr>
  );
}
