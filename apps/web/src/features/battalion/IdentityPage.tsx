import { useRef, useState } from 'react';
import { useBattalionQuery, useClearBattalionLogoMutation, useSetBattalionLogoMutation } from '../../lib/api';
import { apiErrorMessage, Button, Panel, Spinner } from '../../components/ui';
import { BattalionMark } from '../../components/BattalionMark';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';

/** Mirrors the server's limit so a too-big file is turned away before it is sent, with the same wording. */
export const MAX_LOGO_BYTES = 512 * 1024;
const ACCEPTED = ['image/png', 'image/jpeg'];

/**
 * זהות הגדוד: the logo shown in the app, and the name and number printed on every form. The name and
 * number are set up by whoever created the battalion, so they are only shown here.
 */
export function IdentityPage() {
  const { data, isLoading } = useBattalionQuery();
  const [upload, { isLoading: uploading }] = useSetBattalionLogoMutation();
  const [clear, { isLoading: clearing }] = useClearBattalionLogoMutation();
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();

  if (isLoading || !data) return <Spinner />;

  async function pick(file: File | undefined): Promise<void> {
    if (!file) return;
    setError(null);
    if (!ACCEPTED.includes(file.type)) return setError(he.identity.wrongType);
    if (file.size > MAX_LOGO_BYTES) return setError(he.identity.tooBig);
    const result = await upload(file);
    if (result.error) return setError(apiErrorMessage(result.error) ?? he.toast.failed);
    toast.success({ title: he.identity.saved });
  }

  async function remove(): Promise<void> {
    setError(null);
    const result = await clear();
    if (result.error) return setError(apiErrorMessage(result.error) ?? he.toast.failed);
    toast.success({ title: he.identity.removed });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-display font-bold">{he.identity.title}</h1>
        <p className="mt-1 text-ink-soft">{he.identity.subtitle}</p>
      </div>

      <Panel title={he.identity.logo}>
        <div className="flex flex-col gap-5 px-4 py-4 sm:flex-row sm:items-center">
          <div className="grid h-28 w-28 shrink-0 place-items-center self-start rounded-panel bg-[#14221d]">
            <BattalionMark className="h-20 w-20" />
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-ink-soft">{data.hasLogo ? he.identity.hasLogo : he.identity.noLogo(data.number)}</p>
            <p className="text-meta text-graphite">{he.identity.requirements}</p>
            <input
              ref={input}
              type="file"
              accept={ACCEPTED.join(',')}
              className="sr-only"
              aria-label={he.identity.choose}
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                // Picking the same file again after an error must still fire a change.
                e.target.value = '';
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => input.current?.click()} disabled={uploading || clearing}>
                {uploading ? he.identity.uploading : data.hasLogo ? he.identity.replace : he.identity.choose}
              </Button>
              {data.hasLogo && (
                <Button variant="quiet" onClick={() => void remove()} disabled={uploading || clearing}>
                  {he.identity.remove}
                </Button>
              )}
            </div>
            {error && (
              <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
                {error}
              </p>
            )}
          </div>
        </div>
      </Panel>

      <Panel title={he.identity.printedAs}>
        <dl className="grid gap-3 px-4 py-4 sm:grid-cols-2">
          <div>
            <dt className="text-meta text-graphite">{he.identity.name}</dt>
            <dd className="text-body font-semibold">{data.name}</dd>
          </div>
          <div>
            <dt className="text-meta text-graphite">{he.identity.number}</dt>
            <dd className="serial text-body font-semibold">{data.number}</dd>
          </div>
        </dl>
      </Panel>
    </div>
  );
}
