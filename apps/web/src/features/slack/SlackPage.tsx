import { useState } from 'react';
import { useSetSlackChannelMutation } from '../../lib/api';
import { apiErrorMessage, Button, Panel, Spinner, Tag, TextField } from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import { SLACK_KINDS, type SlackKind } from '../../lib/types';
import { useSlack } from './useSlack';

/**
 * Slack: where this battalion's posts go. The bot is the platform's; the channels are the battalion's own,
 * so with nothing set here the battalion has no Slack at all and its screens hide the send buttons.
 */
export function SlackPage() {
  const { overview, isLoading } = useSlack();
  if (isLoading || !overview) return <Spinner />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-display font-bold">{he.slack.title}</h1>
        <p className="mt-1 text-ink-soft">{he.slack.subtitle}</p>
      </div>

      {!overview.botReady && (
        <p role="alert" className="text-meta text-oxide">
          {he.slack.noBot}
        </p>
      )}

      <Panel>
        <ul className="divide-y divide-rule">
          {SLACK_KINDS.map((kind) => (
            <ChannelRow key={kind} kind={kind} current={overview.channels?.[kind] ?? null} active={overview.configured[kind]} />
          ))}
        </ul>
      </Panel>

      <p className="text-meta text-graphite">{he.slack.fullDump}</p>
    </div>
  );
}

function ChannelRow({ kind, current, active }: { kind: SlackKind; current: string | null; active: boolean }) {
  const [save, { isLoading }] = useSetSlackChannelMutation();
  const [draft, setDraft] = useState(current ?? '');
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const changed = draft.trim() !== (current ?? '');

  async function run(channelId: string | null): Promise<void> {
    setError(null);
    const result = await save({ kind, channelId });
    if (result.error) return setError(apiErrorMessage(result.error) ?? he.toast.failed);
    if (channelId === null) setDraft('');
    toast.success({ title: he.slack.saved });
  }

  return (
    <li className="space-y-2 px-4 py-4">
      <span className="flex items-center gap-2">
        <span className="text-body font-semibold">{he.slack.kinds[kind].name}</span>
        <Tag tone={active ? 'field' : 'brass'}>{active ? he.slack.configured : he.slack.notConfigured}</Tag>
      </span>
      <p className="text-meta text-graphite">{he.slack.kinds[kind].about}</p>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(draft.trim() || null);
        }}
      >
        <TextField className="min-w-0 flex-1" label={he.slack.channelId} value={draft} onChange={setDraft} maxLength={40} error={error ?? undefined} />
        <Button type="submit" disabled={isLoading || !changed}>
          {he.common.save}
        </Button>
        {current && (
          <Button type="button" variant="quiet" disabled={isLoading} onClick={() => void run(null)}>
            {he.slack.clear}
          </Button>
        )}
      </form>
    </li>
  );
}
