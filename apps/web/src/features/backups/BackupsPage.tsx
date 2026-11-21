import { useState } from 'react';
import {
  useCreateDbBackupMutation,
  useDeleteDbBackupMutation,
  useDeleteSnapshotMutation,
  useCreateSnapshotMutation,
  useDbBackupsQuery,
  useSendDbBackupToSlackMutation,
  useSendSnapshotToSlackMutation,
  useSnapshotsQuery,
} from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  EmptyState,
  Panel,
  Spinner,
  TableScroll,
  Tag,
  Td,
  Th,
  formatBytes,
  formatDateTime,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { DeleteDialog } from '../../components/DeleteDialog';
import { he } from '../../i18n/he';

export function BackupsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-display font-bold">{he.backups.title}</h1>
        <p className="mt-1 text-ink-soft">{he.backups.subtitle}</p>
      </div>

      <DbBackupPanel />
      <SnapshotPanel />
    </div>
  );
}

/**
 * The daily Excel snapshot — a human-readable copy of the business data, sent
 * to Slack for visibility. Secondary to the SQL backup above: it cannot be
 * restored from, only read.
 */
function SnapshotPanel() {
  const { data, isLoading } = useSnapshotsQuery();
  const [createSnapshot, createState] = useCreateSnapshotMutation();
  const toast = useToast();
  const [sendSlack] = useSendSnapshotToSlackMutation();
  const [remove, removeState] = useDeleteSnapshotMutation();
  const [deleting, setDeleting] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lead font-bold">{he.backups.snapshotTitle}</h2>
        <p className="mt-1 text-meta text-ink-soft">{he.backups.snapshotSubtitle}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href="/api/excel/export"
          className="rounded-ctl bg-field px-3.5 py-2 text-body font-semibold text-white hover:bg-field-dark"
        >
          {he.backups.exportExcel}
        </a>
        <Button
          variant="quiet"
          onClick={() =>
            void createSnapshot().then((r) =>
              'data' in r && r.data
                ? toast.success({ title: he.toast.snapshotCreated })
                : toast.error({
                    title: he.toast.failed,
                    detail: apiErrorMessage('error' in r ? r.error : undefined) ?? undefined,
                  }),
            )
          }
          disabled={createState.isLoading}
        >
          {createState.isLoading ? he.backups.creating : he.backups.createNow}
        </Button>
      </div>

      <Panel title={he.backups.title}>
        {isLoading ? (
          <Spinner />
        ) : (data?.length ?? 0) === 0 ? (
          <EmptyState>{he.common.noResults}</EmptyState>
        ) : (
          <TableScroll>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>{he.backups.created}</Th>
                  <Th>{he.backups.kind}</Th>
                  <Th numeric>{he.backups.rows}</Th>
                  <Th numeric>{he.backups.size}</Th>
                  <Th>{he.backups.slack}</Th>
                  <Th />
                  <Th />
                </tr>
              </thead>
              <tbody>
                {data?.map((s) => (
                  <tr key={s.id}>
                    <Td className="whitespace-nowrap">{formatDateTime(s.createdAt)}</Td>
                    <Td>
                      <Tag tone={s.kind === 'pre_import' ? 'brass' : 'neutral'}>
                        {he.backups.kinds[s.kind]}
                      </Tag>
                    </Td>
                    <Td numeric>{s.rowCount}</Td>
                    <Td numeric className="text-meta text-graphite">
                      {formatBytes(s.sizeBytes)}
                    </Td>
                    <Td>
                      {s.slackSentAt ? (
                        <Tag tone="field">{he.backups.sent}</Tag>
                      ) : (
                        <button
                          onClick={() => void sendSlack(s.id)}
                          className="text-meta font-semibold text-field hover:underline"
                        >
                          {he.backups.sendSlack}
                        </button>
                      )}
                    </Td>
                    <Td>
                      <a
                        href={`/api/snapshots/${s.id}/download`}
                        className="text-meta font-semibold text-field hover:underline"
                      >
                        {he.backups.download}
                      </a>
                    </Td>
                    <Td>
                      <button
                        onClick={() => setDeleting(s.id)}
                        className="text-meta font-semibold text-oxide hover:underline"
                      >
                        {he.backups.delete}
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>
      {deleting && (
        <DeleteDialog
          title={he.backups.deleteTitle}
          body={he.backups.deleteBody}
          isLoading={removeState.isLoading}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            void remove(deleting).then((r) => {
              setDeleting(null);
              if ('data' in r && r.data) toast.success({ title: he.backups.deleted });
              else toast.error({ title: he.toast.failed, detail: apiErrorMessage('error' in r ? r.error : undefined) ?? undefined });
            })
          }
        />
      )}
    </div>
  );
}

/**
 * The full-database disaster-recovery backup — a raw pg_dump, not the
 * business-data xlsx above. Deliberately its own panel/table rather than a
 * tab or a merged list: the two serve different purposes (one is
 * re-importable business data, the other is opaque plumbing for "the home
 * server died"), and conflating them in one table would blur that.
 */
function DbBackupPanel() {
  const { data, isLoading } = useDbBackupsQuery();
  const [createBackup, createState] = useCreateDbBackupMutation();
  const [sendSlack] = useSendDbBackupToSlackMutation();
  const [remove, removeState] = useDeleteDbBackupMutation();
  const [deleting, setDeleting] = useState<string | null>(null);
  const toast = useToast();

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lead font-bold">{he.backups.dbBackupTitle}</h2>
        <p className="mt-1 text-meta text-ink-soft">{he.backups.dbBackupSubtitle}</p>
      </div>

      <Button
        variant="quiet"
        onClick={() =>
          void createBackup().then((r) =>
            'data' in r && r.data
              ? toast.success({ title: he.toast.snapshotCreated })
              : toast.error({
                  title: he.toast.failed,
                  detail: apiErrorMessage('error' in r ? r.error : undefined) ?? undefined,
                }),
          )
        }
        disabled={createState.isLoading}
      >
        {createState.isLoading ? he.backups.creating : he.backups.createNow}
      </Button>

      <Panel title={he.backups.dbBackupTitle}>
        {isLoading ? (
          <Spinner />
        ) : (data?.length ?? 0) === 0 ? (
          <EmptyState>{he.common.noResults}</EmptyState>
        ) : (
          <TableScroll>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>{he.backups.created}</Th>
                  <Th>{he.backups.kind}</Th>
                  <Th numeric>{he.backups.size}</Th>
                  <Th>{he.backups.slack}</Th>
                  <Th />
                  <Th />
                </tr>
              </thead>
              <tbody>
                {data?.map((b) => (
                  <tr key={b.id}>
                    <Td className="whitespace-nowrap">{formatDateTime(b.createdAt)}</Td>
                    <Td>
                      <Tag tone="neutral">{he.backups.dbBackupKinds[b.kind]}</Tag>
                    </Td>
                    <Td numeric className="text-meta text-graphite">
                      {formatBytes(b.sizeBytes)}
                    </Td>
                    <Td>
                      {b.slackSentAt ? (
                        <Tag tone="field">{he.backups.sent}</Tag>
                      ) : (
                        <button
                          onClick={() => void sendSlack(b.id)}
                          className="text-meta font-semibold text-field hover:underline"
                        >
                          {he.backups.sendSlack}
                        </button>
                      )}
                    </Td>
                    <Td>
                      <a
                        href={`/api/db-backups/${b.id}/download`}
                        className="text-meta font-semibold text-field hover:underline"
                      >
                        {he.backups.download}
                      </a>
                    </Td>
                    <Td>
                      <button
                        onClick={() => setDeleting(b.id)}
                        className="text-meta font-semibold text-oxide hover:underline"
                      >
                        {he.backups.delete}
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>
      {deleting && (
        <DeleteDialog
          title={he.backups.deleteTitle}
          body={he.backups.deleteBody}
          isLoading={removeState.isLoading}
          onCancel={() => setDeleting(null)}
          onConfirm={() =>
            void remove(deleting).then((r) => {
              setDeleting(null);
              if ('data' in r && r.data) toast.success({ title: he.backups.deleted });
              else toast.error({ title: he.toast.failed, detail: apiErrorMessage('error' in r ? r.error : undefined) ?? undefined });
            })
          }
        />
      )}
    </div>
  );
}
