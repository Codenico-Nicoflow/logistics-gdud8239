import { Outlet } from 'react-router-dom';
import { TabBar } from '../components/ui';
import { tabAddress, visibleTabs, type HubDef, type Viewer } from './navConfig';

/**
 * Frames one rail entry's screens. The bar only appears when the role can open more than one of them:
 * a viewer in ניפוק וחתימות, or a סמג"ד in דוחות, sees the single screen alone, not a lone tab.
 */
export function HubLayout({ hub, viewer }: { hub: HubDef; viewer: Viewer }) {
  const tabs = visibleTabs(hub, viewer);
  return (
    <>
      {tabs.length > 1 && (
        <TabBar tabs={tabs.map((t) => ({ to: tabAddress(hub, t), label: t.label, end: t.path === '' }))} />
      )}
      <Outlet />
    </>
  );
}
