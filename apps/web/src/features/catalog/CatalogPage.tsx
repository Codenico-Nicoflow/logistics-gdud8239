import { useEffect, useState } from 'react';
import {
  useCreateItemMutation,
  useDeleteItemMutation,
  useItemsQuery,
  useLazyDeletionCheckQuery,
  useSummaryQuery,
  useUpdateItemMutation,
} from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  CategoryTag,
  Panel,
  Select,
  Spinner,
  TableScroll,
  Tag,
  Td,
  Th,
  TextField,
} from '../../components/ui';
import { he } from '../../i18n/he';
import type { DeletionCheck, Item, ItemCategory } from '../../lib/types';

const CATEGORIES: ItemCategory[] = ['WEAPON', 'OPTICS', 'DRONE', 'GEAR'];

export function CatalogPage() {
  const { data: items, isLoading } = useItemsQuery();
  const { data: summary } = useSummaryQuery();
  const [editing, setEditing] = useState<Item | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Item | null>(null);

  const issuedByName = new Map((summary ?? []).map((r) => [r.itemName, r.issued]));

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display font-bold">{he.catalog.title}</h1>
          <p className="mt-1 text-ink-soft">{he.catalog.subtitle}</p>
        </div>
        <Button onClick={() => setAdding(true)}>{he.catalog.add}</Button>
      </div>

      <Panel>
        <TableScroll>
          <table className="row-hover w-full">
            <thead>
              <tr>
                <Th>{he.catalog.name}</Th>
                <Th>{he.catalog.category}</Th>
                <Th numeric>{he.catalog.serialized}</Th>
                <Th numeric>{he.catalog.authorized}</Th>
                <Th numeric>{he.catalog.issued}</Th>
                <Th>{he.catalog.catalogNo}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {(items ?? []).map((item) => (
                <tr key={item.id} className={item.isActive ? undefined : 'opacity-50'}>
                  <Td className="font-semibold">
                    {item.name}
                    {!item.isActive && (
                      <Tag>
                        <span className="mx-1">{he.catalog.deactivated}</span>
                      </Tag>
                    )}
                  </Td>
                  <Td>
                    <CategoryTag category={item.category} />
                  </Td>
                  <Td numeric>
                    {item.isSerialized ? (
                      <Tag tone="brass">{he.common.yes}</Tag>
                    ) : (
                      <span className="text-graphite">{he.common.no}</span>
                    )}
                  </Td>
                  <Td numeric>{item.authorizedQty}</Td>
                  <Td numeric className="text-field-dark">
                    {issuedByName.get(item.name) ?? 0}
                  </Td>
                  <Td className="text-meta text-graphite">{item.catalogNo ?? he.common.none}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button variant="quiet" size="sm" onClick={() => setEditing(item)}>
                        {he.catalog.edit}
                      </Button>
                      <Button variant="quiet" size="sm" onClick={() => setRemoving(item)}>
                        {he.catalog.remove}
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Panel>

      {adding && <ItemDialog onClose={() => setAdding(false)} />}
      {editing && <ItemDialog item={editing} onClose={() => setEditing(null)} />}
      {removing && <RemoveDialog item={removing} onClose={() => setRemoving(null)} />}
    </div>
  );
}

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-panel border border-rule bg-card-raised shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="rounded-t-panel border-b border-rule bg-card px-4 py-3">
          <h2 className="text-lead font-semibold">{title}</h2>
        </header>
        <div className="space-y-3 px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

function ItemDialog({ item, onClose }: { item?: Item; onClose: () => void }) {
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState<ItemCategory>(item?.category ?? 'WEAPON');
  const [isSerialized, setIsSerialized] = useState(item?.isSerialized ?? true);
  const [authorizedQty, setAuthorizedQty] = useState(String(item?.authorizedQty ?? 0));
  const [catalogNo, setCatalogNo] = useState(item?.catalogNo ?? '');
  const [aliases, setAliases] = useState((item?.aliases ?? []).join(', '));

  const [create, createState] = useCreateItemMutation();
  const [update, updateState] = useUpdateItemMutation();
  const isSaving = createState.isLoading || updateState.isLoading;
  const message = apiErrorMessage(createState.error ?? updateState.error);

  async function submit(): Promise<void> {
    const payload = {
      name: name.trim(),
      category,
      isSerialized,
      authorizedQty: Number(authorizedQty) || 0,
      ...(catalogNo ? { catalogNo } : {}),
      aliases: aliases
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
    };
    const result = item
      ? await update({ id: item.id, ...payload })
      : await create(payload);
    if (result.data) onClose();
  }

  return (
    <Dialog
      title={item ? he.catalog.editTitle(item.name) : he.catalog.addTitle}
      onClose={onClose}
    >
      <TextField label={he.catalog.name} value={name} onChange={setName} autoFocus required />
      <Select
        label={he.catalog.category}
        value={category}
        onChange={(v) => v && setCategory(v as ItemCategory)}
        options={CATEGORIES.map((c) => ({ value: c, label: he.categories[c] }))}
      />
      <label className="flex items-center gap-2 rounded-ctl border border-rule bg-card px-3 py-2">
        <input
          type="checkbox"
          checked={isSerialized}
          onChange={(e) => setIsSerialized(e.target.checked)}
        />
        <span className="font-semibold">{he.catalog.serialized}</span>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={he.catalog.authorized}
          value={authorizedQty}
          onChange={setAuthorizedQty}
          type="number"
          required
        />
        <TextField label={he.catalog.catalogNo} value={catalogNo} onChange={setCatalogNo} />
      </div>
      <TextField
        label={he.catalog.aliases}
        value={aliases}
        onChange={setAliases}
        hint={he.catalog.aliasesHint}
      />

      {message && (
        <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
          {message}
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={() => void submit()} disabled={isSaving || !name.trim()}>
          {isSaving ? he.common.saving : he.common.save}
        </Button>
        <Button variant="quiet" onClick={onClose}>
          {he.common.cancel}
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * Deletion is checked before it is offered: the dialog asks the API what is
 * blocking and says so plainly, rather than letting the operator press delete
 * and handing back a failure.
 */
function RemoveDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const [check, setCheck] = useState<DeletionCheck | null>(null);
  const [runCheck, { isFetching }] = useLazyDeletionCheckQuery();
  const [remove, removeState] = useDeleteItemMutation();
  const [update, updateState] = useUpdateItemMutation();

  useEffect(() => {
    void runCheck(item.id).then((r) => {
      if (r.data) setCheck(r.data);
    });
  }, [item.id, runCheck]);

  async function confirmDelete(): Promise<void> {
    const result = await remove(item.id);
    if (result.data) onClose();
  }

  async function deactivate(): Promise<void> {
    const result = await update({ id: item.id, isActive: false });
    if (result.data) onClose();
  }

  const message = apiErrorMessage(removeState.error ?? updateState.error);

  return (
    <Dialog title={he.catalog.removeTitle(item.name)} onClose={onClose}>
      {isFetching || !check ? (
        <Spinner />
      ) : check.canDelete ? (
        <>
          <p className="text-ink-soft">{he.catalog.removeConfirm}</p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => void confirmDelete()} disabled={removeState.isLoading}>
              {he.catalog.remove}
            </Button>
            <Button variant="quiet" onClick={onClose}>
              {he.common.cancel}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-ctl bg-oxide-wash px-3 py-2">
            <p className="font-semibold text-oxide">{he.catalog.cannotRemove}</p>
            <ul className="mt-1 list-inside list-disc text-meta text-ink-soft">
              {check.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
          <p className="text-meta text-graphite">{he.catalog.cannotRemoveHint}</p>
          <div className="flex gap-2">
            {item.isActive && (
              <Button onClick={() => void deactivate()} disabled={updateState.isLoading}>
                {he.catalog.deactivate}
              </Button>
            )}
            <Button variant="quiet" onClick={onClose}>
              {he.common.close}
            </Button>
          </div>
        </>
      )}
      {message && (
        <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
          {message}
        </p>
      )}
    </Dialog>
  );
}
