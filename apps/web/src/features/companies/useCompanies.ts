import { useMemo } from 'react';
import { useCompaniesQuery } from '../../lib/api';
import type { Company, CompanyInfo } from '../../lib/types';

export type SelectOption = { value: string; label: string };

export type UseCompanies = {
  /** Every company, deactivated ones included, in the battalion's own order. */
  all: CompanyInfo[];
  /** Only the ones new work may be assigned to: what a dropdown or a grid column offers. */
  active: CompanyInfo[];
  /** The name to show for a stored code, including one of a deactivated company. Blank until the list has loaded. */
  nameOf: (code: Company) => string;
  /** `active` shaped for a `<Select>`. */
  options: SelectOption[];
  isLoading: boolean;
};

/**
 * The battalion's companies. Companies are data, not a fixed list: a screen that used to loop over five
 * hardcoded codes and look their labels up in `he.ts` asks this instead, so a battalion with three
 * companies, or none yet, gets screens that fit.
 */
export function useCompanies(): UseCompanies {
  const { data, isLoading } = useCompaniesQuery();
  return useMemo(() => {
    const all = data ?? [];
    const names = new Map(all.map((c) => [c.code, c.name]));
    const active = all.filter((c) => c.isActive);
    return {
      all,
      active,
      // While loading there is no name yet; showing the raw code ("SUPPORT") for a moment would be worse than a gap.
      nameOf: (code: Company) => names.get(code) ?? (isLoading ? '' : code),
      options: active.map((c) => ({ value: c.code, label: c.name })),
      isLoading,
    };
  }, [data, isLoading]);
}
