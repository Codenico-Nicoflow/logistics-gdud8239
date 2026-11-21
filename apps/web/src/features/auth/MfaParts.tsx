import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { apiErrorMessage, Button, TextField } from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import type { MfaEnrolStart } from '../../lib/types';

/**
 * The enrolling screen, shared by the first setup in the middle of signing in and by "אבטחה":
 * a QR code to scan (made in the browser, so the secret never goes to a third party), the same
 * secret to type by hand, and the first code to prove the app is set up right.
 */
export function EnrolForm({
  start,
  confirm,
  onCodes,
  onCancel,
  cancelLabel,
}: {
  start: () => Promise<MfaEnrolStart>;
  /** Resolves with the backup codes, or throws. */
  confirm: (code: string) => Promise<string[]>;
  onCodes: (codes: string[]) => void;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  const [enrol, setEnrol] = useState<MfaEnrolStart | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // One secret per mount: React's dev double-run of effects must not mint two and leave the server
  // holding a different one from the QR code on screen.
  const started = useRef<Promise<MfaEnrolStart> | null>(null);

  useEffect(() => {
    let live = true;
    started.current ??= start();
    started.current
      .then(async (e) => {
        const url = await QRCode.toDataURL(e.otpauthUrl, { margin: 2, width: 224 });
        if (live) {
          setEnrol(e);
          setQr(url);
        }
      })
      .catch((e: unknown) => live && setError(apiErrorMessage(e) ?? he.toast.failed));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onCodes(await confirm(code.replace(/\s/g, '')));
    } catch (err) {
      setError(apiErrorMessage(err) ?? he.mfa.wrongCode);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="text-lead font-semibold">{he.mfa.stepOne}</h2>
        <p className="mt-1 text-meta text-ink-soft">{he.mfa.stepOneHint}</p>
      </div>

      <div className="flex justify-center">
        {qr ? (
          <img src={qr} alt="" width={224} height={224} className="rounded-ctl border border-rule bg-white" />
        ) : (
          <div className="flex h-56 w-56 items-center justify-center rounded-ctl border border-rule text-meta text-graphite">
            {he.mfa.preparing}
          </div>
        )}
      </div>

      {enrol && (
        <details className="text-meta">
          <summary className="min-h-10 cursor-pointer py-2 font-semibold text-field">{he.mfa.cantScan}</summary>
          <div className="mt-1 rounded-ctl bg-card px-3 py-2">
            <span className="text-graphite">{he.mfa.secretLabel}: </span>
            <span dir="ltr" className="serial break-all font-semibold text-ink">
              {enrol.secret.match(/.{1,4}/g)?.join(' ')}
            </span>
          </div>
        </details>
      )}

      <div>
        <h2 className="text-lead font-semibold">{he.mfa.stepTwo}</h2>
        <TextField
          value={code}
          onChange={setCode}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          dir="ltr"
          placeholder="123456"
          required
          className="mt-2"
          inputClassName="serial text-center text-lead tracking-[0.3em]"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
          {error}
        </p>
      )}

      <Button type="submit" disabled={busy || !enrol || code.replace(/\s/g, '').length < 6} className="w-full">
        {busy ? he.mfa.confirming : he.mfa.confirm}
      </Button>
      {onCancel && (
        <Button variant="quiet" onClick={onCancel} disabled={busy} className="w-full">
          {cancelLabel ?? he.mfa.back}
        </Button>
      )}
    </form>
  );
}

/** Shown once, right after enrolling. The person must see these before the app starts. */
export function BackupCodes({ codes, onDone, doneLabel }: { codes: string[]; onDone: () => void; doneLabel?: string }) {
  const toast = useToast();

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      toast.success({ title: he.mfa.codesCopied });
    } catch {
      toast.error({ title: he.toast.failed });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lead font-semibold">{he.mfa.backupTitle}</h2>
        <p className="mt-1 text-ink-soft">{he.mfa.backupIntro}</p>
      </div>
      <ul dir="ltr" className="grid grid-cols-2 gap-2 rounded-ctl bg-card px-3 py-3">
        {codes.map((c) => (
          <li key={c} className="serial text-center text-body font-semibold">
            {c}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2 print:hidden">
        <Button variant="quiet" onClick={() => void copy()}>
          {he.mfa.copyCodes}
        </Button>
        <Button variant="quiet" onClick={() => window.print()}>
          {he.mfa.printCodes}
        </Button>
      </div>
      <Button onClick={onDone} className="w-full print:hidden">
        {doneLabel ?? he.mfa.savedThem}
      </Button>
    </div>
  );
}
