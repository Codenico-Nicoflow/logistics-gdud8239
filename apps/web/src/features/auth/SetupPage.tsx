import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCompleteSetupMutation, useSetupInfoQuery } from '../../lib/api';
import { apiErrorMessage, Button, Spinner, TextField } from '../../components/ui';
import { he } from '../../i18n/he';

/**
 * Where a person lands from the one-time link an admin gave them. They choose their own password
 * here, so nobody else ever knows it. Public: they are not logged in yet, so it lives outside the
 * authenticated shell. An invalid, used or expired link all look the same on purpose.
 */
export function SetupPage() {
  const { token = '' } = useParams();
  const info = useSetupInfoQuery(token, { skip: !token });
  const [complete, { isLoading, error }] = useCompleteSetupMutation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const mismatch = confirm.length > 0 && password !== confirm;

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (password !== confirm) return;
    const result = await complete({ token, password });
    // The server signed them in; a full load starts the app with their session.
    if ('data' in result) window.location.replace('/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 border-b-2 border-field pb-4">
          <div className="text-figure font-bold leading-none text-field">{he.app.battalion}</div>
          <h1 className="mt-1 text-lead text-ink-soft">{he.app.name}</h1>
        </div>

        {info.isLoading ? (
          <Spinner />
        ) : info.isError || !info.data ? (
          <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-3 text-meta text-oxide">
            {he.setup.invalid}
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <h2 className="text-lead font-semibold">
                {info.data.kind === 'RESET' ? he.setup.titleReset : he.setup.titleInvite}
              </h2>
              <p className="mt-1 text-ink-soft">{he.setup.intro(info.data.displayName)}</p>
              <p className="mt-2 text-meta text-graphite">
                {he.setup.username}: <span className="serial font-semibold text-ink">{info.data.username}</span>
              </p>
            </div>

            <TextField
              label={he.setup.password}
              value={password}
              onChange={setPassword}
              type="password"
              autoFocus
              required
              hint={he.setup.rules}
            />
            <TextField
              label={he.setup.confirm}
              value={confirm}
              onChange={setConfirm}
              type="password"
              required
              error={mismatch ? he.setup.mismatch : undefined}
            />

            {apiErrorMessage(error) && (
              <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
                {apiErrorMessage(error)}
              </p>
            )}

            <Button type="submit" disabled={isLoading || !password || password !== confirm} className="w-full">
              {isLoading ? he.setup.submitting : he.setup.submit}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
