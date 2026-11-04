import { useState } from 'react';
import {
  useCreateUserMutation,
  useResetPasswordMutation,
  useUpdateUserMutation,
  useUsersQuery,
} from '../../lib/api';
import {
  apiErrorMessage,
  Button,
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
import { he } from '../../i18n/he';
import type { Role } from '../../lib/types';

const ROLES: Role[] = ['admin', 'logistics', 'viewer'];

/**
 * The accounts that appear in דוח תנועות. The display name is what the log
 * records, so it is the soldier's real name rather than a username.
 */
export function UsersPage() {
  const { data, isLoading } = useUsersQuery();
  const [adding, setAdding] = useState(false);
  const [update] = useUpdateUserMutation();
  const [reset] = useResetPasswordMutation();
  const [shownPassword, setShownPassword] = useState<{ name: string; password: string } | null>(
    null,
  );

  if (isLoading) return <Spinner />;

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
              {(data ?? []).map((user) => (
                <tr key={user.id} className={user.isActive ? undefined : 'opacity-50'}>
                  <Td className="font-semibold">
                    {user.displayName}
                    {!user.isActive && (
                      <Tag>
                        <span className="mx-1">{he.users.inactive}</span>
                      </Tag>
                    )}
                  </Td>
                  <Td className="text-meta text-graphite">{user.username}</Td>
                  <Td>
                    <Tag tone={user.role === 'admin' ? 'field' : 'neutral'}>
                      {he.roles[user.role]}
                    </Tag>
                  </Td>
                  <Td className="text-meta text-graphite">{formatDateTime(user.createdAt)}</Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button
                        variant="quiet"
                        size="sm"
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
                      >
                        {he.users.resetPassword}
                      </Button>
                      <Button
                        variant="quiet"
                        size="sm"
                        onClick={() => void update({ id: user.id, isActive: !user.isActive })}
                      >
                        {user.isActive ? he.users.deactivate : he.users.activate}
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Panel>

      {adding && (
        <AddUserDialog
          onClose={() => setAdding(false)}
          onCreated={(name, password) => setShownPassword({ name, password })}
        />
      )}
    </div>
  );
}

function AddUserDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (name: string, password: string) => void;
}) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('logistics');
  const [create, { isLoading, error }] = useCreateUserMutation();

  async function submit(): Promise<void> {
    const result = await create({ username: username.trim(), displayName: displayName.trim(), role });
    if (result.data) {
      if (result.data.generatedPassword) {
        onCreated(result.data.displayName, result.data.generatedPassword);
      }
      onClose();
    }
  }

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
          {apiErrorMessage(error) && (
            <p className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
              {apiErrorMessage(error)}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              onClick={() => void submit()}
              disabled={isLoading || !username.trim() || !displayName.trim()}
            >
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
