import { useModules } from '../features/modules/useModules';
import type { AuthUser } from '../lib/types';
import type { Viewer } from './navConfig';

/** Who is looking, and which optional parts their battalion has on: what decides which screens exist. */
export function useViewer(user: AuthUser): Viewer {
  const { enabled, canChange } = useModules();
  return { role: user.role, isPlatformAdmin: user.isPlatformAdmin, modules: enabled, canChangeModules: canChange };
}
