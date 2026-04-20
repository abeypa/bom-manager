import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ShoppingCart, 
  Search, 
  Filter, 
  Package, 
  Projector, 
  ChevronRight, 
  CheckCircle2, 
  AlertCircle,
  Factory,
  ArrowRight,
  Activity,
  Briefcase
} from 'lucide-react';
import { purchaseOrdersApi } from '@/api/purchase-orders';
import { useToast } from '@/context/ToastContext';
import { useNavigate } from 'react-router-dom';

export default function ProcurementDashboard() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedParts, setSelectedParts] = useState<Set<number>>(new Set());

  const { data: pendingParts, isLoading } = useQuery({
    queryKey: ['pending-procurement'],
    queryFn: () => purchaseOrdersApi.getPendingParts()
  });

  const generatePOMutation = useMutation({
    mutationFn: async ({ supplierId, parts }: { supplierId: number, parts: any[] }) => {
      const firstPart = parts[0];
      const getID = (obj: any): number | null => {
        if (!obj) return null;
        if (typeof obj === 'number') return obj;
        if (Array.isArray(obj)) return getID(obj[0]);
        return obj.id || obj.ID || obj.project_id || obj.projectId || null;
      };

      const projectId = 
        getID(firstPart.project_id) ||
        getID(firstPart.subsection?.project_id) ||
        getID(firstPart.subsection?.section?.project_id) ||
        getID(firstPart.subsection?.section?.project) ||
        getID(firstPart.section?.project_id) ||
        getID(firstPart.section?.project);
      
      if (!projectId) {
        throw new Error('Mandatory Project ID not found for the selected items. Please refresh and try again.');
      }
      
      const poData = {
        supplier_id: supplierId,
        project_id: projectId,
        po_number: `CPO-${Date.now().toString().slice(-8)}`,
        po_date: new Date().toISOString(),
        status: 'Draft',
        grand_total: parts.reduce((acc, p) => acc + (p.quantity * p.unit_price * (1 - ((p.discount_percent || 0) / 100))), 0),
        total_items: parts.length,
        notes: `Consolidated PO generated from Global Procurement Registry.`,
        created_date: new Date().toISOString()
      };

      const poItems = parts.map(p => ({
        part_type: p.part_type || (
                   p.mechanical_manufacture_id ? 'mechanical_manufacture' : 
                   p.mechanical_bought_out_part_id ? 'mechanical_bought_out' :
                   p.electrical_manufacture_id ? 'electrical_manufacture' :
                   p.electrical_bought_out_part_id ? 'electrical_bought_out' : 'pneumatic_bought_out'),
        part_number: p.part_ref?.part_number || p.mechanical_manufacture?.part_number || p.mechanical_bought_out?.part_number || 
                    p.electrical_manufacture?.part_number || p.electrical_bought_out?.part_number || 
                    p.pneumatic_bought_out?.part_number || 'N/A',
        description: p.part_ref?.description || p.mechanical_manufacture?.description || p.mechanical_bought_out?.description || 
                    p.electrical_manufacture?.description || p.electrical_bought_out?.description || 
                    p.pneumatic_bought_out?.description || '',
        quantity: p.quantity,
        unit_price: p.unit_price,
        discount_percent: p.discount_percent || 0,
        total_amount: p.quantity * p.unit_price * (1 - ((p.discount_percent || 0) / 100)),
        project_part_id: p.id,
        part_id: p.part_id || 
                 p.mechanical_manufacture_id || p.mechanical_bought_out_part_id ||
                 p.electrical_manufacture_id || p.electrical_bought_out_part_id ||
                 p.pneumatic_bought_out_part_id
      }));

      return purchaseOrdersApi.createPurchaseOrderWithItems(poData as any, poItems);
    },
    onSuccess: () => {
      showToast('success', 'Consolidated Draft PO generated successfully!');
      queryClient.invalidateQueries({ queryKey: ['pending-procurement'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setSelectedParts(new Set());
      navigate('/purchase-orders');
    },
    onError: (error: any) => {
      showToast('error', `Failed to generate PO: ${error.message}`);
    }
  });

  const togglePartSelection = (id: number) => {
    const next = new Set(selectedParts);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedParts(next);
  };

  const getSupplierName = (p: any) => {
    return p.part_ref?.suppliers?.name || 
           p.mechanical_manufacture?.suppliers?.name || 
           p.mechanical_bought_out?.suppliers?.name || 
           p.electrical_manufacture?.suppliers?.name || 
           p.electrical_bought_out?.suppliers?.name || 
           p.pneumatic_bought_out?.suppliers?.name || 'Unassigned';
  };

  const getSupplierId = (p: any) => {
    return p.part_ref?.supplier_id || 
           p.mechanical_manufacture?.supplier_id || 
           p.mechanical_bought_out?.supplier_id || 
           p.electrical_manufacture?.supplier_id || 
           p.electrical_bought_out?.supplier_id || 
           p.pneumatic_bought_out?.supplier_id || null;
  };

  const groupedBySupplier = pendingParts?.reduce((acc: any, p: any) => {
    const sId = getSupplierId(p);
    const sName = getSupplierName(p);
    if (!acc[sName]) acc[sName] = { id: sId, parts: [] };
    acc[sName].parts.push(p);
    return acc;
  }, {}) || {};

  const filteredSuppliers = Object.entries(groupedBySupplier)
    .filter(([name]) => name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => (b[1] as any).parts.length - (a[1] as any).parts.length);

  const renderSkeletons = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="card h-96 skeleton" />
      ))}
    </div>
  )

  return (
    <div className="page-container page-enter">
      {/* Header */}
      <header className="page-header">
        <div>
          <p className="label-caps mb-1.5 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-navy-500" />
            Global Supply Chain Registry
          </p>
          <h1 className="page-title">Procurement Manager</h1>
        </div>

        <div className="flex items-center gap-4">
           {selectedParts.size > 0 && (
             <button 
              onClick={() => {
                const partsToPO = pendingParts?.filter((p: any) => selectedParts.has(p.id)) || [];
                if (partsToPO.length === 0) return;
                const suppId = getSupplierId(partsToPO[0]);
                const sameSupplier = partsToPO.every((p: any) => getSupplierId(p) === suppId);
                if (!sameSupplier) {
                  showToast('error', 'Critical Error: Selection crosses multiple supply partners. PO must be partner-specific.');
                  return;
                }
                generatePOMutation.mutate({ supplierId: suppId, parts: partsToPO });
              }}
              className="btn btn-primary btn-lg shadow-xl shadow-navy-900/10 px-8 scale-110"
             >
                <ShoppingCart className="w-4 h-4" />
                RELEASE MANIFEST ({selectedParts.size})
             </button>
           )}
        </div>
      </header>

      {/* Toolbar */}
      <div className="section-card p-4 mb-8">
        <div className="relative w-full">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-tertiary" />
          <input 
            type="text"
            className="input pl-11"
            placeholder="Search by vendor identity or supply partner..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? renderSkeletons() : filteredSuppliers.length === 0 ? (
        <div className="empty-state py-24">
          <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mb-6 border border-slate-100 shadow-inner">
            <ShoppingCart size={40} className="text-tertiary" />
          </div>
          <h3 className="section-title mb-2">No pending procurement entities</h3>
          <p className="text-secondary mb-8 max-w-sm text-center">
            All project artifacts have been satisfied or no BOMs have been finalized for procurement yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           {filteredSuppliers.map(([name, data]: [string, any]) => (
             <div key={name} className="card overflow-hidden flex flex-col group hover:shadow-2xl transition-all duration-500 border-b-4 hover:border-navy-500">
                <div className="p-7 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center group-hover:bg-white transition-colors">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:rotate-6 transition-transform">
                         <Factory className="w-6 h-6 text-navy-600" />
                      </div>
                      <div>
                         <h3 className="text-lg font-black tracking-tight text-navy-900 leading-none mb-1.5 uppercase">{name}</h3>
                         <p className="label-caps !text-[9px] !text-tertiary">{data.parts.length} PENDING ARTIFACTS</p>
                      </div>
                   </div>
                   <div className="text-right">
                      <p className="label-caps !text-[8px] !text-navy-400 mb-1">AGGREGATED VALUATION</p>
                      <p className="text-2xl font-black text-navy-900 tabular-nums italic tracking-tighter">
                        <span className="text-xs font-black not-italic mr-1 text-tertiary">₹</span>
                        {data.parts.reduce((sum: number, p: any) => sum + (p.quantity * p.unit_price), 0).toLocaleString('en-IN')}
                      </p>
                   </div>
                </div>

                <div className="flex-1 p-4 space-y-2 max-h-[450px] overflow-y-auto custom-scrollbar">
                   {data.parts.map((p: any) => {
                      const isSelected = selectedParts.has(p.id);
                      const partNumber = p.part_ref?.part_number || p.mechanical_manufacture?.part_number || p.mechanical_bought_out?.part_number || 
                                       p.electrical_manufacture?.part_number || p.electrical_bought_out?.part_number || 
                                       p.pneumatic_bought_out?.part_number || 'N/A';
                      return (
                         <div 
                           key={p.id} 
                           onClick={() => togglePartSelection(p.id)}
                           className={`p-4 rounded-2xl border transition-all cursor-pointer flex justify-between items-center group/item ${
                             isSelected ? 'bg-navy-50 border-navy-200' : 'bg-white border-slate-100/50 hover:bg-slate-50 hover:border-slate-200 shadow-sm'
                           }`}
                         >
                            <div className="flex items-center gap-4 flex-1">
                               <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                                 isSelected ? 'bg-navy-900 text-white shadow-lg' : 'bg-slate-50 text-slate-300'
                               }`}>
                                  {isSelected ? <CheckCircle2 size={18} /> : <Package size={18} />}
                               </div>
                               <div className="min-w-0">
                                  <p className="text-xs font-black text-navy-900 truncate tracking-tight uppercase leading-none mb-1.5 group-hover/item:text-amber-700 transition-colors">{partNumber}</p>
                                  <div className="flex items-center gap-2">
                                     <Briefcase size={10} className="text-slate-300" />
                                     <p className="label-caps !text-[8px] !text-tertiary truncate">
                                        {p.subsection?.section?.project?.project_name || 'MASTER'} <span className="mx-1 opacity-20">•</span> {p.subsection?.section_name || 'CORE'}
                                     </p>
                                  </div>
                               </div>
                            </div>
                            <div className="text-right ml-4">
                               <p className="text-sm font-black text-navy-900 tabular-nums">×{p.quantity}</p>
                               <p className="font-mono text-[9px] font-black text-navy-400 italic">₹{p.unit_price.toLocaleString('en-IN')}</p>
                            </div>
                         </div>
                      );
                   })}
                </div>

                <div className="p-4 bg-slate-50/50 border-t border-slate-100">
                    <button 
                      onClick={() => {
                        const next = new Set(selectedParts);
                        const allSelected = data.parts.every((p: any) => selectedParts.has(p.id));
                        if (allSelected) {
                          data.parts.forEach((p: any) => next.delete(p.id));
                        } else {
                          data.parts.forEach((p: any) => next.add(p.id));
                        }
                        setSelectedParts(next);
                      }}
                      className="btn btn-ghost btn-sm w-full font-black text-[10px] tracking-[0.1em] hover:text-navy-900"
                    >
                       {data.parts.every((p: any) => selectedParts.has(p.id)) ? 'DISCARD ALL SELECTIONS' : 'SELECT ALL VENDOR ITEMS'}
                       <ArrowRight size={14} className="ml-2" />
                    </button>
                </div>
             </div>
           ))}
        </div>
      )}
    </div>
  );
}
