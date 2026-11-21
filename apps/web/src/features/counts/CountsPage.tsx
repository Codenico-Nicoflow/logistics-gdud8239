import { useEffect, useMemo, useState } from 'react';
import {
  useCountSheetQuery,
  useSaveCountMutation,
  useCloseCountMutation,
  useRecentCountsQuery,
} from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  CategoryDot,
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
  const toast = useToast();

  const isClosed = data?.session?.isClosed ?? false;

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

  /** Saves the current state first, then closes it — a sign-and-close must
   * lock in whatever is on screen, not whatever was last saved. */
  async function signAndClose(): Promise<void> {
    const complete =
      responsibleName.trim() &&
      responsiblePn.trim() &&
      responsibleRank.trim() &&
      responsibleSignature &&
      officerName.trim() &&
      officerPn.trim() &&
      officerRank.trim() &&
      officerSignature;
    if (!complete) {
      toast.error({ title: he.toast.failed, detail: he.counts.needsBothSignatures });
      return;
    }
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
          <div className="border-t border-rule px-4 py-2.5">
            <Tag tone="field">{he.counts.closedTag}</Tag>
            <span className="ms-2 text-meta text-graphite">{he.counts.reopenHint}</span>
          </div>
        )}

        {apiErrorMessage(error) && (
          <div className="border-t border-rule px-4 py-2.5">
            <span className="text-meta text-oxide">{apiErrorMessage(error)}</span>
          </div>
        )}
      </Panel>

      <Panel>
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
            <Button onClick={() => void signAndClose()} disabled={isClosing || isSaving}>
              {isClosing ? he.counts.closing : he.counts.signAndClose}
            </Button>
          </div>
        )}
      </Panel>

      <RecentSessions onPick={(d, s) => { setDate(d); setShift(s); }} />
    </div>
  );
}

/** Every past sign-off, kept forever in the DB — lets you go back to any day
 *  and see who counted, who signed, and reprint the sheet. */
function RecentSessions({ onPick }: { onPick: (date: string, shift: CountShift) => void }) {
  const { data, isLoading } = useRecentCountsQuery();

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
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>
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
