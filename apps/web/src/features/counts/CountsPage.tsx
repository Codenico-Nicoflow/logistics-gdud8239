import { useEffect, useMemo, useState } from 'react';
import {
  useCountSheetQuery,
  useSaveCountMutation,
  useCloseCountMutation,
  useRecentCountsQuery,
  useDeleteCountMutation,
  useReopenCountMutation,
  useMeQuery,
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
import { SignaturePad } from '../../components/SignaturePad';
import { useToast } from '../../components/toast';
import { DeleteDialog } from '../../components/DeleteDialog';
import { he } from '../../i18n/he';
import { todayIso } from '../../lib/dates';
import type { CountShift } from '../../lib/types';

/**
 * `ספירת נשקיה` — the two-party sign-off on the day's already-entered מסכם
 * figure (`בנשקייה`). Shows only that one number per item, read-only: the
 * actual count happens once a day in מסכם, so this screen's only job is
 * verifying and signing that existing figure together, not re-entering it.
 */
export function CountsPage() {
  const [date, setDate] = useState(todayIso());
  const [shift, setShift] = useState<CountShift>('EVENING');

  const [responsibleName, setResponsibleName] = useState('');
  const [responsiblePn, setResponsiblePn] = useState('');
  const [responsibleRank, setResponsibleRank] = useState('');
  const [responsibleSignature, setResponsibleSignature] = useState<string | null>(null);
  const [officerName, setOfficerName] = useState('');
  const [officerPn, setOfficerPn] = useState('');
  const [officerRank, setOfficerRank] = useState('');
  const [officerSignature, setOfficerSignature] = useState<string | null>(null);

  const { data, isLoading, isFetching } = useCountSheetQuery({ date, shift });
  const [save, { isLoading: isSaving, error }] = useSaveCountMutation();
  const [close, { isLoading: isClosing, error: closeError }] = useCloseCountMutation();
  const [reopen, { isLoading: isReopening }] = useReopenCountMutation();
  const me = useMeQuery();
  const isAdmin = me.data?.user.role === 'admin';
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [reopening, setReopening] = useState(false);
  const toast = useToast();

  const isClosed = data?.session?.isClosed ?? false;

  // The web and the API deploy separately, so for a few minutes after a release
  // this screen can get a sheet without `figureDate`; show nothing rather than
  // "Invalid Date".
  const figureDate = data?.figureDate ? new Date(`${data.figureDate}T00:00:00`) : null;
  const figureDay =
    figureDate && !Number.isNaN(figureDate.getTime()) ? figureDate.toLocaleDateString('he-IL') : null;

  // Reload the signer fields whenever the sheet changes, so switching date or
  // shift shows what was actually recorded rather than a stale draft.
  useEffect(() => {
    if (!data) return;
    setResponsibleName(data.signers.responsibleName ?? '');
    setResponsiblePn(data.signers.responsiblePn ?? '');
    setResponsibleRank(data.signers.responsibleRank ?? '');
    setResponsibleSignature(data.signers.responsibleSignatureImage ?? null);
    setOfficerName(data.signers.officerName ?? '');
    setOfficerPn(data.signers.officerPn ?? '');
    setOfficerRank(data.signers.officerRank ?? '');
    setOfficerSignature(data.signers.officerSignatureImage ?? null);
  }, [data]);

  const rows = useMemo(() => data?.rows ?? [], [data]);

  function buildBody() {
    return {
      sessionDate: date,
      shift,
      responsibleName: responsibleName.trim() || undefined,
      responsiblePn: responsiblePn.trim() || undefined,
      responsibleRank: responsibleRank.trim() || undefined,
      responsibleSignatureImage: responsibleSignature ?? undefined,
      officerName: officerName.trim() || undefined,
      officerPn: officerPn.trim() || undefined,
      officerRank: officerRank.trim() || undefined,
      officerSignatureImage: officerSignature ?? undefined,
    };
  }

  async function submit(): Promise<void> {
    const result = await save(buildBody());
    if (result.data) {
      toast.success({ title: he.toast.countSaved });
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  const signersComplete = Boolean(
    responsibleName.trim() &&
      responsiblePn.trim() &&
      responsibleRank.trim() &&
      responsibleSignature &&
      officerName.trim() &&
      officerPn.trim() &&
      officerRank.trim() &&
      officerSignature,
  );

  /** Asks first — but only once there is something valid to confirm, so the
   *  operator is not asked "are you sure?" about an action that would just fail. */
  function askToClose(): void {
    if (!signersComplete) {
      toast.error({ title: he.toast.failed, detail: he.counts.needsBothSignatures });
      return;
    }
    setConfirmingClose(true);
  }

  async function doReopen(reason: string): Promise<void> {
    if (!data?.session) return;
    const result = await reopen({ id: data.session.id, reason });
    if (result.data) {
      setReopening(false);
      toast.success({ title: he.counts.reopened });
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  /** Saves the current state first, then closes it — a sign-and-close must
   * lock in whatever is on screen, not whatever was last saved. */
  async function signAndClose(): Promise<void> {
    setConfirmingClose(false);
    const saveResult = await save(buildBody());
    if (!saveResult.data) {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(saveResult.error) ?? undefined });
      return;
    }
    const closeResult = await close(saveResult.data.id);
    if (closeResult.data) {
      toast.success({ title: he.counts.closed });
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(closeResult.error) ?? undefined });
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-display font-bold">{he.counts.title}</h1>
        <p className="mt-1 text-ink-soft">{he.counts.subtitle}</p>
      </div>

      <Panel>
        <div className="flex flex-wrap items-end gap-3 px-4 py-4">
          <TextField
            label={he.counts.date}
            value={date}
            onChange={setDate}
            type="date"
            required
            className="w-44"
          />
          <label className="block">
            <span className="mb-1 block text-meta font-semibold text-ink-soft">
              {he.counts.shift}
            </span>
            <div className="flex overflow-hidden rounded-ctl border border-rule-strong">
              {(['EVENING', 'MORNING'] as CountShift[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setShift(s)}
                  className={`h-11 px-4 text-body font-semibold transition-colors ${
                    shift === s ? 'bg-field text-white' : 'bg-card-raised text-ink-soft hover:bg-card'
                  }`}
                >
                  {s === 'EVENING' ? he.counts.evening : he.counts.morning}
                </button>
              ))}
            </div>
          </label>

          <div className="ms-auto flex items-end gap-2">
            {data?.session?.id && (
              <Button variant="quiet" onClick={() => window.open(`/api/counts/${data.session!.id}/print`, '_blank')}>
                {he.counts.print}
              </Button>
            )}
            {!isClosed && (
              <Button onClick={() => void submit()} disabled={isSaving}>
                {isSaving ? he.counts.saving : he.counts.save}
              </Button>
            )}
          </div>
        </div>

        {isClosed && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule px-4 py-2.5">
            <div>
              <Tag tone="field">{he.counts.closedTag}</Tag>
              <span className="ms-2 text-meta text-graphite">{he.counts.reopenHint}</span>
            </div>
            {isAdmin && (
              <Button variant="quiet" size="sm" onClick={() => setReopening(true)}>
                {he.counts.reopen}
              </Button>
            )}
          </div>
        )}

        {data?.session?.figuresChangedAfterStart && (
          <div className="border-t border-rule bg-oxide-wash px-4 py-2 text-meta font-semibold text-oxide">
            {he.counts.figuresChanged}
          </div>
        )}

        {data?.session?.lastReopen && (
          <div className="border-t border-rule bg-brass-wash px-4 py-2 text-meta text-ink-soft">
            {he.counts.lastReopen(
              data.session.lastReopen.by,
              new Date(data.session.lastReopen.at).toLocaleString('he-IL', {
                timeZone: 'Asia/Jerusalem',
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              }),
              data.session.lastReopen.reason,
            )}
          </div>
        )}

        {apiErrorMessage(error) && (
          <div className="border-t border-rule px-4 py-2.5">
            <span className="text-meta text-oxide">{apiErrorMessage(error)}</span>
          </div>
        )}
      </Panel>

      <Panel>
        {figureDay && (
          <div className="border-b border-rule px-4 py-2 text-meta text-graphite">
            {he.counts.figureNote(figureDay, shift === 'MORNING')}
          </div>
        )}
        {isLoading || isFetching ? (
          <Spinner />
        ) : (
          <TableScroll>
            <table className="row-hover w-full">
              <thead>
                <tr>
                  <Th>{he.counts.item}</Th>
                  <Th numeric>{he.counts.inArmory}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.itemId}>
                    <Td>
                      <span className="flex items-center gap-2 font-semibold">
                        <CategoryDot category={row.category} />
                        {row.itemName}
                      </span>
                    </Td>
                    <Td numeric>
                      {row.nashkiyaQty === null ? (
                        <span className="text-graphite">{he.counts.notCounted}</span>
                      ) : (
                        row.nashkiyaQty
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Panel>

      <Panel>
        <div className="grid gap-5 p-4 sm:grid-cols-2">
          <SignerCard
            title={he.counts.responsible}
            name={responsibleName}
            onNameChange={setResponsibleName}
            pn={responsiblePn}
            onPnChange={setResponsiblePn}
            rank={responsibleRank}
            onRankChange={setResponsibleRank}
            signature={responsibleSignature}
            onSignatureChange={setResponsibleSignature}
            disabled={isClosed}
          />
          <SignerCard
            title={he.counts.officer}
            name={officerName}
            onNameChange={setOfficerName}
            pn={officerPn}
            onPnChange={setOfficerPn}
            rank={officerRank}
            onRankChange={setOfficerRank}
            signature={officerSignature}
            onSignatureChange={setOfficerSignature}
            disabled={isClosed}
          />
        </div>

        {!isClosed && (
          <div className="flex items-center justify-end gap-3 border-t border-rule px-4 py-3">
            {apiErrorMessage(closeError) && (
              <span className="text-meta text-oxide">{apiErrorMessage(closeError)}</span>
            )}
            <Button onClick={askToClose} disabled={isClosing || isSaving}>
              {isClosing ? he.counts.closing : he.counts.signAndClose}
            </Button>
          </div>
        )}
      </Panel>

      <RecentSessions isAdmin={isAdmin} onPick={(d, s) => { setDate(d); setShift(s); }} />

      {confirmingClose && (
        <ConfirmCloseDialog
          body={he.counts.confirmCloseBody(
            shift === 'EVENING' ? he.counts.evening : he.counts.morning,
            new Date(`${date}T00:00:00`).toLocaleDateString('he-IL'),
            rows.length,
            responsibleName.trim(),
            officerName.trim(),
          )}
          isLoading={isClosing || isSaving}
          onConfirm={() => void signAndClose()}
          onCancel={() => setConfirmingClose(false)}
        />
      )}
      {reopening && (
        <ReopenDialog
          isLoading={isReopening}
          onConfirm={(reason) => void doReopen(reason)}
          onCancel={() => setReopening(false)}
        />
      )}
    </div>
  );
}

function ConfirmCloseDialog({
  body,
  isLoading,
  onConfirm,
  onCancel,
}: {
  body: string;
  isLoading: boolean;
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
          <h2 className="text-lead font-semibold">{he.counts.confirmCloseTitle}</h2>
        </div>
        <p className="text-meta text-ink-soft">{body}</p>
        <div className="flex gap-2 pt-1">
          <Button onClick={onConfirm} disabled={isLoading}>
            {isLoading ? he.counts.closing : he.counts.confirmCloseAction}
          </Button>
          <Button variant="quiet" onClick={onCancel} disabled={isLoading}>
            {he.common.cancel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Admin only: undoing a close needs a reason, which is recorded with who did it. */
function ReopenDialog({
  isLoading,
  onConfirm,
  onCancel,
}: {
  isLoading: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= 3;
  return (
    <Modal onClose={onCancel} role="alertdialog" className="w-full max-w-sm">
      <div className="space-y-3 px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-oxide-wash text-oxide">
            <span className="h-2.5 w-2.5 rounded-full bg-oxide" />
          </span>
          <h2 className="text-lead font-semibold">{he.counts.reopenTitle}</h2>
        </div>
        <p className="text-meta text-ink-soft">{he.counts.reopenBody}</p>
        <TextField
          label={he.counts.reopenReason}
          value={reason}
          onChange={setReason}
          placeholder={he.counts.reopenReasonPlaceholder}
          autoFocus
          required
        />
        <div className="flex gap-2 pt-1">
          <Button variant="danger" onClick={() => onConfirm(reason)} disabled={isLoading || !valid}>
            {he.counts.reopenAction}
          </Button>
          <Button variant="quiet" onClick={onCancel} disabled={isLoading}>
            {he.common.cancel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Every past sign-off, kept forever in the DB — lets you go back to any day
 *  and see who counted, who signed, and reprint the sheet. */
function RecentSessions({
  onPick,
  isAdmin,
}: {
  onPick: (date: string, shift: CountShift) => void;
  isAdmin: boolean;
}) {
  const { data, isLoading } = useRecentCountsQuery();
  const [remove, removeState] = useDeleteCountMutation();
  const [deleting, setDeleting] = useState<string | null>(null);
  const toast = useToast();

  if (isLoading) return null;
  const rows = data ?? [];
  if (rows.length === 0) return null;

  return (
    <Panel title={he.counts.recentTitle}>
      <TableScroll>
        <table className="row-hover w-full">
          <thead>
            <tr>
              <Th>{he.counts.date}</Th>
              <Th>{he.counts.shift}</Th>
              <Th>{he.counts.responsible}</Th>
              <Th>{he.counts.officer}</Th>
              <Th>{he.counts.closedTag}</Th>
              <Th>{he.counts.print}</Th>
              {isAdmin && <Th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Td>
                  <button
                    className="font-semibold text-field hover:underline"
                    onClick={() => onPick(row.sessionDate.slice(0, 10), row.shift)}
                  >
                    {new Date(row.sessionDate).toLocaleDateString('he-IL')}
                  </button>
                </Td>
                <Td>{row.shift === 'EVENING' ? he.counts.evening : he.counts.morning}</Td>
                <Td>{row.responsibleName ?? he.summary.notFilled}</Td>
                <Td>{row.officerName ?? he.summary.notFilled}</Td>
                <Td>
                  {row.isClosed ? (
                    <Tag tone="field">{he.counts.closedTag}</Tag>
                  ) : (
                    <span className="text-graphite">{he.summary.notFilled}</span>
                  )}
                </Td>
                <Td>
                  <button
                    className="text-field hover:underline"
                    onClick={() => window.open(`/api/counts/${row.id}/print`, '_blank')}
                  >
                    {he.counts.print}
                  </button>
                </Td>
                {isAdmin && (
                  <Td>
                    <button
                      className="text-oxide hover:underline disabled:cursor-not-allowed disabled:text-graphite disabled:no-underline"
                      disabled={row.isClosed}
                      title={row.isClosed ? he.counts.deleteNeedsReopen : undefined}
                      onClick={() => setDeleting(row.id)}
                    >
                      {he.counts.delete}
                    </button>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {deleting && (
        <DeleteDialog
          title={he.counts.deleteTitle}
          body={he.counts.deleteBody}
          reasonLabel={he.counts.deleteReason}
          isLoading={removeState.isLoading}
          onCancel={() => setDeleting(null)}
          onConfirm={(reason) =>
            void remove({ id: deleting, reason }).then((r) => {
              if ('data' in r && r.data) {
                setDeleting(null);
                toast.success({ title: he.counts.deleted });
              } else {
                toast.error({ title: he.toast.failed, detail: apiErrorMessage('error' in r ? r.error : undefined) ?? undefined });
              }
            })
          }
        />
      )}
    </Panel>
  );
}

function SignerCard({
  title,
  name,
  onNameChange,
  pn,
  onPnChange,
  rank,
  onRankChange,
  signature,
  onSignatureChange,
  disabled,
}: {
  title: string;
  name: string;
  onNameChange: (v: string) => void;
  pn: string;
  onPnChange: (v: string) => void;
  rank: string;
  onRankChange: (v: string) => void;
  signature: string | null;
  onSignatureChange: (v: string | null) => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-ctl border border-rule-strong">
      <h2 className="border-b border-rule bg-card-raised px-3 py-2 font-semibold">{title}</h2>
      <div className="space-y-3 p-3">
        <div className="grid grid-cols-3 gap-2">
          <TextField
            label={he.counts.fullName}
            value={name}
            onChange={onNameChange}
            disabled={disabled}
            required={!disabled}
            className="col-span-1"
          />
          <TextField
            label={he.counts.personalNumber}
            value={pn}
            onChange={onPnChange}
            disabled={disabled}
            required={!disabled}
          />
          <TextField
            label={he.counts.rank}
            value={rank}
            onChange={onRankChange}
            disabled={disabled}
            required={!disabled}
          />
        </div>
        {disabled ? (
          signature ? (
            <img src={signature} alt={title} className="h-28 w-full rounded-ctl border border-rule-strong bg-white object-contain" />
          ) : (
            <div className="flex h-28 items-center justify-center rounded-ctl border border-dashed border-rule-strong text-meta text-graphite">
              {he.counts.needsBothSignatures}
            </div>
          )
        ) : (
          <SignaturePad onChange={onSignatureChange} />
        )}
      </div>
    </div>
  );
}
