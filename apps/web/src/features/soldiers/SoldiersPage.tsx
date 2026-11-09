import { useState } from 'react';
import { useSoldiersQuery, useUpdateSoldierMutation } from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  EmptyState,
  Panel,
  SearchField,
  Select,
  Spinner,
  TableScroll,
  Tag,
  Td,
  Th,
  TextField,
} from '../../components/ui';
import { AddSoldierDialog } from './AddSoldierDialog';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import { COMPANIES, type Company, type SoldierSummary } from '../../lib/types';

const PAGE_SIZE = 50;

/**
 * The battalion roster.
 *
 * ניפוק can only search, which is right mid-issue but wrong when the question
 * is "who do we have" or "whose details are missing". Incomplete records are
 * the reason this needs to be browsable: the Excel arrived with soldiers
 * lacking a מ.א. or a phone, and they are invisible until someone goes looking.
 */
export function SoldiersPage() {
  const [q, setQ] = useState('');
  const [company, setCompany] = useState<Company | ''>('');
  const [holding, setHolding] = useState<'' | 'with' | 'without'>('');
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [take, setTake] = useState(PAGE_SIZE);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SoldierSummary | null>(null);

  const { data, isLoading, isFetching } = useSoldiersQuery({
    ...(q ? { q } : {}),
    ...(company ? { company } : {}),
    ...(holding ? { holding } : {}),
    ...(incompleteOnly ? { incompleteOnly: true } : {}),
    take,
  });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display font-bold">{he.soldiers.title}</h1>
          <p className="mt-1 text-ink-soft">{he.soldiers.subtitle}</p>
        </div>
        <Button onClick={() => setAdding(true)}>{he.soldiers.add}</Button>
      </div>

      <Panel>
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <SearchField
            value={q}
            onSearch={setQ}
            placeholder={he.soldiers.search}
            className="lg:col-span-2"
          />
          <Select
            value={company}
            onChange={setCompany}
            options={[
              { value: '', label: he.soldiers.allCompanies },
              ...COMPANIES.map((c) => ({ value: c, label: he.companies[c] })),
            ]}
          />
          {/* One control rather than two checkboxes: holding something and
              holding nothing are opposites, and a pair of flags would let
              them be ticked together to mean nothing. */}
          <Select
            value={holding}
            onChange={setHolding}
            options={[
              { value: '', label: he.soldiers.anyHolding },
              { value: 'with', label: he.soldiers.withItemsOnly },
              { value: 'without', label: he.soldiers.withoutItemsOnly },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-4 py-2.5">
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-meta">
              <input
                type="checkbox"
                checked={incompleteOnly}
                onChange={(e) => setIncompleteOnly(e.target.checked)}
              />
              {he.soldiers.incompleteFilter}
            </label>
          </div>
          {data && (
            <span className="text-meta text-graphite">
              {he.soldiers.count(rows.length, data.total)}
            </span>
          )}
        </div>
      </Panel>

      <Panel>
        {isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState>{he.soldiers.none}</EmptyState>
        ) : (
          <>
            <TableScroll>
              <table className="row-hover w-full">
                <thead>
                  <tr>
                    <Th>{he.soldiers.name}</Th>
                    <Th>{he.soldiers.personalNumber}</Th>
                    <Th>{he.soldiers.phone}</Th>
                    <Th>{he.soldiers.company}</Th>
                    <Th>{he.soldiers.platoon}</Th>
                    <Th numeric>{he.soldiers.holding}</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className={s.isActive ? undefined : 'opacity-50'}>
                      <Td className="font-semibold">
                        {s.firstName} {s.lastName}
                        {!s.isActive && (
                          <Tag>
                            <span className="mx-1">{he.soldiers.inactive}</span>
                          </Tag>
                        )}
                      </Td>
                      <Missing value={s.personalNumber} mono />
                      <Missing value={s.phone} mono />
                      <Td>{he.companies[s.company]}</Td>
                      <Td className="text-meta text-graphite">
                        {s.platoon ?? he.soldiers.nothing}
                      </Td>
                      <Td numeric>
                        {s.openSignatureCount > 0 ? (
                          <span className="font-semibold text-field-dark">
                            {s.openSignatureCount}
                          </span>
                        ) : (
                          <span className="text-graphite">0</span>
                        )}
                      </Td>
                      <Td>
                        <Button variant="quiet" size="sm" onClick={() => setEditing(s)}>
                          {he.soldiers.edit}
                        </Button>
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

      {adding && (
        <AddSoldierDialog onClose={() => setAdding(false)} onCreated={() => setAdding(false)} />
      )}
      {editing && <EditSoldierDialog soldier={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/**
 * A cell whose emptiness is worth seeing.
 *
 * A blank reads as "nothing to record here"; these fields are always meant to
 * have a value, so an absent one is named and coloured as the gap it is.
 */
function Missing({ value, mono = false }: { value: string | null; mono?: boolean }) {
  if (!value) {
    return (
      <Td>
        <span className="text-meta font-semibold text-oxide">{he.soldiers.missing}</span>
      </Td>
    );
  }
  return <Td className={mono ? 'serial' : undefined}>{value}</Td>;
}

function EditSoldierDialog({
  soldier,
  onClose,
}: {
  soldier: SoldierSummary;
  onClose: () => void;
}) {
  const [firstName, setFirstName] = useState(soldier.firstName);
  const [lastName, setLastName] = useState(soldier.lastName);
  const [personalNumber, setPersonalNumber] = useState(soldier.personalNumber ?? '');
  const [phone, setPhone] = useState(soldier.phone ?? '');
  const [platoon, setPlatoon] = useState(soldier.platoon ?? '');
  const [company, setCompany] = useState<Company>(soldier.company);
  const [update, { isLoading, error }] = useUpdateSoldierMutation();
  const toast = useToast();

  async function submit(): Promise<void> {
    const result = await update({
      id: soldier.id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      company,
      ...(personalNumber.trim() ? { personalNumber: personalNumber.trim() } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(platoon.trim() ? { platoon: platoon.trim() } : {}),
    });
    if ('data' in result && result.data) {
      toast.success({
        title: he.toast.soldierUpdated,
        detail: `${firstName.trim()} ${lastName.trim()}`,
      });
      onClose();
    } else if ('error' in result) {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  const message = apiErrorMessage(error);

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
          <h2 className="text-lead font-semibold">
            {he.soldiers.editTitle(`${soldier.firstName} ${soldier.lastName}`)}
          </h2>
        </header>
        <div className="space-y-3 px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={he.issue.firstName}
              value={firstName}
              onChange={setFirstName}
              autoFocus
              required
            />
            <TextField label={he.issue.lastName} value={lastName} onChange={setLastName} required />
          </div>
          <Select
            label={he.soldiers.company}
            value={company}
            onChange={(v) => v && setCompany(v as Company)}
            options={COMPANIES.map((c) => ({ value: c, label: he.companies[c] }))}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={he.soldiers.personalNumber}
              value={personalNumber}
              onChange={setPersonalNumber}
            />
            <TextField label={he.soldiers.phone} value={phone} onChange={setPhone} />
          </div>
          <TextField label={he.soldiers.platoon} value={platoon} onChange={setPlatoon} />

          {message && (
            <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
              {message}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={() => void submit()} disabled={isLoading}>
              {he.common.save}
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
