import { useState, useEffect } from 'react'
import { X, Save, AlertTriangle, Info, TrendingDown, DollarSign } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { projectsApi } from '@/api/projects'

interface ProjectEditPartModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: number
  projectPart: any
}

export const ProjectEditPartModal = ({ isOpen, onClose, projectId, projectPart }: ProjectEditPartModalProps) => {
  const queryClient = useQueryClient()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    quantity: 1,
    unit_price: 0,
    currency: 'INR',
    discount_percent: 0,
    reference_designator: '',
    notes: '',
    update_master: false
  })

  useEffect(() => {
    if (projectPart && isOpen) {
      setFormData({
        quantity: projectPart.quantity || 1,
        unit_price: projectPart.unit_price || 0,
        currency: projectPart.currency || 'INR',
        discount_percent: projectPart.discount_percent || 0,
        reference_designator: projectPart.reference_designator || '',
        notes: projectPart.notes || '',
        update_master: false
      })
    }
  }, [projectPart, isOpen])

  if (!isOpen || !projectPart) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      // V3 mapping of frontend form back to DB snapshot fields
      const payload = {
        quantity: formData.quantity,
        unit_price: formData.unit_price,
        currency: formData.currency,
        discount_percent: formData.discount_percent,
        reference_designator: formData.reference_designator || null,
        notes: formData.notes || null,
        update_master: formData.update_master
      }

      await projectsApi.updatePartInSection(projectPart.id, payload)
      
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
      onClose()
    } catch (error) {
      console.error('Error updating part:', error)
      alert('Failed to update part.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block w-full max-w-lg px-8 pt-8 pb-8 overflow-hidden text-left align-middle transition-all transform bg-white rounded-[2.5rem] shadow-2xl">
          <div className="flex justify-between items-start mb-6">
            <div>
               <h3 className="text-xl font-black text-gray-900 tracking-tight">Edit BOM Snapshot</h3>
               <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mt-1">Part: {projectPart.part_number}</p>
            </div>
            <button onClick={onClose} className="text-gray-300 hover:text-gray-900 p-2 rounded-2xl hover:bg-gray-50 transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
               <Info className="w-5 h-5 text-amber-600 mt-0.5" />
               <p className="text-xs text-amber-800 font-medium">
                  Modifying these values updates the <strong>Project Snapshot</strong>. This does not affect the master catalog unless checked below.
               </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Quantity</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={formData.quantity}
                  onChange={(e) => setFormData(prev => ({ ...prev, quantity: parseInt(e.target.value) }))}
                  className="block w-full bg-white border border-gray-100 rounded-xl py-2.5 px-3 text-sm font-bold tabular-nums outline-none focus:ring-2 focus:ring-gray-100"
                />
              </div>
              <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Unit Price</label>
                  {projectPart.part_ref && (
                    <button 
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ 
                          ...prev, 
                          unit_price: projectPart.part_ref.base_price,
                          discount_percent: projectPart.part_ref.discount_percent || prev.discount_percent
                        }))
                      }}
                      className="text-[9px] font-black text-primary-600 uppercase tracking-tighter hover:text-primary-700 underline decoration-primary-200"
                    >
                      Sync (₹{projectPart.part_ref.base_price})
                    </button>
                  )}
                </div>
                <div className="relative">
                   <DollarSign className="w-3.5 h-3.5 absolute left-3 top-3 text-gray-300 pointer-events-none" />
                   <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.unit_price}
                    onChange={(e) => setFormData(prev => ({ ...prev, unit_price: parseFloat(e.target.value) }))}
                    className="block w-full bg-white border border-gray-100 rounded-xl py-2.5 pl-9 pr-3 text-sm font-bold tabular-nums outline-none focus:ring-2 focus:ring-gray-100"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Currency</label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                  className="block w-full bg-white border border-gray-100 rounded-xl py-2.5 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-gray-100"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="USD">USD ($)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
              </div>

              <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Snapshot Discount (%)</label>
                <div className="relative">
                   <TrendingDown className="w-3.5 h-3.5 absolute left-3 top-3 text-gray-300 pointer-events-none" />
                   <input
                    type="number"
                    step="0.1"
                    value={formData.discount_percent}
                    onChange={(e) => setFormData(prev => ({ ...prev, discount_percent: parseFloat(e.target.value) }))}
                    className="block w-full bg-white border border-gray-100 rounded-xl py-2.5 pl-9 pr-3 text-sm font-bold tabular-nums outline-none focus:ring-2 focus:ring-gray-100"
                  />
                </div>
              </div>

              {/* Valuation Summary */}
              <div className="p-4 bg-navy-900 rounded-[2rem] shadow-xl space-y-3">
                 <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-navy-400">
                    <span>Gross Total</span>
                    <span>₹{(formData.quantity * formData.unit_price).toLocaleString('en-IN')}</span>
                 </div>
                 <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-emerald-400">
                    <span>Applied Discount ({formData.discount_percent}%)</span>
                    <span>-₹{((formData.quantity * formData.unit_price) * (formData.discount_percent / 100)).toLocaleString('en-IN')}</span>
                 </div>
                 <div className="h-px bg-navy-800" />
                 <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black uppercase tracking-widest text-white">Line Total After Discount</span>
                    <span className="text-xl font-black text-white tabular-nums">
                       ₹{((formData.quantity * formData.unit_price) * (1 - (formData.discount_percent / 100))).toLocaleString('en-IN')}
                    </span>
                 </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Reference Designator</label>
              <input
                type="text"
                value={formData.reference_designator}
                onChange={(e) => setFormData(prev => ({ ...prev, reference_designator: e.target.value }))}
                className="block w-full bg-white border border-gray-100 rounded-xl py-2.5 px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-gray-100"
                placeholder="e.g. R1, C2"
              />
            </div>

            <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
              <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Item Notes</label>
              <textarea
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                className="block w-full bg-white border border-gray-100 rounded-xl py-2.5 px-4 text-xs font-medium outline-none focus:ring-2 focus:ring-gray-100 resize-none"
                placeholder="Internal notes for this project item..."
              />
            </div>

            <div className="px-6 py-4 bg-red-50/30 border border-red-50 rounded-2xl flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <input
                    id="update_master"
                    type="checkbox"
                    checked={formData.update_master}
                    onChange={(e) => setFormData(prev => ({ ...prev, update_master: e.target.checked }))}
                    className="h-5 w-5 text-gray-900 border-gray-200 rounded-lg focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="update_master" className="text-[10px] font-black text-gray-600 uppercase tracking-tight cursor-pointer">
                    Sync changes to master catalog
                  </label>
               </div>
               {formData.update_master && <AlertTriangle className="w-4 h-4 text-amber-500 animate-pulse" />}
            </div>

            <div className="pt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3 text-xs font-black text-gray-400 hover:text-gray-900 uppercase tracking-widest transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center px-8 py-3.5 text-xs font-black text-white bg-gray-900 rounded-2xl shadow-xl shadow-gray-200 hover:bg-gray-800 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-widest"
              >
                {isSubmitting ? 'Updating...' : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Apply Changes
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default ProjectEditPartModal
