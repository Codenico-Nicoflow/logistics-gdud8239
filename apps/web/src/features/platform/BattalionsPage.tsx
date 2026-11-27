import { useState } from 'react';
import {
  useAddBattalionAdminMutation,
  useCreateBattalionMutation,
  usePlatformBattalionsQuery,
  useRenameBattalionMutation,
} from '../../lib/api';
import { apiErrorMessage, Button, EmptyState, Panel, Spinner, Tag, TextField } from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import type { AuthUser, PlatformBattalion } from '../../lib/types';
import { SetupLinkPanel } from '../users/SetupLinkPanel';
import { useActAs } from './useActAs';

type Link = { name: string; url: string; reset: boolean };

/**
 * גדודים: the platform operator's screen. Creates a battalion with its first admin (who gets a one-time
 * setup link and chooses their own password), renames one, and opens any of them. Reached only through
 * the nav's platform-only tab; the API refuses everyone else regardless.
 */
export function BattalionsPage({ user }: { user: AuthUser }) {
  const { data, isLoading } = usePlatformBattalionsQuery();
  const [link, setLink] = useState<Link | null>(null);

  if (isLoading || !data) return <Spinner />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-display font-bold">{he.platform.title}</h1>
        <p className="mt-1 text-ink-soft">{he.platform.subtitle}</p>
      </div>

      {link && <SetupLinkPanel link={link} onClose={() => setLink(null)} />}

      <CreateForm onCreated={(l) => setLink(l)} />

      <Panel title={he.platform.listTitle}>
        {data.length === 0 ? (
          <EmptyState>{he.platform.empty}</EmptyState>
        ) : (
          <ul className="divide-y divide-rule">
            {data.map((b) => (
              <BattalionRow key={b.id} battalion={b} current={b.id === user.battalionId} onLink={(l) => setLink(l)} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: (link: Link) => void }) {
  const [create, { isLoading }] = useCreateBattalionMutation();
  const [form, setForm] = useState({ name: '', number: '', adminUsername: '', adminDisplayName: '' });
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const ready = Object.values(form).every((v) => v.trim().length > 0);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const result = await create({ ...form, name: form.name.trim(), number: form.number.trim() });
    if (!result.data) return setError(apiErrorMessage(result.error) ?? he.toast.failed);
    onCreated({ name: result.data.admin.username, url: result.data.setup.url, reset: false });
    toast.success({ title: he.platform.created(result.data.battalion.name) });
    setForm({ name: '', number: '', adminUsername: '', adminDisplayName: '' });
  }

  return (
    <Panel title={he.platform.createTitle}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3 px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={he.platform.name} value={form.name} onChange={set('name')} placeholder={he.platform.namePlaceholder} maxLength={60} required />
          <TextField
            label={he.platform.number}
            value={form.number}
            onChange={set('number')}
            inputMode="numeric"
            dir="ltr"
            maxLength={6}
            hint={he.platform.numberHint}
            required
          />
          <TextField label={he.platform.adminDisplayName} value={form.adminDisplayName} onChange={set('adminDisplayName')} maxLength={120} required />
          <TextField label={he.platform.adminUsername} value={form.adminUsername} onChange={set('adminUsername')} dir="ltr" maxLength={64} required />
        </div>
        {error && (
          <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
            {error}
          </p>
        )}
        <Button type="submit" disabled={isLoading || !ready}>
          {he.platform.create}
        </Button>
      </form>
    </Panel>
  );
}

function BattalionRow({ battalion, current, onLink }: { battalion: PlatformBattalion; current: boolean; onLink: (link: Link) => void }) {
  const { actAs, isLoading: switching } = useActAs();
  const [rename, { isLoading: renaming }] = useRenameBattalionMutation();
  const [addAdmin, { isLoading: adding }] = useAddBattalionAdminMutation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(battalion.name);
  const [adminOpen, setAdminOpen] = useState(false);
  const [admin, setAdmin] = useState({ adminUsername: '', adminDisplayName: '' });
  const [error, setError] = useState<string | null>(null);

  async function saveName(): Promise<void> {
    const name = draft.trim();
    if (!name || name === battalion.name) return setEditing(false);
    setError(null);
    const result = await rename({ id: battalion.id, name });
    if (result.error) return setError(apiErrorMessage(result.error) ?? he.toast.failed);
    setEditing(false);
  }

  async function saveAdmin(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const result = await addAdmin({ id: battalion.id, ...admin });
    if (!result.data) return setError(apiErrorMessage(result.error) ?? he.toast.failed);
    onLink({ name: result.data.admin.username, url: result.data.setup.url, reset: false });
    setAdmin({ adminUsername: '', adminDisplayName: '' });
    setAdminOpen(false);
  }

  return (
    <li className="space-y-3 px-4 py-3">
      <div className="sm:flex sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <TextField className="min-w-0 flex-1" value={draft} onChange={setDraft} maxLength={60} autoFocus />
              <Button size="sm" onClick={() => void saveName()} disabled={renaming}>
                {he.common.save}
              </Button>
              <Button size="sm" variant="quiet" onClick={() => { setEditing(false); setDraft(battalion.name); }}>
                {he.common.cancel}
              </Button>
            </div>
          ) : (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-body font-semibold">{battalion.name}</span>
              <span className="serial text-meta text-graphite">{battalion.number}</span>
              {current && <Tag tone="field">{he.platform.current}</Tag>}
              {battalion.adminCount === 0 && <Tag tone="brass">{he.platform.noAdmin}</Tag>}
            </span>
          )}
          <p className="mt-0.5 text-micro text-graphite">{he.platform.counts(battalion.userCount, battalion.adminCount)}</p>
        </div>
        {!editing && (
          <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-0">
            <Button size="sm" onClick={() => void actAs(battalion.id)} disabled={current || switching}>
              {he.platform.enter}
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setEditing(true)}>
              {he.platform.rename}
            </Button>
            <Button size="sm" variant="quiet" onClick={() => setAdminOpen((v) => !v)}>
              {he.platform.addAdmin}
            </Button>
          </div>
        )}
      </div>

      {adminOpen && (
        <form onSubmit={(e) => void saveAdmin(e)} className="grid gap-3 rounded-ctl bg-card p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <TextField label={he.platform.adminDisplayName} value={admin.adminDisplayName} onChange={(v) => setAdmin((a) => ({ ...a, adminDisplayName: v }))} required />
          <TextField label={he.platform.adminUsername} value={admin.adminUsername} onChange={(v) => setAdmin((a) => ({ ...a, adminUsername: v }))} dir="ltr" required />
          <Button type="submit" disabled={adding || !admin.adminUsername.trim() || !admin.adminDisplayName.trim()}>
            {he.platform.addAdminSubmit}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
          {error}
        </p>
      )}
    </li>
  );
}
