import { useState } from 'react';
import {
  useCreateServicePeriodMutation,
  useServicePeriodsQuery,
  useUpdateServicePeriodMutation,
} from '../../lib/api';
import { apiErrorMessage, Button, Panel, Select, Spinner, Tag, TextField } from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import type { AuthUser, ServicePeriod, ServicePeriodStatus } from '../../lib/types';
import { CompanyAllocationGrid } from './CompanyAllocationGrid';

/**
 * תקופת שרות planning: the samgad splits each item's בפועל across the five
 * companies before the call-up opens. This is the battalion-level planning
 * step only — no soldier names here, and nothing here constrains what is
 * actually signed on a 1008 later.
 */
export function ServicePeriodsPage({ user }: { user: AuthUser }) {
  const periods = useServicePeriodsQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);

  if (periods.isLoading) return <Spinner />;

  const rows = periods.data ?? [];
  const selected = rows.find((p) => p.id === selectedId) ?? rows[0] ?? null;
  const isAdmin = user.role === 'admin';
  // The server is the real gate (`allocations.battalion` WRITE); this only
  // decides whether to render inputs instead of plain numbers.
  const canEditGrid = isAdmin || user.role === 'SAMGAD';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display font-bold">{he.servicePeriods.title}</h1>
        </div>
        {isAdmin && <Button onClick={() => setCreating(true)}>{he.servicePeriods.newPeriod}</Button>}
      </div>

      {rows.length === 0 ? (
        <Panel>
          <p className="px-4 py-6 text-center text-graphite">{he.servicePeriods.noPeriods}</p>
        </Panel>
      ) : (
        <div className="flex flex-wrap gap-2">
          {rows.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`rounded-ctl border px-3 py-2 text-start transition-colors ${
                selected?.id === p.id
                  ? 'border-field bg-field-wash'
                  : 'border-rule-strong bg-card-raised hover:border-field'
              }`}
            >
              <span className="block font-semibold">{p.name}</span>
              <span className="mt-0.5 flex items-center gap-2 text-micro text-graphite">
                <span>
                  {p.startsAt.slice(0, 10)} – {p.endsAt.slice(0, 10)}
                </span>
                <Tag tone={p.status === 'ACTIVE' ? 'field' : 'neutral'}>
                  {he.servicePeriods.statusLabels[p.status]}
                </Tag>
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <>
          {isAdmin && (
            <PeriodStatusBar period={selected} onEdit={() => setEditing(true)} />
          )}
          <CompanyAllocationGrid servicePeriodId={selected.id} canEdit={canEditGrid} isAdmin={isAdmin} />
        </>
      )}

      {creating && <CreatePeriodDialog onClose={() => setCreating(false)} onCreated={setSelectedId} />}
      {editing && selected && (
        <EditPeriodDialog period={selected} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

function PeriodStatusBar({ period, onEdit }: { period: ServicePeriod; onEdit: () => void }) {
  const [update, { isLoading }] = useUpdateServicePeriodMutation();
  const toast = useToast();

  async function setStatus(status: ServicePeriodStatus): Promise<void> {
    const result = await update({ id: period.id, status });
    if (!result.data) {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <span className="text-meta font-semibold text-ink-soft">{he.servicePeriods.status}:</span>
        <Select
          value={period.status}
          onChange={(v) => v && void setStatus(v)}
          options={(['PLANNING', 'ACTIVE', 'CLOSED'] as ServicePeriodStatus[]).map((s) => ({
            value: s,
            label: he.servicePeriods.statusLabels[s],
          }))}
          className="w-40"
        />
        {isLoading && <Spinner />}
        <Button variant="quiet" size="sm" onClick={onEdit} className="ms-auto">
          {he.servicePeriods.editPeriod}
        </Button>
      </div>
    </Panel>
  );
}

/**
 * Name and dates aren't locked once a period exists — a samgad or admin
 * fixing a typo, or sliding the end date because the call-up ran long,
 * shouldn't have to create a whole new period just to correct one field.
 */
function EditPeriodDialog({ period, onClose }: { period: ServicePeriod; onClose: () => void }) {
  const [name, setName] = useState(period.name);
  const [startsAt, setStartsAt] = useState(period.startsAt.slice(0, 10));
  const [endsAt, setEndsAt] = useState(period.endsAt.slice(0, 10));
  const [update, { isLoading, error }] = useUpdateServicePeriodMutation();
  const toast = useToast();

  // The server refuses this too (belt and suspenders — class-validator can't
  // express a cross-field rule like this on its own), but checking it here
  // means the operator sees the problem before a round-trip, not after.
  const datesInvalid = Boolean(startsAt && endsAt && endsAt < startsAt);

  async function submit(): Promise<void> {
    if (!name.trim() || !startsAt || !endsAt || datesInvalid) return;
    const result = await update({ id: period.id, name: name.trim(), startsAt, endsAt });
    if (result.data) {
      toast.success({ title: he.servicePeriods.editPeriod, detail: result.data.name });
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-md rounded-panel bg-card-raised p-5 shadow-lift">
        <h2 className="text-lead font-semibold">{he.servicePeriods.editPeriod}</h2>
        <div className="mt-3 space-y-3">
          <TextField label={he.servicePeriods.name} value={name} onChange={setName} autoFocus required />
          <TextField
            label={he.servicePeriods.startsAt}
            type="date"
            value={startsAt}
            onChange={setStartsAt}
            required
          />
          <TextField
            label={he.servicePeriods.endsAt}
            type="date"
            value={endsAt}
            onChange={setEndsAt}
            required
            error={datesInvalid ? he.servicePeriods.endBeforeStart : undefined}
          />
          {apiErrorMessage(error) && (
            <p className="text-meta text-oxide">{apiErrorMessage(error)}</p>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            onClick={() => void submit()}
            disabled={isLoading || !name.trim() || !startsAt || !endsAt || datesInvalid}
          >
            {he.common.save}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            {he.common.close}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreatePeriodDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [create, { isLoading, error }] = useCreateServicePeriodMutation();
  const toast = useToast();

  const datesInvalid = Boolean(startsAt && endsAt && endsAt < startsAt);

  async function submit(): Promise<void> {
    if (!name.trim() || !startsAt || !endsAt || datesInvalid) return;
    const result = await create({ name: name.trim(), startsAt, endsAt });
    if (result.data) {
      toast.success({ title: he.servicePeriods.newPeriod, detail: result.data.name });
      onCreated(result.data.id);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
      <div className="w-full max-w-md rounded-panel bg-card-raised p-5 shadow-lift">
        <h2 className="text-lead font-semibold">{he.servicePeriods.newPeriod}</h2>
        <div className="mt-3 space-y-3">
          <TextField label={he.servicePeriods.name} value={name} onChange={setName} autoFocus required />
          <TextField
            label={he.servicePeriods.startsAt}
            type="date"
            value={startsAt}
            onChange={setStartsAt}
            required
          />
          <TextField
            label={he.servicePeriods.endsAt}
            type="date"
            value={endsAt}
            onChange={setEndsAt}
            required
            error={datesInvalid ? he.servicePeriods.endBeforeStart : undefined}
          />
          {apiErrorMessage(error) && (
            <p className="text-meta text-oxide">{apiErrorMessage(error)}</p>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            onClick={() => void submit()}
            disabled={isLoading || !name.trim() || !startsAt || !endsAt || datesInvalid}
          >
            {he.servicePeriods.create}
          </Button>
          <Button variant="quiet" onClick={onClose}>
            {he.common.close}
          </Button>
        </div>
      </div>
    </div>
  );
}
