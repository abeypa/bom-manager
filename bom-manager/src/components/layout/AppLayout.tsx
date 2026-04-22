import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, Package, ShoppingCart,
  ArrowUpDown, LogOut, ShieldCheck, Truck, Factory,
  ChevronRight, Menu, X, Settings, Bell, Search, Activity
} from 'lucide-react';
import { useRole } from '../../hooks/useRole';
import { useAuth } from '../../context/AuthContext';
import SearchOverlay from '@/components/ui/SearchOverlay';
import POBasket from '@/components/projects/POBasket';
import CreatePOFromBOMModal from '@/components/projects/CreatePOFromBOMModal';
import { usePOBasketStore } from '@/store/usePOBasketStore';

const NAV_SECTIONS = [
  {
    label: 'OPERATIONS',
    items: [
      { to: '/dashboard',      icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/projects',       icon: FolderKanban,    label: 'Projects' },
      { to: '/procurement',    icon: Factory,         label: 'Procurement' },
    ],
  },
  {
    label: 'INVENTORY',
    items: [
      { to: '/parts',          icon: Package,         label: 'Parts Master' },
      { to: '/stock-movement', icon: ArrowUpDown,     label: 'Stock In / Out' },
      { to: '/purchase-orders',icon: ShoppingCart,    label: 'Purchase Orders' },
    ],
  },
  {
    label: 'MASTER DATA',
    items: [
      { to: '/suppliers',      icon: Truck,           label: 'Suppliers' },
      { to: '/part-usage-logs', icon: Activity, label: 'Usage Logs' },
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
    <aside className="flex flex-col h-full" style={{ background: '#131313' }}>
      {/* Brand Identity */}
      <div className="px-6 py-6 flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #1a3f7c, #2550a0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'white', letterSpacing: '-0.03em', flexShrink: 0 }}>
            BEP
          </div>
          <div>
            <div className="font-semibold text-sm text-white/90 leading-none mb-1 tracking-tight">
              BOM Manager
            </div>
            <div className="text-[9px] font-medium text-white/30 tracking-[0.15em] uppercase">
               V3.0 Cinematic
            </div>
          </div>
        </div>
        <button onClick={onClose} className="lg:hidden p-2 text-white/40 hover:text-white rounded-lg">
           <X size={18} />
        </button>
      </div>

      {/* Primary Navigation */}
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
                        ? 'bg-white/8 text-white' 
                        : 'text-white/40 hover:text-white/70 hover:bg-white/4'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={16} className={`shrink-0 transition-all ${isActive ? 'text-[#0071e3]' : ''}`} />
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
                     ? 'bg-white/8 text-white' 
                     : 'text-white/40 hover:text-white/70 hover:bg-white/4'
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
                     ? 'bg-white/8 text-white' 
                     : 'text-white/40 hover:text-white/70 hover:bg-white/4'
                 }`
               }
             >
               <Activity size={16} className="shrink-0" />
               <span className="text-xs font-medium tracking-wide">Change Log</span>
             </NavLink>
          </div>
        )}
      </nav>

      {/* User Session Footer */}
      <div className="px-4 py-5 border-t border-white/5">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/4 group transition-all">
          <div className="w-9 h-9 rounded-lg bg-[#1b1b1b] border border-white/10 flex items-center justify-center text-xs font-semibold text-white/80">
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

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

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
    <div className="flex h-screen overflow-hidden bg-[#f8fafc]">
      {/* Platform Sidebar */}
      <div className="hidden lg:flex w-64 flex-col flex-shrink-0">
        <Sidebar
          isAdmin={isAdmin}
          initials={initials}
          displayName={displayName}
          onClose={() => setSidebarOpen(false)}
          onLogout={handleLogout}
        />
      </div>

      {/* Mobile Interaction Layer */}
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

      {/* Main Orchestration Node */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Universal Top Bar — Clean surface, no heavy borders */}
        <header className="h-14 bg-white flex items-center justify-between px-6 shrink-0 z-40" style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-gray-400 hover:text-gray-900 rounded-lg">
               <Menu size={20} />
            </button>
            <div className="flex items-center gap-2 text-xs font-medium text-gray-400 tracking-wide">
              <span className="opacity-50">BEP-CORE</span>
              <ChevronRight size={12} />
              <span className="text-[#1d1d1f] font-semibold">
                 {NAV_SECTIONS.flatMap(s => s.items).find(i => location.pathname.startsWith(i.to))?.label || (location.pathname === '/admin' ? 'Admin Panel' : 'System Node')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div 
               onClick={() => setSearchOpen(true)}
               className="hidden md:flex items-center gap-3 bg-[#f5f5f7] rounded-full px-4 py-2 hover:bg-[#ececee] transition-all cursor-pointer group"
            >
               <Search size={14} className="text-gray-400 group-hover:text-[#0071e3] transition-colors" />
               <span className="text-[11px] font-medium text-gray-500 group-hover:text-gray-700 transition-colors">Global Search</span>
               <div className="flex items-center gap-0.5 bg-white px-1.5 py-0.5 rounded-md" style={{ border: '1px solid rgba(0,0,0,0.08)' }}>
                  <span className="text-[9px] font-medium text-gray-400">⌘</span>
                  <span className="text-[9px] font-medium text-gray-400">K</span>
               </div>
            </div>
          </div>
        </header>

         {/* Viewport Render Node */}
         <main className="flex-1 overflow-auto custom-scrollbar bg-[#f5f5f7]">
            <div className="px-6 py-6">
              <Outlet />
            </div>
         </main>
       </div>
       <SearchOverlay isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
        
        {/* Global PO Basket UI */}
        <POBasket />

        {/* Global Create PO Modal */}
        <GlobalPOModal />
      </div>
    );
}

// Separate helper component to use hooks correctly
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
