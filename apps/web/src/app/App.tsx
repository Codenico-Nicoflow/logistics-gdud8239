import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useMeQuery } from '../lib/api';
import { Shell } from './Shell';
import { HubLayout } from './HubLayout';
import { HUBS, LEGACY_REDIRECTS, addressOf, defaultPathFor, tabAddress, visibleTabs, type TabId } from './navConfig';
import { Spinner } from '../components/ui';
import { LoginPage } from '../features/auth/LoginPage';
import { SetupPage } from '../features/auth/SetupPage';
import { SecurityPage } from '../features/auth/SecurityPage';
import { IssuePage } from '../features/issue/IssuePage';
import { ServicePeriodsPage } from '../features/allocations/ServicePeriodsPage';
import { CompanyAllocationPage } from '../features/allocations/CompanyAllocationPage';
import { DocumentsPage } from '../features/signatures/DocumentsPage';
import { SummaryPage } from '../features/reports/ReportPages';
import { IfsunPage } from '../features/ifsun/IfsunPage';
import { DailyMovementsPage } from '../features/movements/DailyMovementsPage';
import { BackupsPage } from '../features/backups/BackupsPage';
import { CountsPage } from '../features/counts/CountsPage';
import { CatalogPage } from '../features/catalog/CatalogPage';
import { IntakePage } from '../features/intake/IntakePage';
import { HelpPage } from '../features/help/HelpPage';
import { KitsPage } from '../features/kits/KitsPage';
import { NamingPage } from '../features/naming/NamingPage';
import { BattalionsPage } from '../features/platform/BattalionsPage';
import { ModulesPage } from '../features/modules/ModulesPage';
import { useModules } from '../features/modules/useModules';
import { useViewer } from './useViewer';
import { IdentityPage } from '../features/battalion/IdentityPage';
import { CompaniesPage } from '../features/companies/CompaniesPage';
import { CompanySplitPage } from '../features/allocations/CompanySplitPage';
import { AttendancePage } from '../features/attendance/AttendancePage';
import { SoldiersPage } from '../features/soldiers/SoldiersPage';
import { UsersPage } from '../features/users/UsersPage';
import type { AuthUser } from '../lib/types';

/**
 * Which screen each tab shows. Who may open it, and where it sits in the rail, is in navConfig; a tab
 * the role may not open never gets a route, so typing its address lands on the catch-all.
 */
function screenFor(tab: TabId, user: AuthUser): ReactNode {
  switch (tab) {
    case 'issue':
      return <IssuePage />;
    case 'documents':
      return <DocumentsPage user={user} />;
    case 'ifsun':
      return <IfsunPage />;
    case 'servicePeriods':
      return <ServicePeriodsPage user={user} />;
    case 'companyAllocation':
      return <CompanyAllocationPage isAdmin={user.role === 'admin'} />;
    case 'soldiers':
      return <SoldiersPage user={user} />;
    case 'attendance':
      return <AttendancePage user={user} />;
    case 'summary':
      return <SummaryPage />;
    case 'companySplit':
      return <CompanySplitPage />;
    case 'counts':
      return <CountsPage />;
    case 'dailyMovements':
      return <DailyMovementsPage />;
    case 'catalog':
      return <CatalogPage />;
    case 'intake':
      return <IntakePage />;
    case 'kits':
      return <KitsPage />;
    case 'naming':
      return <NamingPage />;
    case 'users':
      return <UsersPage currentUserId={user.id} />;
    case 'companies':
      return <CompaniesPage />;
    case 'identity':
      return <IdentityPage />;
    case 'modules':
      return <ModulesPage />;
    case 'battalions':
      return <BattalionsPage user={user} />;
    case 'backups':
      return <BackupsPage />;
    case 'help':
      return <HelpPage user={user} />;
    case 'security':
      return <SecurityPage />;
  }
}

/** Keeps router state across the hop, so a link that carried a soldier along still does after the move. */
function LegacyRedirect({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={{ pathname: to, search: location.search, hash: location.hash }} state={location.state} replace />;
}

/**
 * The setup page is reachable without being logged in (the person is opening a one-time link to
 * choose their first password), so it sits above the authentication gate.
 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/setup/:token" element={<SetupPage />} />
        <Route path="*" element={<AuthenticatedApp />} />
      </Routes>
    </BrowserRouter>
  );
}

function AuthenticatedApp() {
  const { data, isLoading } = useMeQuery();

  if (isLoading) return <Spinner />;
  if (!data?.user) return <LoginPage />;

  return <SignedInApp user={data.user} />;
}

function SignedInApp({ user }: { user: AuthUser }) {
  const viewer = useViewer(user);
  const { isLoading: modulesLoading } = useModules();

  // The routes are built from which parts are on; building them first with the wrong answer would bounce
  // a refresh on /attendance to the landing page.
  if (modulesLoading) return <Spinner />;

  return (
    <Routes>
      <Route element={<Shell user={user} viewer={viewer} />} path="/">
        <Route index element={<Navigate to={defaultPathFor(viewer)} replace />} />
        {HUBS.map((hub) => {
          const tabs = visibleTabs(hub, viewer);
          const [first] = tabs;
          if (!first) return null;
          return (
            <Route key={hub.id} path={hub.path} element={<HubLayout hub={hub} viewer={viewer} />}>
              {/* The hub's own address is its index tab; when this role cannot open that one, send it to the first it can. */}
              {first.path !== '' && <Route index element={<Navigate to={tabAddress(hub, first)} replace />} />}
              {tabs.map((tab) =>
                tab.path === '' ? (
                  <Route key={tab.id} index element={screenFor(tab.id, user)} />
                ) : (
                  <Route key={tab.id} path={tab.path} element={screenFor(tab.id, user)} />
                ),
              )}
            </Route>
          );
        })}
        {Object.entries(LEGACY_REDIRECTS).map(([from, tab]) => (
          <Route key={from} path={from} element={<LegacyRedirect to={addressOf(tab)} />} />
        ))}
        <Route path="*" element={<Navigate to={defaultPathFor(viewer)} replace />} />
      </Route>
    </Routes>
  );
}
