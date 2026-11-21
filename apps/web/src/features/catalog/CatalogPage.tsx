import { useEffect, useState } from 'react';
import {
  useCreateItemMutation,
  useDeleteItemMutation,
  useItemQuery,
  useItemsQuery,
  useLazyDeletionCheckQuery,
  useRemoveInstanceMutation,
  useSetInstanceStatusMutation,
  useSubmitIntakeMutation,
  useSummaryQuery,
  useUpdateItemMutation,
} from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  CategoryTag,
  Modal,
  Panel,
  Select,
  Serial,
  Spinner,
  TableScroll,
  Tag,
  Td,
  Th,
  TextField,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import type { DeletionCheck, Item, ItemCategory, ItemInstanceWithHolder } from '../../lib/types';

const CATEGORIES: ItemCategory[] = ['WEAPON', 'OPTICS', 'DRONE', 'GEAR', 'AMMO'];

export function CatalogPage() {
  const { data: items, isLoading } = useItemsQuery();
  const { data: summary } = useSummaryQuery();
  const [editing, setEditing] = useState<Item | null>(null);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Item | null>(null);
  const [viewingInstances, setViewingInstances] = useState<Item | null>(null);

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
        {/* Phone: a card per item. Ten columns cannot fit, and a table cut off inside its card hid most
            of them (stock, repair, the row actions) behind a sideways scroll. */}
        <ul className="divide-y divide-rule sm:hidden">
          {(items ?? []).map((item) => {
            const onHand = item.authorizedQty - item.yamahQty - item.repairQty;
            return (
              <li key={item.id} className={`space-y-3 px-4 py-3 ${item.isActive ? '' : 'opacity-50'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-body font-semibold">{item.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <CategoryTag category={item.category} />
                      {item.isSerialized && <Tag tone="brass">{he.catalog.serialized}</Tag>}
                      {!item.isActive && <Tag>{he.catalog.deactivated}</Tag>}
                    </div>
                  </div>
                  <SummaryToggle item={item} />
                </div>
                <dl className="grid grid-cols-5 gap-1.5 text-center">
                  {[
                    [he.catalog.authorized, item.authorizedQty],
                    [he.catalog.yamahQty, item.yamahQty],
                    [he.catalog.repairQty, item.repairQty],
                    [he.catalog.onHand, onHand],
                    [he.catalog.issued, issuedByName.get(item.name) ?? 0],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-ctl bg-card px-1 py-1.5">
                      <dt className="text-micro leading-tight text-graphite">{label}</dt>
                      <dd className="mt-0.5 text-body font-bold">{value}</dd>
                    </div>
                  ))}
                </dl>
                <div className="grid grid-cols-3 gap-2">
                  <Button variant="quiet" size="sm" onClick={() => setViewingInstances(item)}>
                    {he.catalog.instances}
                  </Button>
                  <Button variant="quiet" size="sm" onClick={() => setEditing(item)}>
                    {he.catalog.edit}
                  </Button>
                  <Button variant="quiet" size="sm" onClick={() => setRemoving(item)}>
                    {he.catalog.remove}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="hidden sm:block">
        <TableScroll>
          <table className="row-hover w-full">
            <thead>
              <tr>
                <Th>{he.catalog.name}</Th>
                <Th>{he.catalog.category}</Th>
                <Th numeric>{he.catalog.serialized}</Th>
                <Th numeric>{he.catalog.authorized}</Th>
                <Th numeric>{he.catalog.yamahQty}</Th>
                <Th numeric>{he.catalog.repairQty}</Th>
                <Th numeric>{he.catalog.onHand}</Th>
                <Th numeric>{he.catalog.issued}</Th>
                <Th numeric>{he.catalog.inSummary}</Th>
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
                  <Td numeric>
                    <button
                      onClick={() => setViewingInstances(item)}
                      className="font-semibold text-field-dark hover:underline"
                    >
                      {item.authorizedQty}
                    </button>
                  </Td>
                  <Td numeric>{item.yamahQty}</Td>
                  <Td numeric>{item.repairQty}</Td>
                  <Td numeric className="font-semibold">
                    {item.authorizedQty - item.yamahQty - item.repairQty}
                  </Td>
                  <Td numeric className="text-field-dark">
                    {issuedByName.get(item.name) ?? 0}
                  </Td>
                  <Td numeric>
                    <SummaryToggle item={item} />
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button variant="quiet" size="sm" onClick={() => setViewingInstances(item)}>
                        {he.catalog.instances}
                      </Button>
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
        </div>
      </Panel>

      {adding && <ItemDialog onClose={() => setAdding(false)} />}
      {editing && (
        <ItemDialog
          item={editing}
          onClose={() => setEditing(null)}
          onManageInstances={() => {
            setViewingInstances(editing);
            setEditing(null);
          }}
        />
      )}
      {removing && <RemoveDialog item={removing} onClose={() => setRemoving(null)} />}
      {viewingInstances && (
        <InstancesDialog item={viewingInstances} onClose={() => setViewingInstances(null)} />
      )}
    </div>
  );
}

/**
 * Every מסד registered under one item, with who currently holds it. This is
 * the only place that lists them individually — the catalog row above only
 * ever shows a count, which is easy to confirm but gives no way to check a
 * specific serial was actually recorded.
 */
function InstancesDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const { data, isLoading } = useItemQuery(item.id);

  return (
    <Modal onClose={onClose} className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-rule bg-card px-4 py-3">
          <h2 className="text-lead font-semibold">{he.catalog.instancesTitle(item.name)}</h2>
          <Button variant="quiet" size="sm" onClick={onClose}>
            {he.common.close}
          </Button>
        </header>
        <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <Spinner />
          ) : !data || data.instances.length === 0 ? (
            <p className="px-4 py-6 text-center text-graphite">{he.catalog.noInstances}</p>
          ) : (
            <>
            {/* Phone: a card per serial. Five columns with a status menu and a remove link in each cannot fit
                a phone, and made every control a tiny target. */}
            <ul className="divide-y divide-rule sm:hidden">
              {data.instances.map((inst) => {
                const holder = inst.signatures[0]?.soldier;
                return (
                  <li key={inst.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <Serial value={inst.serial} />
                      <RemoveInstanceButton instanceId={inst.id} serial={inst.serial} held={!!holder} />
                    </div>
                    <InstanceStatusSelect instance={inst} held={!!holder} />
                    <div className="text-meta">
                      {holder ? (
                        `${holder.firstName} ${holder.lastName}`
                      ) : (
                        <span className="text-graphite">{he.catalog.instanceInArmory}</span>
                      )}
                    </div>
                    {inst.notes && <div className="text-meta text-graphite">{inst.notes}</div>}
                  </li>
                );
              })}
            </ul>

            <div className="hidden sm:block">
            <TableScroll>
              <table className="row-hover w-full">
                <thead>
                  <tr>
                    <Th>{he.signatures.serial}</Th>
                    <Th>{he.catalog.instanceStatus}</Th>
                    <Th>{he.catalog.instanceHolder}</Th>
                    <Th>{he.intake.notes}</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {data.instances.map((inst) => {
                    const holder = inst.signatures[0]?.soldier;
                    return (
                      <tr key={inst.id}>
                        <Td>
                          <Serial value={inst.serial} />
                        </Td>
                        <Td>
                          <InstanceStatusSelect instance={inst} held={!!holder} />
                        </Td>
                        <Td>
                          {holder ? (
                            `${holder.firstName} ${holder.lastName}`
                          ) : (
                            <span className="text-graphite">{he.catalog.instanceInArmory}</span>
                          )}
                        </Td>
                        <Td className="text-meta text-graphite">{inst.notes ?? ''}</Td>
                        <Td numeric>
                          <RemoveInstanceButton
                            instanceId={inst.id}
                            serial={inst.serial}
                            held={!!holder}
                          />
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
            </div>
            </>
          )}
        </div>
        <AddInstanceForm item={item} />
    </Modal>
  );
}

/**
 * Changes one מסד's status in place — OK, FAULTY, DISABLED, or IN_REPAIR
 * (sent out to be fixed, so it should stop counting toward בפועל the same
 * way a held signature already does). Disabled while the מסד is signed out:
 * the backend rejects that too, but disabling the control here means the
 * operator sees why immediately instead of via a toast after picking it.
 */
function InstanceStatusSelect({
  instance,
  held,
}: {
  instance: ItemInstanceWithHolder;
  held: boolean;
}) {
  const [setStatus, { isLoading }] = useSetInstanceStatusMutation();
  const toast = useToast();

  async function change(status: string): Promise<void> {
    if (!status || status === instance.status) return;
    const result = await setStatus({ instanceId: instance.id, status: status as typeof instance.status });
    if (result.data) {
      toast.success({
        title: he.catalog.statusChanged(instance.serial, he.instanceStatus[result.data.status]),
      });
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  if (held) {
    return <Tag tone="oxide">{he.instanceStatus[instance.status]}</Tag>;
  }

  return (
    <Select
      value={instance.status}
      onChange={(v) => v && change(v)}
      disabled={isLoading}
      options={(['OK', 'FAULTY', 'IN_REPAIR', 'DISABLED'] as const).map((s) => ({
        value: s,
        label: he.instanceStatus[s],
      }))}
    />
  );
}

/**
 * Adds stock by hand — a soldier handed back something off-book, or a מסד
 * missed the intake sheet. The serial is always optional here, even for an
 * item the catalog marks as דורש מסד: when it's left blank this just adds
 * to the count, same as קליטת ימ"ח's bulk rows.
 */
function AddInstanceForm({ item }: { item: Item }) {
  const [serial, setSerial] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [submit, { isLoading, error }] = useSubmitIntakeMutation();
  const toast = useToast();

  async function add(): Promise<void> {
    const trimmed = serial.trim();
    const result = await submit({
      rows: trimmed
        ? [{ itemId: item.id, kind: 'serial', serial: trimmed }]
        : [{ itemId: item.id, kind: 'bulk', quantity: Number(quantity) || 1 }],
    });
    if (result.data) {
      toast.success({
        title: he.catalog.instanceAdded,
        detail: trimmed ? trimmed : he.catalog.quantityAdded(Number(quantity) || 1),
      });
      setSerial('');
      setQuantity('1');
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  return (
    <div className="shrink-0 border-t border-rule bg-card px-4 py-3">
      <p className="mb-2 text-meta font-semibold text-ink-soft">{he.catalog.addInstance}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="block w-full sm:w-auto">
          <span className="mb-1 block text-micro text-graphite">{he.catalog.optionalSerial}</span>
          <input
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            placeholder={he.catalog.optionalSerialPlaceholder}
            className="serial h-11 w-full rounded-ctl border-2 border-brass bg-brass-wash px-2.5 text-meta sm:h-9 sm:w-40"
          />
        </label>
        {!serial.trim() && (
          <label className="block">
            <span className="mb-1 block text-micro text-graphite">{he.catalog.quantity}</span>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="serial h-11 w-24 rounded-ctl border border-rule-strong bg-card-raised px-2.5 text-center text-meta sm:h-9 sm:w-20"
            />
          </label>
        )}
        <Button size="sm" onClick={() => void add()} disabled={isLoading}>
          {he.catalog.addInstance}
        </Button>
      </div>
      {apiErrorMessage(error) && (
        <p className="mt-1.5 text-micro text-oxide">{apiErrorMessage(error)}</p>
      )}
    </div>
  );
}

/**
 * A held מסד can never be removed here — the return flow is the only way a
 * signature closes, so the button is disabled with an explanation instead of
 * firing a request that the backend would reject anyway.
 */
function RemoveInstanceButton({
  instanceId,
  serial,
  held,
}: {
  instanceId: string;
  serial: string;
  held: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [remove, { isLoading, error }] = useRemoveInstanceMutation();
  const toast = useToast();

  async function handleRemove(): Promise<void> {
    const result = await remove(instanceId);
    if (result.data) {
      setConfirming(false);
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  if (held) {
    return <span className="text-meta text-graphite">{he.catalog.cannotRemoveInstance}</span>;
  }

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className="inline-flex min-h-10 items-center text-meta font-semibold text-oxide hover:underline"
      >
        {he.catalog.removeInstance}
      </button>
      {confirming && (
        <Dialog title={he.catalog.removeInstanceTitle(serial)} onClose={() => setConfirming(false)}>
          <p className="text-ink-soft">{he.catalog.removeInstanceConfirm}</p>
          {apiErrorMessage(error) && (
            <p className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
              {apiErrorMessage(error)}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => void handleRemove()} disabled={isLoading}>
              {he.catalog.removeInstance}
            </Button>
            <Button variant="quiet" onClick={() => setConfirming(false)}>
              {he.common.cancel}
            </Button>
          </div>
        </Dialog>
      )}
    </>
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
    <Modal onClose={onClose}>
        <header className="rounded-t-panel border-b border-rule bg-card px-4 py-3">
          <h2 className="text-lead font-semibold">{title}</h2>
        </header>
        <div className="space-y-3 px-4 py-4">{children}</div>
    </Modal>
  );
}

function ItemDialog({
  item,
  onClose,
  onManageInstances,
}: {
  item?: Item;
  onClose: () => void;
  onManageInstances?: () => void;
}) {
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState<ItemCategory>(item?.category ?? 'WEAPON');
  const [isSerialized, setIsSerialized] = useState(item?.isSerialized ?? true);
  const [inSummary, setInSummary] = useState(item?.inSummary ?? true);
  const [authorizedQty, setAuthorizedQty] = useState(String(item?.authorizedQty ?? 0));
  const [yamahQty, setYamahQty] = useState(String(item?.yamahQty ?? 0));
  const [repairQty, setRepairQty] = useState(String(item?.repairQty ?? 0));
  const [aliases, setAliases] = useState((item?.aliases ?? []).join(', '));

  const [create, createState] = useCreateItemMutation();
  const [update, updateState] = useUpdateItemMutation();
  const toast = useToast();
  const isSaving = createState.isLoading || updateState.isLoading;
  const message = apiErrorMessage(createState.error ?? updateState.error);

  // מצבה is never typed for a serialized item — it is the מסד count. Editing
  // an existing one while it's serialized sends the existing value through
  // untouched (the backend ignores it anyway); unchecking the box re-enables
  // the field, seeded with whatever it last showed.
  const matsevaIsDerived = isSerialized && !!item;

  async function submit(): Promise<void> {
    const payload = {
      name: name.trim(),
      category,
      isSerialized,
      inSummary,
      authorizedQty: matsevaIsDerived ? item.authorizedQty : Number(authorizedQty) || 0,
      yamahQty: Number(yamahQty) || 0,
      repairQty: Number(repairQty) || 0,
      aliases: aliases
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
    };
    const result = item
      ? await update({ id: item.id, ...payload })
      : await create(payload);
    if (result.data) {
      toast.success({
        title: item ? he.toast.itemUpdated : he.toast.itemCreated,
        detail: payload.name,
      });
      onClose();
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
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
      <CheckRow
        label={he.catalog.serialized}
        hint={he.catalog.serializedHint}
        checked={isSerialized}
        onChange={setIsSerialized}
      />
      <CheckRow
        label={he.catalog.inSummary}
        hint={he.catalog.inSummaryHint}
        checked={inSummary}
        onChange={setInSummary}
      />
      {matsevaIsDerived ? (
        <div className="rounded-ctl border border-rule bg-card px-3 py-2">
          <span className="block text-meta text-graphite">{he.catalog.authorized}</span>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="font-semibold">{he.catalog.authorizedDerived(item.authorizedQty)}</span>
            {onManageInstances && (
              <button
                onClick={onManageInstances}
                className="text-meta font-semibold text-field-dark hover:underline"
              >
                {he.catalog.manageInstances}
              </button>
            )}
          </div>
        </div>
      ) : (
        <TextField
          label={he.catalog.authorized}
          value={authorizedQty}
          onChange={setAuthorizedQty}
          type="number"
          required
        />
      )}
      <TextField
        label={he.catalog.yamahQty}
        value={yamahQty}
        onChange={setYamahQty}
        type="number"
        required
      />
      <TextField
        label={he.catalog.repairQty}
        value={repairQty}
        onChange={setRepairQty}
        type="number"
        required
      />
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
  const toast = useToast();

  useEffect(() => {
    void runCheck(item.id).then((r) => {
      if (r.data) setCheck(r.data);
    });
  }, [item.id, runCheck]);

  async function confirmDelete(): Promise<void> {
    const result = await remove(item.id);
    if (result.data) {
      toast.success({ title: he.toast.itemRemoved, detail: item.name });
      onClose();
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  async function deactivate(): Promise<void> {
    const result = await update({ id: item.id, isActive: false });
    if (result.data) {
      toast.success({ title: he.toast.itemDeactivated, detail: item.name });
      onClose();
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
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

/** A labelled checkbox with an explanation, which these two flags both need. */
function CheckRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-ctl border border-rule bg-card px-3 py-2">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block font-semibold">{label}</span>
        <span className="block text-meta text-graphite">{hint}</span>
      </span>
    </label>
  );
}

/**
 * Clears an item out of מסכם straight from the table.
 *
 * Deciding which items to count is a pass down the whole list, so it would be
 * tedious through the edit dialog one item at a time.
 */
function SummaryToggle({ item }: { item: Item }) {
  const [update, { isLoading }] = useUpdateItemMutation();
  const toast = useToast();

  async function toggle(inSummary: boolean): Promise<void> {
    const result = await update({ id: item.id, inSummary });
    if ('data' in result && result.data) {
      // Worth announcing because the effect is elsewhere: the item appears in
      // or disappears from מסכם and the count sheet, neither of which is on
      // screen when the box is ticked.
      toast.success({
        title: he.toast.summaryChanged,
        detail: inSummary
          ? he.catalog.nowInSummary(item.name)
          : he.catalog.nowOutOfSummary(item.name),
      });
    } else if ('error' in result) {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  // The label is the tap target: a bare 13px checkbox is nearly impossible to hit with a thumb. On a phone
  // it also says what it is; on a desktop the checkbox sits alone in its column, as before.
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-meta text-ink-soft sm:min-h-0">
      <input
        type="checkbox"
        className="h-5 w-5 cursor-pointer sm:h-4 sm:w-4"
        aria-label={`${he.catalog.inSummary} — ${item.name}`}
        checked={item.inSummary}
        disabled={isLoading}
        onChange={(e) => void toggle(e.target.checked)}
      />
      <span className="sm:hidden">{he.catalog.inSummary}</span>
    </label>
  );
}
