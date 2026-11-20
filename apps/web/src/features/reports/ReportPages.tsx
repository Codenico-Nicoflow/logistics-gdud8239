import { useEffect, useState } from 'react';
import {
  useAllocationsQuery,
  useCompanyMatrixQuery,
  useMesakemSheetQuery,
  useSaveMesakemMutation,
  useFinishMesakemDayMutation,
} from '../../lib/api';
import {
  apiErrorMessage,
  Button,
  CategoryDot,
  EmptyState,
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
import { COMPANIES } from '../../lib/types';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * `מסכם` — the once-a-day armory headcount. Only בנשקייה is typed by hand;
 * everything else (מנופק, פער) is computed so it cannot drift from the
 * signature data the way the hand-kept sheet did.
 */
export function SummaryPage() {
  const [date, setDate] = useState(today());
  const [nashkiya, setNashkiya] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

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

  async function submit(): Promise<void> {
    const lines = rows
      .filter((r) => nashkiya[r.itemId] !== undefined && nashkiya[r.itemId] !== '')
      .map((r) => ({ itemId: r.itemId, nashkiyaQty: Number(nashkiya[r.itemId]) }));

    const result = await save({ sessionDate: date, lines });
    if (result.data) {
      setSaved(true);
      toast.success({ title: he.summary.saved });
    } else {
      toast.error({ title: he.toast.failed, detail: apiErrorMessage(result.error) ?? undefined });
    }
  }

  async function finish(): Promise<void> {
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
            <Button onClick={() => void submit()} disabled={isSaving}>
              {isSaving ? he.summary.saving : he.summary.save}
            </Button>
            <Button variant="quiet" onClick={() => void finish()} disabled={isFinishing}>
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
    </div>
  );
}

/** `פלוגות` — the item x company matrix. */
export function CompaniesPage() {
  const { data, isLoading } = useCompanyMatrixQuery();
  if (isLoading) return <Spinner />;

  const rows = (data ?? []).filter((r) => r.total > 0);

  return (
    <div className="space-y-5">
      <h1 className="text-display font-bold">{he.companiesReport.title}</h1>
      <Panel>
        <TableScroll>
          <table className="row-hover w-full">
            <thead>
              <tr>
                <Th>{he.companiesReport.item}</Th>
                {COMPANIES.map((c) => (
                  <Th key={c} numeric>
                    {he.companies[c]}
                  </Th>
                ))}
                <Th numeric>{he.companiesReport.total}</Th>
                <Th numeric>{he.companiesReport.inArmory}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.itemName}>
                  <Td className="font-semibold">{r.itemName}</Td>
                  {COMPANIES.map((c) => (
                    <Td
                      key={c}
                      numeric
                      className={
                        r.byCompany[c] === 0 ? 'text-graphite/60' : 'font-semibold text-field-dark'
                      }
                    >
                      {r.byCompany[c]}
                    </Td>
                  ))}
                  <Td numeric className="font-semibold">
                    {r.total}
                  </Td>
                  <Td numeric className="text-graphite">
                    {r.inArmory}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Panel>
    </div>
  );
}

/** `הקצאות` — targets with `נשאר לחתום` computed rather than typed in. */
export function AllocationsPage() {
  const { data, isLoading } = useAllocationsQuery();
  if (isLoading) return <Spinner />;
  const rows = data ?? [];

  return (
    <div className="space-y-5">
      <h1 className="text-display font-bold">{he.allocations.title}</h1>
      {rows.length === 0 ? (
        <Panel>
          <EmptyState>{he.common.noResults}</EmptyState>
        </Panel>
      ) : (
        <Panel>
          <TableScroll>
            <table className="row-hover w-full">
              <thead>
                <tr>
                  <Th>{he.allocations.item}</Th>
                  <Th />
                  {COMPANIES.map((c) => (
                    <Th key={c} numeric>
                      {he.companies[c]}
                    </Th>
                  ))}
                  <Th numeric>{he.allocations.totalTarget}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <>
                    <tr key={`${r.itemName}-t`}>
                      <Td className="font-semibold" >{r.itemName}</Td>
                      <Td className="text-meta text-graphite">{he.allocations.target}</Td>
                      {COMPANIES.map((c) => (
                        <Td key={c} numeric>
                          {r.targets[c]}
                        </Td>
                      ))}
                      <Td numeric className="font-semibold">
                        {r.totalTarget}
                      </Td>
                    </tr>
                    <tr key={`${r.itemName}-r`} className="bg-card">
                      <Td />
                      <Td className="text-meta text-graphite">{he.allocations.remaining}</Td>
                      {COMPANIES.map((c) => {
                        const value = r.remaining[c];
                        return (
                          <Td key={c} numeric>
                            {value === 0 ? (
                              <span className="text-graphite">0</span>
                            ) : (
                              <span className={value > 0 ? 'font-semibold text-oxide' : 'text-field'}>
                                {value}
                              </span>
                            )}
                          </Td>
                        );
                      })}
                      <Td />
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Panel>
      )}
    </div>
  );
}
