import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, Package, ShoppingCart,
  ArrowUpDown, LogOut, ShieldCheck, Truck, Factory, BriefcaseBusiness,
  ChevronRight, Menu, X, Search, Activity, BarChart3, Bot
} from 'lucide-react';
import { useRole } from '../../hooks/useRole';
import { useAuth } from '../../context/AuthContext';
import SearchOverlay from '@/components/ui/SearchOverlay';
import POBasket from '@/components/projects/POBasket';
import BOMBasket from '@/components/projects/BOMBasket';
import CreatePOFromBOMModal from '@/components/projects/CreatePOFromBOMModal';
import { usePOBasketStore } from '@/store/usePOBasketStore';
import { useBOMBasketStore } from '@/store/useBOMBasketStore';
import AIChat from '@/components/ai/AIChat';
import { useAIStore } from '@/store/useAIStore';
import { loadSettingsFromDB, saveSettings } from '@/lib/openrouter';

const NAV_SECTIONS = [
  {
    label: 'OPERATIONS',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/projects', icon: FolderKanban, label: 'Projects' },
      { to: '/project-tracking', icon: BriefcaseBusiness, label: 'Project Tracking' },
      { to: '/manufactured-part-tracking', icon: Factory, label: 'Manufactured Tracking' },
      // PO ingestion is paused as a standalone tab. Use AI chat commands instead.
      // { to: '/po-ingestion', icon: PackageSearch, label: 'PO Ingestion' },
    ],
  },
  {
    label: 'INVENTORY',
    items: [
      { to: '/parts', icon: Package, label: 'Parts Master' },
      { to: '/stock-movement', icon: ArrowUpDown, label: 'Stock In / Out' },
      { to: '/purchase-orders', icon: ShoppingCart, label: 'Purchase Orders' },
    ],
  },
  {
    label: 'MASTER DATA',
    items: [
      { to: '/suppliers', icon: Truck, label: 'Suppliers' },
      { to: '/part-usage-logs', icon: Activity, label: 'Usage Logs' },
      { to: '/reports', icon: BarChart3, label: 'Reports' },
    ],
  },
];

interface SidebarProps {
  isAdmin: boolean;
  initials: string;
  displayName: string;
  onClose: () => void;
  onLogout: () => void;
}

function Sidebar({ isAdmin, initials, displayName, onClose, onLogout }: SidebarProps) {
  return (
    <aside
      className="flex h-full flex-col"
      style={{
        background:
          'radial-gradient(circle at 20% 0%, rgba(14, 165, 233, 0.18), transparent 34%), linear-gradient(180deg, #061428 0%, #07172d 50%, #06111f 100%)',
      }}
    >
      <div className="px-6 py-6 flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <img
            src="/bep-logo.svg"
            alt="BEP"
            className="h-10 w-10 shrink-0 rounded-xl border border-white/15 bg-white object-contain p-1 shadow-lg shadow-sky-950/30"
          />
          <div>
            <div className="font-semibold text-sm text-white leading-none tracking-tight">
              BOM Manager
            </div>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden p-2 text-white/40 hover:text-white rounded-lg">
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 px-4 py-4 overflow-y-auto space-y-8 custom-scrollbar">
        {NAV_SECTIONS.map(section => (
          <div key={section.label}>
            <div className="text-[9px] font-medium text-white/25 tracking-[0.2em] uppercase mb-3 px-3">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                      isActive
                        ? 'bg-sky-400/15 text-white ring-1 ring-sky-300/15 shadow-lg shadow-sky-950/20'
                        : 'text-slate-300/70 hover:text-white hover:bg-white/7'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={16} className={`shrink-0 transition-all ${isActive ? 'text-sky-300' : ''}`} />
                      <span className="text-xs font-medium tracking-wide">{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}

        {isAdmin && (
          <div>
            <div className="text-[9px] font-medium text-white/25 tracking-[0.2em] uppercase mb-3 px-3">ADMINISTRATION</div>
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                  isActive
                    ? 'bg-sky-400/15 text-white ring-1 ring-sky-300/15 shadow-lg shadow-sky-950/20'
                    : 'text-slate-300/70 hover:text-white hover:bg-white/7'
                }`
              }
            >
              <ShieldCheck size={16} className="shrink-0" />
              <span className="text-xs font-medium tracking-wide">System Control</span>
            </NavLink>
            <NavLink
              to="/change-log"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                  isActive
                    ? 'bg-sky-400/15 text-white ring-1 ring-sky-300/15 shadow-lg shadow-sky-950/20'
                    : 'text-slate-300/70 hover:text-white hover:bg-white/7'
                }`
              }
            >
              <Activity size={16} className="shrink-0" />
              <span className="text-xs font-medium tracking-wide">Change Log</span>
            </NavLink>
          </div>
        )}
      </nav>

      <div className="px-4 py-5 border-t border-white/10">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/7 ring-1 ring-white/10 group transition-all">
          <div className="w-9 h-9 rounded-lg bg-sky-400/15 border border-sky-200/15 flex items-center justify-center text-xs font-semibold text-white/90">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white/80 truncate">{displayName}</div>
            <div className="text-[9px] font-medium text-white/30 uppercase tracking-wider">{isAdmin ? 'ROOT ADMIN' : 'FIELD ENGINEER'}</div>
          </div>
          <button
            onClick={onLogout}
            className="p-2 text-white/20 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
            title="Terminate Session"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default function AppLayout() {
  const { isAdmin, userEmail, loading } = useRole();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const bomBasketProjectId = useBOMBasketStore((state) => state.currentProjectId);

  // Sync admin-configured AI key from DB into localStorage so all users can use AI
  useEffect(() => {
    if (!user) return;
    loadSettingsFromDB().then(s => { if (s?.apiKey) saveSettings(s); });
  }, [user]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  useEffect(() => {
    if (!loading && !user) navigate('/login', { replace: true });
  }, [user, loading, navigate]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  const initials = userEmail
    ? userEmail.split('@')[0].slice(0, 2).toUpperCase()
    : 'U';

  const displayName = userEmail
    ? userEmail.split('@')[0].replace('.', ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'User';

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-navy-950">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-app)]">
      <div className="hidden lg:flex w-64 flex-col flex-shrink-0">
        <Sidebar
          isAdmin={isAdmin}
          initials={initials}
          displayName={displayName}
          onClose={() => setSidebarOpen(false)}
          onLogout={handleLogout}
        />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-[60] flex lg:hidden">
          <div className="absolute inset-0 bg-navy-950/40 backdrop-blur-md" onClick={() => setSidebarOpen(false)} />
          <div className="relative w-64 flex flex-col shadow-2xl">
            <Sidebar
              isAdmin={isAdmin}
              initials={initials}
              displayName={displayName}
              onClose={() => setSidebarOpen(false)}
              onLogout={handleLogout}
            />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 bg-white/90 flex items-center justify-between px-6 shrink-0 z-40 backdrop-blur-xl" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-slate-400 hover:text-navy-900 rounded-lg">
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400 tracking-wide">
              <span className="opacity-50">BEP-CORE</span>
              <ChevronRight size={12} />
              <span className="text-navy-900 font-semibold">
                {NAV_SECTIONS.flatMap(s => s.items).find(i => location.pathname.startsWith(i.to))?.label || (location.pathname === '/admin' ? 'Admin Panel' : 'System Node')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              onClick={() => setSearchOpen(true)}
              className="hidden md:flex items-center gap-3 bg-slate-50 rounded-full px-4 py-2 hover:bg-navy-50 transition-all cursor-pointer group border border-slate-100"
            >
              <Search size={14} className="text-slate-400 group-hover:text-sky-600 transition-colors" />
              <span className="text-[11px] font-medium text-slate-500 group-hover:text-navy-700 transition-colors">Global Search</span>
              <div className="flex items-center gap-0.5 bg-white px-1.5 py-0.5 rounded-md" style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
                <span className="text-[9px] font-medium text-slate-400">Ctrl/Cmd</span>
                <span className="text-[9px] font-medium text-slate-400">K</span>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto custom-scrollbar bg-[var(--bg-app)]">
          <div className="px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>

      <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />

      <BOMBasket projectId={bomBasketProjectId} projectCurrency="INR" />
      <POBasket />
      <GlobalPOModal />
      <AILauncher />
      <AIChat />
    </div>
  );
}

function AILauncher() {
  const open = useAIStore(s => s.open);
  const setOpen = useAIStore(s => s.setOpen);
  const pendingCount = useAIStore(s => s.pending.filter(p => p.status === 'pending').length);

  if (open) return null;

  return (
    <button
      onClick={() => setOpen(true)}
      className="fixed bottom-4 right-4 z-40 w-14 h-14 rounded-full shadow-2xl shadow-sky-950/25 bg-gradient-to-br from-sky-500 via-navy-700 to-navy-950 text-white flex items-center justify-center hover:scale-105 transition-transform"
      title="AI assistant"
      aria-label="Open AI assistant"
    >
      <Bot size={22} />
      {pendingCount > 0 && (
        <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
          {pendingCount}
        </span>
      )}
    </button>
  );
}

function GlobalPOModal() {
  const { poModalOpen, setPoModalOpen, projectId, basketItems } = usePOBasketStore();

  if (!projectId) return null;

  return (
    <CreatePOFromBOMModal
      isOpen={poModalOpen}
      onClose={() => setPoModalOpen(false)}
      projectId={projectId}
      items={basketItems}
    />
  );
}
