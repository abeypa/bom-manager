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
import ChangeLog from './pages/ChangeLog';
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

import supabase, { isSupabaseConfigured } from './lib/supabase';

function App() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 text-white font-sans">
        <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl">
          <div className="w-16 h-16 bg-amber-500/10 rounded-xl flex items-center justify-center mb-6">
            <span className="text-3xl">⚙️</span>
          </div>
          <h1 className="text-2xl font-bold mb-4">Configuration Required</h1>
          <p className="text-slate-400 mb-8 leading-relaxed">
            The application is running but the <strong>Supabase credentials</strong> are missing. 
            Please ensure <code className="bg-slate-900 px-2 py-1 rounded text-amber-400">VITE_SUPABASE_URL</code> and 
            <code className="bg-slate-900 px-2 py-1 rounded text-amber-400">VITE_SUPABASE_ANON_KEY</code> 
            are set in your environment variables.
          </p>
          <div className="space-y-4">
            <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 text-sm">
              <p className="font-bold text-slate-300 mb-1">How to fix:</p>
              <ol className="list-decimal list-inside space-y-1 text-slate-400">
                <li>Go to Cloudflare Pages settings</li>
                <li>Add these as <strong>Environment Variables</strong></li>
                <li>Trigger a <strong>new build</strong></li>
              </ol>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-slate-700 hover:bg-slate-600 transition-colors rounded-xl font-bold text-sm"
            >
              Check Again
            </button>
          </div>
        </div>
      </div>
    );
  }

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

                <Route path="/change-log" element={
                  <RoleGuard requiredRole="admin">
                    <ChangeLog />
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
