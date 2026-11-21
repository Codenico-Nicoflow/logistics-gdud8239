import { useState } from 'react';
import {
  useMfaBackupCodesMutation,
  useMfaDisableMutation,
  useMfaSetupConfirmMutation,
  useMfaSetupStartMutation,
  useMfaStatusQuery,
} from '../../lib/api';
import { apiErrorMessage, Button, Modal, Panel, Spinner, Tag, TextField } from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import { BackupCodes, EnrolForm } from './MfaParts';

/**
 * "אבטחה": the signed-in person's own authenticator app. Everyone can reach it, since it is about
 * their own account. Switching it off is not offered while it is required of them.
 */
export function SecurityPage() {
  const { data, isLoading } = useMfaStatusQuery();
  const [setupStart] = useMfaSetupStartMutation();
  const [setupConfirm] = useMfaSetupConfirmMutation();
  const toast = useToast();
  const [setting, setSetting] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [asking, setAsking] = useState<'codes' | 'disable' | null>(null);

  if (isLoading || !data) return <Spinner />;

  if (codes) {
    return (
      <div className="mx-auto max-w-md">
        <Panel>
          <div className="px-4 py-4">
            <BackupCodes codes={codes} doneLabel={he.security.done} onDone={() => setCodes(null)} />
          </div>
        </Panel>
      </div>
    );
  }

  if (setting) {
    return (
      <div className="mx-auto max-w-md">
        <Panel title={he.security.setup}>
          <div className="px-4 py-4">
            <EnrolForm
              start={() => setupStart().unwrap()}
              confirm={async (code) => (await setupConfirm({ code }).unwrap()).backupCodes}
              onCodes={(c) => {
                setSetting(false);
                setCodes(c);
                toast.success({ title: he.security.enabledToast });
              }}
              onCancel={() => setSetting(false)}
              cancelLabel={he.security.cancel}
            />
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-display font-bold">{he.security.title}</h1>
        <p className="mt-1 text-ink-soft">{he.security.subtitle}</p>
      </div>

      <Panel>
        <div className="space-y-4 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone={data.enabled ? 'field' : 'neutral'}>{data.enabled ? he.security.statusOn : he.security.statusOff}</Tag>
            {data.enabled && <span className="text-meta text-graphite">{he.security.codesLeft(data.backupCodesLeft)}</span>}
          </div>
          {data.enforced && !data.exempt && <p className="text-meta text-ink-soft">{he.security.requiredNote}</p>}
          {data.exempt && <p className="text-meta text-ink-soft">{he.security.exemptNote}</p>}

          {!data.enabled ? (
            <Button onClick={() => setSetting(true)} className="w-full sm:w-auto">
              {he.security.setup}
            </Button>
          ) : (
            <div className="grid gap-2 sm:flex">
              <Button variant="quiet" onClick={() => setAsking('codes')}>
                {he.security.newCodes}
              </Button>
              {data.canDisable && (
                <Button variant="danger" onClick={() => setAsking('disable')}>
                  {he.security.disable}
                </Button>
              )}
            </div>
          )}
        </div>
      </Panel>

      {asking && <PasswordDialog kind={asking} onClose={() => setAsking(null)} onCodes={setCodes} />}
    </div>
  );
}

/** Both sensitive actions re-ask for the password, so a stolen open session alone cannot weaken the account. */
function PasswordDialog({
  kind,
  onClose,
  onCodes,
}: {
  kind: 'codes' | 'disable';
  onClose: () => void;
  onCodes: (codes: string[]) => void;
}) {
  const [password, setPassword] = useState('');
  const [newCodes, { isLoading: loadingCodes, error: codesError }] = useMfaBackupCodesMutation();
  const [disable, { isLoading: disabling, error: disableError }] = useMfaDisableMutation();
  const toast = useToast();
  const busy = loadingCodes || disabling;
  const error = apiErrorMessage(kind === 'codes' ? codesError : disableError);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (kind === 'codes') {
      const result = await newCodes({ password });
      if ('data' in result && result.data) {
        onClose();
        onCodes(result.data.backupCodes);
      }
    } else {
      const result = await disable({ password });
      if (!('error' in result)) {
        toast.success({ title: he.security.disabledToast });
        onClose();
      }
    }
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit} className="space-y-3 px-5 py-5">
        <h2 className="text-lead font-semibold">{kind === 'codes' ? he.security.newCodes : he.security.disable}</h2>
        <p className="text-meta text-ink-soft">{kind === 'codes' ? he.security.newCodesBody : he.security.disableBody}</p>
        <TextField
          label={he.security.password}
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          autoFocus
          required
          error={error ?? undefined}
        />
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button type="submit" variant={kind === 'disable' ? 'danger' : 'primary'} disabled={busy || !password}>
            {busy ? he.security.working : kind === 'codes' ? he.security.newCodes : he.security.disable}
          </Button>
          <Button variant="quiet" onClick={onClose} disabled={busy}>
            {he.security.cancel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
