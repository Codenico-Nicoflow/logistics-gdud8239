import { useActAsMutation } from '../../lib/api';

/**
 * Switches the session into a battalion, then reloads the app. A reload rather than a cache reset on
 * purpose: nothing from the battalion just left (a list, a dialog's draft, a cached soldier) may survive
 * in memory into the next one.
 */
export function useActAs(): { actAs: (battalionId: string) => Promise<boolean>; isLoading: boolean } {
  const [run, { isLoading }] = useActAsMutation();
  async function actAs(battalionId: string): Promise<boolean> {
    const result = await run(battalionId);
    if (result.error) return false;
    window.location.assign('/');
    return true;
  }
  return { actAs, isLoading };
}
