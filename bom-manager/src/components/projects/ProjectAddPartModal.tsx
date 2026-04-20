import { useState, useEffect } from 'react'
import { Plus, X, Package, Search, Info, TrendingDown, DollarSign } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { partsApi, PartCategory } from '@/api/parts'
import { projectsApi } from '@/api/projects'
import { SearchableSelect } from '../ui/SearchableSelect'

interface ProjectAddPartModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: number
  sectionId: number
  sectionName: string
}

export const ProjectAddPartModal = ({ isOpen, onClose, projectId, sectionId, sectionName }: ProjectAddPartModalProps) => {
  const queryClient = useQueryClient()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedPartStr, setSelectedPartStr] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unitPrice, setUnitPrice] = useState<number>(0)
  const [currency, setCurrency] = useState('INR')
  const [discountPercent, setDiscountPercent] = useState<number>(0)
  const [referenceDesignator, setReferenceDesignator] = useState('')
  const [notes, setNotes] = useState('')
  const [siteName, setSiteName] = useState('Main Site')
  
  // For UI context
  const [selectedPartData, setSelectedPartData] = useState<any>(null)

  const categories: PartCategory[] = [
    'mechanical_manufacture',
    'mechanical_bought_out',
    'electrical_manufacture',
    'electrical_bought_out',
    'pneumatic_bought_out'
  ]

  const { data: allPartsData, isLoading } = useQuery({
    queryKey: ['allParts'],
    queryFn: async () => {
      const results = await Promise.all(
        categories.map(async (category) => {
          const parts = await partsApi.getParts(category)
          return { category, parts: parts || [] }
        })
      )
      return results
    },
    enabled: isOpen
  })

  // Handle selected part change to auto-fill snapshots
  useEffect(() => {
    if (selectedPartStr && allPartsData) {
      const [catStr, idStr] = selectedPartStr.split('::')
      const catParts = (allPartsData.find(d => d.category === catStr)?.parts as any[]) || []
      const part = catParts.find((p: any) => p.id === parseInt(idStr))
      
      if (part) {
        setSelectedPartData(part)
        setUnitPrice(part.base_price || 0)
        setDiscountPercent(part.discount_percent || 0)
        if (part.currency) setCurrency(part.currency)
      }
    } else {
      setSelectedPartData(null)
    }
  }, [selectedPartStr, allPartsData])

  useEffect(() => {
    if (isOpen) {
      setSelectedPartStr('')
      setQuantity(1)
      setUnitPrice(0)
      setCurrency('INR')
      setDiscountPercent(0)
      setReferenceDesignator('')
      setNotes('')
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPartStr || !selectedPartData) return

    setIsSubmitting(true)
    try {
      const [category, idStr] = selectedPartStr.split('::')
      const partId = parseInt(idStr)

      // Payload strictly follows the new V3 schema
      const payload = {
        project_section_id: sectionId,
        part_type: category,
        part_id: partId,
        quantity,
        unit_price: unitPrice,
        currency,
        discount_percent: discountPercent,
        reference_designator: referenceDesignator || null,
        notes: notes || null
      }

      await projectsApi.addPartToSection(payload)
      
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      onClose()
    } catch (error: any) {
      console.error('Error adding part:', error)
      alert(`Failed: ${error.message || JSON.stringify(error)}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatCategoryLabel = (cat: string) => {
    return cat.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block w-full max-w-2xl px-8 pt-8 pb-8 overflow-hidden text-left align-middle transition-all transform bg-white rounded-[2.5rem] shadow-2xl">
          <div className="flex justify-between items-start mb-8">
            <div>
               <h3 className="text-2xl font-black text-gray-900 tracking-tight">Add Item to BOM</h3>
               <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mt-1">Subsection: {sectionName}</p>
            </div>
            <button onClick={onClose} className="text-gray-300 hover:text-gray-900 p-2 rounded-2xl hover:bg-gray-50 transition-all">
              <X className="w-6 h-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="p-1.5 bg-gray-50 rounded-[2rem] border border-gray-100 mb-2">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-4 mb-2">Select Master Part</label>
              {isLoading ? (
                <div className="px-4 py-3 flex items-center gap-3">
                   <div className="w-4 h-4 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
                   <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Hydrating Catalog...</span>
                </div>
              ) : (
                <div className="relative group">
                  <Package className="w-5 h-5 absolute left-4 top-4 text-gray-300 group-focus-within:text-gray-900 transition-colors" />
                  <SearchableSelect
                    placeholder="-- SEARCH CATALOG --"
                    value={selectedPartStr}
                    onChange={(val) => setSelectedPartStr(val)}
                    options={allPartsData?.flatMap(group => 
                      group.parts.map((p: any) => ({
                        value: `${group.category}::${p.id}`,
                        label: p.manufacturer_part_number || p.part_number,
                        subLabel: `${p.part_number} · ${p.description || 'No Description'} (Stock: ${p.stock_quantity || 0})`,
                        group: formatCategoryLabel(group.category)
                      }))
                    ) || []}
                  />
                </div>
              )}
            </div>

            {selectedPartData && (
               <div className="bg-emerald-50/50 border border-emerald-100 rounded-3xl p-5 flex items-start gap-4">
                  <div className="bg-emerald-600 p-2 rounded-xl text-white shadow-lg shadow-emerald-200">
                    <Info className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-emerald-800 uppercase tracking-[0.1em]">Price Snapshot Active</h4>
                    <p className="text-xs text-emerald-600 font-medium mt-1">
                       The BOM will freeze the current price of <strong>{unitPrice} {currency}</strong> from <strong>{selectedPartData.suppliers?.name || 'Master Repository'}</strong>. 
                       Future master price changes won't affect this Project BOM.
                    </p>
                  </div>
               </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="p-4 bg-gray-50/50 rounded-3xl border border-gray-100">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Quantity Selection</label>
                <div className="relative">
                   <Package className="w-4 h-4 absolute left-4 top-3.5 text-gray-300 pointer-events-none" />
                   <input
                    type="number"
                    required
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value))}
                    className="block w-full bg-white border border-gray-100 rounded-2xl py-3 pl-11 pr-4 text-sm font-bold tabular-nums outline-none focus:ring-2 focus:ring-gray-100 transition-all"
                    placeholder="Qty"
                  />
                </div>
              </div>
              
              <div className="p-4 bg-gray-50/50 rounded-3xl border border-gray-100">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Snapshot Price</label>
                <div className="relative">
                   <DollarSign className="w-4 h-4 absolute left-4 top-3.5 text-gray-300 pointer-events-none" />
                   <input
                    type="number"
                    step="0.01"
                    required
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(parseFloat(e.target.value))}
                    className="block w-full bg-white border border-gray-100 rounded-2xl py-3 pl-11 pr-4 text-sm font-bold tabular-nums outline-none focus:ring-2 focus:ring-gray-100 transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="p-4 bg-gray-50/50 rounded-3xl border border-gray-100">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Currency</label>
                <select
                  required
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="block w-full bg-white border border-gray-100 rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-gray-100 transition-all"
                >
                  <option value="INR">Indian Rupee (₹)</option>
                  <option value="EUR">Euro (€)</option>
                  <option value="USD">US Dollar ($)</option>
                  <option value="GBP">British Pound (£)</option>
                </select>
              </div>

              <div className="p-4 bg-gray-50/50 rounded-3xl border border-gray-100">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Snapshot Discount (%)</label>
                <div className="relative">
                   <TrendingDown className="w-4 h-4 absolute left-4 top-3.5 text-gray-300 pointer-events-none" />
                   <input
                    type="number"
                    step="0.1"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(parseFloat(e.target.value))}
                    className="block w-full bg-white border border-gray-100 rounded-2xl py-3 pl-11 pr-4 text-sm font-bold tabular-nums outline-none focus:ring-2 focus:ring-gray-100 transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="p-4 bg-gray-50/50 rounded-3xl border border-gray-100">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Designators</label>
                <input
                  type="text"
                  placeholder="e.g., R1, C2"
                  value={referenceDesignator}
                  onChange={(e) => setReferenceDesignator(e.target.value)}
                  className="block w-full bg-white border border-gray-100 rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-gray-100 transition-all"
                />
              </div>

              <div className="p-4 bg-gray-50/50 rounded-3xl border border-gray-100">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Target Site</label>
                <select
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  className="block w-full bg-white border border-gray-100 rounded-2xl py-3 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-gray-100 transition-all"
                >
                  <option value="Main Site">Main Site</option>
                  <option value="Client Site">Client Site</option>
                  <option value="Assembly Site">Assembly Site</option>
                </select>
              </div>
            </div>

            <div className="p-4 bg-gray-50/50 rounded-3xl border border-gray-100">
               <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Item Notes</label>
               <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Internal assembly or sourcing notes..."
                className="block w-full bg-white border border-gray-100 rounded-2xl py-3 px-4 text-sm font-medium outline-none focus:ring-2 focus:ring-gray-100 transition-all"
              />
            </div>

            <div className="pt-6 flex justify-end gap-4 border-t border-gray-50">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3.5 text-xs font-black text-gray-400 uppercase tracking-widest hover:text-gray-900 transition-all"
              >
                Discard
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !selectedPartStr}
                className="inline-flex items-center px-10 py-3.5 text-xs font-black text-white bg-gray-900 rounded-2xl shadow-xl shadow-gray-200 hover:bg-gray-800 focus:outline-none transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest"
              >
                {isSubmitting ? 'Assigned...' : 'Add to Section'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default ProjectAddPartModal
