import { useState } from 'react';
import { useLoginMutation } from '../../lib/api';
import { Button, TextField } from '../../components/ui';
import { MfaStep } from './MfaStep';
import { he } from '../../i18n/he';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [login, { isLoading, isError }] = useLoginMutation();
  // Set when the password was right but the authenticator step is still owed.
  const [pending, setPending] = useState<{ step: 'totp' | 'enroll'; mfaToken: string } | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    const result = await login({ username, password });
    if ('data' in result && result.data && 'step' in result.data) {
      // The password is not kept around: the token is all the next step needs.
      setPassword('');
      setPending({ step: result.data.step, mfaToken: result.data.mfaToken });
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* The battalion number is the identifying mark here, so it carries the
            weight rather than a logo or a tagline. */}
        <div className="mb-8 border-b-2 border-field pb-4">
          <div className="text-figure font-bold leading-none text-field">{he.app.battalion}</div>
          <h1 className="mt-1 text-lead text-ink-soft">{he.app.name}</h1>
        </div>

        {pending ? (
          <MfaStep step={pending.step} mfaToken={pending.mfaToken} onBack={() => setPending(null)} />
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <TextField
              label={he.auth.username}
              value={username}
              onChange={setUsername}
              autoFocus
              required
            />
            <TextField
              label={he.auth.password}
              value={password}
              onChange={setPassword}
              type="password"
              required
            />

            {isError && (
              <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
                {he.auth.failed}
              </p>
            )}

            <Button type="submit" disabled={isLoading || !username || !password} className="w-full">
              {isLoading ? he.auth.submitting : he.auth.submit}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
