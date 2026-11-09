import { useState } from 'react';
import { useCreateIssueFormMutation } from '../../lib/api';
import { apiErrorMessage, Button, Panel } from '../../components/ui';
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import type { IssueForm, SoldierSummary } from '../../lib/types';
import { SoldierSearch } from './SoldierSearch';
import { ConfirmSoldier } from './ConfirmSoldier';
import { BasketStep, type BasketLine } from './BasketStep';
import { SignStep } from './SignStep';

type Step = 'soldier' | 'confirm' | 'basket' | 'sign' | 'done';

/**
 * ניפוק — the 1008.
 *
 * A handover is one event, not a row per item: a soldier takes a weapon with
 * its magazines, sling and cleaning kit, and signs once for the lot. So the
 * flow collects the whole basket first and takes a single signature at the
 * end, which is what the paper שובר השאלה פנימית records and what this
 * replaces. Everything lands in one transaction or none of it does.
 */
export function IssuePage() {
  const [step, setStep] = useState<Step>('soldier');
  const [soldier, setSoldier] = useState<SoldierSummary | null>(null);
  const [lines, setLines] = useState<BasketLine[]>([]);
  const [receiptNo, setReceiptNo] = useState('');
  const [notes, setNotes] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [form, setForm] = useState<IssueForm | null>(null);
  const [create, { isLoading, error }] = useCreateIssueFormMutation();
  const toast = useToast();

  function reset(): void {
    setStep('soldier');
    setSoldier(null);
    setLines([]);
    setReceiptNo('');
    setNotes('');
    setSignature(null);
    setForm(null);
  }

  async function submit(): Promise<void> {
    if (!soldier || !signature || lines.length === 0) return;
    const result = await create({
      soldierId: soldier.id,
      signatureImage: signature,
      ...(receiptNo.trim() ? { receiptNo: receiptNo.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      lines: lines.map((l) => ({
        itemId: l.item.id,
        quantity: l.quantity,
        ...(l.serial.trim() ? { serial: l.serial.trim() } : {}),
        ...(l.lineNotes.trim() ? { lineNotes: l.lineNotes.trim() } : {}),
      })),
    });

    if (result.data) {
      setForm(result.data);
      setStep('done');
      toast.success({
        title: he.toast.formSigned,
        detail: `${he.form1008.created(result.data.formNo)} · ${soldier.firstName} ${soldier.lastName}`,
      });
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-display font-bold">{he.form1008.title}</h1>

      {step !== 'done' && <Steps step={step} soldier={soldier} lineCount={lines.length} />}

      {step === 'soldier' && (
        <SoldierSearch
          onPick={(picked) => {
            setSoldier(picked);
            setStep('confirm');
          }}
        />
      )}

      {step === 'confirm' && soldier && (
        <ConfirmSoldier
          soldierId={soldier.id}
          onBack={() => {
            setSoldier(null);
            setStep('soldier');
          }}
          onContinue={() => setStep('basket')}
        />
      )}

      {step === 'basket' && (
        <BasketStep
          lines={lines}
          onChange={setLines}
          onBack={() => setStep('confirm')}
          onContinue={() => setStep('sign')}
        />
      )}

      {step === 'sign' && soldier && (
        <SignStep
          soldier={soldier}
          lines={lines}
          receiptNo={receiptNo}
          onReceiptNo={setReceiptNo}
          notes={notes}
          onNotes={setNotes}
          signature={signature}
          onSignature={setSignature}
          onBack={() => setStep('basket')}
          onSubmit={() => void submit()}
          isSubmitting={isLoading}
          error={apiErrorMessage(error)}
        />
      )}

      {step === 'done' && form && <Signed form={form} onNew={reset} />}
    </div>
  );
}

/**
 * The form, once it exists.
 *
 * The printable copy opens in its own tab rather than inline: it is a document
 * meant for a printer, and the operator's next action is usually the next
 * soldier rather than reading it.
 */
function Signed({ form, onNew }: { form: IssueForm; onNew: () => void }) {
  return (
    <Panel title={he.form1008.created(form.formNo)}>
      <div className="space-y-4 px-4 py-4">
        <div>
          <span className="font-semibold">{form.soldierNameSnapshot}</span>
          <span className="text-meta text-graphite">
            {' · '}
            {he.companies[form.companySnapshot]}
            {' · '}
            {he.form1008.linesCount(form.lines.length)}
          </span>
        </div>

        <ul className="space-y-1">
          {form.lines.map((l) => (
            <li key={l.id} className="text-meta">
              <span className="font-semibold">{l.itemNameSnapshot}</span>
              <span className="text-graphite">
                {' · '}
                {l.quantity} {l.unitOfMeasure}
                {l.serialSnapshot ? ` · ${l.serialSnapshot}` : ''}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <a
            href={`/api/issue-forms/${form.id}/print`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-ctl bg-field px-3.5 py-2 text-body font-semibold text-white transition-colors hover:bg-field-bright"
          >
            {he.form1008.openForm}
          </a>
          <Button variant="quiet" onClick={onNew}>
            {he.form1008.newForm}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

/** A progress trail. This is genuinely a sequence, so it is numbered. */
function Steps({
  step,
  soldier,
  lineCount,
}: {
  step: Step;
  soldier: SoldierSummary | null;
  lineCount: number;
}) {
  const steps: { key: Step; label: string; value: string | null }[] = [
    { key: 'soldier', label: he.issue.stepSoldier, value: null },
    {
      key: 'confirm',
      label: he.issue.confirmSoldier,
      value: soldier ? `${soldier.firstName} ${soldier.lastName}` : null,
    },
    {
      key: 'basket',
      label: he.form1008.stepBasket,
      value: lineCount > 0 ? he.form1008.linesCount(lineCount) : null,
    },
    { key: 'sign', label: he.form1008.stepSign, value: null },
  ];
  const activeIndex = steps.findIndex((s) => s.key === step);

  return (
    <ol className="flex gap-2">
      {steps.map((s, i) => (
        <li key={s.key} className="min-w-0 flex-1">
          <div className={`border-t-2 pt-2 ${i <= activeIndex ? 'border-field' : 'border-rule'}`}>
            <div className={`text-meta ${i <= activeIndex ? 'text-field-dark' : 'text-graphite'}`}>
              {i + 1}. {s.label}
            </div>
            {s.value && <div className="truncate text-meta font-semibold">{s.value}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
