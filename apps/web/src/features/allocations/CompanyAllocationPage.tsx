import { useState } from 'react';
import { useServicePeriodsQuery } from '../../lib/api';
import { Panel, Select, Spinner, Tag } from '../../components/ui';
import { he } from '../../i18n/he';
import { type Company } from '../../lib/types';
import { SoldierAllocationGrid } from './SoldierAllocationGrid';
import { useCompanies } from '../companies/useCompanies';

/**
 * סגן מפקד פלוגה's own screen — a standalone page rather than a mode inside
 * הקצאה לתקופת שרות, since that screen is the samgad's job (splitting the
 * battalion across companies) and this one is a different job entirely
 * (splitting one company across its own soldiers). Same תקופת שרות picker
 * as that screen, but the grid underneath is always `SoldierAllocationGrid`,
 * scoped server-side to this commander's own company.
 *
 * Admin can also reach this page (admin sees everything), but admin has no
 * companyScope of their own, so the server requires an explicit `company` —
 * hence the picker shown only to `isAdmin`. A real COMPANY_CMDR never sees
 * it: the server already knows their one company and would reject anyone
 * else's.
 */
export function CompanyAllocationPage({ isAdmin }: { isAdmin: boolean }) {
  const { options: companyOptions } = useCompanies();
  const periods = useServicePeriodsQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [company, setCompany] = useState<Company | ''>('');

  if (periods.isLoading) return <Spinner />;

  const rows = periods.data ?? [];
  const selected = rows.find((p) => p.id === selectedId) ?? rows[0] ?? null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-display font-bold">{he.nav.companyAllocation}</h1>
      </div>

      {isAdmin && (
        <Panel>
          <div className="px-4 py-4">
            <Select
              label={he.servicePeriods.chooseCompany}
              value={company}
              onChange={setCompany}
              options={[
                { value: '', label: he.soldiers.allCompanies },
                ...companyOptions,
              ]}
              className="max-w-xs"
            />
          </div>
        </Panel>
      )}

      {rows.length === 0 ? (
        <Panel>
          <p className="px-4 py-6 text-center text-graphite">{he.servicePeriods.noPeriods}</p>
        </Panel>
      ) : (
        <div className="flex flex-wrap gap-2">
          {rows.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`rounded-ctl border px-3 py-2 text-start transition-colors ${
                selected?.id === p.id
                  ? 'border-field bg-field-wash'
                  : 'border-rule-strong bg-card-raised hover:border-field'
              }`}
            >
              <span className="block font-semibold">{p.name}</span>
              <span className="mt-0.5 flex items-center gap-2 text-micro text-graphite">
                <span>
                  {p.startsAt.slice(0, 10)} – {p.endsAt.slice(0, 10)}
                </span>
                <Tag tone={p.status === 'ACTIVE' ? 'field' : 'neutral'}>
                  {he.servicePeriods.statusLabels[p.status]}
                </Tag>
              </span>
            </button>
          ))}
        </div>
      )}

      {selected && (!isAdmin || company) && (
        <SoldierAllocationGrid servicePeriodId={selected.id} company={isAdmin ? company || undefined : undefined} />
      )}
      {selected && isAdmin && !company && (
        <Panel>
          <p className="px-4 py-6 text-center text-graphite">{he.servicePeriods.chooseCompanyHint}</p>
        </Panel>
      )}
    </div>
  );
}
