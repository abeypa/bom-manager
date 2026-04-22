import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, CheckCircle2, ShoppingCart, Info, DollarSign, Calendar, FileText, Package } from 'lucide-react'
import { suppliersApi } from '@/api/suppliers'
import { purchaseOrdersApi } from '@/api/purchase-orders'
import { usePOBasketStore } from '@/store/usePOBasketStore'
import { useToast } from '@/context/ToastContext'

interface Props {
  isOpen: boolean
  onClose: () => void
  projectId: number
  items: any[]
}

const CreatePOFromBOMModal = ({ isOpen, onClose, projectId, items }: Props) => {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const { clearBasket } = usePOBasketStore()
  const [supplierId, setSupplierId] = useState<string>('')
  const [currency, setCurrency] = useState<string>('INR')
  const [notes, setNotes] = useState('')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>('')
  const [bepPoPdfUrl, setBepPoPdfUrl] = useState<string>('')

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => suppliersApi.getSuppliers()
  })

  const selectedParts = useMemo(() => {
    return items.map(p => ({
      ...p,
      tableName: p.part_type,
      catalogItem: p.part_ref || { part_number: p.part_number, description: p.description },
      finalUnitPrice: p.unit_price || 0,
      finalCurrency: p.currency || 'INR',
      finalDiscount: p.discount_percent || 0,
    }))
  }, [items])

  const totalAmount = useMemo(() => {
    return selectedParts.reduce((acc, p) => {
      return acc + (p.quantity * p.finalUnitPrice * (1 - (p.finalDiscount / 100)))
    }, 0)
  }, [selectedParts])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!supplierId) throw new Error('Please select a supplier')

      const poData = {
        project_id: projectId,
        supplier_id: parseInt(supplierId),
        po_number: `PO-${Date.now().toString().slice(-8)}`,
        po_date: new Date().toISOString(),
        currency: currency,
        grand_total: totalAmount,
        total_items: selectedParts.length,
        total_quantity: selectedParts.reduce((acc, p) => acc + (p.quantity || 0), 0),
        status: bepPoPdfUrl ? 'Released' : 'Draft',
        expected_delivery_date: expectedDeliveryDate || null,
        bep_po_pdf_url: bepPoPdfUrl || null,
        notes: notes,
        terms: 'Locked BOM Snapshot Pricing applied.',
        created_date: new Date().toISOString()
      }

      const items = selectedParts.map(p => ({
        purchase_order_id: 0, 
        part_type: p.tableName,
        part_number: p.catalogItem?.part_number || 'N/A',
        description: p.catalogItem?.description || '',
        quantity: p.quantity,
        unit_price: p.finalUnitPrice,
        discount_percent: p.finalDiscount,
        total_amount: p.quantity * p.finalUnitPrice * (1 - (p.finalDiscount / 100)),
        part_id: p.part_id,
        project_part_id: p.id
      }))

      return (purchaseOrdersApi as any).createPurchaseOrderWithItems(poData as any, items)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bom-tree', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['project-pos', projectId] })
      queryClient.invalidateQueries({ queryKey: ['po-line-items', projectId] })
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      
      clearBasket()
      showToast('success', bepPoPdfUrl ? 'Purchase Order Released' : 'Draft PO Created Successfully')
      onClose()
    },
    onError: (error: any) => {
      alert(`Failed to create PO: ${error.message}`)
    }
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
        
        <div className="inline-block w-full max-w-2xl px-10 pt-10 pb-10 overflow-hidden text-left align-middle transition-all transform bg-white shadow-2xl rounded-[3rem]">
          <div className="flex justify-between items-start mb-8">
             <div>
                <h3 className="text-3xl font-black text-gray-900 tracking-tight italic">Procure from BOM</h3>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">Staging Draft Purchase Order</p>
             </div>
             <button onClick={onClose} className="p-2.5 bg-gray-50 rounded-2xl text-gray-400 hover:text-gray-900 transition-all">
                <X className="h-6 w-6" />
             </button>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-8">
             <div className="bg-gray-50/50 p-5 rounded-3xl border border-gray-100 flex flex-col items-center justify-center text-center">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Items</p>
                <div className="flex items-center gap-2 text-gray-900 font-black">
                   <Package className="w-4 h-4 text-gray-300" />
                   <p className="text-2xl tabular-nums">{selectedParts.length}</p>
                </div>
             </div>
             <div className="bg-gray-900 p-5 rounded-3xl shadow-xl shadow-gray-200 flex flex-col items-center justify-center text-center">
                <p className="text-[10px] font-black text-gray-400/50 uppercase tracking-widest mb-1 leading-none">PO Value</p>
                <div className="flex items-center gap-2 text-white font-black">
                   <DollarSign className="w-4 h-4 text-gray-500" />
                   <p className="text-2xl tabular-nums">{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 1 })}</p>
                </div>
             </div>
             <div className="bg-gray-50/50 p-5 rounded-3xl border border-gray-100 flex flex-col items-center justify-center text-center">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Currency</p>
                <div className="px-3 py-1 bg-white rounded-xl border border-gray-100 text-sm font-black text-gray-900">{currency}</div>
             </div>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
               <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Target Supplier</label>
                  <select 
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-gray-900 outline-none transition-all appearance-none cursor-pointer"
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                  >
                    <option value="">-- SELECT PARTNER --</option>
                    {suppliers?.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
               </div>

               <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Expected Delivery</label>
                  <div className="relative">
                    <Calendar className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="date"
                      value={expectedDeliveryDate}
                      onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-14 pr-6 py-4 text-sm font-bold focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                    />
                  </div>
               </div>
            </div>

            <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">BEP PO PDF URL (Required to Release)</label>
                <div className="relative">
                  <FileText className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={bepPoPdfUrl}
                    onChange={(e) => setBepPoPdfUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-14 py-4 text-[10px] font-black focus:ring-2 focus:ring-gray-900 outline-none transition-all"
                  />
                </div>
            </div>

            <div className="space-y-3">
               <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">BOM Item Preview</label>
               <div className="max-h-48 overflow-y-auto pr-3 space-y-2 custom-scrollbar">
                  {selectedParts.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-gray-50/30 rounded-2xl border border-gray-100 hover:bg-white hover:border-gray-900 transition-all group">
                       <div className="flex items-center space-x-4">
                          <div className="w-10 h-10 bg-white border border-gray-100 rounded-xl flex items-center justify-center text-[10px] font-black text-gray-300 group-hover:text-gray-900 transition-colors">
                            {idx + 1}
                          </div>
                          <div className="min-w-0 text-left">
                            <p className="text-sm font-black text-gray-900 truncate tracking-tight">{p.catalogItem?.part_number}</p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest truncate max-w-[250px]">{p.description || 'N/A'}</p>
                          </div>
                       </div>
                       <div className="text-right">
                          <p className="text-xs font-black text-gray-900 tabular-nums">x{p.quantity}</p>
                          <div className="flex items-center gap-1.5 text-[10px] justify-end">
                             <span className="font-bold text-gray-400 tabular-nums tracking-tight">{currency}</span>
                             <span className="font-black text-gray-900 tabular-nums">{(p.finalUnitPrice * (1 - (p.finalDiscount / 100))).toFixed(1)}</span>
                          </div>
                       </div>
                    </div>
                  ))}
               </div>
            </div>

            <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4">Internal Procurement Notes</label>
                <textarea 
                  className="w-full bg-gray-50 border border-gray-200 rounded-3xl px-6 py-4 text-xs font-medium focus:ring-2 focus:ring-gray-900 outline-none transition-all min-h-[80px] resize-none"
                  placeholder="Terms, shipping instructions..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
            </div>

            <div className="flex gap-4 pt-4">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-4 text-xs font-black text-gray-400 hover:text-gray-900 uppercase tracking-[0.2em] transition-all"
              >
                Discard
              </button>
              <button
                disabled={mutation.isPending || !supplierId}
                onClick={() => mutation.mutate()}
                className="flex-[2] inline-flex items-center justify-center px-4 py-4 border border-transparent shadow-[0_20px_50px_rgba(31,41,55,0.1)] text-xs font-black rounded-[1.5rem] text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50 transition-all active:scale-95 uppercase tracking-[0.2em]"
              >
                {mutation.isPending ? 'Staging...' : (
                  <>
                    <ShoppingCart className="w-5 h-5 mr-3" />
                    {bepPoPdfUrl ? 'Process PO Release' : 'Create Draft PO'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CreatePOFromBOMModal
