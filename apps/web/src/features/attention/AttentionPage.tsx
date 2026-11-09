import { useState } from 'react';
import { useBackfillSerialMutation, useNeedsAttentionQuery } from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  EmptyState,
  Panel,
  Serial,
  Spinner,
  TableScroll,
  Tag,
  Td,
  Th,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import type { ImportIssue, Signature } from '../../lib/types';

/**
 * Rows that came in from the Excel with a problem. The import deliberately
 * keeps them rather than dropping them, so this screen is where the gaps get
 * closed by hand.
 */
export function AttentionPage() {
  const { data, isLoading } = useNeedsAttentionQuery();
  const [fixing, setFixing] = useState<{ issue: ImportIssue; signature: Signature } | null>(null);

  if (isLoading) return <Spinner />;

  const issues = data?.issues ?? [];
  const signatures = new Map((data?.signatures ?? []).map((s) => [s.id, s]));

  const byKind = new Map<string, number>();
  for (const i of issues) byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + 1);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-display font-bold">{he.attention.title}</h1>
        <p className="mt-1 text-ink-soft">{he.attention.subtitle}</p>
      </div>

      {issues.length === 0 ? (
        <Panel>
          <EmptyState>{he.attention.none}</EmptyState>
        </Panel>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {[...byKind.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([kind, count]) => (
                <span
                  key={kind}
                  className="rounded-ctl border border-rule bg-card-raised px-3 py-1.5 text-meta"
                >
                  <span className="font-semibold">{count}</span>
                  <span className="text-graphite"> · </span>
                  {he.issueKinds[kind as keyof typeof he.issueKinds] ?? kind}
                </span>
              ))}
          </div>

          <Panel>
            <TableScroll>
              <table className="row-hover w-full">
                <thead>
                  <tr>
                    <Th>{he.attention.detail}</Th>
                    <Th>{he.signatures.soldier}</Th>
                    <Th>{he.signatures.item}</Th>
                    <Th numeric>{he.attention.row}</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue) => {
                    const signature = issue.signatureId
                      ? signatures.get(issue.signatureId)
                      : undefined;
                    const canFixSerial =
                      issue.kind === 'MISSING_SERIAL' &&
                      signature &&
                      signature.item.isSerialized &&
                      !signature.itemInstanceId;

                    return (
                      <tr key={issue.id}>
                        <Td>
                          <Tag tone="oxide">{he.issueKinds[issue.kind] ?? issue.kind}</Tag>
                          <div className="mt-1 text-meta text-ink-soft">{issue.detail}</div>
                        </Td>
                        <Td>
                          {signature ? (
                            <>
                              <span className="font-semibold">
                                {signature.soldier.firstName} {signature.soldier.lastName}
                              </span>
                              <div className="text-meta text-graphite">
                                {he.companies[signature.soldier.company]}
                              </div>
                            </>
                          ) : (
                            <span className="text-graphite">{he.common.none}</span>
                          )}
                        </Td>
                        <Td>
                          {signature?.item.name ?? he.common.none}
                          {issue.serial && (
                            <div>
                              <Serial value={issue.serial} />
                            </div>
                          )}
                        </Td>
                        <Td numeric className="text-meta text-graphite">
                          {issue.rowNumber}
                        </Td>
                        <Td>
                          {canFixSerial && signature && (
                            <Button
                              variant="quiet"
                              size="sm"
                              onClick={() => setFixing({ issue, signature })}
                            >
                              {he.attention.fixSerial}
                            </Button>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableScroll>
          </Panel>
        </>
      )}

      {fixing && <BackfillDialog {...fixing} onClose={() => setFixing(null)} />}
    </div>
  );
}

function BackfillDialog({
  signature,
  onClose,
}: {
  issue: ImportIssue;
  signature: Signature;
  onClose: () => void;
}) {
  const [serial, setSerial] = useState('');
  const [backfill, { isLoading, error }] = useBackfillSerialMutation();
  const toast = useToast();

  async function submit(): Promise<void> {
    const result = await backfill({ id: signature.id, serial: serial.trim() });
    if (result.data) {
      toast.success({
        title: he.toast.serialBackfilled,
        detail: `${signature.item.name} · ${serial.trim()} → ${signature.soldier.firstName} ${signature.soldier.lastName}`,
      });
      onClose();
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  const apiMessage = apiErrorMessage(error);

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-ink/30 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-panel border border-rule bg-card-raised shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-rule px-4 py-3">
          <h2 className="text-lead font-semibold">
            {he.attention.fixSerialTitle(signature.item.name)}
          </h2>
        </header>
        <div className="space-y-3 px-4 py-4">
          <div className="rounded-ctl bg-card px-3 py-2 text-meta">
            <span className="font-semibold">
              {signature.soldier.firstName} {signature.soldier.lastName}
            </span>
            <span className="text-graphite"> · {he.companies[signature.soldier.company]}</span>
          </div>

          <label className="block">
            <span className="mb-1 block text-meta font-semibold text-ink-soft">
              {he.issue.serialLabel}
            </span>
            <input
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              autoFocus
              className="serial w-full rounded-ctl border-2 border-brass bg-brass-wash px-3 py-3 text-head"
            />
          </label>

          {apiMessage && (
            <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
              {apiMessage}
            </p>
          )}

          <div className="flex gap-2">
            <Button onClick={() => void submit()} disabled={isLoading || !serial.trim()}>
              {isLoading ? he.common.saving : he.common.save}
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
