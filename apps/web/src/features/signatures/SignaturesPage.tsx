import { useState } from 'react';
import {
  useItemsQuery,
  useReturnItemMutation,
  useSignaturesQuery,
} from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  EmptyState,
  Panel,
  Select,
  Serial,
  Spinner,
  TableScroll,
  Tag,
  Td,
  Th,
  TextField,
  formatDateTime,
} from '../../components/ui';
import { he } from '../../i18n/he';
import { COMPANIES, type Company, type Signature } from '../../lib/types';

const PAGE_SIZE = 50;

export function SignaturesPage() {
  const [q, setQ] = useState('');
  const [company, setCompany] = useState<Company | ''>('');
  const [itemId, setItemId] = useState('');
  const [includeReturned, setIncludeReturned] = useState(false);
  const [take, setTake] = useState(PAGE_SIZE);
  const [returning, setReturning] = useState<Signature | null>(null);

  const items = useItemsQuery();
  const { data, isLoading, isFetching } = useSignaturesQuery({
    ...(q ? { q } : {}),
    ...(company ? { company } : {}),
    ...(itemId ? { itemId } : {}),
    includeReturned,
    take,
  });

  return (
    <div className="space-y-5">
      <h1 className="text-display font-bold">{he.signatures.title}</h1>

      <Panel>
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            value={q}
            onChange={setQ}
            placeholder={he.signatures.search}
            className="lg:col-span-2"
            required
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
        <div className="flex items-center justify-between gap-3 border-t border-rule px-4 py-2.5">
          <label className="flex items-center gap-2 text-meta">
            <input
              type="checkbox"
              checked={includeReturned}
              onChange={(e) => setIncludeReturned(e.target.checked)}
            />
            {he.signatures.showReturned}
          </label>
          {data && (
            <span className="text-meta text-graphite">
              {he.signatures.count(data.rows.length, data.total)}
            </span>
          )}
        </div>
      </Panel>

      <Panel>
        {isLoading ? (
          <Spinner />
        ) : (data?.rows.length ?? 0) === 0 ? (
          <EmptyState>{he.signatures.none}</EmptyState>
        ) : (
          <>
            <TableScroll>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>{he.signatures.soldier}</Th>
                    <Th>{he.signatures.company}</Th>
                    <Th>{he.signatures.item}</Th>
                    <Th>{he.signatures.serial}</Th>
                    <Th numeric>{he.signatures.quantity}</Th>
                    <Th>{he.signatures.receipt}</Th>
                    <Th>{he.signatures.signedAt}</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {data?.rows.map((s) => (
                    <tr key={s.id} className={s.returnedAt ? 'text-graphite' : undefined}>
                      <Td>
                        <span className="font-semibold">
                          {s.soldier.firstName} {s.soldier.lastName}
                        </span>
                        {s.soldier.personalNumber && (
                          <span className="ms-2 text-meta text-graphite">
                            {s.soldier.personalNumber}
                          </span>
                        )}
                        {s.needsAttention && (
                          <Tag tone="oxide">
                            <span className="mx-1">{he.attention.title}</span>
                          </Tag>
                        )}
                      </Td>
                      <Td>{he.companies[s.soldier.company]}</Td>
                      <Td>{s.item.name}</Td>
                      <Td>
                        <Serial value={s.itemInstance?.serial ?? null} />
                      </Td>
                      <Td numeric>{s.quantity}</Td>
                      <Td className="text-meta">{s.receiptNo ?? he.common.none}</Td>
                      <Td className="whitespace-nowrap text-meta text-graphite">
                        {formatDateTime(s.signedAt)}
                      </Td>
                      <Td>
                        {s.returnedAt ? (
                          <Tag>{he.signatures.returned}</Tag>
                        ) : (
                          <Button variant="quiet" size="sm" onClick={() => setReturning(s)}>
                            {he.returnItem.action}
                          </Button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
            {data && data.rows.length < data.total && (
              <div className="border-t border-rule px-4 py-3 text-center">
                <Button
                  variant="quiet"
                  size="sm"
                  disabled={isFetching}
                  onClick={() => setTake((t) => t + PAGE_SIZE)}
                >
                  {isFetching ? he.common.loading : he.common.loadMore}
                </Button>
              </div>
            )}
          </>
        )}
      </Panel>

      {returning && <ReturnDialog signature={returning} onClose={() => setReturning(null)} />}
    </div>
  );
}

function ReturnDialog({ signature, onClose }: { signature: Signature; onClose: () => void }) {
  const isSerialized = signature.itemInstanceId !== null;
  const [quantity, setQuantity] = useState(String(signature.quantity));
  const [notes, setNotes] = useState('');
  const [returnItem, { isLoading, error }] = useReturnItemMutation();

  async function submit(): Promise<void> {
    const result = await returnItem({
      id: signature.id,
      ...(isSerialized ? {} : { quantity: Number(quantity) || signature.quantity }),
      ...(notes ? { notes } : {}),
    });
    if (result.data) onClose();
  }

  const apiMessage = apiErrorMessage(error);

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-ink/30 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-panel border border-rule bg-card-raised shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-rule px-4 py-3">
          <h2 className="text-lead font-semibold">{he.returnItem.title}</h2>
        </header>
        <div className="space-y-3 px-4 py-4">
          <div className="rounded-ctl bg-card px-3 py-2 text-meta">
            <span className="font-semibold">
              {signature.soldier.firstName} {signature.soldier.lastName}
            </span>
            <span className="text-graphite"> · </span>
            <span className="font-semibold">{signature.item.name}</span>
            {signature.itemInstance && (
              <>
                <span className="text-graphite"> · </span>
                <Serial value={signature.itemInstance.serial} />
              </>
            )}
          </div>

          {!isSerialized && signature.quantity > 1 && (
            <TextField
              label={he.returnItem.quantityLabel}
              value={quantity}
              onChange={setQuantity}
              type="number"
              hint={he.returnItem.partialHint(signature.quantity)}
              required
            />
          )}
          <TextField label={he.returnItem.notesLabel} value={notes} onChange={setNotes} />

          {apiMessage && (
            <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
              {apiMessage}
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={() => void submit()} disabled={isLoading}>
              {isLoading ? he.returnItem.submitting : he.returnItem.confirm}
            </Button>
            <Button variant="quiet" onClick={onClose}>
              {he.common.cancel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
