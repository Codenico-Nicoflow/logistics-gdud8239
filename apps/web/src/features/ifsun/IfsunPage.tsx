import { useState } from 'react';
import {
  useCollectStoredMutation,
  useCreditStoredMutation,
  useIfsunQuery,
  useIfsunRecordQuery,
  useSignatureHoldersQuery,
} from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  EmptyState,
  formatDateTime,
  Modal,
  Panel,
  Refreshing,
  SearchField,
  Serial,
  Select,
  Spinner,
  Tag,
  TextField,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import { addDays, todayIso } from '../../lib/dates';
import { type IfsunRecord, type IfsunStatus, type SignatureHolder } from '../../lib/types';
import { SignerFields, type SignerValue } from './SignerFields';
import { StoreDialog, type StorableSignature } from './StoreDialog';

const PAGE_SIZE = 25;
type Tab = 'STORED' | 'ALL';
type Closing = { record: IfsunRecord; mode: 'collect' | 'credit' };

/**
 * אפסון — what soldiers left in the armory instead of taking home. Admin and
 * logistics only. The list is cards, not a table, so it works on a phone.
 */
export function IfsunPage() {
  const [tab, setTab] = useState<Tab>('STORED');
  const [q, setQ] = useState('');
  // History can run to thousands of rows, so it is filtered on the server and read a page at a time.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<IfsunStatus | ''>('');
  const [page, setPage] = useState(0);
  const [closing, setClosing] = useState<Closing | null>(null);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const isHistory = tab === 'ALL';
  const { data, isLoading, isFetching } = useIfsunQuery({
    status: isHistory ? status || 'ALL' : 'STORED',
    q: q || undefined,
    from: isHistory && from ? from : undefined,
    to: isHistory && to ? to : undefined,
    take: PAGE_SIZE,
    skip: page * PAGE_SIZE,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Quick ranges just fill the same two date fields, so the pills and the pickers never disagree.
  const today = todayIso();
  const presets: { key: string; label: string; from: string; to: string }[] = [
    { key: 'all', label: he.ifsun.rangeAll, from: '', to: '' },
    { key: 'today', label: he.ifsun.rangeToday, from: today, to: today },
    { key: 'week', label: he.ifsun.rangeWeek, from: addDays(today, -6), to: today },
  ];

  // Any filter change starts over at the first page — otherwise page 7 of the old filter is empty.
  function filter<T>(set: (v: T) => void): (v: T) => void {
    return (v) => {
      set(v);
      setPage(0);
    };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-title font-semibold">{he.ifsun.title}</h1>
          <p className="text-meta text-graphite">{he.ifsun.subtitle}</p>
        </div>
        <Button onClick={() => setAdding(true)}>{he.ifsun.newAction}</Button>
      </div>

      <section className="rounded-panel border border-brass/30 bg-brass-wash px-4 py-3">
        <h2 className="text-meta font-semibold text-brass">{he.ifsun.rulesTitle}</h2>
        <ol className="mt-1.5 list-decimal space-y-0.5 ps-5 text-meta text-ink-soft">
          {he.ifsun.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>
      </section>

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-3">
          <div className="flex gap-1">
            {(['STORED', 'ALL'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTab(t);
                  setPage(0);
                }}
                className={`h-9 rounded-ctl px-3 text-meta font-semibold ${
                  tab === t ? 'bg-field-wash text-field-dark' : 'text-ink-soft hover:bg-card'
                }`}
              >
                {t === 'STORED' ? he.ifsun.tabStored : he.ifsun.tabHistory}
              </button>
            ))}
          </div>
          <SearchField
            value={q}
            onSearch={filter(setQ)}
            placeholder={he.ifsun.searchPlaceholder}
            className="w-full sm:w-72"
          />
        </div>

        {isHistory && (
          <div className="space-y-3 border-b border-rule px-4 py-3">
            <div className="flex flex-wrap gap-1">
              {presets.map((p) => {
                const active = from === p.from && to === p.to;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      setFrom(p.from);
                      setTo(p.to);
                      setPage(0);
                    }}
                    className={`h-9 rounded-ctl px-3 text-meta font-semibold ${
                      active ? 'bg-field-wash text-field-dark' : 'text-ink-soft hover:bg-card'
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField label={he.ifsun.fromDate} value={from} onChange={filter(setFrom)} type="date" />
              <TextField label={he.ifsun.toDate} value={to} onChange={filter(setTo)} type="date" />
              <Select
                label={he.ifsun.status}
                value={status}
                onChange={filter(setStatus)}
                options={[
                  { value: '', label: he.common.all },
                  { value: 'STORED', label: he.ifsun.statuses.STORED },
                  { value: 'COLLECTED', label: he.ifsun.statuses.COLLECTED },
                  { value: 'CREDITED', label: he.ifsun.statuses.CREDITED },
                ]}
              />
            </div>
          </div>
        )}

        <Refreshing active={isFetching && !isLoading}>
        {isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState>{tab === 'STORED' ? he.ifsun.empty : he.ifsun.emptyHistory}</EmptyState>
        ) : (
          <ul className="divide-y divide-rule">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.soldierNameSnapshot}</span>
                    {r.companySnapshot && (
                      <span className="text-meta text-graphite">{he.companies[r.companySnapshot]}</span>
                    )}
                    <Tag
                      tone={r.status === 'STORED' ? 'brass' : r.status === 'COLLECTED' ? 'field' : 'neutral'}
                    >
                      {he.ifsun.statuses[r.status]}
                    </Tag>
                  </div>
                  <div className="text-meta">
                    {r.itemNameSnapshot}
                    {r.serialSnapshot && (
                      <>
                        {' · '}
                        <Serial value={r.serialSnapshot} />
                      </>
                    )}
                    {r.quantity > 1 && ` ×${r.quantity}`}
                  </div>
                  <div className="text-micro text-graphite">
                    {he.ifsun.storedAt} {formatDateTime(r.storedAt)} · {r.storedByName}
                    {r.closedAt && ` · ${he.ifsun.closedAt} ${formatDateTime(r.closedAt)}`}
                    {r.closedByName && ` · ${r.closedByName}`}
                  </div>
                  {(r.notes || r.closeNotes) && (
                    <div className="text-micro text-ink-soft">
                      {[r.notes, r.closeNotes].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="quiet" onClick={() => setViewing(r.id)}>
                    {he.ifsun.viewDocument}
                  </Button>
                  {r.status === 'STORED' && (
                    <>
                      <Button size="sm" onClick={() => setClosing({ record: r, mode: 'collect' })}>
                        {he.ifsun.collectAction}
                      </Button>
                      <Button
                        size="sm"
                        variant="quiet"
                        onClick={() => setClosing({ record: r, mode: 'credit' })}
                      >
                        {he.ifsun.creditAction}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        </Refreshing>
        {total > PAGE_SIZE && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule px-4 py-3">
            <span className="text-meta text-graphite">{he.ifsun.pageOf(page + 1, pages, total)}</span>
            <div className="flex gap-2">
              <Button
                variant="quiet"
                size="sm"
                disabled={page === 0 || isFetching}
                onClick={() => setPage(page - 1)}
              >
                {he.ifsun.prevPage}
              </Button>
              <Button
                variant="quiet"
                size="sm"
                disabled={page + 1 >= pages || isFetching}
                onClick={() => setPage(page + 1)}
              >
                {he.ifsun.nextPage}
              </Button>
            </div>
          </div>
        )}
      </Panel>

      {closing && <CloseDialog closing={closing} onClose={() => setClosing(null)} />}
      {viewing && <DocumentDialog id={viewing} onClose={() => setViewing(null)} />}
      {adding && <NewIfsunDialog onClose={() => setAdding(false)} />}
    </div>
  );
}

function CloseDialog({ closing, onClose }: { closing: Closing; onClose: () => void }) {
  const [collect, { isLoading: collecting }] = useCollectStoredMutation();
  const [credit, { isLoading: crediting }] = useCreditStoredMutation();
  const toast = useToast();
  const [notes, setNotes] = useState('');
  const [signer, setSigner] = useState<SignerValue>({
    signatureImage: null,
    signerName: undefined,
    valid: false,
  });
  const [error, setError] = useState<string | null>(null);
  const { record, mode } = closing;
  const isCollect = mode === 'collect';

  async function submit(): Promise<void> {
    setError(null);
    const note = notes.trim() || undefined;
    if (isCollect && !signer.signatureImage) return;
    const result =
      isCollect && signer.signatureImage
        ? await collect({
            id: record.id,
            notes: note,
            signatureImage: signer.signatureImage,
            signerName: signer.signerName,
          })
        : await credit({ id: record.id, notes: note });
    if ('error' in result) {
      setError(apiErrorMessage(result.error) ?? he.toast.failed);
      return;
    }
    toast.success({
      title: isCollect ? he.ifsun.collectDone : he.ifsun.creditDone,
      detail: `${record.soldierNameSnapshot} · ${record.itemNameSnapshot}`,
    });
    onClose();
  }

  return (
    <Modal onClose={onClose} className="max-h-[92dvh] w-full max-w-md overflow-y-auto">
      <div className="space-y-3 px-5 py-5">
        <h2 className="text-lead font-semibold">
          {isCollect ? he.ifsun.collectTitle : he.ifsun.creditTitle}
        </h2>
        <p className="text-meta text-ink-soft">
          {(isCollect ? he.ifsun.collectBody : he.ifsun.creditBody)(
            record.soldierNameSnapshot,
            record.itemNameSnapshot,
          )}
        </p>
        {isCollect && (
          <SignerFields hint={he.ifsun.signCollectHint} disabled={collecting} onChange={setSigner} />
        )}
        <TextField label={he.ifsun.notes} value={notes} onChange={setNotes} />
        {error && (
          <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
            {error}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          <Button
            variant={isCollect ? 'primary' : 'danger'}
            onClick={() => void submit()}
            disabled={collecting || crediting || (isCollect && !signer.valid)}
          >
            {isCollect ? he.ifsun.collectAction : he.ifsun.creditAction}
          </Button>
          <Button variant="quiet" onClick={onClose} disabled={collecting || crediting}>
            {he.common.cancel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Find the soldier, then the signed item to store. Uses the same holders list as חתימות. */
function NewIfsunDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [holder, setHolder] = useState<SignatureHolder | null>(null);
  const [picked, setPicked] = useState<StorableSignature | null>(null);
  const { data, isFetching } = useSignatureHoldersQuery({ q: q || undefined, take: 20 }, { skip: !q });

  if (picked && holder) {
    return (
      <StoreDialog
        signature={picked}
        soldierName={`${holder.firstName} ${holder.lastName}`}
        onClose={onClose}
      />
    );
  }

  const free =
    holder?.signatures.filter(
      (s) => s.item.ifsunAllowed && !(s.ifsunRecords && s.ifsunRecords.length >= 1),
    ) ?? [];

  return (
    <Modal onClose={onClose} className="flex max-h-[85dvh] w-full max-w-md flex-col">
      <div className="space-y-3 border-b border-rule px-5 py-4">
        <h2 className="text-lead font-semibold">{he.ifsun.newAction}</h2>
        {!holder && <SearchField value={q} onSearch={setQ} placeholder={he.ifsun.pickSoldier} autoFocus />}
        {holder && (
          <p className="text-meta text-ink-soft">
            {he.ifsun.pickItem} — {holder.firstName} {holder.lastName}
          </p>
        )}
      </div>
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto">
        {!holder ? (
          isFetching ? (
            <Spinner />
          ) : q && data && data.rows.length === 0 ? (
            <EmptyState>{he.ifsun.noHeld}</EmptyState>
          ) : (
            <ul className="divide-y divide-rule">
              {(data?.rows ?? []).map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => setHolder(h)}
                    className="flex w-full items-center justify-between px-5 py-3 text-start hover:bg-card"
                  >
                    <span className="font-semibold">
                      {h.firstName} {h.lastName}
                    </span>
                    <span className="text-meta text-graphite">{he.companies[h.company]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : free.length === 0 ? (
          <EmptyState>{he.ifsun.allStored}</EmptyState>
        ) : (
          <ul className="divide-y divide-rule">
            {free.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() =>
                    setPicked({
                      id: s.id,
                      itemName: s.item.name,
                      quantity: s.quantity,
                      serial: s.itemInstance?.serial ?? null,
                    })
                  }
                  className="flex w-full items-center justify-between gap-2 px-5 py-3 text-start hover:bg-card"
                >
                  <span className="font-semibold">{s.item.name}</span>
                  {s.itemInstance && <Serial value={s.itemInstance.serial} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex gap-2 border-t border-rule px-5 py-3">
        {holder && (
          <Button variant="quiet" onClick={() => setHolder(null)}>
            {he.common.back}
          </Button>
        )}
        <Button variant="quiet" onClick={onClose}>
          {he.common.cancel}
        </Button>
      </div>
    </Modal>
  );
}

/** The אפסון document: who deposited and when with their signature, and who collected and when with theirs. */
function DocumentDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: r, isLoading } = useIfsunRecordQuery(id);
  return (
    <Modal onClose={onClose} className="max-h-[92dvh] w-full max-w-md overflow-y-auto">
      <div className="space-y-4 px-5 py-5">
        <h2 className="text-lead font-semibold">{he.ifsun.documentTitle}</h2>
        {isLoading || !r ? (
          <Spinner />
        ) : (
          <>
            <p className="text-meta">
              <span className="font-semibold">{r.soldierNameSnapshot}</span> · {r.itemNameSnapshot}
              {r.serialSnapshot && (
                <>
                  {' · '}
                  <Serial value={r.serialSnapshot} />
                </>
              )}
              {r.quantity > 1 && ` ×${r.quantity}`}
            </p>
            <SignedHalf
              title={he.ifsun.depositedBy}
              name={r.storeSignerName}
              at={r.storedAt}
              image={r.storeSignatureImage ?? null}
              logged={r.storedByName}
            />
            {r.status !== 'STORED' && (
              <SignedHalf
                title={he.ifsun.collectedBy}
                name={r.collectSignerName}
                at={r.closedAt}
                image={r.collectSignatureImage ?? null}
                logged={r.closedByName}
              />
            )}
          </>
        )}
        <div className="flex gap-2">
          <Button onClick={() => window.open(`/api/ifsun/${id}/print`, '_blank')} disabled={!r}>
            {he.ifsun.printDocument}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            {he.common.close}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SignedHalf({
  title,
  name,
  at,
  image,
  logged,
}: {
  title: string;
  name: string | null;
  at: string | null;
  image: string | null;
  logged: string | null;
}) {
  return (
    <div className="rounded-ctl border border-rule p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-meta">
        <span className="font-semibold">
          {title}: {name ?? he.common.none}
        </span>
        <span className="text-graphite">{at ? formatDateTime(at) : ''}</span>
      </div>
      {image ? (
        <img src={image} alt="" className="mt-2 h-24 w-full rounded-ctl bg-white object-contain" />
      ) : (
        <p className="mt-2 text-micro text-graphite">{he.ifsun.notSigned}</p>
      )}
      {logged && <p className="mt-1 text-micro text-graphite">{logged}</p>}
    </div>
  );
}
