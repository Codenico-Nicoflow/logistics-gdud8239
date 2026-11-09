import { Button, Panel, Serial, TableScroll, Td, Th, TextField } from '../../components/ui';
import { SignaturePad } from '../../components/SignaturePad';
import { he } from '../../i18n/he';
import type { SoldierSummary } from '../../lib/types';
import type { BasketLine } from './BasketStep';

/**
 * Step 4 — the signature.
 *
 * The list is restated here exactly as the printed form will show it, because
 * this is the last moment before it becomes a record somebody is accountable
 * for. Nothing on this screen is editable: an operator who spots a mistake
 * goes back rather than fixing it under the soldier's pen.
 */
export function SignStep({
  soldier,
  lines,
  receiptNo,
  onReceiptNo,
  notes,
  onNotes,
  signature,
  onSignature,
  onBack,
  onSubmit,
  isSubmitting,
  error,
}: {
  soldier: SoldierSummary;
  lines: BasketLine[];
  receiptNo: string;
  onReceiptNo: (value: string) => void;
  notes: string;
  onNotes: (value: string) => void;
  signature: string | null;
  onSignature: (value: string | null) => void;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  error: string | null;
}) {
  return (
    <Panel title={he.form1008.stepSign}>
      <div className="space-y-4 px-4 py-4">
        <div className="rounded-ctl bg-card px-3 py-2">
          <span className="font-semibold">
            {soldier.firstName} {soldier.lastName}
          </span>
          <span className="text-meta text-graphite">
            {' · '}
            {he.companies[soldier.company]}
            {soldier.personalNumber ? ` · ${he.issue.personalNumber} ${soldier.personalNumber}` : ''}
          </span>
        </div>

        {/* Laid out in the paper form's own column order, so reading it aloud
            to the soldier matches what they will be handed. */}
        <div>
          <p className="mb-1.5 text-meta font-semibold text-ink-soft">
            {he.form1008.reviewBeforeSign}
          </p>
          <TableScroll>
            <table className="w-full">
              <thead>
                <tr>
                  <Th>{he.signatures.item}</Th>
                  <Th>{he.form1008.unit}</Th>
                  <Th numeric>{he.issue.quantityLabel}</Th>
                  <Th>{he.signatures.serial}</Th>
                  <Th>{he.form1008.lineNotes}</Th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.item.id}>
                    <Td className="font-semibold">{l.item.name}</Td>
                    <Td>{l.item.unitOfMeasure}</Td>
                    <Td numeric>{l.quantity}</Td>
                    <Td>
                      <Serial value={l.serial.trim() || null} />
                    </Td>
                    <Td>{l.lineNotes || ''}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={he.form1008.receiptNo} value={receiptNo} onChange={onReceiptNo} />
          <TextField label={he.form1008.formNotes} value={notes} onChange={onNotes} />
        </div>

        <div className="rounded-ctl border border-rule bg-card px-3 py-3">
          <p className="text-meta text-ink-soft">{he.form1008.declaration}</p>
        </div>

        <SignaturePad onChange={onSignature} disabled={isSubmitting} />

        {error && (
          <p role="alert" className="rounded-ctl bg-oxide-wash px-3 py-2 text-meta text-oxide">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <Button onClick={onSubmit} disabled={isSubmitting || !signature}>
            {isSubmitting ? he.form1008.submitting : he.form1008.submit}
          </Button>
          <Button variant="quiet" onClick={onBack} disabled={isSubmitting}>
            {he.issue.back}
          </Button>
        </div>
        {!signature && <p className="text-meta text-graphite">{he.form1008.signatureRequired}</p>}
      </div>
    </Panel>
  );
}
