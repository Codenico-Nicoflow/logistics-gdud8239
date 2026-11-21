import { useState } from 'react';
import {
  useMfaEnrolConfirmMutation,
  useMfaEnrolStartMutation,
  useMfaVerifyMutation,
} from '../../lib/api';
import { apiErrorMessage, Button, TextField } from '../../components/ui';
import { he } from '../../i18n/he';
import { BackupCodes, EnrolForm } from './MfaParts';

/**
 * The second step of signing in. `totp`: type the code from the authenticator app (or a backup
 * code). `enroll`: the person has none yet and it is required, so set it up now — which also signs
 * them in, after they have seen their backup codes.
 */
export function MfaStep({
  step,
  mfaToken,
  onBack,
  onSignedIn,
}: {
  step: 'totp' | 'enroll';
  mfaToken: string;
  onBack: () => void;
  /** Called once a session exists. The login page needs nothing (the app notices); the setup page reloads. */
  onSignedIn?: () => void;
}) {
  const [verify, { isLoading }] = useMfaVerifyMutation();
  const [enrolStart] = useMfaEnrolStartMutation();
  const [enrolConfirm] = useMfaEnrolConfirmMutation();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Set once enrolling worked: the session exists, but the codes must be seen before the app starts.
  const [codes, setCodes] = useState<string[] | null>(null);

  if (codes) {
    return <BackupCodes codes={codes} onDone={() => (onSignedIn ? onSignedIn() : window.location.replace('/'))} />;
  }

  if (step === 'enroll') {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lead font-semibold">{he.mfa.enrolTitle}</h2>
          <p className="mt-1 text-ink-soft">{he.mfa.enrolIntro}</p>
        </div>
        <EnrolForm
          start={() => enrolStart({ mfaToken }).unwrap()}
          confirm={async (c) => (await enrolConfirm({ mfaToken, code: c }).unwrap()).backupCodes}
          onCodes={setCodes}
          onCancel={onBack}
        />
      </div>
    );
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    const result = await verify({ mfaToken, code: code.trim() });
    if ('error' in result) setError(apiErrorMessage(result.error) ?? he.mfa.wrongCode);
    else onSignedIn?.();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="text-lead font-semibold">{he.mfa.stepTitle}</h2>
        <p className="mt-1 text-ink-soft">{he.mfa.stepIntro}</p>
      </div>

      <TextField
        label={he.mfa.codeLabel}
        value={code}
        onChange={setCode}
        autoComplete="one-time-code"
        inputMode="text"
        maxLength={20}
        dir="ltr"
        autoFocus
        required
        hint={he.mfa.codeHint}
        inputClassName="serial text-center text-lead tracking-[0.2em]"
      />

      {error && (
        <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
          {error}
        </p>
      )}

      <Button type="submit" disabled={isLoading || code.trim().length < 6} className="w-full">
        {isLoading ? he.mfa.verifying : he.mfa.verify}
      </Button>
      <Button variant="quiet" onClick={onBack} disabled={isLoading} className="w-full">
        {he.mfa.back}
      </Button>
    </form>
  );
}
