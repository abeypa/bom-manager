import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Save, FileUp, Factory, Upload, FileText, Image as ImageIcon, Box } from 'lucide-react'
import { partsApi, PartCategory } from '@/api/parts'
import { suppliersApi } from '@/api/suppliers'
import { priceHistoryApi } from '@/api/price-history'
import { FileUpload } from '../ui/FileUpload'

interface PartFormModalProps {
  isOpen: boolean
  onClose: () => void
  activeTab: PartCategory
  partToEdit?: any | null
}

const PartFormModal = ({ isOpen, onClose, activeTab, partToEdit }: PartFormModalProps) => {
  const queryClient = useQueryClient()
  const isManufacture = activeTab.includes('manufacture')

  const [formData, setFormData] = useState<any>({
    part_number: '',
    description: '',
    stock_quantity: 0,
    min_stock_level: 0,
    base_price: 0,
    currency: 'INR',
    discount_percent: 0,
    manufacturer: '',
    make: '',
    manufacturer_part_number: '',
    supplier_id: null,
    beperp_part_no: '',
    material: '',
    finish: '',
    port_size: '',
    operating_pressure: '',
    specifications: '',
    notes: '',
    // File paths
    image_path: null,
    pdf_path: null,
    pdf2_path: null,
    pdf3_path: null,
    cad_file_url: null,
    price_revision_date: new Date().toISOString().split('T')[0]
  })

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => suppliersApi.getSuppliers(),
    enabled: isOpen
  })

  useEffect(() => {
    if (partToEdit) {
      setFormData({
        ...partToEdit,
        currency: partToEdit.currency || 'INR',
        discount_percent: partToEdit.discount_percent || 0,
        price_revision_date: new Date().toISOString().split('T')[0]
      })
    } else {
      setFormData({
        part_number: '',
        description: '',
        stock_quantity: 0,
        min_stock_level: 0,
        base_price: 0,
        currency: 'INR',
        discount_percent: 0,
        manufacturer: '',
        make: '',
        manufacturer_part_number: '',
        supplier_id: null,
        beperp_part_no: '',
        material: '',
        finish: '',
        port_size: '',
        operating_pressure: '',
        specifications: '',
        notes: '',
        image_path: null,
        pdf_path: null,
        pdf2_path: null,
        pdf3_path: null,
        cad_file_url: null,
        price_revision_date: new Date().toISOString().split('T')[0]
      })
    }
  }, [partToEdit, isOpen])

  const createMutation = useMutation({
    mutationFn: (newPart: any) => partsApi.createPart(activeTab, newPart),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parts', activeTab] })
      onClose()
    },
    onError: (error: any) => {
      alert(`Error creating part: ${error.message || 'Unknown error'}`)
      console.error('Create Part Error:', error)
    }
  })

  const updateMutation = useMutation({
    mutationFn: async (updatedPart: any) => {
      // 1. Update the master part
      const result = await partsApi.updatePart(activeTab, partToEdit.id, updatedPart);

      // 2. If base_price changed, log it to history
      const oldPrice = partToEdit.base_price;
      const newPrice = updatedPart.base_price;

      if (newPrice !== undefined && newPrice !== oldPrice && newPrice !== null) {
        try {
          await priceHistoryApi.addEntry({
            part_table_name: activeTab,
            part_id: partToEdit.id,
            part_number: partToEdit.part_number,
            old_price: oldPrice,
            new_price: newPrice,
            change_reason: 'Engineering Update',
            changed_at: new Date().toISOString()
          });
        } catch (historyErr) {
          console.error('Failed to log price history during update:', historyErr);
          // Don't fail the whole update if history fails
        }
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parts'] })
      queryClient.invalidateQueries({ queryKey: ['parts', activeTab] })
      onClose()
    },
    onError: (error: any) => {
      alert(`Error updating part: ${error.message || 'Unknown error'}`)
      console.error('Update Part Error:', error)
    }
  })

  const cleanPayload = (data: any) => {
    const cleaned = { ...data }
    
    // Fields only for mechanical categories
    if (!activeTab.includes('mechanical')) {
      delete cleaned.material
      delete cleaned.finish
      delete cleaned.weight
      delete cleaned.pdm_file_path
    }

    // Fields only for pneumatic categories
    if (!activeTab.includes('pneumatic')) {
      delete cleaned.port_size
      delete cleaned.operating_pressure
    }

    // Remove empty strings for fields that migrate to null
    Object.keys(cleaned).forEach(key => {
      if (cleaned[key] === '') cleaned[key] = null
    })

    // Remove UI-only fields that are not in the database schema or handled differently
    delete cleaned.notes
    delete cleaned.suppliers
    delete cleaned.display_type
    delete cleaned.category
    
    // These are handled by history/audit tables, not the master part table
    delete cleaned.price_revision_date
    // delete cleaned.discount_percent // actually some tables might have it, but checking schema
    
    return cleaned
  }

  const categoryPrefixMap: Record<string, string> = {
    'electrical_bought_out': 'EBO-',
    'pneumatic_bought_out': 'PBO-',
    'mechanical_bought_out': 'MBO-',
    'mechanical_manufacture': 'MM-',
    'electrical_manufacture': 'EM-',
    'RAW MATERIAL': 'RMO-',
    'SOFTWARE': 'SBO-',
    'SERVICE': 'SVC-',
    'DEFAULT': ''
  }

  const getPrefix = (cat: string) => {
    const key = cat.toLowerCase();
    if (key.includes('electrical') && key.includes('bought')) return 'EBO-';
    if (key.includes('pneumatic') && key.includes('bought')) return 'PBO-';
    if (key.includes('mechanical') && key.includes('bought')) return 'MBO-';
    if (key.includes('mechanical') && key.includes('manufacture')) return 'MM-';
    if (key.includes('electrical') && key.includes('manufacture')) return 'EM-';
    return categoryPrefixMap[cat] || '';
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const payload = cleanPayload(formData)
    
    if (partToEdit) {
      updateMutation.mutate(payload)
    } else {
      createMutation.mutate(payload)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    const processedValue = type === 'number' ? parseFloat(value) : (value === '' ? null : value)
    
    setFormData((prev: any) => {
      const nextData = { ...prev, [name]: processedValue }
      
      // Real-time sync: Auto-update part_number when beperp_part_no changes
      if (name === 'beperp_part_no' && value) {
        const prefix = getPrefix(activeTab)
        const erpValue = value.trim()
        // Only update if it doesn't already have the correct prefix or if it's purely the ERP ID
        if (prefix && !prev.part_number?.startsWith(prefix)) {
          nextData.part_number = `${prefix}${erpValue}`
        } else if (prefix && prev.part_number?.startsWith(prefix) && prev.part_number.replace(prefix, '') === (prev.beperp_part_no || '')) {
          // If the part number was already synced with the old ERP ID, update it with the new one
          nextData.part_number = `${prefix}${erpValue}`
        }
      }
      
      return nextData
    })
  }

  const handleFileUpload = (key: string, url: any) => {
    setFormData((prev: any) => ({ ...prev, [key]: url }))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

      <div className="relative bg-white rounded-[2.5rem] shadow-2xl max-w-4xl w-full flex flex-col max-h-[90vh] overflow-hidden border border-gray-100">
        {/* Header */}
        <div className="px-10 py-8 border-b border-gray-50 flex justify-between items-center bg-white sticky top-0 z-20">
          <div>
            <h3 className="text-3xl font-black text-gray-900 tracking-tight italic">
              {partToEdit ? 'Edit Asset' : 'New Master Entry'}
            </h3>
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mt-1">
              Category: {activeTab.replace(/_/g, ' ')}
            </p>
          </div>
          <button onClick={onClose} className="p-3 bg-gray-50 rounded-2xl text-gray-400 hover:text-gray-900 transition-all hover:rotate-90">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
          
          {/* Section 1: Identification */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
               <div className="w-1.5 h-6 bg-gray-900 rounded-full" />
               <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Part Identification</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 bg-gray-50/50 rounded-3xl border border-gray-100 focus-within:border-gray-900 transition-all">
                <div className="flex justify-between items-center mb-2 px-1">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Internal Part Number *</label>
                  <button
                    type="button"
                    onClick={() => {
                      const prefix = getPrefix(activeTab);
                      const uniqueId = Date.now().toString().slice(-6);
                      setFormData((prev: any) => ({ ...prev, part_number: `${prefix}${uniqueId}` }));
                    }}
                    className="text-[9px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-800 transition-colors"
                  >
                    Auto Generate
                  </button>
                </div>
                <input
                  type="text"
                  name="part_number"
                  required
                  value={formData.part_number || ''}
                  onChange={handleChange}
                  className="block w-full bg-transparent text-sm font-bold outline-none tabular-nums"
                  placeholder="e.g. MM-123456"
                />
              </div>

              <div className="p-4 bg-gray-50/50 rounded-3xl border border-gray-100 focus-within:border-gray-900 transition-all">
                <label htmlFor="supplier_id" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Supplier Selection *</label>
                <select
                  id="supplier_id"
                  name="supplier_id"
                  required
                  value={formData.supplier_id || ''}
                  onChange={handleChange}
                  className="block w-full bg-transparent text-sm font-bold outline-none cursor-pointer appearance-none"
                >
                  <option value="">-- Master Registry --</option>
                  {suppliers?.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="p-4 bg-gray-50/50 rounded-3xl border border-gray-100 focus-within:border-gray-900 transition-all">
                <label htmlFor="make" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Make</label>
                <input
                  id="make"
                  type="text"
                  name="make"
                  value={formData.make || ''}
                  onChange={handleChange}
                  className="block w-full bg-transparent text-sm font-bold outline-none"
                  placeholder="Brand / Manufacturer"
                />
              </div>

              {!isManufacture && (
                <div className="p-4 bg-gray-50/50 rounded-3xl border border-gray-100 focus-within:border-gray-900 transition-all">
                  <label htmlFor="manufacturer_part_number" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Manufacturer Part No.</label>
                  <input
                    id="manufacturer_part_number"
                    type="text"
                    name="manufacturer_part_number"
                    value={formData.manufacturer_part_number || ''}
                    onChange={handleChange}
                    className="block w-full bg-transparent text-sm font-bold outline-none"
                    placeholder="OEM Reference"
                  />
                </div>
              )}

              <div className="p-4 bg-gray-50/50 rounded-3xl border border-gray-100 focus-within:border-gray-900 transition-all">
                <label htmlFor="beperp_part_no" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">ERP Integration ID</label>
                <input
                  id="beperp_part_no"
                  type="text"
                  name="beperp_part_no"
                  value={formData.beperp_part_no || ''}
                  onChange={handleChange}
                  className="block w-full bg-transparent text-sm font-bold outline-none"
                  placeholder="Cross-platform UID"
                />
              </div>

              <div className="md:col-span-2 p-4 bg-gray-50/50 rounded-3xl border border-gray-100 focus-within:border-gray-900 transition-all">
                <label htmlFor="description" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 px-1">Global Description *</label>
                <textarea
                  id="description"
                  name="description"
                  rows={2}
                  value={formData.description || ''}
                  onChange={handleChange}
                  required
                  className="block w-full bg-transparent text-sm font-medium outline-none resize-none"
                  placeholder="Detailed part specification..."
                />
              </div>
            </div>
          </section>

          {/* Section 2: Commercials & Stock */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
               <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
               <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Inventory & Pricing</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="p-4 bg-gray-50/50 rounded-3xl border border-gray-100">
                <label htmlFor="stock_quantity" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Stock Level</label>
                <input
                  id="stock_quantity"
                  type="number"
                  name="stock_quantity"
                  value={formData.stock_quantity || 0}
                  onChange={handleChange}
                  className="block w-full bg-transparent text-sm font-black tabular-nums outline-none"
                />
              </div>
              <div className="p-4 bg-gray-50/50 rounded-3xl border border-gray-100">
                <label htmlFor="min_stock_level" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Safety Buffer</label>
                <input
                  id="min_stock_level"
                  type="number"
                  name="min_stock_level"
                  value={formData.min_stock_level || 0}
                  onChange={handleChange}
                  className="block w-full bg-transparent text-sm font-black tabular-nums outline-none text-red-500"
                />
              </div>
              <div className="p-4 bg-gray-900 rounded-3xl shadow-xl shadow-gray-200">
                <label htmlFor="base_price" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Base Price (Snapshot)</label>
                <div className="flex items-center">
                   <span className="text-gray-500 font-black mr-2">₹</span>
                   <input
                    id="base_price"
                    type="number"
                    name="base_price"
                    step="0.01"
                    value={formData.base_price || 0}
                    onChange={handleChange}
                    className="block w-full bg-transparent text-sm font-black tabular-nums text-white outline-none"
                  />
                </div>
              </div>
              <div className="p-4 bg-gray-50/50 rounded-3xl border border-gray-100">
                <label htmlFor="discount_percent" className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Standard Disc. %</label>
                <input
                  id="discount_percent"
                  type="number"
                  name="discount_percent"
                  step="0.1"
                  value={formData.discount_percent || 0}
                  onChange={handleChange}
                  className="block w-full bg-transparent text-sm font-black tabular-nums outline-none text-emerald-600"
                />
              </div>
              <div className="p-4 bg-emerald-50 rounded-3xl border border-emerald-100">
                <label htmlFor="price_revision_date" className="block text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Price Quote Date</label>
                <input
                  id="price_revision_date"
                  type="date"
                  name="price_revision_date"
                  value={formData.price_revision_date || new Date().toISOString().split('T')[0]}
                  onChange={handleChange}
                  className="block w-full bg-transparent text-sm font-black tabular-nums outline-none text-emerald-900"
                />
              </div>
            </div>
          </section>

          {/* Section 3: Technical Docs & Files */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
               <div className="w-1.5 h-6 bg-blue-500 rounded-full" />
               <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Digital Assets & Engineering</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               <div className="p-5 bg-white border border-gray-100 rounded-[2rem] shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                     <ImageIcon className="w-4 h-4 text-blue-500" />
                     <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Part Visual</span>
                  </div>
                  <FileUpload
                    existingUrl={formData.image_path}
                    onUpload={(url: string) => handleFileUpload('image_path', url)}
                    bucket="bom_assets"
                    label="Image"
                  />
               </div>

               <div className="p-5 bg-white border border-gray-100 rounded-[2rem] shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                     <Box className="w-4 h-4 text-cyan-500" />
                     <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">CAD Geometry</span>
                  </div>
                  <FileUpload
                    existingUrl={formData.cad_file_url}
                    onUpload={(url: string) => handleFileUpload('cad_file_url', url)}
                    bucket="bom_assets"
                    label="Model"
                  />
               </div>

               <div className="p-5 bg-white border border-gray-100 rounded-[2rem] shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                     <FileText className="w-4 h-4 text-emerald-500" />
                     <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Primary Datasheet</span>
                  </div>
                  <FileUpload
                    existingUrl={formData.pdf_path}
                    onUpload={(url: string) => handleFileUpload('pdf_path', url)}
                    bucket="bom_assets"
                    label="Datasheet"
                  />
               </div>

               <div className="p-5 bg-white border border-gray-100 rounded-[2rem] shadow-sm">
                  <div className="flex items-center gap-2 mb-4 text-gray-400">
                     <FileText className="w-4 h-4" />
                     <span className="text-[10px] font-black uppercase tracking-widest">Audit PDF 2</span>
                  </div>
                  <FileUpload
                    existingUrl={formData.pdf2_path}
                    onUpload={(url: string) => handleFileUpload('pdf2_path', url)}
                    bucket="bom_assets"
                    label="Certificates"
                  />
               </div>

               <div className="p-5 bg-white border border-gray-100 rounded-[2rem] shadow-sm">
                  <div className="flex items-center gap-2 mb-4 text-gray-400">
                     <FileText className="w-4 h-4" />
                     <span className="text-[10px] font-black uppercase tracking-widest">Drawing PDF 3</span>
                  </div>
                  <FileUpload
                    existingUrl={formData.pdf3_path}
                    onUpload={(url: any) => handleFileUpload('pdf3_path', url)}
                    bucket="bom_assets"
                    label="Drawings"
                  />
               </div>
            </div>
          </section>

          {/* Section 4: Specifications */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
               <div className="w-1.5 h-6 bg-gray-300 rounded-full" />
               <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Engineering Specifications</h4>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
               {(isManufacture || activeTab === 'pneumatic_bought_out') && (
                  <div className="md:col-span-2 grid grid-cols-2 gap-4">
                     <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Material / Grade</label>
                        <input name="material" value={formData.material || ''} onChange={handleChange} className="w-full bg-transparent text-sm font-bold outline-none" />
                     </div>
                     <div className="p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Coating / Finish</label>
                        <input name="finish" value={formData.finish || ''} onChange={handleChange} className="w-full bg-transparent text-sm font-bold outline-none" />
                     </div>
                  </div>
               )}
               <div className="md:col-span-2 p-4 bg-gray-50/50 rounded-3xl border border-gray-100">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Technical Summary</label>
                <textarea
                  name="specifications"
                  rows={2}
                  value={formData.specifications || ''}
                  onChange={handleChange}
                  className="block w-full bg-transparent text-sm font-medium outline-none resize-none"
                  placeholder="Dimensions, tolerances, or power ratings..."
                />
              </div>
            </div>
          </section>

          {/* Spacer for footer */}
          <div className="h-10" />
        </form>

        {/* Footer */}
        <div className="px-10 py-8 border-t border-gray-50 flex justify-end gap-5 bg-white sticky bottom-0 z-20 shadow-[0_-20px_50px_rgba(0,0,0,0.02)]">
          <button
            type="button"
            onClick={onClose}
            className="px-8 py-4 text-xs font-black text-gray-400 uppercase tracking-[0.2em] hover:text-gray-900 transition-all"
          >
            Discard
          </button>
          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending || updateMutation.isPending}
            className="inline-flex items-center px-12 py-4 bg-gray-900 text-white text-xs font-black rounded-3xl shadow-2xl shadow-gray-200 hover:bg-gray-800 transition-all active:scale-95 disabled:opacity-50 uppercase tracking-[0.2em]"
          >
            {createMutation.isPending || updateMutation.isPending ? 'Propagating...' : (
              <>
                <Save className="h-4 w-4 mr-3" />
                Commit to Registry
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PartFormModal
