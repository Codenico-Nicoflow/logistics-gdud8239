import { useState } from 'react';
import {
  useCollectStoredMutation,
  useCreditStoredMutation,
  useIfsunQuery,
  useSignatureHoldersQuery,
} from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  EmptyState,
  formatDateTime,
  Modal,
  Panel,
  SearchField,
  Serial,
  Spinner,
  Tag,
  TextField,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import { IFSUN_CATEGORIES, type IfsunRecord, type SignatureHolder } from '../../lib/types';
import { StoreDialog, type StorableSignature } from './StoreDialog';

type Tab = 'STORED' | 'ALL';
type Closing = { record: IfsunRecord; mode: 'collect' | 'credit' };

/**
 * אפסון — what soldiers left in the armory instead of taking home. Admin and
 * logistics only. The list is cards, not a table, so it works on a phone.
 */
export function IfsunPage() {
  const [tab, setTab] = useState<Tab>('STORED');
  const [q, setQ] = useState('');
  const [closing, setClosing] = useState<Closing | null>(null);
  const [adding, setAdding] = useState(false);
  const { data, isLoading } = useIfsunQuery({ status: tab, q: q || undefined, take: 200 });
  const rows = data?.rows ?? [];

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
                onClick={() => setTab(t)}
                className={`h-9 rounded-ctl px-3 text-meta font-semibold ${
                  tab === t ? 'bg-field-wash text-field-dark' : 'text-ink-soft hover:bg-card'
                }`}
              >
                {t === 'STORED' ? he.ifsun.tabStored : he.ifsun.tabHistory}
              </button>
            ))}
          </div>
          <SearchField value={q} onSearch={setQ} placeholder={he.ifsun.searchPlaceholder} className="w-full sm:w-72" />
        </div>

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
                    <Tag tone={r.status === 'STORED' ? 'brass' : r.status === 'COLLECTED' ? 'field' : 'neutral'}>
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
                    <div className="text-micro text-ink-soft">{[r.notes, r.closeNotes].filter(Boolean).join(' · ')}</div>
                  )}
                </div>
                {r.status === 'STORED' && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setClosing({ record: r, mode: 'collect' })}>
                      {he.ifsun.collectAction}
                    </Button>
                    <Button size="sm" variant="quiet" onClick={() => setClosing({ record: r, mode: 'credit' })}>
                      {he.ifsun.creditAction}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {closing && <CloseDialog closing={closing} onClose={() => setClosing(null)} />}
      {adding && <NewIfsunDialog onClose={() => setAdding(false)} />}
    </div>
  );
}

function CloseDialog({ closing, onClose }: { closing: Closing; onClose: () => void }) {
  const [collect, { isLoading: collecting }] = useCollectStoredMutation();
  const [credit, { isLoading: crediting }] = useCreditStoredMutation();
  const toast = useToast();
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { record, mode } = closing;
  const isCollect = mode === 'collect';

  async function submit(): Promise<void> {
    setError(null);
    const body = { id: record.id, notes: notes.trim() || undefined };
    const result = isCollect ? await collect(body) : await credit(body);
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
    <Modal onClose={onClose} className="w-full max-w-sm">
      <div className="space-y-3 px-5 py-5">
        <h2 className="text-lead font-semibold">{isCollect ? he.ifsun.collectTitle : he.ifsun.creditTitle}</h2>
        <p className="text-meta text-ink-soft">
          {(isCollect ? he.ifsun.collectBody : he.ifsun.creditBody)(record.soldierNameSnapshot, record.itemNameSnapshot)}
        </p>
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
            disabled={collecting || crediting}
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
    return <StoreDialog signature={picked} soldierName={`${holder.firstName} ${holder.lastName}`} onClose={onClose} />;
  }

  const free = holder?.signatures.filter(
      (s) => IFSUN_CATEGORIES.includes(s.item.category) && !(s.ifsunRecords && s.ifsunRecords.length >= 1),
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
