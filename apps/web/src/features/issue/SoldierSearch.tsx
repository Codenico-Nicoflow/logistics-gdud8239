import { useState } from 'react';
import { useSoldiersQuery } from '../../lib/api';
import { Button, Panel, SearchField, Spinner, Tag } from '../../components/ui';
import { AddSoldierDialog } from '../soldiers/AddSoldierDialog';
import { he } from '../../i18n/he';
import type { SoldierSummary } from '../../lib/types';

/**
 * Step 1 — finding the soldier.
 *
 * A search result shows every field that distinguishes two people with the
 * same name, because that is the choice being made here. A field nobody has
 * recorded is named as missing rather than left blank: a blank reads as "no
 * such thing" instead of "unknown".
 */
export function SoldierSearch({ onPick }: { onPick: (soldier: SoldierSummary) => void }) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
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
                      <span>{he.companies[s.company]}</span>
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
                      {s.platoon && (
                        <span>
                          {he.issue.platoon}: {s.platoon}
                        </span>
                      )}
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

        {/* Offered whether or not the search found anyone: a soldier who has
            never signed for anything is not in the system yet, and ניפוק is
            where that is discovered. */}
        <div className="mt-4 border-t border-rule pt-3">
          <Button variant="quiet" size="sm" onClick={() => setAdding(true)}>
            {he.issue.addSoldier}
          </Button>
        </div>
      </div>

      {adding && (
        <AddSoldierDialog
          onClose={() => setAdding(false)}
          onCreated={(created) => {
            setAdding(false);
            onPick(created);
          }}
        />
      )}
    </Panel>
  );
}
