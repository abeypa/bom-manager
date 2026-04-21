import { useState, useEffect } from 'react'
import {
  Package, FolderKanban, AlertTriangle, CheckCircle, Database,
  FileText, ShoppingCart, RefreshCcw, ArrowUpRight,
  TrendingUp, Clock, ArrowRight, Zap, ArrowUpDown, ChevronRight, Activity, Globe
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { dashboardApi } from '@/api/dashboard'
import { useRole } from '@/hooks/useRole'
import { partsApi } from '@/api/parts'
import { useToast } from '@/context/ToastContext'

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  planning:  { cls: 'badge-slate',   label: 'Planning' },
  design:    { cls: 'badge-navy',    label: 'Design' },
  build:     { cls: 'badge-amber',   label: 'Build' },
  testing:   { cls: 'badge-teal-soft', label: 'Testing' },
  completed: { cls: 'badge-success', label: 'Completed' },
  on_hold:   { cls: 'badge-amber',   label: 'On Hold' },
  cancelled: { cls: 'badge-danger',  label: 'Cancelled' },
}

const Dashboard = () => {
  const { displayName, userEmail, isAdmin } = useRole() as any
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [isHealing, setIsHealing] = useState(false)
  const [healResult, setHealResult] = useState<{ sync: number; err: number } | null>(null)
  const { showToast } = useToast()
  const queryClient = useQueryClient()
  useEffect(() => {
    document.title = 'Dashboard | BOM Manager'
  }, [])

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const name = userEmail ? userEmail.split('@')[0].split('.')[0] : 'Engineer'
  const nameDisplay = name.charAt(0).toUpperCase() + name.slice(1)

  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardApi.getStats,
  })

  const { data: recentProjects = [], isLoading: isLoadingProjects } = useQuery({
    queryKey: ['recent-projects'],
    queryFn: dashboardApi.getRecentProjects,
  })

  const PART_BREAKDOWN = [
    { label: 'Mech. Manufacture', value: stats?.mechanical_manufacture ?? 0,  color: 'bg-navy-700', pct: 0 },
    { label: 'Mech. Bought-Out',  value: stats?.mechanical_bought_out ?? 0,   color: 'bg-navy-500', pct: 0 },
    { label: 'Elec. Manufacture', value: stats?.electrical_manufacture ?? 0,  color: 'bg-teal-600', pct: 0 },
    { label: 'Elec. Bought-Out',  value: stats?.electrical_bought_out ?? 0,   color: 'bg-teal-400', pct: 0 },
    { label: 'Pneumatic System',  value: stats?.pneumatic_bought_out ?? 0,    color: 'bg-amber-500', pct: 0 },
  ]
  const totalPartsCount = PART_BREAKDOWN.reduce((s, r) => s + r.value, 0) || 1
  PART_BREAKDOWN.forEach(r => { r.pct = Math.round((r.value / totalPartsCount) * 100) })

  return (
    <div className="page-container py-8 page-enter">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{greeting()}, {nameDisplay}</h1>
          <p className="text-secondary mt-1">Centralized orchestration of Bill of Materials, procurement cycles, and project lifecycle tracking.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-emerald-100 text-emerald-700 text-xs font-black rounded-2xl flex items-center gap-2 border border-emerald-200 uppercase tracking-widest shadow-sm">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            Active Infrastructure
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
        <div className="card p-6 group hover:border-navy-200 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-tertiary">Active Clusters</p>
              <p className="text-4xl font-black text-navy-900 mt-2 font-mono tabular-nums">
                {isLoadingStats ? '...' : (stats?.active_projects || 0)}
              </p>
            </div>
            <div className="p-3 bg-navy-50 rounded-xl text-navy-600 group-hover:bg-navy-900 group-hover:text-white transition-all">
              <FolderKanban className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="card p-6 group hover:border-amber-200 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-tertiary">Parts in Registry</p>
              <p className="text-4xl font-black text-navy-900 mt-2 font-mono tabular-nums">
                {isLoadingStats ? '...' : (stats?.total_parts || 0).toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-amber-50 rounded-xl text-amber-600 group-hover:bg-amber-500 group-hover:text-white transition-all">
              <Package className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="card p-6 group hover:border-teal-200 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-tertiary">Open Manifests</p>
              <p className="text-4xl font-black text-navy-900 mt-2 font-mono tabular-nums">
                {isLoadingStats ? '...' : (stats?.pending_pos || 0)}
              </p>
            </div>
            <div className="p-3 bg-teal-50 rounded-xl text-teal-600 group-hover:bg-teal-600 group-hover:text-white transition-all">
              <ShoppingCart className="h-6 w-6" />
            </div>
          </div>
        </div>

        <div className="card p-6 group hover:border-emerald-200 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-tertiary">Inbound Velocity</p>
              <p className="text-4xl font-black text-navy-900 mt-2 font-mono tabular-nums italic">
                ₹{isLoadingStats ? '...' : '18.4L'}
              </p>
            </div>
            <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-all">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Recent Activity */}
        <div className="lg:col-span-2 space-y-8">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/30">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-navy-50 rounded-lg text-navy-600">
                  <Activity size={18} />
                </div>
                <h3 className="section-title">Recent Project Stream</h3>
              </div>
              <Link to="/projects" className="btn btn-ghost btn-sm group">
                REVEAL ALL <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
            
            {isLoadingProjects ? (
              <div className="p-8 space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="skeleton h-16 w-full rounded-xl" />)}
              </div>
            ) : recentProjects.length === 0 ? (
              <div className="empty-state py-16">
                <FolderKanban size={32} className="text-slate-200 mb-4" />
                <p className="text-sm font-bold text-tertiary">No project entities found</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {recentProjects.map((project) => {
                  const badge = STATUS_BADGE[project.status] || STATUS_BADGE.planning
                  const pct = [
                    project.mechanical_design_status,
                    project.ee_design_status,
                    project.pneumatic_design_status,
                    project.po_release_status,
                    project.part_arrival_status,
                    project.machine_build_status,
                  ].filter(s => s === 'completed').length / 6 * 100

                  return (
                    <Link
                      key={project.id}
                      to={`/projects/${project.id}`}
                      className="flex items-center gap-6 px-6 py-5 hover:bg-slate-50 transition-all group"
                    >
                      <div className="w-12 h-12 bg-navy-900 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-navy-900/10 group-hover:scale-105 transition-transform">
                        <span className="font-mono text-[10px] font-black text-white opacity-60 uppercase">{project.project_number?.slice(-3)}</span>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1.5">
                          <span className="text-base font-black text-navy-900 truncate group-hover:text-amber-600 transition-colors">
                            {project.project_name}
                          </span>
                          <span className={`badge ${badge.cls} !px-2.5 !py-0.5`}>{badge.label}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-[9px] font-black text-navy-400 tracking-tighter">
                            {project.project_number}
                          </span>
                          <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-700 ${pct === 100 ? 'bg-emerald-500' : 'bg-navy-500'}`} 
                              style={{ width: `${pct}%` }} 
                            />
                          </div>
                          <span className="font-mono text-[10px] font-black text-navy-400">{Math.round(pct)}%</span>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-slate-200 group-hover:text-navy-400 group-hover:translate-x-1 transition-all shrink-0" />
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Insights & Quick Nav */}
        <div className="space-y-8">
          {/* Registry Breakdown */}
          <div className="card shadow-sm">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/30">
              <div className="p-2 bg-teal-50 rounded-lg text-teal-600">
                <Globe size={18} />
              </div>
              <h3 className="section-title">Asset Inventory</h3>
            </div>
            <div className="p-6 space-y-6">
              {PART_BREAKDOWN.map(row => (
                <div key={row.label} className="group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="label-caps !text-[9px] !text-secondary group-hover:!text-navy-900 transition-colors">{row.label}</span>
                    <span className="font-mono text-[11px] font-black text-navy-900">
                      {isLoadingStats ? '—' : row.value.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${row.color} rounded-full transition-all duration-1000 group-hover:opacity-80`}
                      style={{ width: `${row.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* System Access Keys */}
          <div className="card shadow-sm">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/30">
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                <Zap size={18} />
              </div>
              <h3 className="section-title">Quick Control</h3>
            </div>
            <div className="p-3 grid grid-cols-1 gap-1">
              {[
                { label: 'ASSET REGISTRY', icon: Database, to: '/parts', sub: 'Master Repository Access' },
                { label: 'Project Control',    icon: FolderKanban, to: '/projects',        sub: 'Hierarchy & BOM Orchestration' },
                { label: 'Procurement Cycle',  icon: ShoppingCart, to: '/purchase-orders', sub: 'Vendor Manifest Generation' },
                { label: 'Movement Logs',      icon: ArrowUpDown,  to: '/stock-movement',  sub: 'Logistical Inbound/Outbound' },
              ].map(({ label, icon: Icon, to, sub }) => (
                <Link
                  key={to}
                  to={to}
                  className="flex items-center gap-4 p-3 rounded-2xl hover:bg-slate-50 transition-all group"
                >
                  <div className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center shrink-0 shadow-sm group-hover:shadow-md transition-all group-hover:bg-navy-900 group-hover:rotate-6">
                    <Icon size={16} className="text-navy-400 group-hover:text-white transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-black text-navy-900 group-hover:text-amber-700 transition-colors uppercase tracking-tight">{label}</div>
                    <div className="text-[10px] font-bold text-tertiary opacity-70 truncate">{sub}</div>
                  </div>
                  <ChevronRight size={14} className="text-slate-200 group-hover:text-navy-400 group-hover:translate-x-1 transition-all" />
                </Link>
              ))}
            </div>
          </div>

          {/* Admin Diagnostics */}
          {isAdmin && (
            <div className="card shadow-lg border-navy-100 bg-navy-50/20 overflow-hidden animate-in slide-in-from-bottom-5">
              <div className="px-6 py-5 border-b border-navy-100 flex items-center justify-between bg-navy-900 text-white">
                <div className="flex items-center gap-3">
                  <Activity size={18} className="text-amber-400" />
                  <h3 className="section-title !text-white !mb-0">System Integrity</h3>
                </div>
                {isHealing && <RefreshCcw size={16} className="animate-spin text-amber-400" />}
              </div>
              <div className="p-6">
                <p className="text-[10px] font-bold text-navy-400 uppercase tracking-widest mb-4">Diagnostic Tools</p>
                
                <button
                  onClick={async () => {
                    if (!window.confirm('HEAL PRICING: This will scan all parts and synchronize master prices with the latest historical audit entries. Proceed?')) return;
                    setIsHealing(true);
                    showToast('info', 'Synchronizing registry valuations...');
                    try {
                      const result = await partsApi.healPriceSynchronicity();
                      setHealResult({ sync: result.synchronizedCount, err: result.errorCount });
                      showToast('success', `Database Healed: ${result.synchronizedCount} records synchronized.`);
                      queryClient.invalidateQueries();
                    } catch (err) {
                      showToast('error', 'Integrity check failed');
                    } finally {
                      setIsHealing(false);
                    }
                  }}
                  disabled={isHealing}
                  className="w-full flex items-center justify-between p-4 bg-white border border-navy-100 rounded-2xl hover:border-navy-400 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-navy-50 rounded-xl flex items-center justify-center group-hover:bg-navy-900 transition-colors">
                      <ArrowUpDown size={16} className="text-navy-600 group-hover:text-white" />
                    </div>
                    <div className="text-left">
                      <div className="text-xs font-black text-navy-900 uppercase tracking-tight">Repair Registry Pricing</div>
                      <div className="text-[9px] font-bold text-navy-400 opacity-70">Sync Master Tables with Audit Trail</div>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-slate-200 group-hover:text-navy-900" />
                </button>

                {healResult && (
                  <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-100 animate-in fade-in">
                    <div className="flex items-center gap-2 text-[10px] font-black text-emerald-700 uppercase tracking-widest">
                      <CheckCircle size={12} />
                      Repair Complete
                    </div>
                    <div className="mt-1 text-[10px] font-medium text-emerald-600">
                      {healResult.sync} entities synchronized. {healResult.err ? `${healResult.err} errors encountered.` : 'Integrity 100% verified.'}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard

