import { useState, type ReactNode } from 'react';
import {
  useDeleteSoldierMutation,
  useSetSoldierEnlistedMutation,
  useSoldiersQuery,
  useUpdateSoldierMutation,
} from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  EmptyState,
  Modal,
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
import { COMPANIES, type AuthUser, type Company, type SoldierSummary } from '../../lib/types';

const PAGE_SIZE = 50;

/**
 * The battalion roster.
 *
 * ניפוק can only search, which is right mid-issue but wrong when the question
 * is "who do we have" or "whose details are missing". Incomplete records are
 * the reason this needs to be browsable: the Excel arrived with soldiers
 * lacking a מ.א. or a phone, and they are invisible until someone goes looking.
 */
export function SoldiersPage({ user }: { user: AuthUser }) {
  const [q, setQ] = useState('');
  const [company, setCompany] = useState<Company | ''>('');
  const [holding, setHolding] = useState<'' | 'with' | 'without'>('');
  const [incompleteOnly, setIncompleteOnly] = useState(false);
  const [sort, setSort] = useState<'name' | 'company'>('name');
  const [take, setTake] = useState(PAGE_SIZE);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SoldierSummary | null>(null);
  const [confirmingEnlist, setConfirmingEnlist] = useState<SoldierSummary | null>(null);
  const [deleting, setDeleting] = useState<SoldierSummary | null>(null);
  const [setEnlisted, { isLoading: isTogglingEnlisted }] = useSetSoldierEnlistedMutation();
  const [deleteSoldier, { isLoading: isDeleting }] = useDeleteSoldierMutation();
  const toast = useToast();

  // Server is the real gate (`soldiers` WRITE); this only decides which
  // controls render. SAMGAD/COMPANY_CMDR can see the roster — their job is
  // picking soldiers' companies for allocation planning — but never touch a
  // soldier record itself: no add/edit, no enlistment toggle, no delete.
  const canEditSoldier = user.role === 'admin' || user.role === 'logistics' || user.role === 'SHLISHUT';
  const canEditEnlistment = user.role === 'admin' || user.role === 'SHLISHUT';
  const canDelete = user.role === 'admin' || user.role === 'SHLISHUT';

  const { data, isLoading, isFetching } = useSoldiersQuery({
    ...(q ? { q } : {}),
    ...(company ? { company } : {}),
    ...(holding ? { holding } : {}),
    ...(incompleteOnly ? { incompleteOnly: true } : {}),
    sort,
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
        {canEditSoldier && <Button onClick={() => setAdding(true)}>{he.soldiers.add}</Button>}
      </div>

      <Panel>
        <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <SearchField
            value={q}
            onSearch={setQ}
            placeholder={he.soldiers.search}
            className="sm:col-span-2 lg:col-span-2"
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
                    <SortableTh active={sort === 'name'} onClick={() => setSort('name')}>
                      {he.soldiers.name}
                    </SortableTh>
                    <Th>{he.soldiers.personalNumber}</Th>
                    <Th>{he.soldiers.phone}</Th>
                    <SortableTh active={sort === 'company'} onClick={() => setSort('company')}>
                      {he.soldiers.company}
                    </SortableTh>
                    <Th>{he.soldiers.enlisted}</Th>
                    <Th numeric>{he.soldiers.holding}</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className={s.isActive ? undefined : 'opacity-50'}>
                      <Td className="font-semibold">
                        {s.firstName} {s.lastName}
                        {s.isAttached && (
                          <Tag tone="brass">
                            <span className="mx-1">{he.soldiers.attached}</span>
                          </Tag>
                        )}
                        {!s.isActive && (
                          <Tag>
                            <span className="mx-1">{he.soldiers.inactive}</span>
                          </Tag>
                        )}
                      </Td>
                      <Missing value={s.personalNumber} mono />
                      <Missing value={s.phone} mono />
                      <Td>{he.companies[s.company]}</Td>
                      <Td>
                        <EnlistedCell
                          soldier={s}
                          canEdit={canEditEnlistment}
                          onRequestToggle={() => setConfirmingEnlist(s)}
                        />
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
                        <span className="flex items-center gap-3">
                          {canEditSoldier && (
                            <button
                              onClick={() => setEditing(s)}
                              className="text-meta font-semibold text-field-dark hover:underline"
                            >
                              {he.soldiers.edit}
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setDeleting(s)}
                              className="text-meta font-semibold text-oxide hover:underline"
                            >
                              {he.soldiers.delete}
                            </button>
                          )}
                        </span>
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
      {confirmingEnlist && (
        <ConfirmEnlistDialog
          soldier={confirmingEnlist}
          isLoading={isTogglingEnlisted}
          onCancel={() => setConfirmingEnlist(null)}
          onConfirm={async () => {
            const next = !confirmingEnlist.isEnlisted;
            const result = await setEnlisted({ id: confirmingEnlist.id, enlisted: next });
            if ('data' in result) {
              toast.success({
                title: next ? he.soldiers.enlistedToastOn : he.soldiers.enlistedToastOff,
                detail: `${confirmingEnlist.firstName} ${confirmingEnlist.lastName}`,
              });
            } else if ('error' in result) {
              toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
            }
            setConfirmingEnlist(null);
          }}
        />
      )}
      {deleting && (
        <ConfirmDeleteDialog
          soldier={deleting}
          isLoading={isDeleting}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            const result = await deleteSoldier(deleting.id);
            if ('data' in result) {
              toast.success({
                title: he.soldiers.deletedToast,
                detail: `${deleting.firstName} ${deleting.lastName}`,
              });
            } else if ('error' in result) {
              toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
            }
            setDeleting(null);
          }}
        />
      )}
    </div>
  );
}

/** A column header that sorts the roster when clicked, with an arrow marking the active one. */
function SortableTh({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <th className="whitespace-nowrap border-b-2 border-rule-strong bg-card px-3 py-2.5 text-start text-meta font-semibold text-ink-soft">
      <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-field-dark">
        {children}
        <svg
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
          className={`h-3.5 w-3.5 transition-opacity ${active ? 'opacity-100 text-field-dark' : 'opacity-30'}`}
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </th>
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

/**
 * מחויל status for the currently active תקופת שרות. `null` means there is no
 * active period at all, in which case the question doesn't apply yet.
 *
 * Styled as a switch rather than a bordered button: the dot and its position
 * read as on/off at a glance, which a label-only button didn't give you —
 * and clicking it only opens the confirmation, never flips state directly.
 */
function EnlistedCell({
  soldier,
  canEdit,
  onRequestToggle,
}: {
  soldier: SoldierSummary;
  canEdit: boolean;
  onRequestToggle: () => void;
}) {
  if (soldier.isEnlisted === null) {
    return <span className="text-meta text-graphite">{he.soldiers.noActivePeriod}</span>;
  }

  const on = soldier.isEnlisted;

  if (!canEdit) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 text-meta font-semibold ${
          on ? 'text-field-dark' : 'text-graphite'
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${on ? 'bg-field' : 'bg-rule-strong'}`} />
        {on ? he.soldiers.enlistedYes : he.soldiers.enlistedNo}
      </span>
    );
  }

  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onRequestToggle}
      className={`group inline-flex h-9 items-center gap-2 rounded-full border px-1 pe-3 text-meta font-semibold transition-colors ${
        on
          ? 'border-field bg-field-wash text-field-dark hover:bg-field/15'
          : 'border-rule-strong bg-card text-ink-soft hover:border-ink-soft'
      }`}
    >
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
          on ? 'bg-field text-white' : 'bg-card-raised text-graphite'
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${on ? 'bg-white' : 'bg-graphite'}`} />
      </span>
      {on ? he.soldiers.enlistedYes : he.soldiers.enlistedNo}
    </button>
  );
}

function ConfirmEnlistDialog({
  soldier,
  isLoading,
  onConfirm,
  onCancel,
}: {
  soldier: SoldierSummary;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const next = !soldier.isEnlisted;
  const name = `${soldier.firstName} ${soldier.lastName}`;

  return (
    <Modal onClose={onCancel} role="alertdialog" className="w-full max-w-sm">
        <div className="space-y-3 px-5 py-5">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                next ? 'bg-field-wash text-field-dark' : 'bg-oxide-wash text-oxide'
              }`}
            >
              <span className={`h-2.5 w-2.5 rounded-full ${next ? 'bg-field' : 'bg-oxide'}`} />
            </span>
            <h2 className="text-lead font-semibold">
              {next ? he.soldiers.confirmEnlistTitle(name) : he.soldiers.confirmUnenlistTitle(name)}
            </h2>
          </div>
          <p className="text-meta text-ink-soft">
            {next ? he.soldiers.confirmEnlistBody : he.soldiers.confirmUnenlistBody}
          </p>
          <div className="flex gap-2 pt-1">
            <Button onClick={onConfirm} disabled={isLoading}>
              {next ? he.soldiers.confirmEnlistAction : he.soldiers.confirmUnenlistAction}
            </Button>
            <Button variant="quiet" onClick={onCancel} disabled={isLoading}>
              {he.common.cancel}
            </Button>
          </div>
        </div>
    </Modal>
  );
}

/**
 * Deleting is a real DB delete, not another isActive flag — the server
 * refuses it with a 409 if the soldier has any signature/movement history,
 * so this dialog can't accidentally erase audit trail; it can only remove a
 * record that was never real to begin with.
 */
function ConfirmDeleteDialog({
  soldier,
  isLoading,
  onConfirm,
  onCancel,
}: {
  soldier: SoldierSummary;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const name = `${soldier.firstName} ${soldier.lastName}`;

  return (
    <Modal onClose={onCancel} role="alertdialog" className="w-full max-w-sm">
        <div className="space-y-3 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-oxide-wash text-oxide">
              <span className="h-2.5 w-2.5 rounded-full bg-oxide" />
            </span>
            <h2 className="text-lead font-semibold">{he.soldiers.confirmDeleteTitle(name)}</h2>
          </div>
          <p className="text-meta text-ink-soft">{he.soldiers.confirmDeleteBody}</p>
          <div className="flex gap-2 pt-1">
            <Button variant="danger" onClick={onConfirm} disabled={isLoading}>
              {he.soldiers.confirmDeleteAction}
            </Button>
            <Button variant="quiet" onClick={onCancel} disabled={isLoading}>
              {he.common.cancel}
            </Button>
          </div>
        </div>
    </Modal>
  );
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
  const [company, setCompany] = useState<Company>(soldier.company);
  const [isAttached, setIsAttached] = useState(soldier.isAttached);
  const [update, { isLoading, error }] = useUpdateSoldierMutation();
  const toast = useToast();

  async function submit(): Promise<void> {
    const result = await update({
      id: soldier.id,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      company,
      isAttached,
      ...(personalNumber.trim() ? { personalNumber: personalNumber.trim() } : {}),
      ...(phone.trim() ? { phone: phone.trim() } : {}),
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
    <Modal onClose={onClose}>
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
          <label className="flex items-center gap-2 text-meta">
            <input type="checkbox" checked={isAttached} onChange={(e) => setIsAttached(e.target.checked)} />
            {he.soldiers.attachedHint}
          </label>

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
    </Modal>
  );
}
