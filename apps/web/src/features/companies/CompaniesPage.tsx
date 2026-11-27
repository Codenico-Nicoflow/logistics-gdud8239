import { useState } from 'react';
import { useCreateCompanyMutation, useUpdateCompanyMutation } from '../../lib/api';
import { apiErrorMessage, Button, EmptyState, Panel, Spinner, Tag, TextField } from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import type { CompanyInfo } from '../../lib/types';
import { useCompanies } from './useCompanies';

/**
 * פלוגות — the battalion's own companies. Every dropdown, grid column and Excel sheet that used to assume
 * five fixed companies reads this list, so an admin can set it up for their unit here.
 *
 * A company is deactivated, never deleted: soldiers and years of signatures refer to it by code, and an
 * inactive one simply stops being offered for new work while its history stays readable.
 */
export function CompaniesPage() {
  const { all, isLoading } = useCompanies();
  const [create, { isLoading: isCreating }] = useCreateCompanyMutation();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function add(): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    const result = await create({ name: trimmed });
    if (result.error) {
      setError(apiErrorMessage(result.error) ?? he.toast.failed);
      return;
    }
    setName('');
    toast.success({ title: he.companiesAdmin.added(trimmed) });
  }

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-display font-bold">{he.companiesAdmin.title}</h1>
        <p className="mt-1 text-ink-soft">{he.companiesAdmin.subtitle}</p>
      </div>

      <Panel>
        <form
          className="flex items-end gap-2 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <TextField
            className="min-w-0 flex-1"
            label={he.companiesAdmin.newName}
            value={name}
            onChange={setName}
            placeholder={he.companiesAdmin.newNamePlaceholder}
            maxLength={40}
            error={error ?? undefined}
          />
          <Button type="submit" disabled={isCreating || !name.trim()}>
            {he.companiesAdmin.add}
          </Button>
        </form>
      </Panel>

      <Panel>
        {all.length === 0 ? (
          <EmptyState>{he.companiesAdmin.empty}</EmptyState>
        ) : (
          <ul className="divide-y divide-rule">
            {all.map((company, i) => (
              <CompanyRow key={company.id} company={company} previous={all[i - 1]} next={all[i + 1]} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function CompanyRow({
  company,
  previous,
  next,
}: {
  company: CompanyInfo;
  previous: CompanyInfo | undefined;
  next: CompanyInfo | undefined;
}) {
  const [update, { isLoading }] = useUpdateCompanyMutation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(company.name);
  const [error, setError] = useState<string | null>(null);

  async function run(patch: { name?: string; sortOrder?: number; isActive?: boolean }): Promise<boolean> {
    setError(null);
    const result = await update({ id: company.id, ...patch });
    if (result.error) {
      setError(apiErrorMessage(result.error) ?? he.toast.failed);
      return false;
    }
    return true;
  }

  async function rename(): Promise<void> {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === company.name) {
      setEditing(false);
      return;
    }
    if (await run({ name: trimmed })) setEditing(false);
  }

  /** Swaps places with a neighbour by swapping their sort numbers. */
  async function swapWith(other: CompanyInfo): Promise<void> {
    if (await run({ sortOrder: other.sortOrder })) {
      await update({ id: other.id, sortOrder: company.sortOrder });
    }
  }

  return (
    <li className="space-y-2 px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:space-y-0">
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-2">
            <TextField
              className="min-w-0 flex-1"
              value={draft}
              onChange={setDraft}
              maxLength={40}
              autoFocus
              error={error ?? undefined}
            />
            <Button size="sm" onClick={() => void rename()} disabled={isLoading}>
              {he.common.save}
            </Button>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => {
                setEditing(false);
                setDraft(company.name);
                setError(null);
              }}
            >
              {he.common.cancel}
            </Button>
          </div>
        ) : (
          <span className="flex flex-wrap items-center gap-2">
            <span className={`text-body font-semibold ${company.isActive ? '' : 'text-graphite'}`}>{company.name}</span>
            {!company.isActive && <Tag tone="brass">{he.companiesAdmin.inactive}</Tag>}
          </span>
        )}
        {!editing && error && <p className="mt-1 text-micro text-oxide">{error}</p>}
      </div>

      {!editing && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="quiet"
            onClick={() => previous && void swapWith(previous)}
            disabled={isLoading || !previous}
          >
            {he.companiesAdmin.moveUp}
          </Button>
          <Button size="sm" variant="quiet" onClick={() => next && void swapWith(next)} disabled={isLoading || !next}>
            {he.companiesAdmin.moveDown}
          </Button>
          <Button size="sm" variant="quiet" onClick={() => setEditing(true)} disabled={isLoading}>
            {he.companiesAdmin.rename}
          </Button>
          <Button
            size="sm"
            variant={company.isActive ? 'danger' : 'quiet'}
            onClick={() => void run({ isActive: !company.isActive })}
            disabled={isLoading}
          >
            {company.isActive ? he.companiesAdmin.deactivate : he.companiesAdmin.activate}
          </Button>
        </div>
      )}
    </li>
  );
}
