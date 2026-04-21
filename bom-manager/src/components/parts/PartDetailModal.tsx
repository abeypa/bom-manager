import React, { useState, useEffect } from 'react';
import { X, Edit, History, ArrowUpDown, FileText, Package, TrendingUp, TrendingDown, Clock, ShieldCheck, Box, Trash2, Plus } from 'lucide-react';
import { priceHistoryApi } from '../../api/price-history';
import { stockMovementsApi } from '../../api/stock-movements';
import { useRole } from '../../hooks/useRole';
import { partsApi } from '../../api/parts';
import { useToast } from '../../context/ToastContext';
import { useQueryClient } from '@tanstack/react-query';

interface PartDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (part: any) => void;
  part: any;
  category: string;
}

export default function PartDetailModal({ isOpen, onClose, onEdit, part, category }: PartDetailModalProps) {
  const { isAdmin } = useRole();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'details' | 'history' | 'stock' | 'files'>('details');
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [stockHistory, setStockHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAddingPrice, setIsAddingPrice] = useState(false);
  const [newPriceData, setNewPriceData] = useState({
    price: '',
    date: new Date().toISOString().split('T')[0],
    reason: 'Manual Audit'
  });

  const handleDecommission = async () => {
    if (!window.confirm(`CRITICAL ACTION: Are you sure you want to decommission ${part.part_number}? This will permanently remove it from the master registry.`)) return;

    try {
      await partsApi.deletePart(category as any, part.id);
      showToast('success', 'Asset decommissioned from registry');
      queryClient.invalidateQueries({ queryKey: ['parts'] });
      onClose();
    } catch (err) {
      showToast('error', 'Failed to decommission asset');
    }
  };

  useEffect(() => {
    if (!isOpen || !part) return;

    const loadData = async () => {
      setLoading(true);
      try {
        const [historyData, stockData] = await Promise.all([
          priceHistoryApi.getHistory(category, part.id),
          stockMovementsApi.getByPart(category, part.id),
        ]);
        setPriceHistory(historyData);
        setStockHistory(stockData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [isOpen, part, category]);

  const handleAddPriceEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    try {
      setLoading(true);
      // Centralized Update: Use updatePart which handles master sync AND history logging
      await partsApi.updatePart(category as any, part.id, {
        base_price: parseFloat(newPriceData.price),
        price_revision_date: new Date(newPriceData.date).toISOString()
      });

      // Reload local history view
      const historyData = await priceHistoryApi.getHistory(category, part.id);
      setPriceHistory(historyData);
      
      // Invalidate globally
      queryClient.invalidateQueries();
      
      setIsAddingPrice(false);
      setNewPriceData({
        price: '',
        date: new Date().toISOString().split('T')[0],
        reason: 'Manual Audit'
      });
      showToast('success', 'Latest price recorded & synced to master registry');
    } catch (err) {
      showToast('error', 'Failed to record entry');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePriceEntry = async (id: string) => {
    if (!window.confirm('Delete this historical entry? This will impact the price evolution timeline.')) return;
    
    try {
      setLoading(true);
      await priceHistoryApi.deleteEntry(id);
      showToast('success', 'Timeline entry removed');
      const historyData = await priceHistoryApi.getHistory(category, part.id);
      setPriceHistory(historyData);
    } catch (err) {
      showToast('error', 'Failed to remove entry');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !part) return null;

  const getMovementIcon = (type: string) => {
    switch (type) {
        case 'IN': return <TrendingUp className="w-4 h-4 text-emerald-500" />;
        case 'OUT': return <TrendingDown className="w-4 h-4 text-red-500" />;
        case 'RESTORE': return <History className="w-4 h-4 text-blue-500" />;
        default: return <Clock className="w-4 h-4 text-gray-400" />;
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[2.5rem] w-full max-w-5xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl border border-gray-100">
        
        {/* Header Section */}
        <div className="px-10 py-8 border-b border-gray-50 flex items-center justify-between bg-white relative z-10">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-gray-50 rounded-[2rem] overflow-hidden flex items-center justify-center border border-gray-100 shadow-sm shrink-0">
              {part.image_path ? (
                <img src={part.image_path} alt="" className="w-full h-full object-contain p-2" />
              ) : (
                <Package className="w-10 h-10 text-gray-200" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-3xl font-black text-gray-900 tracking-tight italic">{part.part_number}</h1>
                <span className="px-3 py-1 bg-gray-900 text-white text-[8px] font-black uppercase tracking-widest rounded-lg">
                    {category.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-gray-400 text-xs font-medium max-w-xl line-clamp-1 italic">"{part.description || 'No datasheet summary available...'}"</p>
            </div>
          </div>
          <button onClick={onClose} className="p-4 bg-gray-50 text-gray-400 hover:text-gray-900 rounded-[1.5rem] transition-all hover:rotate-90">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-gray-50 bg-gray-50/20 px-10">
          {[
            { id: 'details', label: 'Overview', icon: <Package className="w-4 h-4" /> },
            { id: 'history', label: 'Price Audit', icon: <History className="w-4 h-4" /> },
            { id: 'stock', label: 'Transaction Log', icon: <ArrowUpDown className="w-4 h-4" /> },
            { id: 'files', label: 'Digital Assets', icon: <FileText className="w-4 h-4" /> }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-8 py-5 text-[10px] font-black uppercase tracking-widest transition-all relative ${
                activeTab === tab.id ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab.icon}
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-900 rounded-t-full shadow-[0_-4px_10px_rgba(0,0,0,0.1)]" />
              )}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 p-10 overflow-y-auto custom-scrollbar bg-white">
          {loading ? (
             <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="w-12 h-12 border-4 border-gray-900 border-t-transparent rounded-full animate-spin" />
                <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Accessing Ledger...</p>
             </div>
          ) : (
            <>
              {activeTab === 'details' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                  <div className="lg:col-span-2 space-y-10">
                    {/* Primary Stats */}
                    <div className="grid grid-cols-2 gap-6">
                        <div className="p-8 bg-gray-900 text-white rounded-[2.5rem] shadow-2xl shadow-gray-200 border-b-8 border-gray-800">
                            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-gray-400 mb-2 px-1">Market Valuation</p>
                            <div className="text-4xl font-black italic tabular-nums">
                                <span className="text-sm font-black mr-1 not-italic text-gray-500">₹</span>
                                {part.base_price?.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
                            </div>
                            <button
                              onClick={() => {
                                if (onEdit) {
                                  onEdit(part);
                                  onClose();
                                }
                              }}
                              className="mt-6 group flex items-center justify-center gap-3 w-full px-8 py-4 bg-white/10 hover:bg-white/20 rounded-[1.5rem] text-white transition-all text-[10px] font-black uppercase tracking-widest"
                            >
                              <Edit className="w-3 h-3" />
                              Modify Record
                            </button>
                        </div>
                        <div className="p-8 bg-white border border-gray-100 rounded-[2.5rem] shadow-sm relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Box className="w-20 h-20" />
                            </div>
                            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-gray-300 mb-2 px-1">Physical Stock</p>
                            <div className="text-4xl font-black italic tabular-nums text-gray-900">
                                {part.stock_quantity || 0}
                                <span className="text-xs font-black ml-2 not-italic text-gray-300 tracking-widest uppercase">Units</span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="w-1.5 h-6 bg-gray-900 rounded-full" />
                            <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Engineering Snapshot</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-5 bg-gray-50/50 rounded-2xl border border-gray-100">
                                <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest block mb-1">Manufacturer</span>
                                <span className="text-sm font-bold text-gray-900">{part.manufacturer || 'Internal BEP'}</span>
                            </div>
                            <div className="p-5 bg-gray-50/50 rounded-2xl border border-gray-100">
                                <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest block mb-1">Manuf. Part No.</span>
                                <span className="text-sm font-bold text-gray-900">{part.manufacturer_part_number || 'N/A'}</span>
                            </div>
                            <div className="p-5 bg-gray-50/50 rounded-2xl border border-gray-100">
                                <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest block mb-1">Safety Buffer</span>
                                <span className="text-sm font-bold text-gray-900">{part.min_stock_level || 0} <span className="text-[10px] text-gray-300 ml-1 italic inline-block">Min. Level</span></span>
                            </div>
                            <div className="p-5 bg-gray-50/50 rounded-2xl border border-gray-100">
                                <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest block mb-1">Identity UID</span>
                                <span className="text-sm font-bold text-gray-900">{part.beperp_part_no || 'Pending ERP'}</span>
                            </div>
                        </div>
                    </div>
                  </div>

                  {/* Actions & Side Info */}
                  <div className="space-y-6">
                    <div className="p-8 bg-gray-50 rounded-[2.5rem] border border-gray-100 space-y-4">
                        <button
                          onClick={() => {
                            if (onEdit) {
                              onEdit(part);
                              onClose();
                            }
                          }}
                          className="w-full flex items-center justify-between px-8 py-5 bg-white border border-gray-100 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest hover:shadow-xl transition-all group"
                        >
                            <span>Modify Specs</span>
                            <Edit className="w-4 h-4 text-gray-300 group-hover:text-gray-900" />
                        </button>
                        <div className="pt-6">
                             <div className="text-[8px] font-black text-gray-300 uppercase tracking-widest mb-4 px-2">Primary Partner</div>
                             <div className="p-6 bg-white border border-gray-100 rounded-[2rem] shadow-sm flex items-center gap-4">
                                <div className="w-10 h-10 bg-gray-900 text-white rounded-xl flex items-center justify-center font-black">
                                    {part.suppliers?.name?.charAt(0) || 'B'}
                                </div>
                                <div>
                                    <p className="text-xs font-black text-gray-900 uppercase tracking-widest truncate max-w-[120px]">{part.suppliers?.name || 'BEP INTERNAL'}</p>
                                    <p className="text-[8px] text-gray-300 font-bold uppercase tracking-widest mt-1">Sourcing Node</p>
                                </div>
                             </div>
                        </div>
                    </div>
                    
                    <div className="p-8 border border-gray-100 rounded-[2.5rem] space-y-4">
                         <div className="flex items-center gap-2 mb-2">
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                            <span className="text-[8px] font-black text-gray-900 uppercase tracking-widest">Integrity Check</span>
                         </div>
                         <p className="text-[10px] text-gray-400 font-medium leading-relaxed italic">"Snapshot pricing is active for all BOM instances of this asset. History is immutable once committed to parent ledger."</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-6 bg-emerald-500 rounded-full" />
                        <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Price Evolution Timeline</h4>
                    </div>
                    <div className="flex items-center gap-4">
                      {/* Add Manual Price Entry - Open to all */}
                      {!isAddingPrice && (
                        <button
                          onClick={() => setIsAddingPrice(true)}
                          className="inline-flex items-center gap-2 text-[10px] font-black text-gray-400 hover:text-gray-900 uppercase tracking-widest transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          Log Manual Entry
                        </button>
                      )}
                      <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">{priceHistory.length} Recorded Changes</span>
                    </div>
                  </div>

                  {isAddingPrice && (
                    <form onSubmit={handleAddPriceEntry} className="p-8 bg-gray-50 rounded-[2rem] border-2 border-dashed border-gray-200 animate-in fade-in slide-in-from-top-4 duration-300">
                      <div className="flex items-center justify-between mb-6">
                        <h5 className="text-[10px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                          <History className="w-4 h-4 text-emerald-500" />
                          Record Historical Valuation
                        </h5>
                        <button 
                          type="button"
                          onClick={() => setIsAddingPrice(false)}
                          className="text-[8px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-900"
                        >
                          Cancel
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-6">
                        <div className="space-y-2">
                          <label className="text-[8px] font-black text-gray-300 uppercase tracking-widest block px-1">Valuation (₹)</label>
                          <input
                            type="number"
                            step="0.01"
                            required
                            value={newPriceData.price}
                            onChange={(e) => setNewPriceData({...newPriceData, price: e.target.value})}
                            placeholder="0.0"
                            className="w-full px-5 py-3 bg-white border border-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-gray-900 outline-none"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[8px] font-black text-gray-300 uppercase tracking-widest block px-1">Timeline Date</label>
                          <input
                            type="date"
                            required
                            value={newPriceData.date}
                            onChange={(e) => setNewPriceData({...newPriceData, date: e.target.value})}
                            className="w-full px-5 py-3 bg-white border border-gray-100 rounded-xl text-sm font-bold focus:ring-2 focus:ring-gray-900 outline-none"
                          />
                        </div>
                        <div className="flex items-end">
                          <button 
                            type="submit"
                            className="w-full py-3 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
                          >
                            Commit to Ledger
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                  
                  <div className="border border-gray-50 rounded-[2.5rem] overflow-hidden shadow-sm shadow-gray-50">
                    <table className="w-full">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="px-8 py-5 text-left text-[9px] font-black text-gray-300 uppercase tracking-widest">Timeline</th>
                                <th className="px-8 py-5 text-left text-[9px] font-black text-gray-300 uppercase tracking-widest">Valuation Delta</th>
                                <th className="px-8 py-5 text-left text-[9px] font-black text-gray-300 uppercase tracking-widest">Change Vector</th>
                                <th className="px-8 py-5 text-right text-[9px] font-black text-gray-300 uppercase tracking-widest">Agent</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {priceHistory.map((h: any) => (
                                <tr key={h.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">{new Date(h.changed_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                        <div className="text-[8px] text-gray-300 font-bold uppercase tracking-widest mt-1">{new Date(h.changed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="text-base font-black text-gray-900 italic tabular-nums group-hover:scale-105 transition-transform origin-left">₹ {h.new_price?.toLocaleString('en-IN', { minimumFractionDigits: 1 })}</div>
                                        <div className="text-[8px] text-gray-400 font-bold uppercase tracking-widest mt-1">Prev: {h.old_price ? `₹${h.old_price}` : 'Origin'}</div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className="px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-[8px] font-black text-gray-400 uppercase tracking-widest">{h.change_reason?.replace('_', ' ')}</span>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <div className="flex items-center justify-end gap-4">
                                          <div>
                                            <div className="text-[10px] font-bold text-gray-900">{h.changed_by?.split('@')[0]}</div>
                                            <div className="text-[8px] text-gray-300 font-bold uppercase tracking-widest mt-1 px-1">{h.changed_by?.split('@')[1]}</div>
                                          </div>
                                          {isAdmin && (
                                            <button 
                                              onClick={() => handleDeletePriceEntry(h.id)}
                                              className="p-2 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                              title="Delete Entry"
                                            >
                                              <Trash2 className="w-3 h-3" />
                                            </button>
                                          )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === 'stock' && (
                <div className="space-y-6">
                   <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-1.5 h-6 bg-blue-500 rounded-full" />
                        <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Transaction Audit Ledger</h4>
                    </div>
                    <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">{stockHistory.length} Movement Records</span>
                  </div>

                  <div className="space-y-4">
                    {stockHistory.map((m: any) => (
                        <div key={m.id} className="p-6 bg-white border border-gray-50 rounded-3xl hover:border-gray-900 hover:shadow-xl transition-all group flex items-center justify-between">
                            <div className="flex items-center gap-6">
                                <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center border border-gray-100 group-hover:scale-110 transition-transform">
                                    {getMovementIcon(m.movement_type)}
                                </div>
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h5 className="text-sm font-black text-gray-900 uppercase tracking-widest">{m.movement_type} Registry Entry</h5>
                                        <span className="text-[8px] font-black text-gray-300 uppercase tracking-widest">&middot; {new Date(m.moved_at).toLocaleDateString()}</span>
                                    </div>
                                    <p className="text-[10px] text-gray-400 font-medium mt-1 italic">Reference: {m.reference_notes || m.po_number || m.project_name || 'Manual System Adjustment'}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className={`text-2xl font-black italic tabular-nums ${m.movement_type === 'IN' || m.movement_type === 'RESTORE' ? 'text-emerald-500' : 'text-red-500'}`}>
                                    {m.movement_type === 'IN' || m.movement_type === 'RESTORE' ? '+' : '-'}{m.quantity}
                                </div>
                                <div className="text-[8px] text-gray-300 font-bold uppercase tracking-[0.2em] mt-1 pr-1">Delta Count</div>
                            </div>
                        </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'files' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                   {[
                    { id: 'pdf_path', label: 'Primary Datasheet', icon: <FileText className="w-6 h-6 text-red-400" />, desc: 'Technical specs & PDF Drawing' },
                    { id: 'cad_file_url', label: 'CAD Model / Step', icon: <Box className="w-6 h-6 text-blue-400" />, desc: '3D Geometry registry' },
                    { id: 'pdf2_path', label: 'Certificates', icon: <ShieldCheck className="w-6 h-6 text-emerald-400" />, desc: 'Validation & Quality files' },
                    { id: 'pdf3_path', label: 'Drafting PDF', icon: <FileText className="w-6 h-6 text-gray-400" />, desc: 'Supplementary drafting docs' }
                   ].map(file => (
                    <div key={file.id} className={`p-8 bg-gray-50/50 rounded-[2rem] border border-gray-100 flex flex-col items-center text-center transition-all ${part[file.id] ? 'hover:bg-white hover:shadow-xl border-dashed border-gray-200' : 'opacity-40 grayscale'}`}>
                        <div className="w-14 h-14 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-6">
                            {file.icon}
                        </div>
                        <h5 className="text-[10px] font-black text-gray-900 uppercase tracking-widest mb-2">{file.label}</h5>
                        <p className="text-[9px] text-gray-400 font-medium leading-relaxed px-4">{file.desc}</p>
                        
                        {part[file.id] ? (
                            <button className="mt-8 px-8 py-3 bg-gray-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all">
                                Download File
                            </button>
                        ) : (
                            <div className="mt-8 text-[9px] text-gray-300 font-black uppercase tracking-widest">Locked / Empty</div>
                        )}
                    </div>
                   ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Area */}
        <div className="px-10 py-6 border-t border-gray-50 flex justify-between items-center bg-white">
            <div className="flex gap-4">
                <div className="px-5 py-2 bg-gray-50 rounded-xl text-[9px] font-black text-gray-400 uppercase tracking-widest border border-gray-100">
                    ID: {part.id}
                </div>
                {isAdmin && (
                  <button 
                    onClick={handleDecommission}
                    className="px-5 py-2 bg-red-50 text-red-600 rounded-xl text-[9px] font-black uppercase tracking-widest border border-red-100 hover:bg-red-600 hover:text-white transition-all flex items-center gap-2"
                  >
                    <Trash2 className="w-3 h-3" />
                    Decommission Asset
                  </button>
                )}
                <div className="px-5 py-2 bg-gray-50 rounded-xl text-[9px] font-black text-gray-400 uppercase tracking-widest border border-gray-100">
                    Audit: Verified
                </div>
            </div>
            <button onClick={onClose} className="px-12 py-4 bg-gray-900 text-white rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest shadow-2xl shadow-gray-200 hover:bg-gray-800 active:scale-95 transition-all">
                Close Dossier
            </button>
        </div>
      </div>
    </div>
  );
}
