import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { partsApi, PartCategory } from '@/api/parts'
import { useToast } from '@/context/ToastContext'
import { 
  Search, Plus, FileDown, MoreHorizontal, FileText, Image as ImageIcon, 
  Trash2, Edit, Package, Upload, History, LayoutGrid, List, Filter, ChevronRight
} from 'lucide-react'
import PartFormModal from '@/components/parts/PartFormModal'
import PartImportModal from '@/components/parts/PartImportModal'
import PriceHistoryModal from '@/components/parts/PriceHistoryModal'
import AdvancedFilterBar from '@/components/ui/AdvancedFilterBar'
import PartDetailModal from '@/components/parts/PartDetailModal'

const TABS: { id: PartCategory; name: string }[] = [
  { id: 'electrical_bought_out', name: 'Elec Bought-Out' },
  { id: 'mechanical_manufacture', name: 'Mech Manufacture' },
  { id: 'mechanical_bought_out', name: 'Mech Bought-Out' },
  { id: 'electrical_manufacture', name: 'Elec Manufacture' },
  { id: 'pneumatic_bought_out', name: 'Pneumatic' },
]

const Parts = () => {
  const { error: showToastError } = useToast()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<PartCategory>('mechanical_manufacture')
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [partToEdit, setPartToEdit] = useState<any | null>(null)
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [detailModal, setDetailModal] = useState<{ id: number; category: PartCategory } | null>(null)
  
  const [historyModal, setHistoryModal] = useState<{
    isOpen: boolean;
    partId: number;
    partNumber: string;
    category: PartCategory;
  } | null>(null);

  useEffect(() => {
    document.title = 'Parts Master Registry | BEP BOM Manager';
  }, []);

  const { data: parts, isLoading } = useQuery({
    queryKey: ['parts', activeTab],
    queryFn: () => partsApi.getParts(activeTab),
  })

  const handleAddPart = () => {
    setPartToEdit(null)
    setIsModalOpen(true)
  }

  const handleEditPart = (part: any) => {
    setPartToEdit(part)
    setIsModalOpen(true)
  }

  const handleShowHistory = (part: any) => {
    setHistoryModal({
      isOpen: true,
      partId: part.id,
      partNumber: part.part_number,
      category: activeTab
    });
  }

  const uniqueSuppliers = Array.from(new Set((parts || []).map((p: any) => p.suppliers?.name).filter(Boolean))).sort()

  const filteredParts = (parts || []).filter((p: any) => {
    const matchesSearch = 
      p.part_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.manufacturer_part_number?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesSupplier = selectedSupplier === '' || p.suppliers?.name === selectedSupplier

    return matchesSearch && matchesSupplier
  })

  const getStockBadgeCls = (stock: number, min: number) => {
    if (stock <= 0) return 'badge-danger'
    if (stock <= min) return 'badge-amber'
    return 'badge-success'
  }

  const isManufacture = activeTab.includes('manufacture')

  const renderSkeletons = () => {
    if (viewMode === 'grid') {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
          {[1, 2, 3, 4, 5, 6].map(n => (
            <div key={n} className="card min-h-[400px]">
              <div className="skeleton aspect-square rounded-t-[2.5rem] w-full" />
              <div className="p-8 space-y-4">
                <div className="skeleton h-6 w-3/4 rounded-lg" />
                <div className="skeleton h-4 w-full rounded-lg" />
                <div className="skeleton h-4 w-1/2 rounded-lg" />
                <div className="pt-4 border-t border-slate-100 flex justify-between">
                  <div className="skeleton h-10 w-24 rounded-lg" />
                  <div className="skeleton h-4 w-12 rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )
    }
    return (
      <div className="card overflow-hidden">
        <div className="p-6 space-y-4">
          {[1, 2, 3, 4, 5].map(n => (
            <div key={n} className="skeleton h-14 w-full rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="page-container py-8 page-enter">
      {/* Header */}
      <header className="page-header">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-navy-900 rounded-2xl flex items-center justify-center shadow-lg shadow-navy-900/10">
            <Package className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="page-title">Parts Master Registry</h1>
            <p className="text-sm text-tertiary font-mono italic">Operational Inventory Hub</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-tertiary" />
            <input
              type="text"
              placeholder="Search by part #, ID, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input w-full pl-11"
              aria-label="Search assets"
            />
          </div>

          <button 
            onClick={() => setIsImportModalOpen(true)}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            IMPORT
          </button>
          
          <button 
            onClick={handleAddPart}
            className="btn btn-primary flex items-center gap-2 shadow-lg shadow-navy-900/10"
          >
            <Plus className="h-4 w-4" />
            NEW ASSET
          </button>
        </div>
      </header>

      {/* Category Tabs */}
      <div className="tab-bar mb-4 flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
          >
            {tab.name}
          </button>
        ))}
      </div>

      <AdvancedFilterBar onFilterChange={(filters) => console.log('Parts Filter', filters)} />

      {/* Toolbar */}
      <div className="section-card p-4 flex flex-col lg:flex-row items-center gap-4 mb-8">
        <div className="flex-1 w-full lg:w-64">
          <select
            className="input font-black uppercase tracking-widest text-[10px]"
            value={selectedSupplier}
            onChange={(e) => setSelectedSupplier(e.target.value)}
            aria-label="Filter by supply partner"
          >
            <option value="">All Supply Partners</option>
            {uniqueSuppliers.map(s => (
              <option key={String(s)} value={String(s)}>{s as string}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 ml-auto shrink-0">
          <button
            onClick={() => setViewMode('grid')}
            className={`btn btn-icon btn-sm transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm border-white' : 'btn-ghost'}`}
            title="Grid View"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`btn btn-icon btn-sm transition-all ${viewMode === 'table' ? 'bg-white shadow-sm border-white' : 'btn-ghost'}`}
            title="Table View"
          >
            <List size={15} />
          </button>
        </div>
      </div>

      {/* Assets Display */}
      <div className="flex-1">
        {isLoading ? renderSkeletons() : filteredParts.length === 0 ? (
          <div className="empty-state py-24">
            <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mb-6 border border-slate-100 shadow-inner">
              <Package size={40} className="text-tertiary" />
            </div>
            <h3 className="section-title mb-2">No matching assets found</h3>
            <p className="text-secondary mb-8 max-w-sm">
              Adjust your search term or category filters to locate your parts.
            </p>
            <button 
              onClick={() => {setSearchTerm(''); setSelectedSupplier('')}}
              className="btn btn-secondary"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8">
                {filteredParts.map((part: any) => {
                  const stockCls = getStockBadgeCls(part.stock_quantity, part.min_stock_level || 0);
                  return (
                    <div
                      key={part.id}
                      onClick={() => setDetailModal({ id: part.id, category: activeTab })}
                      className="card group hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300 overflow-hidden flex flex-col cursor-pointer border-b-4 hover:border-navy-500"
                    >
                      {/* Card Preview */}
                      <div className="aspect-square bg-slate-50 relative flex items-center justify-center border-b border-slate-100 p-4 overflow-hidden">
                        {part.image_path ? (
                          <img
                            src={part.image_path}
                            alt={part.part_number}
                            className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-700"
                          />
                        ) : (
                          <Package className="w-24 h-24 text-slate-200 group-hover:scale-110 transition-transform duration-700" />
                        )}
                        
                        <div className={`absolute top-4 right-4 badge ${stockCls} shadow-sm !px-3 !py-1 tracking-tighter`}>
                          {part.stock_quantity <= 0 ? 'Out of Stock' : part.stock_quantity <= (part.min_stock_level || 0) ? 'Low Stock' : 'In Stock'}
                        </div>
  
                        <div className="absolute top-4 left-4 badge badge-slate !bg-white/90 backdrop-blur-sm !px-2.5 !py-1 !text-[9px] font-black border-slate-200">
                          {isManufacture ? 'CUSTOM' : 'SOURCED'}
                        </div>
                      </div>
        
                      {/* Body */}
                      <div className="p-7 flex-1 flex flex-col">
                        <div className="flex-1">
                          <div className="flex justify-between items-start gap-3 mb-1">
                             <div className="text-lg font-black text-navy-900 tracking-tight font-mono line-clamp-1 group-hover:text-amber-600 transition-colors">
                                {part.manufacturer_part_number || part.part_number}
                             </div>
                             <button 
                                  onClick={(e) => { e.stopPropagation(); handleShowHistory(part); }}
                                  className="p-2 btn-ghost text-tertiary hover:text-emerald-500 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              >
                                  <History className="w-4 h-4" />
                              </button>
                          </div>
                          
                          {part.manufacturer_part_number && (
                            <div className="mb-4">
                              <span className="font-mono text-[9px] font-black tracking-tighter text-tertiary bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                INT-ID: {part.part_number}
                              </span>
                            </div>
                          )}

                          <p className="text-xs text-secondary font-medium line-clamp-2 leading-relaxed mb-6 italic min-h-[2.5rem]">
                            {part.description || 'Missing technical specification metadata...'}
                          </p>
                          
                          {part.suppliers?.name && (
                             <div className="flex items-center gap-2 mb-6 bg-slate-50/50 p-2 rounded-xl border border-slate-100">
                                <div className="w-5 h-5 bg-navy-900 rounded-md flex items-center justify-center text-[9px] font-black text-white">{part.suppliers.name.charAt(0)}</div>
                                <span className="label-caps !text-[9px] truncate">{part.suppliers.name}</span>
                             </div>
                          )}
                        </div>
        
                        <div className="pt-5 border-t border-slate-100 flex justify-between items-end">
                          <div>
                            <div className="label-caps !text-[9px] mb-1">Unit Valuation</div>
                            <div className="text-2xl font-black text-navy-900 tabular-nums tracking-tighter italic">
                               <span className="text-xs font-black mr-1 not-italic text-tertiary">₹</span>
                               {part.base_price?.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                            </div>
                          </div>
                          
                          <div className="flex gap-1.5 mb-2">
                             {part.pdf_path && <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse shadow-sm" title="Datasheet Connected" />}
                             {part.cad_file_url && <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse shadow-sm" title="CAD/3D Component Connected" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="card shadow-sm overflow-hidden">
                <table className="data-table-modern">
                    <thead>
                        <tr>
                            <th>Asset Identity</th>
                            <th>Valuation</th>
                            <th>Registry Status</th>
                            <th>Technical Data</th>
                            <th className="w-28" />
                        </tr>
                    </thead>
                    <tbody>
                        {filteredParts.map((part: any) => (
                            <tr key={part.id} className="table-row-hover group" onClick={() => setDetailModal({ id: part.id, category: activeTab })}>
                                <td>
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-white border border-slate-100 rounded-xl flex items-center justify-center shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                                            {part.image_path ? <img src={part.image_path} className="w-9 h-9 object-contain p-1" /> : <Package className="w-6 h-6 text-slate-200" />}
                                        </div>
                                        <div>
                                            <p className="font-black text-navy-900 tracking-tight font-mono leading-none group-hover:text-amber-600 transition-colors">
                                                {part.manufacturer_part_number || part.part_number}
                                            </p>
                                            {part.manufacturer_part_number && (
                                                <p className="font-mono text-[9px] font-black text-tertiary opacity-60 mt-1">INT-ID: {part.part_number}</p>
                                            )}
                                            <p className="text-[10px] text-tertiary font-bold line-clamp-1 mt-1.5 max-w-[300px]">"{part.description || 'No meta-description available'}"</p>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <p className="text-lg font-black text-navy-900 tabular-nums tracking-tighter italic">₹ {part.base_price?.toLocaleString('en-IN', { minimumFractionDigits: 1 })}</p>
                                    <p className="label-caps !text-[9px] !text-tertiary mt-1">{part.currency}</p>
                                </td>
                                <td>
                                    <div className="flex items-center gap-3">
                                        <div className={`badge ${getStockBadgeCls(part.stock_quantity, part.min_stock_level || 0)} !px-3 font-mono`}>
                                            {part.stock_quantity}
                                        </div>
                                        <span className="font-mono text-[9px] font-black text-tertiary opacity-40">/ {part.min_stock_level || 0}</span>
                                    </div>
                                </td>
                                <td>
                                    <div className="flex items-center gap-3">
                                        {part.pdf_path && <FileText size={14} className="text-red-400" />}
                                        {part.cad_file_url && <Package size={14} className="text-blue-400" />}
                                        {part.manufacturer && <span className="label-caps !text-[9px] truncate max-w-[120px]">{part.manufacturer}</span>}
                                    </div>
                                </td>
                                <td>
                                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all scale-95 group-hover:scale-100">
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleShowHistory(part); }}
                                            className="btn btn-icon btn-sm btn-ghost hover:text-emerald-500"
                                            title="View Price Audit"
                                        >
                                            <History className="h-4 w-4" />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleEditPart(part); }}
                                            className="btn btn-icon btn-sm btn-ghost"
                                            title="Edit Asset"
                                        >
                                            <Edit className="h-4 w-4" />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); }}
                                            className="btn btn-icon btn-sm btn-ghost"
                                        >
                                            <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <PartFormModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        activeTab={activeTab}
        partToEdit={partToEdit}
      />
      
      <PartImportModal 
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        activeTab={activeTab}
      />

      {detailModal && (
        <PartDetailModal
            isOpen={true}
            onClose={() => setDetailModal(null)}
            onEdit={handleEditPart}
            part={parts?.find((p: any) => p.id === detailModal.id)}
            category={detailModal.category}
        />
      )}
      
      {historyModal && (
        <PriceHistoryModal
          isOpen={historyModal.isOpen}
          onClose={() => setHistoryModal(null)}
          partTable={historyModal.category}
          partId={historyModal.partId}
          partNumber={historyModal.partNumber}
        />
      )}
    </div>
  )
}

export default Parts
