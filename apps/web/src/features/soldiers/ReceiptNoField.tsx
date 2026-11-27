import { useReceiptHintQuery } from '../../lib/api';
import { TextField } from '../../components/ui';
import { he } from '../../i18n/he';

/**
 * The shelf-note number of a soldier's personal weapon. Numbers are a company's own (1-100 in each), so the
 * hint names the last one that company used and offers the next, instead of the operator counting the shelf.
 */
export function ReceiptNoField({
  company,
  value,
  onChange,
  required = false,
  autoFocus = false,
}: {
  company: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const { data: hint } = useReceiptHintQuery(company, { skip: company === '' });
  return (
    <div>
      <TextField label={he.receiptNo.label} value={value} onChange={onChange} maxLength={40} required={required} autoFocus={autoFocus} />
      {hint && (
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-micro text-graphite">
          <span>{hint.last === null ? he.receiptNo.hintNone : he.receiptNo.hint(hint.last, hint.next)}</span>
          {value.trim() === '' && (
            <button type="button" onClick={() => onChange(hint.next)} className="inline-flex min-h-10 items-center font-semibold text-field hover:underline">
              {he.receiptNo.useNext(hint.next)}
            </button>
          )}
        </p>
      )}
    </div>
  );
}
