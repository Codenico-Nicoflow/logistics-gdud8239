import { useState } from 'react';
import {
  useCreateUserMutation,
  useDeleteUserMutation,
  useResetPasswordMutation,
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
  const [reset] = useResetPasswordMutation();
  const [unlock] = useUnlockUserMutation();
  const [deleteUser, { isLoading: isDeleting }] = useDeleteUserMutation();
  const toast = useToast();
  const [shownPassword, setShownPassword] = useState<{ name: string; password: string } | null>(
    null,
  );

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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display font-bold">{he.users.title}</h1>
          <p className="mt-1 text-ink-soft">{he.users.subtitle}</p>
        </div>
        <Button onClick={() => setAdding(true)}>{he.users.add}</Button>
      </div>

      {shownPassword && (
        <Panel>
          <div className="px-4 py-3">
            <p className="font-semibold">{shownPassword.name}</p>
            <p className="mt-1 text-meta text-oxide">{he.users.passwordOnce}</p>
            <code className="mt-2 block rounded-ctl bg-brass-wash px-3 py-2 text-head font-bold tracking-wide">
              {shownPassword.password}
            </code>
            <Button variant="quiet" size="sm" onClick={() => setShownPassword(null)} className="mt-3">
              {he.common.close}
            </Button>
          </div>
        </Panel>
      )}

      <Panel>
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
              {rows.map((user) => {
                // A regular admin can look but not touch: a super-admin row
                // has no edit/reset/deactivate/delete controls at all unless
                // the viewer is a super-admin too — matches the server-side
                // guard in UsersService exactly, so nobody sees a button
                // that would just 400 anyway.
                const canManage = !user.isSuperAdmin || viewerIsSuperAdmin;
                return (
                  <tr
                    key={user.id}
                    className={`${user.isActive ? '' : 'opacity-50'} ${
                      user.isSuperAdmin ? 'relative' : ''
                    }`}
                  >
                    <Td className="font-semibold">
                      {user.isSuperAdmin ? (
                        <span className="inline-flex items-center gap-2">
                          <span
                            aria-hidden
                            className="animate-pulse text-lead"
                            style={{ filter: 'drop-shadow(0 0 4px var(--brass-bright))' }}
                          >
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
                      )}
                      {!user.isActive && (
                        <Tag>
                          <span className="mx-1">{he.users.inactive}</span>
                        </Tag>
                      )}
                      {user.lockedUntil && new Date(user.lockedUntil) > new Date() && (
                        <span title={he.users.lockedHint(formatDateTime(user.lockedUntil))} className="ms-2">
                          <Tag tone="oxide">{he.users.locked}</Tag>
                        </span>
                      )}
                    </Td>
                    <Td className="text-meta text-graphite">{user.username}</Td>
                    <Td>
                      {user.isSuperAdmin ? (
                        <Tag tone="brass">⚡ {he.users.superAdminTag} ⚡</Tag>
                      ) : user.username === 'shunem' ? (
                        <Tag tone="oxide">{he.users.shunemTag}</Tag>
                      ) : (
                        <Tag tone={user.role === 'admin' ? 'field' : 'neutral'}>
                          {he.roles[user.role]}
                        </Tag>
                      )}
                    </Td>
                    <Td className="text-meta text-graphite">{formatDateTime(user.createdAt)}</Td>
                    <Td>
                      {canManage ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            onClick={() => setEditing(user)}
                            className="text-meta font-semibold text-field-dark hover:underline"
                          >
                            {he.users.edit}
                          </button>
                          {user.lockedUntil && new Date(user.lockedUntil) > new Date() && (
                            <button
                              onClick={() => void unlock(user.id)}
                              className="text-meta font-semibold text-oxide hover:underline"
                            >
                              {he.users.unlock}
                            </button>
                          )}
                          <button
                            onClick={() =>
                              void reset(user.id).then((r) => {
                                if (r.data) {
                                  setShownPassword({
                                    name: user.displayName,
                                    password: r.data.password,
                                  });
                                }
                              })
                            }
                            className="text-meta font-semibold text-field-dark hover:underline"
                          >
                            {he.users.resetPassword}
                          </button>
                          <button
                            onClick={() => void update({ id: user.id, isActive: !user.isActive })}
                            className="text-meta font-semibold text-field-dark hover:underline"
                          >
                            {user.isActive ? he.users.deactivate : he.users.activate}
                          </button>
                          {user.id !== currentUserId && (
                            <button
                              onClick={() => setDeleting(user)}
                              className="text-meta font-semibold text-oxide hover:underline"
                            >
                              {he.users.delete}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-meta text-graphite">{he.users.superAdminProtected}</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      </Panel>

      {adding && (
        <AddUserDialog
          viewerIsShunem={currentUser?.username === 'shunem'}
          onClose={() => setAdding(false)}
          onCreated={(name, password) => setShownPassword({ name, password })}
        />
      )}
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
  onCreated: (name: string, password: string) => void;
}) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('logistics');
  const [companyScope, setCompanyScope] = useState<Company | ''>('');
  const [password, setPassword] = useState('');
  const [create, { isLoading, error }] = useCreateUserMutation();
  const toast = useToast();

  const needsCompanyScope = COMPANY_SCOPED_ROLES.includes(role);
  // The API itself enforces this minimum; checking it here too means the
  // button disables before a round-trip rather than after a rejected one.
  const passwordTooShort = password.trim().length > 0 && password.trim().length < 6;

  async function submit(): Promise<void> {
    const result = await create({
      username: username.trim(),
      displayName: displayName.trim(),
      role,
      ...(needsCompanyScope && companyScope ? { companyScope } : {}),
      ...(password.trim() ? { password: password.trim() } : {}),
    });
    if (result.data) {
      // Deliberately no success toast: the generated/given password is shown
      // in a panel that must stay until it is copied, and a toast announcing
      // the same thing would pull attention away from the one-time secret.
      onCreated(result.data.displayName, result.data.generatedPassword ?? password.trim());
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
          <TextField
            label={he.users.password}
            value={password}
            onChange={setPassword}
            hint={he.users.passwordHint}
            error={passwordTooShort ? he.users.passwordTooShort : undefined}
          />
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
                passwordTooShort ||
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
