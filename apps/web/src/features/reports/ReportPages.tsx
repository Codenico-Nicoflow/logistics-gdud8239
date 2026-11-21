import { useEffect, useState } from 'react';
import {
  useMesakemSheetQuery,
  useSaveMesakemMutation,
  useFinishMesakemDayMutation,
} from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  CategoryDot,
  Modal,
  Panel,
  Spinner,
  TableScroll,
  Tag,
  Td,
  Th,
  TextField,
} from '../../components/ui';
import { useToast } from '../../components/toast';

import { he } from '../../i18n/he';
import { todayIso } from '../../lib/dates';

/**
 * `מסכם` — the once-a-day armory headcount. Only בנשקייה is typed by hand;
 * everything else (מנופק, פער) is computed so it cannot drift from the
 * signature data the way the hand-kept sheet did.
 */
export function SummaryPage() {
  const [date, setDate] = useState(todayIso());
  const [nashkiya, setNashkiya] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [confirmingFinish, setConfirmingFinish] = useState(false);
  const [correcting, setCorrecting] = useState(false);

  const { data, isLoading, isFetching } = useMesakemSheetQuery({ date });
  const [save, { isLoading: isSaving, error }] = useSaveMesakemMutation();
  const [finishDay, { isLoading: isFinishing, error: finishError }] = useFinishMesakemDayMutation();
  const toast = useToast();

  useEffect(() => {
    if (!data) return;
    const next: Record<string, string> = {};
    for (const row of data.rows) {
      if (row.nashkiyaQty !== null) next[row.itemId] = String(row.nashkiyaQty);
    }
    setNashkiya(next);
    setSaved(false);
  }, [data]);

  // Every item flagged `מופיע במסכם` in the catalog shows here, regardless of
  // מנופק — the old sheet listed the whole list (`CatalogPage`'s inSummary
  // flag), not just items currently issued.
  const rows = data?.rows ?? [];

  function gapFor(row: (typeof rows)[number]): number | null {
    const raw = nashkiya[row.itemId];
    if (raw === undefined || raw === '') return null;
    const value = Number(raw);
    if (Number.isNaN(value)) return null;
    return row.authorizedQty - (row.issued + value);
  }

  const gapCount = rows.filter((r) => {
    const gap = gapFor(r);
    return gap !== null && gap !== 0;
  }).length;

  const signedCounts = data?.signedCounts ?? [];
  const signedLabel = signedCounts
    .map((c) => (c.shift === 'EVENING' ? he.summary.shiftEvening : he.summary.shiftMorning))
    .join(' ו');

  function currentLines(): { itemId: string; nashkiyaQty: number }[] {
    return rows
      .filter((r) => nashkiya[r.itemId] !== undefined && nashkiya[r.itemId] !== '')
      .map((r) => ({ itemId: r.itemId, nashkiyaQty: Number(nashkiya[r.itemId]) }));
  }

  /** A number differs from what is stored — only then does a signed count have to be reopened. */
  function hasChanges(): boolean {
    return currentLines().some((l) => rows.find((r) => r.itemId === l.itemId)?.nashkiyaQty !== l.nashkiyaQty);
  }

  function submit(): void {
    if (signedCounts.length > 0 && hasChanges()) {
      setCorrecting(true);
      return;
    }
    void doSave();
  }

  async function doSave(correctionReason?: string): Promise<void> {
    const result = await save({
      sessionDate: date,
      lines: currentLines(),
      ...(correctionReason ? { correctionReason } : {}),
    });
    if (result.data) {
      setCorrecting(false);
      setSaved(true);
      toast.success({ title: result.data.reopened > 0 ? he.summary.countsReopened : he.summary.saved });
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  async function finish(): Promise<void> {
    setConfirmingFinish(false);
    const result = await finishDay({ sessionDate: date });
    if (result.data?.sent) {
      toast.success({ title: he.summary.finishDay });
    } else {
      toast.error({
        title: he.summary.finishFailed,
        detail: result.data?.error ?? apiErrorMessage(result.error) ?? undefined,
      });
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-display font-bold">{he.summary.title}</h1>
        <p className="mt-1 text-ink-soft">{he.summary.subtitle}</p>
      </div>

      <Panel>
        <div className="flex flex-wrap items-end gap-3 px-4 py-4">
          <TextField label={he.summary.date} value={date} onChange={setDate} type="date" required className="w-44" />

          <div className="ms-auto flex items-end gap-2">
            <Button onClick={submit} disabled={isSaving}>
              {isSaving ? he.summary.saving : he.summary.save}
            </Button>
            <Button
              variant="quiet"
              onClick={() => window.open(`/api/mesakem/export?date=${date}`, '_blank')}
            >
              {he.summary.downloadExcel}
            </Button>
            <Button variant="quiet" onClick={() => setConfirmingFinish(true)} disabled={isFinishing}>
              {isFinishing ? he.summary.finishing : he.summary.finishDay}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-rule px-4 py-2.5">
          {gapCount > 0 ? (
            <Tag tone="oxide">{he.summary.withGaps(gapCount)}</Tag>
          ) : (
            <Tag tone="field">{he.summary.noGaps}</Tag>
          )}
          {saved && <Tag tone="field">{he.summary.saved}</Tag>}
          {signedCounts.length > 0 && <Tag tone="brass">{he.summary.signedNote(signedLabel)}</Tag>}
          {data?.sentAt && (
            <Tag tone="field">
              {he.summary.finishedToday(new Date(data.sentAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }))}
            </Tag>
          )}
          {apiErrorMessage(error) && <span className="text-meta text-oxide">{apiErrorMessage(error)}</span>}
          {apiErrorMessage(finishError) && (
            <span className="text-meta text-oxide">{apiErrorMessage(finishError)}</span>
          )}
        </div>
      </Panel>

      <Panel>
        {isLoading || isFetching ? (
          <Spinner />
        ) : (
          <TableScroll>
            <table className="row-hover w-full">
              <thead>
                <tr>
                  <Th>{he.summary.item}</Th>
                  <Th numeric>{he.summary.authorized}</Th>
                  <Th numeric>{he.summary.issued}</Th>
                  <Th numeric>{he.summary.inArmory}</Th>
                  <Th numeric>{he.summary.gap}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const gap = gapFor(row);
                  return (
                    <tr key={row.itemId}>
                      <Td>
                        <span className="flex items-center gap-2 font-semibold">
                          <CategoryDot category={row.category} />
                          {row.itemName}
                        </span>
                      </Td>
                      <Td numeric>{row.authorizedQty}</Td>
                      <Td numeric className="text-field-dark">
                        {row.issued}
                        {(row.stored ?? 0) > 0 && (
                          <span className="ms-1 text-micro text-brass">{he.ifsun.storedQty(row.stored ?? 0)}</span>
                        )}
                      </Td>
                      <Td numeric>
                        <input
                          type="number"
                          min={0}
                          value={nashkiya[row.itemId] ?? ''}
                          onChange={(e) => {
                            setNashkiya((c) => ({ ...c, [row.itemId]: e.target.value }));
                            setSaved(false);
                          }}
                          className="w-20 rounded-ctl border border-rule-strong bg-card-raised px-2 py-1 text-center text-body"
                        />
                      </Td>
                      <Td numeric>
                        {gap === null ? (
                          <span className="text-graphite">{he.summary.notFilled}</span>
                        ) : gap === 0 ? (
                          <span className="font-semibold text-field">0</span>
                        ) : (
                          <Tag tone="oxide">{gap > 0 ? `חסר ${gap}` : `עודף ${-gap}`}</Tag>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>

      {confirmingFinish && (
        <ConfirmFinishDialog
          date={new Date(`${date}T00:00:00`).toLocaleDateString('he-IL')}
          filled={currentLines().length}
          total={rows.length}
          alreadySent={!!data?.sentAt}
          onConfirm={() => void finish()}
          onCancel={() => setConfirmingFinish(false)}
        />
      )}
      {correcting && (
        <CorrectionDialog
          shifts={signedLabel}
          isLoading={isSaving}
          onConfirm={(reason) => void doSave(reason)}
          onCancel={() => setCorrecting(false)}
        />
      )}
    </div>
  );
}

function ConfirmFinishDialog({
  date,
  filled,
  total,
  alreadySent,
  onConfirm,
  onCancel,
}: {
  date: string;
  filled: number;
  total: number;
  alreadySent: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal onClose={onCancel} role="alertdialog" className="w-full max-w-sm">
      <div className="space-y-3 px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brass-wash text-brass">
            <span className="h-2.5 w-2.5 rounded-full bg-brass" />
          </span>
          <h2 className="text-lead font-semibold">{he.summary.finishTitle}</h2>
        </div>
        <p className="text-meta text-ink-soft">{he.summary.finishBody(date, filled, total)}</p>
        {filled < total && (
          <p className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta font-semibold text-oxide">
            {he.summary.finishMissing(total - filled)}
          </p>
        )}
        {alreadySent && <p className="text-meta text-brass">{he.summary.finishResend}</p>}
        <div className="flex gap-2 pt-1">
          <Button onClick={onConfirm}>{he.summary.finishAction}</Button>
          <Button variant="quiet" onClick={onCancel}>
            {he.common.cancel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CorrectionDialog({
  shifts,
  isLoading,
  onConfirm,
  onCancel,
}: {
  shifts: string;
  isLoading: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal onClose={onCancel} role="alertdialog" className="w-full max-w-sm">
      <div className="space-y-3 px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-oxide-wash text-oxide">
            <span className="h-2.5 w-2.5 rounded-full bg-oxide" />
          </span>
          <h2 className="text-lead font-semibold">{he.summary.correctionTitle}</h2>
        </div>
        <p className="text-meta text-ink-soft">{he.summary.correctionBody(shifts)}</p>
        <TextField
          label={he.summary.correctionReason}
          value={reason}
          onChange={setReason}
          placeholder={he.summary.correctionPlaceholder}
          autoFocus
          required
        />
        <div className="flex gap-2 pt-1">
          <Button variant="danger" onClick={() => onConfirm(reason)} disabled={isLoading || reason.trim().length < 3}>
            {he.summary.correctionAction}
          </Button>
          <Button variant="quiet" onClick={onCancel} disabled={isLoading}>
            {he.common.cancel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
