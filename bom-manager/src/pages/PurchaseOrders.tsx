import React, { useState, useEffect } from 'react';
import { Search, Plus, Filter, Eye, Download, ShoppingCart, ChevronRight, FileText } from 'lucide-react';
import { purchaseOrdersApi } from '../api/purchase-orders';
import PODetailModal from '../components/purchase-orders/PODetailModal';
import exportUtils from '../utils/export';
import { useToast } from '../context/ToastContext';

export default function PurchaseOrders() {
  const { showToast } = useToast();
  const [pos, setPos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPOId, setSelectedPOId] = useState<number | null>(null);

  const loadPOs = async () => {
    setLoading(true);
    try {
      const data = await purchaseOrdersApi.getAll();
      setPos(data);
    } catch (err) {
      showToast('error', 'Failed to synchronize with procurement server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPOs();
  }, []);

  const filteredPOs = pos.filter(po =>
    po.po_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    po.suppliers?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExportPO = async (po: any) => {
    try {
      const fullPO = await purchaseOrdersApi.getById(po.id) as any;
      if (!fullPO) {
        showToast('error', 'Critical error: PO document not found');
        return;
      }

      const items = (fullPO.purchase_order_items || []).map((item: any) => ({
        ...item,
        part_number: item.part_number || 'N/A',
        description: item.description || '-'
      }));

      const poToExport = { ...fullPO, purchase_order_items: items };
      exportUtils.exportPOToCSV(poToExport);
      showToast('success', `Manifest for PO ${po.po_number} exported.`);
    } catch (err) {
      showToast('error', 'Failed to generate export bundle');
    }
  };

  const renderSkeletons = () => (
    <div className="card overflow-hidden">
      <div className="p-6 space-y-4">
        {[1, 2, 3, 4, 5].map(n => (
          <div key={n} className="skeleton h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );

  return (
    <div className="page-container py-8 page-enter">
      {/* Header */}
      <header className="page-header">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-navy-900 rounded-2xl flex items-center justify-center shadow-lg shadow-navy-900/10">
            <ShoppingCart className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="page-title">Purchase Records</h1>
            <p className="text-sm text-tertiary font-mono italic">Procurement Service Ledger</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative w-80">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-tertiary" />
            <input
              type="text"
              placeholder="Search manifests, suppliers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input w-full pl-11"
            />
          </div>

          <button className="btn btn-secondary flex items-center gap-2">
            <Filter className="w-4 h-4" />
            FILTER
          </button>
          <button className="btn btn-primary flex items-center gap-2 shadow-lg shadow-navy-900/10">
            <Plus className="w-4 h-4" />
            NEW MANIFEST
          </button>
        </div>
      </header>

      {/* Stats / Info bar */}
      <div className="mb-8 flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-tertiary bg-slate-50 p-2 px-4 rounded-xl border border-slate-100">
        <div className="flex items-center gap-4">
          <span>Total Entities: {pos.length}</span>
          <span className="w-1 h-1 bg-slate-300 rounded-full" />
          <span>Pending: {pos.filter(p => p.status === 'Pending').length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          System Synchronized
        </div>
      </div>

      {/* Main Table */}
      <div className="min-h-[500px]">
        {loading ? renderSkeletons() : filteredPOs.length === 0 ? (
          <div className="empty-state py-24">
            <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mb-6 border border-slate-100 shadow-inner">
              <ShoppingCart size={40} className="text-tertiary" />
            </div>
            <h3 className="section-title mb-2">No manifest records matching criteria</h3>
            <p className="text-secondary mb-8 max-w-sm">
              Either no purchase orders exist yet, or your filters are too restrictive.
            </p>
            <button 
              onClick={() => setSearchTerm('')}
              className="btn btn-secondary"
            >
              Clear search
            </button>
          </div>
        ) : (
          <div className="card overflow-hidden shadow-sm">
            <table className="data-table-modern">
              <thead>
                <tr>
                  <th>Manifest Ref</th>
                  <th>Supply Partner</th>
                  <th>Associated Project</th>
                  <th className="text-right">Net Valuation</th>
                  <th className="text-center">Status</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {filteredPOs.map((po) => (
                  <tr key={po.id} className="table-row-hover group cursor-pointer" onClick={() => setSelectedPOId(po.id)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-slate-50 rounded-lg border border-slate-100 text-navy-400 group-hover:text-amber-500 transition-colors">
                          <FileText size={16} />
                        </div>
                        <span className="font-black font-mono text-navy-900 group-hover:text-navy-700">
                          #{po.po_number}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="font-bold text-secondary">{po.suppliers?.name || '—'}</span>
                    </td>
                    <td>
                      <span className="text-sm font-medium text-tertiary">{po.project?.project_name || 'Global Pool'}</span>
                    </td>
                    <td className="text-right">
                      <div className="font-black text-navy-900 tabular-nums italic">
                        <span className="text-xs not-italic mr-1 text-tertiary">₹</span>
                        {(po.grand_total || po.total_amount || 0).toLocaleString('en-IN')}
                      </div>
                    </td>
                    <td className="text-center">
                      <span className={`badge ${
                        po.status === 'Received' ? 'badge-success' : 
                        po.status === 'Pending' ? 'badge-amber' : 
                        'badge-slate'
                      } !px-4`}>
                        {po.status}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all translate-x-1 group-hover:translate-x-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleExportPO(po); }}
                          className="btn btn-icon btn-sm btn-ghost hover:text-navy-600"
                          title="Export CSV"
                        >
                          <Download size={14} />
                        </button>
                        <button className="btn btn-icon btn-sm btn-ghost">
                          <ChevronRight size={16} className="text-slate-300" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedPOId && (
        <PODetailModal
          isOpen={true}
          onClose={() => { setSelectedPOId(null); loadPOs(); }}
          poId={selectedPOId}
          onStatusUpdated={loadPOs}
        />
      )}
    </div>
  );
}
