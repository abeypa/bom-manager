import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { suppliersApi, Supplier } from '@/api/suppliers'
import { Search, Plus, Edit, Trash2, Users, Mail, Phone, MapPin, Factory, ChevronRight } from 'lucide-react'
import SupplierFormModal from '@/components/suppliers/SupplierFormModal'
import { useRole } from '@/hooks/useRole'

const Suppliers = () => {
  const { isAdmin } = useRole()
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [supplierToEdit, setSupplierToEdit] = useState<Supplier | null>(null)

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => suppliersApi.getSuppliers()
  })

  useEffect(() => {
    document.title = 'Partners | BOM Manager'
  }, [])

  const deleteMutation = useMutation({
    mutationFn: (id: number) => suppliersApi.deleteSupplier(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
    }
  })

  const filteredSuppliers = (suppliers || []).filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.contact_person?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleAddSupplier = () => {
    setSupplierToEdit(null)
    setIsModalOpen(true)
  }

  const handleEditSupplier = (supplier: Supplier) => {
    setSupplierToEdit(supplier)
    setIsModalOpen(true)
  }

  const handleDelete = (id: number) => {
    if (window.confirm('Are you sure you want to decommission this supply partner record? Parts linked to this entity will remain in registry.')) {
      deleteMutation.mutate(id)
    }
  }

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
            <Factory className="h-3.5 w-3.5 text-navy-500" />
            Supply Chain Ecosystem
          </p>
          <h1 className="page-title">Vendor Directory</h1>
        </div>
        <div>
          <button 
            onClick={handleAddSupplier}
            className="btn btn-primary btn-lg shadow-lg shadow-navy-900/10"
          >
            <Plus className="h-5 w-5" />
            REGISTER PARTNER
          </button>
        </div>
      </header>

      {/* Toolbar */}
      <div className="section-card p-4 mb-8">
        <div className="relative w-full">
           <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-tertiary" />
           <label htmlFor="partner-search" className="sr-only">Search partners</label>
           <input
             id="partner-search"
             type="text"
             className="input pl-11"
             placeholder="Search partners by company name, contact person or email ID…"
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
           />
        </div>
      </div>

      {/* Main Panel */}
      <div className="flex-1">
        {isLoading ? renderSkeletons() : filteredSuppliers.length === 0 ? (
          <div className="empty-state py-24">
            <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mb-6 border border-slate-100 shadow-inner">
              <Users size={40} className="text-tertiary" />
            </div>
            <h3 className="section-title mb-2">No vendor entities detected</h3>
            <p className="text-secondary mb-8 max-w-sm text-center">
              Your network database is currently empty. Start by initializing your first supply partner record.
            </p>
            <button
               onClick={handleAddSupplier}
               className="btn btn-secondary"
            >
               Register New Partner
            </button>
          </div>
        ) : (
          <div className="card shadow-sm overflow-hidden">
             <table className="data-table-modern">
               <thead>
                 <tr>
                   <th className="w-1/3">Corporate Identity</th>
                   <th>Liaison Details</th>
                   <th>Procurement Terms</th>
                   <th className="w-24 text-right" />
                 </tr>
               </thead>
               <tbody>
                 {filteredSuppliers.map((supplier) => (
                   <tr key={supplier.id} className="table-row-hover group">
                     <td>
                       <div className="flex flex-col">
                         <span className="text-base font-black text-navy-900 group-hover:text-amber-600 transition-colors uppercase tracking-tight leading-none mb-1.5">{supplier.name}</span>
                         {supplier.address && (
                           <div className="flex items-center text-[10px] font-bold text-tertiary opacity-70">
                             <MapPin size={10} className="mr-1" />
                             <span className="line-clamp-1">{supplier.address}</span>
                           </div>
                         )}
                       </div>
                     </td>
                     <td>
                       <div className="flex flex-col gap-1">
                         <span className="text-xs font-black text-navy-800 uppercase tracking-tighter leading-none">{supplier.contact_person || 'No Liaison Assigned'}</span>
                         <div className="flex items-center gap-3">
                            {supplier.email && (
                              <div className="flex items-center text-[10px] font-bold text-tertiary">
                                <Mail size={10} className="mr-1" /> {supplier.email}
                              </div>
                            )}
                            {supplier.phone && (
                              <div className="flex items-center text-[10px] font-bold text-tertiary">
                                <Phone size={10} className="mr-1" /> {supplier.phone}
                              </div>
                            )}
                         </div>
                       </div>
                     </td>
                     <td>
                        <span className="badge badge-slate !px-3 !py-1 !text-[10px] font-mono font-black">{supplier.payment_terms || 'NET 30 (Default)'}</span>
                     </td>
                     <td className="text-right">
                       <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-1 group-hover:translate-x-0 scale-95 group-hover:scale-100">
                         <button 
                           onClick={() => handleEditSupplier(supplier)}
                           className="btn btn-icon btn-sm btn-ghost hover:text-navy-600"
                           title="Maintain Record"
                         >
                           <Edit size={14} />
                         </button>
                         {isAdmin && (
                           <button 
                             onClick={() => handleDelete(supplier.id)}
                             disabled={deleteMutation.isPending}
                             className="btn btn-icon btn-sm btn-ghost hover:text-red-500"
                             title="Decommission Partner"
                           >
                             <Trash2 size={14} />
                           </button>
                         )}
                       </div>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
          </div>
        )}
      </div>

      <SupplierFormModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        supplierToEdit={supplierToEdit}
      />
    </div>
  )
}

export default Suppliers
