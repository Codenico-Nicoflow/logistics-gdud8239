import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useMeQuery } from '../lib/api';
import { Shell } from './Shell';
import { Spinner } from '../components/ui';
import { LoginPage } from '../features/auth/LoginPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { IssuePage } from '../features/issue/IssuePage';
import { SignaturesPage } from '../features/signatures/SignaturesPage';
import { AttentionPage } from '../features/attention/AttentionPage';
import { AllocationsPage, CompaniesPage, SummaryPage } from '../features/reports/ReportPages';
import { MovementsPage } from '../features/movements/MovementsPage';
import { BackupsPage } from '../features/backups/BackupsPage';
import { CountsPage } from '../features/counts/CountsPage';
import { CatalogPage } from '../features/catalog/CatalogPage';
import { AttendancePage } from '../features/attendance/AttendancePage';
import { UsersPage } from '../features/users/UsersPage';

export function App() {
  const { data, isLoading } = useMeQuery();

  if (isLoading) return <Spinner />;
  if (!data?.user) return <LoginPage />;

  const user = data.user;
  const isAdmin = user.role === 'admin';

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell user={user} />} path="/">
          <Route index element={<DashboardPage />} />
          <Route path="signatures" element={<SignaturesPage />} />
          <Route path="attention" element={<AttentionPage />} />
          <Route path="summary" element={<SummaryPage />} />
          <Route path="companies" element={<CompaniesPage />} />
          <Route path="allocations" element={<AllocationsPage />} />
          <Route path="movements" element={<MovementsPage />} />
          <Route path="counts" element={<CountsPage />} />
          {user.role !== 'viewer' && <Route path="issue" element={<IssuePage />} />}
          {user.role !== 'viewer' && <Route path="attendance" element={<AttendancePage />} />}
          {isAdmin && <Route path="catalog" element={<CatalogPage />} />}
          {isAdmin && <Route path="users" element={<UsersPage />} />}
          {isAdmin && <Route path="backups" element={<BackupsPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
