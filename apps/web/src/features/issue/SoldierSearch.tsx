import { useState } from 'react';
import { useSoldiersQuery } from '../../lib/api';
import { Panel, SearchField, Spinner, Tag } from '../../components/ui';
import { he } from '../../i18n/he';
import type { SoldierSummary } from '../../lib/types';
import { useCompanies } from '../companies/useCompanies';

/**
 * Step 1 — finding the soldier.
 *
 * Only an existing soldier can be issued to from here — ניפוק is not where a
 * new soldier gets created. A missing name means he needs to be added on
 * חיילים first, by whoever is allowed to (שלישות/לוגיסטיקה), not inline here.
 *
 * A search result shows every field that distinguishes two people with the
 * same name, because that is the choice being made here. A field nobody has
 * recorded is named as missing rather than left blank: a blank reads as "no
 * such thing" instead of "unknown".
 */
export function SoldierSearch({ onPick }: { onPick: (soldier: SoldierSummary) => void }) {
  const { nameOf } = useCompanies();
  const [query, setQuery] = useState('');
  const soldiers = useSoldiersQuery({ q: query, take: 8 }, { skip: query.length < 2 });

  return (
    <Panel title={he.issue.stepSoldier}>
      <div className="px-4 py-4">
        <SearchField
          value={query}
          onSearch={setQuery}
          placeholder={he.issue.searchSoldier}
          autoFocus
        />
        {soldiers.isFetching && <Spinner />}
        {query.length >= 2 && !soldiers.isFetching && (
          <ul className="mt-3 divide-y divide-rule">
            {(soldiers.data?.rows ?? []).length === 0 && (
              <li className="py-6 text-center text-graphite">{he.issue.noSoldiers}</li>
            )}
            {soldiers.data?.rows.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => onPick(s)}
                  className="flex w-full items-center justify-between gap-3 px-1 py-2.5 text-start hover:bg-card"
                >
                  <span className="min-w-0">
                    <span className="font-semibold">
                      {s.firstName} {s.lastName}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-3 text-meta text-graphite">
                      <span>{nameOf(s.company)}</span>
                      <span>
                        {he.issue.personalNumber}:{' '}
                        {s.personalNumber ? (
                          <span className="serial text-ink-soft">{s.personalNumber}</span>
                        ) : (
                          <span className="text-oxide">{he.issue.missing}</span>
                        )}
                      </span>
                      <span>
                        {he.issue.phone}:{' '}
                        {s.phone ? (
                          <span className="serial text-ink-soft">{s.phone}</span>
                        ) : (
                          <span className="text-oxide">{he.issue.missing}</span>
                        )}
                      </span>
                    </span>
                  </span>
                  {s.openSignatureCount > 0 && (
                    <Tag>{he.issue.holdsItems(s.openSignatureCount)}</Tag>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
