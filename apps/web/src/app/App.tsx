import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useMeQuery } from '../lib/api';
import { Shell } from './Shell';
import { Spinner } from '../components/ui';
import { LoginPage } from '../features/auth/LoginPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { IssuePage } from '../features/issue/IssuePage';
import { ServicePeriodsPage } from '../features/allocations/ServicePeriodsPage';
import { CompanyAllocationPage } from '../features/allocations/CompanyAllocationPage';
import { DocumentsPage } from '../features/signatures/DocumentsPage';
import { AllocationsPage, CompaniesPage, SummaryPage } from '../features/reports/ReportPages';
import { MovementsPage } from '../features/movements/MovementsPage';
import { DailyMovementsPage } from '../features/movements/DailyMovementsPage';
import { BackupsPage } from '../features/backups/BackupsPage';
import { CountsPage } from '../features/counts/CountsPage';
import { CatalogPage } from '../features/catalog/CatalogPage';
import { IntakePage } from '../features/intake/IntakePage';
import { NamingPage } from '../features/naming/NamingPage';
import { CompanySplitPage } from '../features/allocations/CompanySplitPage';
import { AttendancePage } from '../features/attendance/AttendancePage';
import { SoldiersPage } from '../features/soldiers/SoldiersPage';
import { UsersPage } from '../features/users/UsersPage';
import type { Role } from '../lib/types';

/**
 * The battalion's three original roles (admin/logistics/viewer) keep their
 * existing full access to every legacy screen, exactly as before these three
 * reserve-duty roles existed. SHLISHUT/SAMGAD/COMPANY_CMDR are new and
 * narrow by design: each sees only the one screen built for it, nothing else
 * — not even by typing a URL. A route with no explicit `roles` is reachable
 * by any of the three original roles, matching the old (role-less) behavior;
 * SHLISHUT/SAMGAD/COMPANY_CMDR must be listed explicitly on every route they
 * are meant to reach, including read-only ones like /soldiers.
 */
const OLD_ROLES: Role[] = ['admin', 'logistics', 'viewer'];

function defaultPathFor(role: Role): string {
  if (role === 'SHLISHUT') return '/soldiers';
  if (role === 'SAMGAD') return '/service-periods';
  if (role === 'COMPANY_CMDR') return '/company-allocation';
  return '/issue';
}

export function App() {
  const { data, isLoading } = useMeQuery();

  if (isLoading) return <Spinner />;
  if (!data?.user) return <LoginPage />;

  const user = data.user;
  const isAdmin = user.role === 'admin';

  const can = (roles: Role[]): boolean => roles.includes(user.role);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell user={user} />} path="/">
          <Route index element={<Navigate to={defaultPathFor(user.role)} replace />} />
          {can(OLD_ROLES) && <Route path="dashboard" element={<DashboardPage />} />}
          {can(OLD_ROLES) && <Route path="documents" element={<DocumentsPage user={user} />} />}
          {can(['admin', 'logistics']) && <Route path="summary" element={<SummaryPage />} />}
          {can(OLD_ROLES) && <Route path="companies" element={<CompaniesPage />} />}
          {can(OLD_ROLES) && <Route path="allocations" element={<AllocationsPage />} />}
          {can(OLD_ROLES) && <Route path="movements" element={<MovementsPage />} />}
          {can(['admin', 'logistics']) && (
            <Route path="daily-movements" element={<DailyMovementsPage />} />
          )}
          {can(['admin', 'logistics']) && <Route path="counts" element={<CountsPage />} />}
          {can([...OLD_ROLES, 'SHLISHUT', 'SAMGAD', 'COMPANY_CMDR']) && (
            <Route path="soldiers" element={<SoldiersPage user={user} />} />
          )}
          {can(['admin', 'logistics']) && <Route path="issue" element={<IssuePage />} />}
          {can(['admin', 'logistics', 'SAMGAD']) && (
            <Route path="service-periods" element={<ServicePeriodsPage user={user} />} />
          )}
          {can(['admin', 'logistics', 'SAMGAD']) && (
            <Route path="company-split" element={<CompanySplitPage />} />
          )}
          {can(['admin', 'COMPANY_CMDR']) && (
            <Route path="company-allocation" element={<CompanyAllocationPage isAdmin={isAdmin} />} />
          )}
          {can(['admin', 'logistics']) && (
            <Route path="attendance" element={<AttendancePage user={user} />} />
          )}
          {isAdmin && <Route path="catalog" element={<CatalogPage />} />}
          {isAdmin && <Route path="intake" element={<IntakePage />} />}
          {isAdmin && <Route path="naming" element={<NamingPage />} />}
          {isAdmin && <Route path="users" element={<UsersPage currentUserId={user.id} />} />}
          {isAdmin && <Route path="backups" element={<BackupsPage />} />}
          <Route path="*" element={<Navigate to={defaultPathFor(user.role)} replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
