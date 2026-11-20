import { useEffect, useMemo, useState } from 'react';
import { useCountSheetQuery, useSaveCountMutation } from '../../lib/api';
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
import { useToast } from '../../components/toast';
import { he } from '../../i18n/he';
import type { CountShift } from '../../lib/types';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * `ספירת נשקיה` — the evening count.
 *
 * The counted figure is entered by hand rather than derived: deriving it as
 * `מצבה − מנופק` would force the gap to zero and hide exactly the discrepancy
 * the count exists to find.
 */
export function CountsPage() {
  const [date, setDate] = useState(today());
  const [shift, setShift] = useState<CountShift>('EVENING');
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const { data, isLoading, isFetching } = useCountSheetQuery({ date, shift });
  const [save, { isLoading: isSaving, error }] = useSaveCountMutation();
  const toast = useToast();

  // Reload the entered values whenever the sheet changes, so switching date or
  // shift shows what was actually recorded rather than a stale draft.
  useEffect(() => {
    if (!data) return;
    const next: Record<string, string> = {};
    for (const row of data.rows) {
      if (row.countedQty !== null) next[row.itemId] = String(row.countedQty);
    }
    setCounted(next);
    setSaved(false);
  }, [data]);

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    return all.filter((r) => r.authorizedQty > 0 || r.issued > 0);
  }, [data]);

  /** The live gap, recomputed as the operator types. */
  function gapFor(row: (typeof rows)[number]): number | null {
    const raw = counted[row.itemId];
    if (raw === undefined || raw === '') return null;
    const value = Number(raw);
    if (Number.isNaN(value)) return null;
    return row.authorizedQty - (row.issued + value);
  }

  const gapCount = rows.filter((r) => {
    const gap = gapFor(r);
    return gap !== null && gap !== 0;
  }).length;

  async function submit(): Promise<void> {
    const lines = rows
      .filter((r) => counted[r.itemId] !== undefined && counted[r.itemId] !== '')
      .map((r) => ({ itemId: r.itemId, countedQty: Number(counted[r.itemId]) }));

    const result = await save({ sessionDate: date, shift, lines });
    if (result.data) {
      setSaved(true);
      // The gap count is the reason to look again, so it leads the detail.
      toast.success({
        title: he.toast.countSaved,
        detail: gapCount > 0
          ? he.counts.savedWithGaps(lines.length, gapCount)
          : he.counts.savedClean(lines.length),
      });
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  /** Pre-fills what should be on the shelf, as a starting point to check against. */
  function fillExpected(): void {
    const next: Record<string, string> = {};
    for (const row of rows) {
      next[row.itemId] = String(Math.max(row.authorizedQty - row.issued, 0));
    }
    setCounted(next);
    setSaved(false);
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
            <Button variant="quiet" onClick={fillExpected}>
              {he.counts.fillAll}
            </Button>
            <Button onClick={() => void submit()} disabled={isSaving}>
              {isSaving ? he.counts.saving : he.counts.save}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-rule px-4 py-2.5">
          <span className="text-meta text-graphite">{he.counts.gapHint}</span>
          {gapCount > 0 ? (
            <Tag tone="oxide">{he.counts.withGaps(gapCount)}</Tag>
          ) : (
            <Tag tone="field">{he.counts.noGaps}</Tag>
          )}
          {saved && <Tag tone="field">{he.counts.saved}</Tag>}
          {apiErrorMessage(error) && (
            <span className="text-meta text-oxide">{apiErrorMessage(error)}</span>
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
                  <Th>{he.counts.item}</Th>
                  <Th numeric>{he.counts.authorized}</Th>
                  <Th numeric>{he.counts.issued}</Th>
                  <Th numeric>{he.counts.counted}</Th>
                  <Th numeric>{he.counts.gap}</Th>
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
                      </Td>
                      <Td numeric>
                        <input
                          type="number"
                          min={0}
                          value={counted[row.itemId] ?? ''}
                          onChange={(e) => {
                            setCounted((c) => ({ ...c, [row.itemId]: e.target.value }));
                            setSaved(false);
                          }}
                          className="w-20 rounded-ctl border border-rule-strong bg-card-raised px-2 py-1 text-center text-body"
                        />
                      </Td>
                      <Td numeric>
                        {gap === null ? (
                          <span className="text-graphite">{he.counts.notCounted}</span>
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
    </div>
  );
}
