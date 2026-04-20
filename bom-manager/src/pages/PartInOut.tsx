import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { stockMovementsApi } from '@/api/stock-movements'
import {
  ArrowDownToLine, ArrowUpFromLine, Search, Plus,
  Calendar, Briefcase, Factory, FileText, RefreshCw,
  RotateCcw, SlidersHorizontal, Package, ShoppingCart, Activity, User, ChevronRight
} from 'lucide-react'
import StockMovementModal from '@/components/inventory/StockMovementModal'
import POReceiveModal from '@/components/inventory/POReceiveModal'

type TabType = 'all' | 'IN' | 'OUT' | 'ADJUST' | 'RESTORE' | 'PO_IN'

const TYPE_STYLE = {
  IN:      { label: 'STOCK IN',    cls: 'badge-success', icon: ArrowDownToLine  },
  OUT:     { label: 'STOCK OUT',   cls: 'badge-amber',   icon: ArrowUpFromLine  },
  ADJUST:  { label: 'ADJUST',      cls: 'badge-navy',    icon: SlidersHorizontal },
  RESTORE: { label: 'RESTORE',     cls: 'badge-teal-soft',  icon: RotateCcw        },
}

const TABS: { id: TabType; label: string }[] = [
  { id: 'all',     label: 'Audit Trail' },
  { id: 'IN',      label: 'Stock In'    },
  { id: 'OUT',     label: 'Stock Out'   },
  { id: 'PO_IN',   label: 'PO Receipts' },
  { id: 'ADJUST',  label: 'Adjustments' },
  { id: 'RESTORE', label: 'Restores'    },
]

export default function PartInOut() {
  const [activeTab, setActiveTab]     = useState<TabType>('all')
  const [search, setSearch]           = useState('')
  const [adjustModalOpen, setAdjustModalOpen] = useState(false)
  const [receiveModalOpen, setReceiveModalOpen] = useState(false)

  const queryFilter =
    activeTab === 'all'   ? undefined :
    activeTab === 'PO_IN' ? 'IN'      :
    activeTab

  const { data: movements = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['stock-movements', activeTab],
    queryFn: () => stockMovementsApi.getAll({
      movement_type: queryFilter as any,
      limit: 200,
    }),
  })

  useEffect(() => {
    document.title = 'Logistics | BOM Manager'
  }, [])

  const filtered = movements.filter((m: any) => {
    if (activeTab === 'PO_IN' && !m.po_number) return false
    const q = search.toLowerCase()
    return !q || 
      m.part_number?.toLowerCase().includes(q) ||
      m.reference_notes?.toLowerCase().includes(q) ||
      m.project_name?.toLowerCase().includes(q) ||
      m.supplier_name?.toLowerCase().includes(q) ||
      m.po_number?.toLowerCase().includes(q)
  })

  const renderSkeletons = () => (
    <div className="card overflow-hidden">
      <div className="p-6 space-y-4">
        {[1, 2, 3, 4, 5].map(n => (
          <div key={n} className="skeleton h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )

  return (
    <div className="page-container page-enter">
      {/* Header */}
      <header className="page-header">
        <div>
          <p className="label-caps mb-1.5 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-navy-500" />
            Stock Logistics
          </p>
          <h1 className="page-title">Movement Logs</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="btn btn-secondary btn-icon h-11 w-11"
          >
            <RefreshCw size={16} className={isRefetching ? 'animate-spin' : ''} />
          </button>
          
          <button
            onClick={() => setReceiveModalOpen(true)}
            className="btn btn-secondary"
          >
            <ShoppingCart size={16} />
            RECEIVE PO
          </button>

          <button
            onClick={() => setAdjustModalOpen(true)}
            className="btn btn-primary btn-lg shadow-lg shadow-navy-900/10"
          >
            <Plus size={18} />
            ADJUST STOCK
          </button>
        </div>
      </header>

      {/* Nav */}
      <nav className="tab-bar">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Toolbar */}
      <div className="section-card p-4 flex flex-col md:flex-row items-center gap-4 mb-8">
        <div className="relative flex-1 w-full">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-tertiary" />
          <label htmlFor="log-search" className="sr-only">Search logs</label>
          <input
            id="log-search"
            type="text"
            className="input pl-11"
            placeholder="Search by part, project, supplier or PO number…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="label-caps !text-tertiary px-2">
          {filtered.length} Entries Logged
        </div>
      </div>

      {activeTab === 'PO_IN' && (
        <div className="card bg-emerald-50/50 border-emerald-100 p-4 flex items-center gap-3 mb-6">
          <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
            <ShoppingCart size={16} />
          </div>
          <p className="text-sm font-bold text-emerald-800">
            Filtered view: Showing movements verified against system Purchase Orders.
          </p>
        </div>
      )}

      {/* Main Stream */}
      <div className="flex-1">
        {isLoading ? renderSkeletons() : filtered.length === 0 ? (
          <div className="empty-state py-24">
            <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mb-6 border border-slate-100 shadow-inner">
              <Activity size={40} className="text-tertiary" />
            </div>
            <h3 className="section-title mb-2">No activity records found</h3>
            <p className="text-secondary mb-8 max-w-sm text-center">
              Try adjusting your filters or search terms for the current log period.
            </p>
          </div>
        ) : (
          <div className="card shadow-sm overflow-hidden">
            <table className="data-table-modern">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Classification</th>
                  <th>Part Reference</th>
                  <th className="text-right">Transaction</th>
                  <th>Chain Context</th>
                  <th>Orchestrator</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m: any) => {
                  const style = TYPE_STYLE[m.movement_type as keyof typeof TYPE_STYLE] || {
                    label: m.movement_type, cls: 'badge-slate', icon: FileText
                  }
                  const Icon = style.icon
                  const isPOReceipt = !!m.po_number && m.movement_type === 'IN'

                  return (
                    <tr key={m.id} className="table-row-hover group">
                      <td>
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4 text-slate-300" />
                          <div>
                            <p className="text-xs font-black text-navy-900 tabular-nums leading-none mb-1">
                              {new Date(m.moved_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>
                            <p className="text-[10px] font-bold text-tertiary tabular-nums">
                              {new Date(m.moved_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="flex flex-col gap-1.5">
                          <span className={`badge ${style.cls} !px-2.5 !py-0.5 inline-flex items-center gap-1.5`}>
                            <Icon size={12} />
                            {style.label}
                          </span>
                          {isPOReceipt && (
                            <span className="badge badge-success !bg-emerald-600 !text-white !px-2 !py-0.5 !text-[8px] font-black w-fit">
                              PO RECEIPT
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        <p className="font-black text-navy-900 font-mono tracking-tighter leading-none mb-1.5">{m.part_number}</p>
                        <p className="label-caps !text-[9px] truncate max-w-[150px]">
                          {m.part_table_name?.replace(/_/g, ' ')}
                        </p>
                      </td>

                      <td className="text-right">
                        <p className={`text-lg font-black tabular-nums italic ${m.quantity > 0 ? 'text-emerald-600' : 'text-orange-600'}`}>
                          {m.quantity > 0 ? '+' : ''}{m.quantity}
                        </p>
                        <p className="font-mono text-[9px] font-black text-tertiary opacity-40">
                          {m.stock_before} → {m.stock_after}
                        </p>
                      </td>

                      <td>
                        <div className="flex flex-col gap-1.5">
                          {m.po_number ? (
                            <div className="badge badge-navy !px-2 !py-0.5 !text-[9px] font-black w-fit flex items-center gap-1">
                              <ShoppingCart size={10} />
                              PO-{m.po_number}
                            </div>
                          ) : null}
                          {m.project_name ? (
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-secondary">
                              <Briefcase size={12} className="text-slate-300" />
                              {m.project_name}
                            </div>
                          ) : null}
                          {m.supplier_name ? (
                            <div className="flex items-center gap-1.5 text-[11px] font-bold text-secondary">
                              <Factory size={12} className="text-slate-300" />
                              {m.supplier_name}
                            </div>
                          ) : null}
                          {!m.po_number && !m.project_name && !m.supplier_name && (
                            <p className="text-xs text-secondary italic opacity-60">"{m.reference_notes || 'No meta reference'}"</p>
                          )}
                        </div>
                      </td>

                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center font-black text-navy-400 group-hover:bg-navy-900 group-hover:text-white group-hover:border-navy-900 transition-all">
                            {(m.moved_by || 'S').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-black text-navy-900 leading-none mb-1">
                              {(m.moved_by || 'System').split('@')[0]}
                            </p>
                            <p className="label-caps !text-[9px]">Verified Admin</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <StockMovementModal isOpen={adjustModalOpen} onClose={() => setAdjustModalOpen(false)} />
      <POReceiveModal     isOpen={receiveModalOpen} onClose={() => setReceiveModalOpen(false)} />
    </div>
  )
}
