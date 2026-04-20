import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import RoleGuard from './components/auth/RoleGuard';

// Pages
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import ProjectDetails from './pages/ProjectDetails';
import Parts from './pages/Parts';
import PurchaseOrders from './pages/PurchaseOrders';
import PartInOut from './pages/PartInOut';
import Suppliers from './pages/Suppliers';
import PartUsageLogs from './pages/PartUsageLogs';
import Admin from './pages/Admin';
import ProcurementDashboard from './pages/ProcurementDashboard';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <Router>
            <Routes>
              {/* Public Route */}
              <Route path="/login" element={<Login />} />

              {/* Protected Routes with Layout */}
              <Route element={<AppLayout />}>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                
                <Route path="/dashboard" element={
                  <RoleGuard>
                    <Dashboard />
                  </RoleGuard>
                } />

                <Route path="/projects" element={
                  <RoleGuard>
                    <Projects />
                  </RoleGuard>
                } />

                <Route path="/projects/:id" element={
                  <RoleGuard>
                    <ProjectDetails />
                  </RoleGuard>
                } />

                <Route path="/parts" element={
                  <RoleGuard>
                    <Parts />
                  </RoleGuard>
                } />

                <Route path="/purchase-orders" element={
                  <RoleGuard>
                    <PurchaseOrders />
                  </RoleGuard>
                } />

                <Route path="/stock-movement" element={
                  <RoleGuard>
                    <PartInOut />
                  </RoleGuard>
                } />
                
                <Route path="/procurement" element={
                  <RoleGuard>
                    <ProcurementDashboard />
                  </RoleGuard>
                } />

                <Route path="/suppliers" element={
                  <RoleGuard>
                    <Suppliers />
                  </RoleGuard>
                } />

                <Route path="/part-usage-logs" element={
                  <RoleGuard>
                    <PartUsageLogs />
                  </RoleGuard>
                } />

                {/* Admin-only route */}
                <Route path="/admin" element={
                  <RoleGuard requiredRole="admin">
                    <Admin />
                  </RoleGuard>
                } />
              </Route>

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Router>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
