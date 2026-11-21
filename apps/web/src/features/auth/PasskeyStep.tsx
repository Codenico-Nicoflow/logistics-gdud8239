import { useState } from 'react';
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import {
  usePasskeyAuthOptionsMutation,
  usePasskeyAuthVerifyMutation,
  usePasskeyEnrolOptionsMutation,
  usePasskeyEnrolVerifyMutation,
} from '../../lib/api';
import { apiErrorMessage, Button, TextField } from '../../components/ui';
import { he } from '../../i18n/he';

/** A readable default so the list of devices means something without the person typing a name. */
function guessDeviceName(): string {
  const ua = navigator.userAgent;
  const names = he.passkey.defaultName;
  if (/iPhone|iPad/i.test(ua)) return names.iphone;
  if (/Android/i.test(ua)) return names.android;
  if (/Macintosh/i.test(ua)) return names.mac;
  if (/Windows/i.test(ua)) return names.windows;
  return names.other;
}

/** The browser reports "the person dismissed the prompt" as a NotAllowedError; that is not a fault. */
const wasCancelled = (e: unknown): boolean => e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'AbortError');

/**
 * The second step of signing in. After the password, the person confirms on their own device
 * (fingerprint, face, PIN) — or, on a shared computer, scans a QR code with their phone and confirms
 * there, so nothing is stored on that computer. `enroll` is the same screen for a first device.
 */
export function PasskeyStep({
  step,
  mfaToken,
  onBack,
  onSignedIn,
}: {
  step: 'passkey' | 'enroll';
  mfaToken: string;
  onBack: () => void;
  /** Called once a session exists. The login page needs nothing (the app notices); the setup page reloads. */
  onSignedIn?: () => void;
}) {
  const [authOptions] = usePasskeyAuthOptionsMutation();
  const [authVerify] = usePasskeyAuthVerifyMutation();
  const [enrolOptions] = usePasskeyEnrolOptionsMutation();
  const [enrolVerify] = usePasskeyEnrolVerifyMutation();
  const [deviceName, setDeviceName] = useState(guessDeviceName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported = browserSupportsWebAuthn();

  async function run(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      if (step === 'passkey') {
        const optionsJSON = await authOptions({ mfaToken }).unwrap();
        const response = await startAuthentication({ optionsJSON });
        await authVerify({ mfaToken, response }).unwrap();
      } else {
        const optionsJSON = await enrolOptions({ mfaToken }).unwrap();
        const response = await startRegistration({ optionsJSON });
        await enrolVerify({ mfaToken, response, deviceName: deviceName.trim() || guessDeviceName() }).unwrap();
      }
      onSignedIn?.();
    } catch (e) {
      setError(wasCancelled(e) ? he.passkey.cancelled : (apiErrorMessage(e) ?? he.toast.failed));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lead font-semibold">{step === 'passkey' ? he.passkey.stepTitle : he.passkey.enrolTitle}</h2>
        <p className="mt-1 text-ink-soft">{step === 'passkey' ? he.passkey.stepIntro : he.passkey.enrolIntro}</p>
      </div>

      {step === 'enroll' && (
        <TextField
          label={he.passkey.deviceName}
          value={deviceName}
          onChange={setDeviceName}
          hint={he.passkey.deviceNameHint}
        />
      )}

      {!supported && (
        <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
          {he.passkey.unsupported}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
          {error}
        </p>
      )}

      <Button onClick={() => void run()} disabled={busy || !supported} className="w-full">
        {busy ? he.passkey.working : step === 'passkey' ? he.passkey.stepButton : he.passkey.enrolButton}
      </Button>
      {step === 'passkey' && <p className="text-meta text-graphite">{he.passkey.sharedComputer}</p>}
      <Button variant="quiet" onClick={onBack} disabled={busy} className="w-full">
        {he.passkey.back}
      </Button>
    </div>
  );
}
