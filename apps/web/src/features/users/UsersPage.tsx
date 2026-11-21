import { useState, type ReactNode } from 'react';
import {
  useCreateUserMutation,
  useDeleteUserMutation,
  useIssueSetupLinkMutation,
  useSecurityEventsQuery,
  useUnlockUserMutation,
  useUpdateUserMutation,
  useUsersQuery,
} from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  Modal,
  Panel,
  Select,
  Spinner,
  TableScroll,
  Tag,
  Td,
  Th,
  TextField,
  formatDateTime,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import { COMPANIES, type Company, type PublicUser, type Role } from '../../lib/types';

const ROLES: Role[] = ['admin', 'logistics', 'viewer', 'SHLISHUT', 'SAMGAD', 'COMPANY_CMDR'];

/** Roles whose access is scoped to one company, same as `logistics` today. */
const COMPANY_SCOPED_ROLES: Role[] = ['logistics', 'COMPANY_CMDR'];

/**
 * The accounts that appear in דוח תנועות. The display name is what the log
 * records, so it is the soldier's real name rather than a username.
 */
export function UsersPage({ currentUserId }: { currentUserId: string }) {
  const { data, isLoading } = useUsersQuery();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PublicUser | null>(null);
  const [deleting, setDeleting] = useState<PublicUser | null>(null);
  const [update] = useUpdateUserMutation();
  const [issueLink] = useIssueSetupLinkMutation();
  const [logFor, setLogFor] = useState<PublicUser | null>(null);
  const [unlock] = useUnlockUserMutation();
  const [deleteUser, { isLoading: isDeleting }] = useDeleteUserMutation();
  const toast = useToast();
  // The one-time setup link, shown until it is copied: the server never returns it again.
  const [shownLink, setShownLink] = useState<{ name: string; url: string; reset: boolean } | null>(null);

  if (isLoading) return <Spinner />;

  const currentUser = (data ?? []).find((u) => u.id === currentUserId);
  const viewerIsSuperAdmin = currentUser?.isSuperAdmin ?? false;

  // Super-admin always leads the table — he's not just another row — and
  // שונם gets the runner-up slot right under him, by inside-joke decree.
  // Everyone else keeps the server's own ordering (inactive last, then by
  // username) below those two.
  const rows = [...(data ?? [])].sort((a, b) => {
    const rank = (u: PublicUser) => (u.isSuperAdmin ? 0 : u.username === 'shunem' ? 1 : 2);
    return rank(a) - rank(b);
  });


  // A regular admin can look but not touch: a super-admin row has no edit/reset/deactivate/delete
  // controls at all unless the viewer is a super-admin too — matches the server-side guard in
  // UsersService exactly, so nobody sees a button that would just 400 anyway.
  const canManage = (user: PublicUser): boolean => !user.isSuperAdmin || viewerIsSuperAdmin;

  const nameOf = (user: PublicUser): ReactNode =>
    user.isSuperAdmin ? (
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className="animate-pulse text-lead" style={{ filter: 'drop-shadow(0 0 4px var(--brass-bright))' }}>
          👑
        </span>
        <span
          className="bg-[linear-gradient(90deg,var(--brass),var(--brass-bright),var(--brass))] bg-clip-text font-black tracking-wide text-transparent"
          style={{ backgroundSize: '200% auto' }}
        >
          {user.displayName}
        </span>
      </span>
    ) : (
      user.displayName
    );

  const roleTag = (user: PublicUser): ReactNode =>
    user.isSuperAdmin ? (
      <Tag tone="brass">⚡ {he.users.superAdminTag} ⚡</Tag>
    ) : user.username === 'shunem' ? (
      <Tag tone="oxide">{he.users.shunemTag}</Tag>
    ) : (
      <Tag tone={user.role === 'admin' ? 'field' : 'neutral'}>{he.roles[user.role]}</Tag>
    );

  const isLocked = (user: PublicUser): boolean => !!user.lockedUntil && new Date(user.lockedUntil) > new Date();

  const statusTags = (user: PublicUser): ReactNode => (
    <>
      {!user.isActive && <Tag>{he.users.inactive}</Tag>}
      {user.isActive && !user.mustSetup && user.passkeyCount === 0 && <Tag>{he.users.noDevice}</Tag>}
      {user.mustSetup && <Tag tone="brass">{he.users.pendingSetup}</Tag>}
      {isLocked(user) && (
        <span title={he.users.lockedHint(formatDateTime(user.lockedUntil as string))}>
          <Tag tone="oxide">{he.users.locked}</Tag>
        </span>
      )}
    </>
  );

  /** The same actions in both layouts: text links in the table, full-size buttons on a phone. */
  const actionsOf = (user: PublicUser, layout: 'table' | 'phone'): ReactNode => {
    if (!canManage(user)) return <span className="text-meta text-graphite">{he.users.superAdminProtected}</span>;

    const items: { key: string; label: string; danger?: boolean; run: () => void }[] = [
      { key: 'edit', label: he.users.edit, run: () => setEditing(user) },
    ];
    if (isLocked(user)) items.push({ key: 'unlock', label: he.users.unlock, danger: true, run: () => void unlock(user.id) });
    if (user.id !== currentUserId && user.isActive) {
      items.push({
        key: 'link',
        label: he.users.newSetupLink,
        run: () =>
          void issueLink(user.id).then((r) => {
            if ('data' in r && r.data) setShownLink({ name: user.displayName, url: r.data.url, reset: true });
            else if ('error' in r) toast.error({ title: he.toast.failed, detail: apiErrorMessage(r.error) ?? undefined });
          }),
      });
    }
    items.push({ key: 'log', label: he.users.securityLog, run: () => setLogFor(user) });
    items.push({
      key: 'active',
      label: user.isActive ? he.users.deactivate : he.users.activate,
      run: () => void update({ id: user.id, isActive: !user.isActive }),
    });
    if (user.id !== currentUserId) items.push({ key: 'delete', label: he.users.delete, danger: true, run: () => setDeleting(user) });

    if (layout === 'phone') {
      return (
        <div className="grid grid-cols-2 gap-2 pt-1">
          {items.map((i) => (
            <Button key={i.key} variant="quiet" size="sm" onClick={i.run} className={i.danger ? 'text-oxide' : ''}>
              {i.label}
            </Button>
          ))}
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-3">
        {items.map((i) => (
          <button
            key={i.key}
            onClick={i.run}
            className={`text-meta font-semibold hover:underline ${i.danger ? 'text-oxide' : 'text-field-dark'}`}
          >
            {i.label}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display font-bold">{he.users.title}</h1>
          <p className="mt-1 text-ink-soft">{he.users.subtitle}</p>
          {data && (
            <p className="mt-1 text-meta text-graphite">
              {he.users.deviceSummary(
                data.filter((u) => u.isActive && (u.passkeyCount ?? 0) > 0).length,
                data.filter((u) => u.isActive).length,
              )}
            </p>
          )}
        </div>
        <Button onClick={() => setAdding(true)}>{he.users.add}</Button>
      </div>

      {shownLink && <SetupLinkPanel link={shownLink} onClose={() => setShownLink(null)} />}

      <Panel>
        {/* Phone: a card per account, with the actions as real buttons. A five-column table with a row of
            text links cannot be read or tapped at phone width. */}
        <ul className="divide-y divide-rule sm:hidden">
          {rows.map((user) => (
            <li key={user.id} className={`space-y-2 px-4 py-3 ${user.isActive ? '' : 'opacity-50'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-body font-semibold">{nameOf(user)}</div>
                  <div className="text-meta text-graphite">{user.username}</div>
                </div>
                {roleTag(user)}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">{statusTags(user)}</div>
              <div className="text-micro text-graphite">
                {he.users.created} {formatDateTime(user.createdAt)}
              </div>
              {actionsOf(user, 'phone')}
            </li>
          ))}
        </ul>

        <div className="hidden sm:block">
          <TableScroll>
            <table className="row-hover w-full">
              <thead>
                <tr>
                  <Th>{he.users.displayName}</Th>
                  <Th>{he.users.username}</Th>
                  <Th>{he.users.role}</Th>
                  <Th>{he.users.created}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((user) => (
                  <tr key={user.id} className={`${user.isActive ? '' : 'opacity-50'} ${user.isSuperAdmin ? 'relative' : ''}`}>
                    <Td className="font-semibold">
                      {nameOf(user)}
                      <span className="ms-2 inline-flex flex-wrap items-center gap-1.5 align-middle">{statusTags(user)}</span>
                    </Td>
                    <Td className="text-meta text-graphite">{user.username}</Td>
                    <Td>{roleTag(user)}</Td>
                    <Td className="text-meta text-graphite">{formatDateTime(user.createdAt)}</Td>
                    <Td>{actionsOf(user, 'table')}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      </Panel>

      {adding && (
        <AddUserDialog
          viewerIsShunem={currentUser?.username === 'shunem'}
          onClose={() => setAdding(false)}
          onCreated={(name, url) => setShownLink({ name, url, reset: false })}
        />
      )}
      {logFor && <SecurityLogDialog user={logFor} onClose={() => setLogFor(null)} />}
      {editing && (
        <EditUserDialog
          user={editing}
          canRename={
            editing.username === 'shunem' && editing.id === currentUserId
              ? false
              : editing.id === currentUserId || editing.role !== 'admin' || viewerIsSuperAdmin
          }
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <ConfirmDeleteUserDialog
          user={deleting}
          isLoading={isDeleting}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            const result = await deleteUser(deleting.id);
            if ('data' in result) {
              toast.success({ title: he.users.deletedToast, detail: deleting.displayName });
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

function EditUserDialog({
  user,
  canRename,
  onClose,
}: {
  user: PublicUser;
  /** A regular admin cannot rename another admin account — only a
   *  super-admin can, or the account's own owner for themselves. */
  canRename: boolean;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [role, setRole] = useState<Role>(user.role);
  const [companyScope, setCompanyScope] = useState<Company | ''>(
    (user.companyScope as Company | null) ?? '',
  );
  const [update, { isLoading, error }] = useUpdateUserMutation();
  const toast = useToast();

  const needsCompanyScope = COMPANY_SCOPED_ROLES.includes(role);

  async function submit(): Promise<void> {
    const result = await update({
      id: user.id,
      ...(canRename ? { displayName: displayName.trim() } : {}),
      role,
      companyScope: needsCompanyScope && companyScope ? companyScope : null,
    });
    if ('data' in result && result.data) {
      toast.success({ title: he.toast.userUpdated, detail: displayName.trim() });
      onClose();
    } else if ('error' in result) {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  const message = apiErrorMessage(error);

  return (
    <Modal onClose={onClose}>
        <header className="rounded-t-panel border-b border-rule bg-card px-4 py-3">
          <h2 className="text-lead font-semibold">{he.users.editTitle(user.displayName)}</h2>
        </header>
        <div className="space-y-3 px-4 py-4">
          <TextField
            label={he.users.displayName}
            value={displayName}
            onChange={setDisplayName}
            hint={
              canRename
                ? he.users.displayNameHint
                : user.username === 'shunem'
                  ? he.users.shunemCantRename
                  : he.users.displayNameLocked
            }
            disabled={!canRename}
            autoFocus
            required
          />
          <Select
            label={he.users.role}
            value={role}
            onChange={(v) => v && setRole(v as Role)}
            options={ROLES.map((r) => ({ value: r, label: he.roles[r] }))}
          />
          {needsCompanyScope && (
            <Select
              label={he.users.companyScope}
              value={companyScope}
              onChange={setCompanyScope}
              options={[
                { value: '', label: he.soldiers.allCompanies },
                ...COMPANIES.map((c) => ({ value: c, label: he.companies[c] })),
              ]}
            />
          )}
          {message && (
            <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
              {message}
            </p>
          )}
          <div className="flex gap-2">
            <Button onClick={() => void submit()} disabled={isLoading || !displayName.trim()}>
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

/**
 * A real delete, not another isActive flag — the server refuses it with a
 * 409 if the account has any signature/movement/count history, so this
 * dialog can't accidentally erase audit trail; it can only remove an
 * account that was never real to begin with.
 */
function ConfirmDeleteUserDialog({
  user,
  isLoading,
  onConfirm,
  onCancel,
}: {
  user: PublicUser;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal onClose={onCancel} role="alertdialog" className="w-full max-w-sm">
        <div className="space-y-3 px-5 py-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-oxide-wash text-oxide">
              <span className="h-2.5 w-2.5 rounded-full bg-oxide" />
            </span>
            <h2 className="text-lead font-semibold">{he.users.confirmDeleteTitle(user.displayName)}</h2>
          </div>
          <p className="text-meta text-ink-soft">{he.users.confirmDeleteBody}</p>
          <div className="flex gap-2 pt-1">
            <Button variant="danger" onClick={onConfirm} disabled={isLoading}>
              {he.users.confirmDeleteAction}
            </Button>
            <Button variant="quiet" onClick={onCancel} disabled={isLoading}>
              {he.common.cancel}
            </Button>
          </div>
        </div>
    </Modal>
  );
}

function AddUserDialog({
  viewerIsShunem,
  onClose,
  onCreated,
}: {
  viewerIsShunem: boolean;
  onClose: () => void;
  onCreated: (name: string, url: string) => void;
}) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('logistics');
  const [companyScope, setCompanyScope] = useState<Company | ''>('');
  const [create, { isLoading, error }] = useCreateUserMutation();
  const toast = useToast();

  const needsCompanyScope = COMPANY_SCOPED_ROLES.includes(role);

  async function submit(): Promise<void> {
    const result = await create({
      username: username.trim(),
      displayName: displayName.trim(),
      role,
      ...(needsCompanyScope && companyScope ? { companyScope } : {}),
    });
    if (result.data) {
      // Deliberately no success toast: the setup link is shown in a panel that must stay until it
      // is copied, and a toast announcing the same thing would pull attention from the one-time link.
      onCreated(result.data.displayName, result.data.setup.url);
      onClose();
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  return (
    <Modal onClose={onClose}>
        <header className="rounded-t-panel border-b border-rule bg-card px-4 py-3">
          <h2 className="text-lead font-semibold">{he.users.addTitle}</h2>
        </header>
        <div className="space-y-3 px-4 py-4">
          <TextField
            label={he.users.displayName}
            value={displayName}
            onChange={setDisplayName}
            hint={he.users.displayNameHint}
            autoFocus
            required
          />
          <TextField
            label={he.users.username}
            value={username}
            onChange={setUsername}
            required
          />
          <Select
            label={he.users.role}
            value={role}
            onChange={(v) => v && setRole(v as Role)}
            options={ROLES.map((r) => ({ value: r, label: he.roles[r] }))}
          />
          {viewerIsShunem && role === 'admin' && (
            <p className="text-meta text-oxide">{he.users.shunemCantCreateAdmin}</p>
          )}
          {needsCompanyScope && (
            <Select
              label={he.users.companyScope}
              value={companyScope}
              onChange={setCompanyScope}
              options={[
                { value: '', label: he.soldiers.allCompanies },
                ...COMPANIES.map((c) => ({ value: c, label: he.companies[c] })),
              ]}
            />
          )}
          <p className="text-meta text-graphite">{he.users.createHint}</p>
          {apiErrorMessage(error) && (
            <p className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
              {apiErrorMessage(error)}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => void submit()}
              disabled={
                isLoading ||
                !username.trim() ||
                !displayName.trim() ||
                (viewerIsShunem && role === 'admin')
              }
            >
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

/**
 * The link only exists in this panel: the server stores a hash and cannot show it again. It stays
 * until the admin closes it, with a copy button because the next step is pasting it into a chat.
 */
function SetupLinkPanel({
  link,
  onClose,
}: {
  link: { name: string; url: string; reset: boolean };
  onClose: () => void;
}) {
  const toast = useToast();

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(link.url);
      toast.success({ title: he.users.linkCopied });
    } catch {
      // Clipboard access can be refused (insecure context, permissions): the link is still selectable below.
    }
  }

  return (
    <Panel>
      <div className="space-y-2 px-4 py-3">
        <p className="font-semibold">{he.users.setupLinkTitle(link.name)}</p>
        <p className="text-meta text-oxide">{he.users.setupLinkOnce}</p>
        {link.reset && <p className="text-meta text-ink-soft">{he.users.setupLinkResetNote}</p>}
        <input
          readOnly
          value={link.url}
          dir="ltr"
          onFocus={(e) => e.currentTarget.select()}
          className="block w-full rounded-ctl border border-rule-strong bg-brass-wash px-3 py-2 text-meta"
        />
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={() => void copy()}>
            {he.users.copyLink}
          </Button>
          <Button variant="quiet" size="sm" onClick={onClose}>
            {he.common.close}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function SecurityLogDialog({ user, onClose }: { user: PublicUser; onClose: () => void }) {
  const { data, isLoading } = useSecurityEventsQuery(user.id);
  return (
    <Modal onClose={onClose} className="max-h-[85dvh] w-full max-w-lg overflow-y-auto">
      <div className="space-y-3 px-5 py-5">
        <h2 className="text-lead font-semibold">{he.users.securityLogTitle(user.displayName)}</h2>
        {isLoading ? (
          <Spinner />
        ) : (data ?? []).length === 0 ? (
          <p className="text-meta text-graphite">{he.users.securityLogEmpty}</p>
        ) : (
          <ul className="divide-y divide-rule">
            {(data ?? []).map((e) => (
              <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="font-semibold">{he.users.eventTypes[e.type] ?? e.type}</span>
                <span className="text-micro text-graphite">
                  {formatDateTime(e.at)}
                  {e.ip && <span className="serial ms-2">{e.ip}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button variant="quiet" onClick={onClose}>
          {he.common.close}
        </Button>
      </div>
    </Modal>
  );
}
