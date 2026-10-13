import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AttendancePage } from './app/AttendancePage';
import { EmployeeProfilePage } from './app/EmployeeProfilePage';
import { EmployeesPage } from './app/EmployeesPage';
import { FeatureRoute } from './app/FeatureRoute';
import { HomePage } from './app/HomePage';
import { LeavesPage } from './app/LeavesPage';
import { LoginPage } from './app/LoginPage';
import { OrganizationPage } from './app/OrganizationPage';
import { PlaceholderPage } from './app/PlaceholderPage';
import { PlatformLoginPage } from './app/PlatformLoginPage';
import {
  PlatformAuditPage,
  PlatformCatalogPage,
  PlatformDashboardPage,
  PlatformFeaturesPage,
  PlatformHealthPage,
  PlatformPlansPage,
  PlatformSettingsPage,
  PlatformSupportPage,
  SupportInboxPage,
} from './app/platform/PlatformPages';
import { ProtectedRoute } from './app/ProtectedRoute';
import { RolesPage } from './app/RolesPage';
import { SettingsPage } from './app/SettingsPage';
import { TenantsPage } from './app/TenantsPage';
import { AppShell } from './layouts/AppShell';
import { AuthProvider } from './lib/auth';
import { ThemeProvider } from './lib/theme';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/platform/login" element={<PlatformLoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<AppShell />}>
                  <Route index element={<HomePage />} />

                  {/* Platform Super Admin console */}
                  <Route path="platform" element={<PlatformDashboardPage />} />
                  <Route path="platform/tenants" element={<TenantsPage />} />
                  <Route path="platform/plans" element={<PlatformPlansPage />} />
                  <Route path="platform/catalog" element={<PlatformCatalogPage />} />
                  <Route path="platform/features" element={<PlatformFeaturesPage />} />
                  <Route path="platform/support" element={<PlatformSupportPage />} />
                  <Route path="platform/audit" element={<PlatformAuditPage />} />
                  <Route path="platform/health" element={<PlatformHealthPage />} />
                  <Route path="platform/settings" element={<PlatformSettingsPage />} />
                  <Route
                    path="tenants"
                    element={<Navigate to="/platform/tenants" replace />}
                  />

                  <Route path="roles" element={<RolesPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="support-inbox" element={<SupportInboxPage />} />

                  <Route element={<FeatureRoute feature="hrm.employees" />}>
                    <Route path="organization" element={<OrganizationPage />} />
                    <Route path="employees" element={<EmployeesPage />} />
                    <Route path="employees/:id" element={<EmployeeProfilePage />} />
                  </Route>
                  <Route element={<FeatureRoute feature="hrm.attendance" />}>
                    <Route path="attendance" element={<AttendancePage />} />
                  </Route>
                  <Route element={<FeatureRoute feature="hrm.leave" />}>
                    <Route path="leaves" element={<LeavesPage />} />
                  </Route>
                  <Route element={<FeatureRoute feature="hrm.payroll" />}>
                    <Route
                      path="payroll"
                      element={
                        <PlaceholderPage
                          title="Payroll"
                          description="Compensation, runs, and payslips land in Phase 5."
                          phase="Phase 5"
                        />
                      }
                    />
                  </Route>
                  <Route element={<FeatureRoute feature="hrm.recruitment" />}>
                    <Route
                      path="recruitment"
                      element={
                        <PlaceholderPage
                          title="Recruitment"
                          description="Jobs and applications land in Phase 6."
                          phase="Phase 6"
                        />
                      }
                    />
                  </Route>
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
