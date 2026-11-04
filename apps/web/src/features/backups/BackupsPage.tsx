import { useRef, useState } from 'react';
import {
  useCommitImportMutation,
  useCreateSnapshotMutation,
  usePreviewImportMutation,
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
import { he } from '../../i18n/he';
import type { ImportPreview } from '../../lib/types';

export function BackupsPage() {
  const { data, isLoading } = useSnapshotsQuery();
  const [createSnapshot, createState] = useCreateSnapshotMutation();
  const [sendSlack] = useSendSnapshotToSlackMutation();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-display font-bold">{he.backups.title}</h1>
        <p className="mt-1 text-ink-soft">{he.backups.subtitle}</p>
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
          onClick={() => void createSnapshot()}
          disabled={createState.isLoading}
        >
          {createState.isLoading ? he.backups.creating : he.backups.createNow}
        </Button>
      </div>

      <ImportPanel />

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
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>
    </div>
  );
}

/**
 * Import is deliberately two-stage: the preview writes nothing, so the operator
 * sees what a wipe-and-replace would do before committing to it.
 */
function ImportPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [runPreview, previewState] = usePreviewImportMutation();
  const [runCommit, commitState] = useCommitImportMutation();

  async function choose(selected: File | null): Promise<void> {
    setFile(selected);
    setPreview(null);
    setResult(null);
    if (!selected) return;
    const form = new FormData();
    form.append('file', selected);
    const res = await runPreview(form);
    if (res.data) setPreview(res.data);
  }

  async function commit(): Promise<void> {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    const res = await runCommit(form);
    if (res.data) {
      setResult(he.backups.imported(res.data.signatures));
      setPreview(null);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const error = previewState.error ?? commitState.error;
  const apiMessage = apiErrorMessage(error);

  return (
    <Panel title={he.backups.importTitle}>
      <div className="space-y-3 px-4 py-4">
        <p className="rounded-ctl bg-brass-wash px-3 py-2 text-meta text-ink-soft">
          {he.backups.importWarning}
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx"
          onChange={(e) => void choose(e.target.files?.[0] ?? null)}
          className="block w-full text-meta file:me-3 file:rounded-ctl file:border file:border-rule-strong file:bg-card-raised file:px-3 file:py-1.5 file:text-body file:font-semibold"
        />

        {previewState.isLoading && <Spinner />}

        {preview && (
          <div className="rounded-panel border border-rule bg-card px-4 py-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={he.backups.previewRows} value={preview.totalRows} />
              <Stat label={he.backups.previewSoldiers} value={preview.soldiers} />
              <Stat label={he.backups.previewSignatures} value={preview.signatures} />
              <Stat
                label={he.backups.previewIssues}
                value={preview.issues.reduce((sum, i) => sum + i.count, 0)}
                tone={preview.issues.length ? 'oxide' : 'ink'}
              />
            </div>

            {preview.issues.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-rule pt-3">
                {preview.issues.map((i) => (
                  <li key={i.kind} className="text-meta">
                    <span className="font-semibold">{i.count}</span>
                    <span className="text-graphite"> · </span>
                    {he.issueKinds[i.kind] ?? i.kind}
                  </li>
                ))}
              </ul>
            )}

            <Button
              onClick={() => void commit()}
              disabled={commitState.isLoading}
              className="mt-4"
            >
              {commitState.isLoading ? he.backups.importing : he.backups.confirmImport}
            </Button>
          </div>
        )}

        {result && (
          <p role="status" className="rounded-ctl bg-field-wash px-3 py-2 font-semibold text-field-dark">
            {result}
          </p>
        )}
        {apiMessage && (
          <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
            {apiMessage}
          </p>
        )}
      </div>
    </Panel>
  );
}

function Stat({
  label,
  value,
  tone = 'ink',
}: {
  label: string;
  value: number;
  tone?: 'ink' | 'oxide';
}) {
  return (
    <div>
      <div className="text-micro text-graphite">{label}</div>
      <div className={`text-head font-bold ${tone === 'oxide' ? 'text-oxide' : 'text-ink'}`}>
        {value}
      </div>
    </div>
  );
}
