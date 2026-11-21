import { useState } from 'react';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import {
  useMyPasskeysQuery,
  usePasskeyAddOptionsMutation,
  usePasskeyAddVerifyMutation,
  useRemovePasskeyMutation,
} from '../../lib/api';
import { apiErrorMessage, Button, EmptyState, formatDateTime, Panel, Spinner, Tag, TextField } from '../../components/ui';
import { DeleteDialog } from '../../components/DeleteDialog';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import type { PasskeySummary } from '../../lib/types';

/**
 * "המכשירים שלי": the devices that approve this person's sign-ins. Everyone can reach it — it is
 * about their own account — and it is where a second device gets added, so losing one phone is an
 * inconvenience and not a call to an admin.
 */
export function DevicesPage() {
  const { data, isLoading } = useMyPasskeysQuery();
  const [addOptions] = usePasskeyAddOptionsMutation();
  const [addVerify] = usePasskeyAddVerifyMutation();
  const [remove, { isLoading: removing }] = useRemovePasskeyMutation();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<PasskeySummary | null>(null);

  const supported = browserSupportsWebAuthn();

  async function add(): Promise<void> {
    setBusy(true);
    try {
      const optionsJSON = await addOptions().unwrap();
      const response = await startRegistration({ optionsJSON });
      await addVerify({ response, deviceName: name.trim() || he.passkey.defaultName.other }).unwrap();
      setName('');
      toast.success({ title: he.devices.added });
    } catch (e) {
      const dismissed = e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'AbortError');
      toast.error({ title: he.toast.failed, detail: dismissed ? he.passkey.cancelled : (apiErrorMessage(e) ?? undefined) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-display font-bold">{he.devices.title}</h1>
        <p className="mt-1 text-ink-soft">{he.devices.subtitle}</p>
      </div>

      <Panel>
        {isLoading ? (
          <Spinner />
        ) : (data ?? []).length === 0 ? (
          <EmptyState>{he.devices.none}</EmptyState>
        ) : (
          <ul className="divide-y divide-rule">
            {(data ?? []).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{d.deviceName}</span>
                    <Tag tone={d.backedUp ? 'field' : 'neutral'}>{d.backedUp ? he.devices.synced : he.devices.singleDevice}</Tag>
                  </div>
                  <div className="text-micro text-graphite">
                    {he.devices.addedOn} {formatDateTime(d.createdAt)} ·{' '}
                    {d.lastUsedAt ? `${he.devices.lastUsed} ${formatDateTime(d.lastUsedAt)}` : he.devices.neverUsed}
                  </div>
                </div>
                <Button size="sm" variant="quiet" onClick={() => setConfirming(d)}>
                  {he.devices.remove}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <div className="space-y-3 px-4 py-4">
          <TextField label={he.passkey.deviceName} value={name} onChange={setName} hint={he.passkey.deviceNameHint} />
          {!supported && <p className="text-meta text-oxide">{he.passkey.unsupported}</p>}
          <Button onClick={() => void add()} disabled={busy || !supported}>
            {busy ? he.passkey.working : he.devices.add}
          </Button>
        </div>
      </Panel>

      {confirming && (
        <DeleteDialog
          title={he.devices.removeTitle}
          body={he.devices.removeBody(confirming.deviceName)}
          isLoading={removing}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => {
            const result = await remove(confirming.id);
            if ('error' in result) {
              toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
            } else {
              toast.success({ title: he.devices.removed });
            }
            setConfirming(null);
          }}
        />
      )}
    </div>
  );
}
