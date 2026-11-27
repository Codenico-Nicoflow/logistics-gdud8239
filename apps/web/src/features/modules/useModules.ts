import { useModulesQuery } from '../../lib/api';
import { MODULE_IDS, type ModuleId, type ModuleState } from '../../lib/types';

const ALL_ON = Object.fromEntries(MODULE_IDS.map((id) => [id, true])) as ModuleState;

/**
 * Which optional parts this battalion uses. If the answer cannot be had, everything counts as on: the
 * server is the real gate and refuses what is off, so a failed read must not hide a part that is on.
 */
export function useModules(): { isOn: (id: ModuleId) => boolean; enabled: ModuleState; canChange: boolean; isLoading: boolean } {
  const { data, isLoading } = useModulesQuery();
  const enabled = data?.enabled ?? ALL_ON;
  return { isOn: (id) => enabled[id], enabled, canChange: data?.canChange ?? false, isLoading };
}
