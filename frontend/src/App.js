import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import RootRoute from './components/RootRoute';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ProjectsListPage from './pages/ProjectsListPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import DeliverablesPage from './pages/DeliverablesPage';
import EmployeesPage from './pages/EmployeesPage';
import EmployeeDetailPage from './pages/EmployeeDetailPage';
import ProfilePage from './pages/ProfilePage';
import ResourceAllocationPage from './pages/ResourceAllocationPage';
import ResourceUsagePage from './pages/ResourceUsagePage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* Authenticated app shell */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/projects" element={<ProjectsListPage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/deliverables" element={<DeliverablesPage />} />
        <Route path="/employees" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><EmployeesPage /></ProtectedRoute>} />
        <Route path="/employees/:id" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><EmployeeDetailPage /></ProtectedRoute>} />
        <Route path="/allocations" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><ResourceAllocationPage /></ProtectedRoute>} />
        <Route path="/usage" element={<ProtectedRoute allowedRoles={['admin', 'manager']}><ResourceUsagePage /></ProtectedRoute>} />
      </Route>

      <Route path="/" element={<RootRoute />} />
      <Route
        path="*"
        element={
          <ProtectedRoute>
            <NotFoundPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
