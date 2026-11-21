import { useMemo, useState } from 'react';
import {
  useIssueFormQuery,
  useIssueFormsQuery,
  useItemsQuery,
  useReissueIssueFormMutation,
  useReturnItemMutation,
  useSignatureHoldersQuery,
  useSoldierQuery,
  useUpdateIssueFormMutation,
} from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  CategoryDot,
  EmptyState,
  SearchField,
  Modal,
  Panel,
  Select,
  Serial,
  Spinner,
  Tag,
  TableScroll,
  Td,
  Th,
  TextField,
  formatDateTime,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { StoreDialog, type StorableSignature } from '../ifsun/StoreDialog';
import { he } from '../../i18n/he';
import {
  COMPANIES,
  IFSUN_CATEGORIES,
  type AuthUser,
  type Company,
  type IssueForm,
  type SignatureHolder,
  type SoldierSummary,
} from '../../lib/types';
import { BasketStep, newLine, type BasketLine } from '../issue/BasketStep';
import { SignStep } from '../issue/SignStep';

const PAGE_SIZE = 100;

/**
 * חתימות — one screen for everything about what a soldier has signed for:
 * pick him from the roster, then switch between "what he holds right now"
 * (open items, each with a זיכוי button) and "his latest signed 1008" (the
 * actual document, exactly as it looked at the end of ניפוק — openable,
 * printable, and editable on its header fields only). Used to be two
 * separate screens; folded into one since both answer "what's going on with
 * this guy's signatures" and splitting them just meant re-finding him twice.
 */
export function DocumentsPage({ user }: { user: AuthUser }) {
  const [q, setQ] = useState('');
  const [company, setCompany] = useState<Company | ''>('');
  const [itemId, setItemId] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = useItemsQuery();
  const { data, isLoading, isFetching } = useSignatureHoldersQuery({
    ...(q ? { q } : {}),
    ...(company ? { company } : {}),
    ...(itemId ? { itemId } : {}),
    take: PAGE_SIZE,
  });

  const selected = data?.rows.find((h) => h.id === selectedId) ?? null;
  const canEditForm = user.role === 'admin' || user.role === 'logistics';

  return (
    <div className="space-y-5">
      <h1 className="text-display font-bold">{he.documents.title}</h1>

      {/* On a phone this is master/detail, one at a time: the list, and once a soldier is picked his
          details take the screen (with a way back) instead of appearing far below the list. A desktop
          shows both side by side as before. */}
      <Panel className={selected ? 'hidden lg:block' : ''}>
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <SearchField
            value={q}
            onSearch={setQ}
            placeholder={he.signatures.search}
            className="lg:col-span-2"
          />
          <Select
            value={company}
            onChange={setCompany}
            options={[
              { value: '', label: he.signatures.allCompanies },
              ...COMPANIES.map((c) => ({ value: c, label: he.companies[c] })),
            ]}
          />
          <Select
            value={itemId}
            onChange={setItemId}
            options={[
              { value: '', label: he.signatures.allItems },
              ...(items.data ?? []).map((i) => ({ value: i.id, label: i.name })),
            ]}
          />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <Panel className={selected ? 'hidden lg:block' : ''}>
          {isLoading ? (
            <Spinner />
          ) : (data?.rows.length ?? 0) === 0 ? (
            <EmptyState>{he.documents.none}</EmptyState>
          ) : (
            <>
              <TableScroll>
                <table className="row-hover w-full">
                  <thead>
                    <tr>
                      <Th>{he.soldiers.name}</Th>
                      <Th>{he.soldiers.company}</Th>
                      <Th numeric>{he.documents.itemCount}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.rows.map((h) => (
                      <tr
                        key={h.id}
                        onClick={() => setSelectedId(h.id)}
                        className={`cursor-pointer ${selectedId === h.id ? 'bg-field-wash' : ''}`}
                      >
                        <Td className="font-semibold">
                          {h.firstName} {h.lastName}
                        </Td>
                        <Td>{he.companies[h.company]}</Td>
                        <Td numeric>{h.itemCount}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
              {data && (
                <div className="border-t border-rule px-4 py-2.5 text-end text-meta text-graphite">
                  {he.signatures.soldierCount(data.total)}
                  {isFetching && ` · ${he.common.loading}`}
                </div>
              )}
            </>
          )}
        </Panel>

        {selected ? (
          <div className="space-y-3">
            <Button variant="quiet" onClick={() => setSelectedId(null)} className="w-full lg:hidden">
              {he.documents.backToList}
            </Button>
            <SoldierDetail key={selected.id} holder={selected} canEditForm={canEditForm} />
          </div>
        ) : (
          <Panel className="hidden lg:block">
            <EmptyState>{he.documents.pickSoldier}</EmptyState>
          </Panel>
        )}
      </div>
    </div>
  );
}

function storedQty(s: { ifsunRecords?: { quantity: number }[] }): number {
  return (s.ifsunRecords ?? []).reduce((n, r) => n + r.quantity, 0);
}

function SoldierDetail({
  holder,
  canEditForm,
}: {
  holder: SignatureHolder;
  canEditForm: boolean;
}) {
  const [tab, setTab] = useState<'items' | 'form'>('items');
  const [reissuing, setReissuing] = useState(false);
  const [confirmingReturnAll, setConfirmingReturnAll] = useState(false);
  const [storing, setStoring] = useState<StorableSignature | null>(null);
  // Fetched once up here, not inside the "form" tab — the "ערוך פריטים
  // וחתום מחדש" action lives on the "פריטים מוחזקים" tab (it's an action on
  // what he's holding, not on the document itself) but still needs the
  // latest form's own lines to seed the basket from.
  const { data: formsData } = useIssueFormsQuery({ soldierId: holder.id, take: 1 });
  const latestFormSummary = formsData?.rows[0];
  const { data: latestForm } = useIssueFormQuery(latestFormSummary?.id ?? '', {
    skip: !latestFormSummary,
  });

  return (
    <Panel
      title={`${holder.firstName} ${holder.lastName}`}
      action={
        <span className="flex items-center gap-2 text-meta text-graphite">
          {he.companies[holder.company]}
          {holder.personalNumber && <span className="serial">{holder.personalNumber}</span>}
        </span>
      }
    >
      <div className="flex gap-1 border-b border-rule px-4 pt-2">
        <TabButton active={tab === 'items'} onClick={() => setTab('items')}>
          {he.documents.tabItems}
        </TabButton>
        <TabButton active={tab === 'form'} onClick={() => setTab('form')}>
          {he.documents.tabForm}
        </TabButton>
      </div>

      {tab === 'items' ? (
        <>
          {canEditForm && (latestForm || holder.signatures.length > 0) && (
            <div className="flex justify-end gap-2 border-b border-rule px-4 py-2.5">
              {holder.signatures.length > 0 && (
                <Button variant="quiet" size="sm" onClick={() => setConfirmingReturnAll(true)}>
                  {he.documents.returnAllAction}
                </Button>
              )}
              {latestForm && (
                <Button variant="quiet" size="sm" onClick={() => setReissuing(true)}>
                  {he.form1008.reissueAction}
                </Button>
              )}
            </div>
          )}
          {holder.signatures.length === 0 ? (
            <EmptyState>{he.signatures.none}</EmptyState>
          ) : (
            <ul className="divide-y divide-rule">
              {holder.signatures.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    <CategoryDot category={s.item.category} />
                    <span className="font-semibold">{s.item.name}</span>
                    {s.itemInstance && <Serial value={s.itemInstance.serial} />}
                    {s.quantity > 1 && <span className="text-meta text-graphite">×{s.quantity}</span>}
                    {storedQty(s) > 0 && <Tag tone="brass">{he.ifsun.storedQty(storedQty(s))}</Tag>}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="whitespace-nowrap text-meta text-graphite">
                      {formatDateTime(s.signedAt)}
                    </span>
                    {canEditForm && IFSUN_CATEGORIES.includes(s.item.category) && storedQty(s) < s.quantity && (
                      <Button
                        variant="quiet"
                        size="sm"
                        onClick={() =>
                          setStoring({
                            id: s.id,
                            itemName: s.item.name,
                            quantity: s.quantity,
                            serial: s.itemInstance?.serial ?? null,
                          })
                        }
                      >
                        {he.ifsun.storeAction}
                      </Button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <SoldierLatestForm soldierId={holder.id} canEdit={canEditForm} />
      )}

      {reissuing && latestForm && (
        <ReissueDialog original={latestForm} onClose={() => setReissuing(false)} />
      )}
      {storing && (
        <StoreDialog
          signature={storing}
          soldierName={`${holder.firstName} ${holder.lastName}`}
          onClose={() => setStoring(null)}
        />
      )}
      {confirmingReturnAll && (
        <ReturnAllDialog holder={holder} onClose={() => setConfirmingReturnAll(false)} />
      )}
    </Panel>
  );
}

/**
 * Returning every open item at once — the soldier handed back the whole
 * load, not just one thing. A plain loop of the existing single-signature
 * return call: no bulk endpoint exists or is worth adding for this, since
 * it's the exact same action repeated, not a different one.
 */
function ReturnAllDialog({ holder, onClose }: { holder: SignatureHolder; onClose: () => void }) {
  const [returnItem, { isLoading }] = useReturnItemMutation();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    setError(null);
    for (const s of holder.signatures) {
      const result = await returnItem({ id: s.id });
      if ('error' in result) {
        setError(apiErrorMessage(result.error) ?? he.toast.failed);
        return;
      }
    }
    toast.success({
      title: he.documents.returnAllDone,
      detail: `${holder.firstName} ${holder.lastName}`,
    });
    onClose();
  }

  return (
    <Modal onClose={onClose} className="w-full max-w-sm">
      <div className="space-y-3 px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-oxide-wash text-oxide">
            <span className="h-2.5 w-2.5 rounded-full bg-oxide" />
          </span>
          <h2 className="text-lead font-semibold">{he.documents.returnAllTitle}</h2>
        </div>
        <p className="text-meta text-ink-soft">
          {he.documents.returnAllBody(
            `${holder.firstName} ${holder.lastName}`,
            holder.signatures.length,
          )}
        </p>
        {error && (
          <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
            {error}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <Button variant="danger" onClick={() => void submit()} disabled={isLoading}>
            {isLoading ? he.returnItem.submitting : he.documents.returnAllAction}
          </Button>
          <Button variant="quiet" onClick={onClose} disabled={isLoading}>
            {he.common.cancel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-t-ctl border-x border-t px-3.5 py-2 text-meta font-semibold transition-colors ${
        active
          ? 'border-rule bg-card-raised text-field-dark'
          : 'border-transparent text-graphite hover:text-ink-soft'
      }`}
    >
      {children}
    </button>
  );
}

function SoldierLatestForm({ soldierId, canEdit }: { soldierId: string; canEdit: boolean }) {
  const { data, isLoading } = useIssueFormsQuery({ soldierId, take: 1 });
  const form = data?.rows[0];

  if (isLoading) return <Spinner />;
  if (!form) return <EmptyState>{he.documents.noForms}</EmptyState>;

  return <FormDocument formId={form.id} canEdit={canEdit} />;
}

/**
 * The actual signed document — same shape as `Signed` at the end of ניפוק
 * (soldier, lines, open-in-tab export), extended with inline editing of the
 * two header fields the server allows changing after signing. Editing is
 * gated to admin/logistics; anyone else sees the fields read-only.
 */
function FormDocument({ formId, canEdit }: { formId: string; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const { data: full, isLoading } = useIssueFormQuery(formId);
  const [update, { isLoading: isSaving, error }] = useUpdateIssueFormMutation();
  const toast = useToast();
  const [receiptNo, setReceiptNo] = useState('');
  const [notes, setNotes] = useState('');

  if (isLoading || !full) return <Spinner />;

  function startEdit(): void {
    // Always starts blank, not pre-filled from the current value — a
    // deliberate re-entry rather than editing existing text in place.
    setReceiptNo('');
    setNotes('');
    setEditing(true);
  }

  async function submit(): Promise<void> {
    const result = await update({
      id: formId,
      receiptNo: receiptNo.trim(),
      notes: notes.trim(),
    });
    if (result.data) {
      toast.success({ title: he.toast.formUpdated });
      setEditing(false);
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{he.form1008.created(full.formNo)}</span>
        <span className="text-meta text-graphite">
          {he.companies[full.companySnapshot]} · {formatDateTime(full.signedAt)}
        </span>
      </div>

      <ul className="space-y-1 border-t border-rule pt-3">
        {full.lines.map((l) => (
          <li key={l.id} className="text-meta">
            <span className="font-semibold">{l.itemNameSnapshot}</span>
            <span className="text-graphite">
              {' · '}
              {l.quantity} {l.unitOfMeasure}
              {l.serialSnapshot ? ` · ${l.serialSnapshot}` : ''}
            </span>
          </li>
        ))}
      </ul>

      {editing ? (
        <div className="space-y-3 border-t border-rule pt-3">
          <TextField label={he.form1008.receiptNo} value={receiptNo} onChange={setReceiptNo} />
          <TextField label={he.form1008.formNotes} value={notes} onChange={setNotes} />
          {apiErrorMessage(error) && (
            <p className="text-meta text-oxide">{apiErrorMessage(error)}</p>
          )}
          <div className="flex gap-2">
            <Button onClick={() => void submit()} disabled={isSaving}>
              {isSaving ? he.common.saving : he.common.save}
            </Button>
            <Button variant="quiet" onClick={() => setEditing(false)}>
              {he.common.cancel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1 border-t border-rule pt-3 text-meta">
          <div>
            <span className="font-semibold text-ink-soft">{he.form1008.receiptNo}: </span>
            {full.receiptNo ?? he.common.none}
          </div>
          <div>
            <span className="font-semibold text-ink-soft">{he.form1008.formNotes}: </span>
            {full.notes ?? he.common.none}
          </div>
        </div>
      )}

      <div className="flex gap-2 border-t border-rule pt-3">
        <a
          href={`/api/issue-forms/${full.id}/print`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-ctl bg-field px-3.5 py-2 text-body font-semibold text-white transition-colors hover:bg-field-bright"
        >
          {he.form1008.openForm}
        </a>
        {!editing && canEdit && (
          <Button variant="quiet" onClick={startEdit}>
            {he.common.edit}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Changing what's actually on a signed form — a different מסד, item, or
 * quantity — is never an in-place edit; it's a brand new handover that
 * happens to start from the old one's lines. Reuses the exact same
 * BasketStep/SignStep the end of ניפוק uses, seeded with the original
 * form's lines, so adding/removing/changing items and the serial-memory
 * suggestions all work identically — then a fresh signature creates a new
 * 1008 and the server returns whatever the new lines no longer cover.
 */
function ReissueDialog({ original, onClose }: { original: IssueForm; onClose: () => void }) {
  const { data: soldier, isLoading: soldierLoading } = useSoldierQuery(original.soldierId);
  const items = useItemsQuery();
  const [step, setStep] = useState<'basket' | 'sign'>('basket');
  const [lines, setLines] = useState<BasketLine[] | null>(null);
  const [receiptNo, setReceiptNo] = useState(original.receiptNo ?? '');
  const [notes, setNotes] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [reissue, { isLoading: isSubmitting, error }] = useReissueIssueFormMutation();
  const toast = useToast();

  const soldierSummary: SoldierSummary | null = soldier
    ? { ...soldier, openSignatureCount: soldier.signatures.length }
    : null;

  const initialLines = useMemo(() => {
    if (!items.data) return null;
    const byId = new Map(items.data.map((i) => [i.id, i]));
    return original.lines
      .map((l) => {
        const item = byId.get(l.itemId);
        if (!item) return null;
        return newLine(item, l.quantity, l.serialSnapshot ?? '', l.lineNotes ?? '');
      })
      .filter((l): l is BasketLine => l !== null);
  }, [items.data, original.lines]);

  if (soldierLoading || !soldierSummary || !initialLines) {
    return (
      <Modal onClose={onClose}>
        <div className="p-8">
          <Spinner />
        </div>
      </Modal>
    );
  }

  const basketLines = lines ?? initialLines;

  async function submit(): Promise<void> {
    if (!soldierSummary || !signature || basketLines.length === 0) return;
    const result = await reissue({
      id: original.id,
      soldierId: soldierSummary.id,
      signatureImage: signature,
      ...(receiptNo.trim() ? { receiptNo: receiptNo.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      lines: basketLines.map((l) => ({
        itemId: l.item.id,
        quantity: l.quantity,
        ...(l.serial.trim() ? { serial: l.serial.trim() } : {}),
        ...(l.lineNotes.trim() ? { lineNotes: l.lineNotes.trim() } : {}),
      })),
    });
    if (result.data) {
      toast.success({
        title: he.form1008.reissued,
        detail: `${he.form1008.created(result.data.formNo)} · ${soldierSummary.firstName} ${soldierSummary.lastName}`,
      });
      onClose();
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  return (
    <Modal onClose={onClose} className="w-full max-w-2xl">
      <div className="scroll-slim max-h-[85vh] overflow-y-auto">
        <header className="flex items-center justify-between rounded-t-panel border-b border-rule bg-card px-4 py-3">
          <h2 className="text-lead font-semibold">{he.form1008.reissueTitle(original.formNo)}</h2>
          <button onClick={onClose} className="text-meta font-semibold text-graphite hover:text-ink">
            {he.common.close}
          </button>
        </header>
        <div className="px-4 py-4">
          {step === 'basket' ? (
            <BasketStep
              soldier={soldierSummary}
              lines={basketLines}
              onChange={setLines}
              onBack={onClose}
              onContinue={() => setStep('sign')}
            />
          ) : (
            <SignStep
              soldier={soldierSummary}
              lines={basketLines}
              receiptNo={receiptNo}
              onReceiptNo={setReceiptNo}
              notes={notes}
              onNotes={setNotes}
              signature={signature}
              onSignature={setSignature}
              onBack={() => setStep('basket')}
              onSubmit={() => void submit()}
              isSubmitting={isSubmitting}
              error={apiErrorMessage(error)}
            />
          )}
        </div>
      </div>
    </Modal>
  );
}

