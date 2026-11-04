import { useState } from 'react';
import { useMovementsQuery } from '../../lib/api';
import {
  Button,
  EmptyState,
  SearchField,
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
import { COMPANIES, type Company, type MovementAction } from '../../lib/types';

const PAGE_SIZE = 100;

/** `דוח תנועות` — read-only by design; the log is written automatically. */
export function MovementsPage() {
  const [q, setQ] = useState('');
  const [action, setAction] = useState<MovementAction | ''>('');
  const [company, setCompany] = useState<Company | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [take, setTake] = useState(PAGE_SIZE);

  const { data, isLoading, isFetching } = useMovementsQuery({
    ...(q ? { q } : {}),
    ...(action ? { action } : {}),
    ...(company ? { company } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    take,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-display font-bold">{he.movements.title}</h1>
        <p className="mt-1 text-ink-soft">{he.movements.subtitle}</p>
      </div>

      <Panel>
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-5">
          <SearchField value={q} onSearch={setQ} placeholder={he.common.search} />
          <Select
            value={action}
            onChange={setAction}
            options={[
              { value: '', label: he.movements.allActions },
              { value: 'ISSUE', label: he.actions.ISSUE },
              { value: 'RETURN', label: he.actions.RETURN },
            ]}
          />
          <Select
            value={company}
            onChange={setCompany}
            options={[
              { value: '', label: he.signatures.allCompanies },
              ...COMPANIES.map((c) => ({ value: c, label: he.companies[c] })),
            ]}
          />
          <TextField label={he.movements.from} value={from} onChange={setFrom} type="date" />
          <TextField label={he.movements.to} value={to} onChange={setTo} type="date" />
        </div>
      </Panel>

      <Panel>
        {isLoading ? (
          <Spinner />
        ) : (data?.rows.length ?? 0) === 0 ? (
          <EmptyState>{he.movements.none}</EmptyState>
        ) : (
          <>
            <TableScroll>
              <table className="row-hover w-full">
                <thead>
                  <tr>
                    <Th>{he.movements.when}</Th>
                    <Th>{he.movements.action}</Th>
                    <Th>{he.movements.soldier}</Th>
                    <Th>{he.signatures.company}</Th>
                    <Th>{he.movements.item}</Th>
                    <Th>{he.movements.serial}</Th>
                    <Th numeric>{he.movements.quantity}</Th>
                    <Th>{he.movements.receipt}</Th>
                    <Th>{he.movements.performedBy}</Th>
                    <Th>{he.movements.notes}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data?.rows.map((m) => (
                    <tr key={m.id}>
                      <Td className="whitespace-nowrap text-meta text-graphite">
                        {formatDateTime(m.occurredAt)}
                      </Td>
                      <Td>
                        <Tag
                          tone={
                            m.action === 'ISSUE' ? 'field' : m.action === 'RETURN' ? 'neutral' : 'brass'
                          }
                        >
                          {he.actions[m.action]}
                        </Tag>
                      </Td>
                      <Td className="font-semibold">{m.soldierName}</Td>
                      <Td>{m.company ? he.companies[m.company] : he.common.none}</Td>
                      <Td>{m.itemName}</Td>
                      <Td>
                        <Serial value={m.serial} />
                      </Td>
                      <Td numeric>{m.quantity}</Td>
                      <Td className="text-meta">{m.receiptNo ?? he.common.none}</Td>
                      <Td className="text-meta">{m.performedBy}</Td>
                      <Td className="max-w-xs truncate text-meta text-graphite" >
                        {m.notes ?? ''}
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
    </div>
  );
}
