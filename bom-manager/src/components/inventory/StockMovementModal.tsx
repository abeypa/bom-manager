import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Search, Package, Plus, Minus, Info, Check, Factory, Briefcase } from 'lucide-react';
import { partsApi } from '@/api/parts';
import { stockMovementsApi } from '@/api/stock-movements';
import { projectsApi } from '@/api/projects';
import { suppliersApi } from '@/api/suppliers';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';

interface StockMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const StockMovementModal = ({ isOpen, onClose }: StockMovementModalProps) => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedPart, setSelectedPart] = useState<any>(null);
  
  const [movementType, setMovementType] = useState<'IN' | 'OUT' | 'ADJUST'>('IN');
  const [quantity, setQuantity] = useState<number>(1);
  const [referenceType, setReferenceType] = useState<'none' | 'project' | 'supplier'>('none');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [referenceNotes, setReferenceNotes] = useState('');
  const [poNumber, setPoNumber] = useState('');

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.getProjects,
    enabled: referenceType === 'project'
  });

  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: suppliersApi.getSuppliers,
    enabled: referenceType === 'supplier'
  });

  const handleSearch = async (term: string) => {
    setSearchTerm(term);
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const results = await partsApi.searchAllParts(term);
      setSearchResults(results);
    } catch (err) {
      console.error('Search failed:', err);
    }
  };

  const recordMovement = useMutation({
    mutationFn: async () => {
      const currentStock = selectedPart.stock_quantity || 0;
      let newStock = currentStock;
      
      if (movementType === 'IN') newStock += quantity;
      else if (movementType === 'OUT') newStock -= quantity;
      else newStock = quantity; // Adjustment sets the total

      // 1. Update the part table
      const { error: updError } = await (supabase as any)
        .from(selectedPart.category)
        .update({ stock_quantity: newStock })
        .eq('id', selectedPart.id);
      
      if (updError) throw updError;

      // 2. Add movement record
      const selectedProject = projects?.find((p: any) => p.id === selectedProjectId);
      const selectedSupplier = suppliers?.find((s: any) => s.id === selectedSupplierId);

      await stockMovementsApi.addMovement({
        movement_type: movementType === 'ADJUST' ? 'ADJUST' : movementType,
        part_table_name: selectedPart.category,
        part_id: selectedPart.id,
        part_number: selectedPart.part_number,
        quantity: movementType === 'OUT' ? -quantity : (movementType === 'ADJUST' ? quantity - currentStock : quantity),
        stock_before: currentStock,
        stock_after: newStock,
        project_id: selectedProjectId || undefined,
        project_name: selectedProject?.project_name,
        supplier_id: selectedSupplierId || undefined,
        supplier_name: selectedSupplier?.name,
        po_number: poNumber || undefined,
        reference_notes: referenceNotes
      });

      return { newStock };
    },
    onSuccess: () => {
      showToast('success', 'Stock movement recorded successfully');
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['parts'] }); // Invalidate part caches
      onClose();
      // Reset state
      setSelectedPart(null);
      setQuantity(1);
      setReferenceNotes('');
    },
    onError: (err: any) => {
      showToast('error', `Failed to record movement: ${err.message}`);
    }
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden border border-gray-100">
        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-gray-900 rounded-2xl text-white shadow-lg shadow-gray-200">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900 tracking-tight">Stock Adjustment</h3>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">Inventory Transaction Manual Override</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 text-gray-400 hover:text-gray-900 hover:bg-white rounded-2xl shadow-sm transition-all border border-transparent hover:border-gray-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-8 overflow-y-auto space-y-8">
          {/* Step 1: Part Selection */}
          <section>
            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3">1. Select Part Identification</label>
            {!selectedPart ? (
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Scan part or search by number/description..."
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent border-gray-100 rounded-2xl text-base font-bold focus:bg-white focus:border-gray-900 focus:ring-4 focus:ring-gray-900/5 transition-all outline-none"
                  autoFocus
                />
                
                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-10 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 max-h-64 overflow-y-auto p-2">
                    {searchResults.map((p: any) => (
                      <button
                        key={`${p.category}-${p.id}`}
                        onClick={() => {
                          setSelectedPart(p);
                          setSearchResults([]);
                          setSearchTerm('');
                        }}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-100 group"
                      >
                        <div className="flex flex-col items-start">
                          <span className="font-black text-gray-900 tracking-tight">{p.part_number}</span>
                          <span className="text-xs text-gray-400 truncate max-w-[300px]">{p.description}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg uppercase">{p.display_type}</span>
                          <span className="block text-xs font-bold text-gray-400 mt-1 uppercase">Stock: {p.stock_quantity || 0}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 bg-gray-50 rounded-3xl border-2 border-gray-200 flex items-center justify-between group transition-all hover:bg-white hover:border-gray-900 relative">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-gray-100 shadow-sm">
                    <Package className="h-6 w-6 text-gray-400" />
                  </div>
                  <div>
                    <h4 className="font-black text-lg text-gray-900 tracking-tight leading-none">{selectedPart.part_number}</h4>
                    <p className="text-xs text-gray-500 mt-1.5 font-medium">{selectedPart.description}</p>
                    <span className="inline-block mt-2 text-[8px] font-black tracking-[0.2em] uppercase px-1.5 py-0.5 bg-gray-100 text-gray-400 rounded-md">
                      {selectedPart.display_type}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedPart(null)}
                  className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </section>

          {selectedPart && (
            <div className="animate-in fade-in slide-in-from-top-4 duration-500 flex flex-col space-y-8">
              {/* Step 2: Movement Type */}
              <section>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-4">2. Movement Vector</label>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { id: 'IN', label: 'Stock-In', icon: Plus, color: 'emerald', desc: 'Add new items' },
                    { id: 'OUT', label: 'Stock-Out', icon: Minus, color: 'orange', desc: 'Usage/Despatch' },
                    { id: 'ADJUST', label: 'Overwrite', icon: Info, color: 'blue', desc: 'Audit Correction' }
                  ].map((type) => {
                    const isActive = movementType === type.id;
                    const Icon = type.icon;
                    return (
                      <button
                        key={type.id}
                        onClick={() => setMovementType(type.id as any)}
                        className={`flex flex-col items-center p-6 rounded-3xl border-2 transition-all group ${
                          isActive 
                            ? `border-${type.color}-600 bg-${type.color}-50 scale-105` 
                            : 'border-gray-100 bg-white hover:border-gray-200'
                        }`}
                      >
                        <div className={`p-3 rounded-2xl mb-3 ${isActive ? `bg-${type.color}-600 text-white` : 'bg-gray-50 text-gray-400 group-hover:bg-${type.color}-100 group-hover:text-${type.color}-600'} transition-all`}>
                          <Icon className="h-6 w-6" />
                        </div>
                        <span className={`text-sm font-black uppercase tracking-widest ${isActive ? `text-${type.color}-900` : 'text-gray-400'}`}>{type.label}</span>
                        <span className="text-[10px] text-gray-400 font-medium mt-1">{type.desc}</span>
                      </button>
                    )
                  })}
                </div>
              </section>

              {/* Step 3: Quantity */}
              <section>
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest">3. Impact Magnitude</label>
                  <span className="text-[10px] font-bold text-gray-300">CURRENT: <span className="text-gray-900">{selectedPart.stock_quantity || 0}</span></span>
                </div>
                <div className="relative group">
                  <input 
                    type="number" 
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full px-6 py-6 bg-gray-50 border-2 border-transparent border-gray-100 rounded-3xl text-3xl font-black text-gray-900 tabular-nums focus:bg-white focus:border-gray-900 focus:ring-4 focus:ring-gray-900/5 transition-all outline-none"
                    min="0"
                  />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center space-x-2">
                    <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="p-3 bg-white border border-gray-100 rounded-2xl hover:bg-gray-900 hover:text-white transition-all shadow-sm active:scale-95"><Minus className="h-5 w-5" /></button>
                    <button onClick={() => setQuantity(quantity + 1)} className="p-3 bg-white border border-gray-100 rounded-2xl hover:bg-gray-900 hover:text-white transition-all shadow-sm active:scale-95"><Plus className="h-5 w-5" /></button>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-gray-900 rounded-2xl flex items-center justify-between text-white shadow-lg overflow-hidden relative">
                  <div className="flex items-center space-x-3">
                    <Check className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-bold uppercase tracking-widest opacity-80">Projected Inventory</span>
                  </div>
                  <span className="text-2xl font-black tabular-nums">
                    {movementType === 'IN' ? (selectedPart.stock_quantity || 0) + quantity :
                     movementType === 'OUT' ? Math.max(0, (selectedPart.stock_quantity || 0) - quantity) :
                     quantity}
                  </span>
                </div>
              </section>

              {/* Step 4: References */}
              <section className="space-y-4">
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3">4. Accountability & Context</label>
                
                <div className="flex gap-2 p-1 bg-gray-50 rounded-2xl border border-gray-100">
                  {['none', 'project', 'supplier'].map((ref: any) => (
                    <button
                      key={ref}
                      onClick={() => setReferenceType(ref)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all ${
                        referenceType === ref ? 'bg-white shadow-md text-gray-900 scale-105' : 'text-gray-400'
                      }`}
                    >
                      {ref === 'none' ? 'Manual' : ref}
                    </button>
                  ))}
                </div>

                {referenceType === 'project' && (
                  <div className="animate-in fade-in duration-300">
                    <div className="relative">
                      <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <select 
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent border-gray-100 rounded-2xl text-sm font-bold appearance-none focus:bg-white focus:border-gray-900 transition-all outline-none cursor-pointer"
                        value={selectedProjectId || ''}
                        onChange={(e) => setSelectedProjectId(parseInt(e.target.value) || null)}
                      >
                        <option value="">Select Target Project</option>
                        {projects?.map((p: any) => (
                          <option key={p.id} value={p.id}>{p.project_number} - {p.project_name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {referenceType === 'supplier' && (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="relative">
                      <Factory className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <select 
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent border-gray-100 rounded-2xl text-sm font-bold appearance-none focus:bg-white focus:border-gray-900 transition-all outline-none cursor-pointer"
                        value={selectedSupplierId || ''}
                        onChange={(e) => setSelectedSupplierId(parseInt(e.target.value) || null)}
                      >
                        <option value="">Select Sourcing Origin</option>
                        {suppliers?.map((s: any) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="relative">
                      <Info className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input 
                        type="text" 
                        placeholder="PO Number (Optional)"
                        value={poNumber}
                        onChange={(e) => setPoNumber(e.target.value)}
                        className="w-full pl-12 pr-4 py-4 bg-gray-50 border-2 border-transparent border-gray-100 rounded-2xl text-sm font-bold focus:bg-white focus:border-gray-900 transition-all outline-none"
                      />
                    </div>
                  </div>
                )}

                <textarea 
                  placeholder="Mandatory Audit Notes: Why is this movement happening?"
                  value={referenceNotes}
                  onChange={(e) => setReferenceNotes(e.target.value)}
                  className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent border-gray-100 rounded-3xl text-sm font-medium focus:bg-white focus:border-gray-900 transition-all outline-none min-h-[100px]"
                />
              </section>
            </div>
          )}
        </div>

        <div className="px-8 py-6 border-t border-gray-100 bg-white sticky bottom-0 z-20">
          <button
            onClick={() => recordMovement.mutate()}
            disabled={!selectedPart || recordMovement.isPending || (quantity <= 0 && movementType !== 'ADJUST')}
            className={`w-full flex items-center justify-center px-8 py-5 text-base font-black rounded-[2rem] text-white shadow-2xl transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-30 ${
              movementType === 'IN' ? 'bg-emerald-600 shadow-emerald-200' :
              movementType === 'OUT' ? 'bg-orange-600 shadow-orange-200' :
              'bg-blue-600 shadow-blue-200'
            }`}
          >
            {recordMovement.isPending ? 'Syncing with Ledger...' : `Confirm Transaction: ${movementType}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StockMovementModal;
