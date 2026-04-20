import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, Search, Package, ChevronDown, CheckCircle2,
  AlertTriangle, ShoppingCart, Truck, ArrowDownToLine,
  Info,
} from 'lucide-react';
import { purchaseOrdersApi } from '@/api/purchase-orders';
import { useToast } from '@/context/ToastContext';

interface POReceiveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ReceiveLine {
  itemId: number;
  partId: number;
  partType: string;
  partNumber: string;
  description: string;
  quantityOrdered: number;
  receivedQty: number; // already received before this session
  unitPrice: number;
  currency: string;
  receivingNow: number; // what user enters
}

export default function POReceiveModal({ isOpen, onClose }: POReceiveModalProps) {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [selectedPO, setSelectedPO] = useState<any>(null);
  const [lines, setLines] = useState<ReceiveLine[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Fetch all POs ready to receive
  const { data: pos = [], isLoading: posLoading } = useQuery({
    queryKey: ['pos-for-receiving'],
    queryFn: purchaseOrdersApi.getForReceiving,
    enabled: isOpen,
  });

  // When user picks a PO, build the line items
  useEffect(() => {
    if (!selectedPO) { setLines([]); return; }
    const items: ReceiveLine[] = (selectedPO.purchase_order_items || [])
      .filter((item: any) => (item.quantity || 0) > (item.received_qty || 0))
      .map((item: any) => {
        const outstanding = (item.quantity || 0) - (item.received_qty || 0);
        return {
          itemId: item.id,
          partId: item.part_id,
          partType: item.part_type,
          partNumber: item.part_number || '—',
          description: item.description || '',
          quantityOrdered: item.quantity || 0,
          receivedQty: item.received_qty || 0,
          unitPrice: item.unit_price || 0,
          currency: item.currency || 'INR',
          receivingNow: outstanding, // default = receive all outstanding
        };
      });
    setLines(items);
  }, [selectedPO]);

  const filteredPOs = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return pos;
    return pos.filter(
      (po: any) =>
        po.po_number?.toLowerCase().includes(q) ||
        po.suppliers?.name?.toLowerCase().includes(q) ||
        po.project?.project_name?.toLowerCase().includes(q)
    );
  }, [pos, search]);

  const updateLine = (itemId: number, qty: number) => {
    setLines(prev =>
      prev.map(l =>
        l.itemId === itemId
          ? { ...l, receivingNow: Math.max(0, Math.min(qty, l.quantityOrdered - l.receivedQty)) }
          : l
      )
    );
  };

  const totalReceiving = lines.reduce((s, l) => s + l.receivingNow, 0);
  const totalValue = lines.reduce((s, l) => s + l.receivingNow * l.unitPrice, 0);
  const anyReceiving = totalReceiving > 0;

  const receiveMutation = useMutation({
    mutationFn: () =>
      purchaseOrdersApi.receiveFromPO(
        selectedPO.id,
        lines.map(l => ({
          itemId: l.itemId,
          partId: l.partId,
          partType: l.partType,
          partNumber: l.partNumber,
          currentReceivedQty: l.receivedQty,
          receivingQty: l.receivingNow,
        }))
      ),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['stock-movements'] });
      qc.invalidateQueries({ queryKey: ['parts'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['pos-for-receiving'] });

      if (result.failed > 0) {
        showToast('error', `${result.failed} item(s) failed. ${result.succeeded} succeeded.`);
      } else {
        const msg =
          result.newStatus === 'Received'
            ? `PO fully received — status set to Received`
            : `Partial receipt saved — PO status: ${result.newStatus}`;
        showToast('success', msg);
      }
      onClose();
      setSelectedPO(null);
      setLines([]);
      setSearch('');
    },
    onError: (err: any) => {
      showToast('error', `Failed: ${err.message}`);
    },
  });

  if (!isOpen) return null;

  const PO_STATUS_CLS: Record<string, string> = {
    Confirmed: 'bg-amber-50 text-amber-700 border-amber-200',
    Partial:   'bg-blue-50  text-blue-700  border-blue-200',
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[92vh] overflow-hidden border border-gray-100">

        {/* Header */}
        <div className="px-7 py-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600 rounded-2xl shadow-lg shadow-emerald-200">
              <ArrowDownToLine className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-black text-gray-900 tracking-tight">Receive from PO</h3>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                Stock-in against purchase order
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-900 hover:bg-white rounded-xl border border-transparent hover:border-gray-100 transition-all"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-7 space-y-6">

          {/* Step 1 — Pick PO */}
          <section>
            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">
              1. Select Purchase Order
            </label>

            {!selectedPO ? (
              <div className="relative">
                {/* Trigger */}
                <button
                  onClick={() => setDropdownOpen(d => !d)}
                  className="w-full flex items-center gap-3 px-5 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl hover:bg-white hover:border-gray-900 transition-all text-left"
                >
                  <ShoppingCart className="h-5 w-5 text-gray-400 flex-shrink-0" />
                  <span className="flex-1 text-sm font-bold text-gray-400">
                    {posLoading ? 'Loading POs…' : `Choose a PO — ${pos.length} awaiting receipt`}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown */}
                {dropdownOpen && !posLoading && (
                  <div className="absolute top-full left-0 right-0 z-20 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
                    {/* Search within dropdown */}
                    <div className="p-3 border-b border-gray-50">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                        <input
                          type="text"
                          autoFocus
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          placeholder="Search by PO number, supplier, project…"
                          className="w-full pl-9 pr-3 py-2.5 bg-gray-50 rounded-xl text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-gray-900/5 transition-all"
                        />
                      </div>
                    </div>

                    {/* PO List */}
                    <div className="max-h-64 overflow-y-auto">
                      {filteredPOs.length === 0 ? (
                        <div className="p-6 text-center text-sm text-gray-400">
                          {search ? 'No POs match your search' : 'No POs awaiting receipt'}
                        </div>
                      ) : (
                        filteredPOs.map((po: any) => {
                          const outstanding = (po.purchase_order_items || []).filter(
                            (i: any) => (i.quantity || 0) > (i.received_qty || 0)
                          ).length;
                          return (
                            <button
                              key={po.id}
                              onClick={() => {
                                setSelectedPO(po);
                                setDropdownOpen(false);
                                setSearch('');
                              }}
                              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left border-b border-gray-50 last:border-none"
                            >
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="font-black text-gray-900 font-mono text-sm">
                                    #{po.po_number}
                                  </span>
                                  <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${PO_STATUS_CLS[po.status] || ''}`}>
                                    {po.status}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500 font-medium">
                                  {po.suppliers?.name}
                                  {po.project?.project_name && ` · ${po.project.project_name}`}
                                </p>
                              </div>
                              <div className="text-right flex-shrink-0 ml-4">
                                <div className="text-xs font-black text-gray-700">{outstanding} item{outstanding !== 1 ? 's' : ''}</div>
                                <div className="text-[10px] text-gray-400">outstanding</div>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Selected PO card */
              <div className="flex items-center justify-between p-5 bg-emerald-50 border border-emerald-200 rounded-2xl">
                <div className="flex items-center gap-4">
                  <div className="p-2.5 bg-emerald-100 rounded-xl">
                    <ShoppingCart className="h-5 w-5 text-emerald-700" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-black text-gray-900 font-mono">#{selectedPO.po_number}</span>
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${PO_STATUS_CLS[selectedPO.status] || ''}`}>
                        {selectedPO.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Truck className="h-3 w-3 text-gray-400" />
                      <p className="text-xs text-gray-600 font-medium">{selectedPO.suppliers?.name}</p>
                      {selectedPO.project?.project_name && (
                        <span className="text-xs text-gray-400">· {selectedPO.project.project_name}</span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedPO(null); setLines([]); }}
                  className="p-2 text-gray-400 hover:text-gray-900 hover:bg-white rounded-xl border border-transparent hover:border-gray-100 transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </section>

          {/* Step 2 — Line items */}
          {selectedPO && lines.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  2. Enter Received Quantities
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLines(prev => prev.map(l => ({ ...l, receivingNow: l.quantityOrdered - l.receivedQty })))}
                    className="text-[10px] font-black text-blue-600 hover:text-blue-800 px-3 py-1.5 bg-blue-50 rounded-xl border border-blue-100 transition-all"
                  >
                    Receive All
                  </button>
                  <button
                    onClick={() => setLines(prev => prev.map(l => ({ ...l, receivingNow: 0 })))}
                    className="text-[10px] font-black text-gray-500 hover:text-gray-900 px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-100 transition-all"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_80px_80px_80px_110px] gap-0 bg-gray-50 border-b border-gray-100">
                  <div className="px-5 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">Part</div>
                  <div className="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Ordered</div>
                  <div className="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Prev Rcvd</div>
                  <div className="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Balance</div>
                  <div className="px-3 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Rcv Now</div>
                </div>

                {/* Rows */}
                {lines.map((line) => {
                  const balance = line.quantityOrdered - line.receivedQty;
                  const isFullyReceiving = line.receivingNow === balance;
                  const isPartial = line.receivingNow > 0 && line.receivingNow < balance;
                  const isZero = line.receivingNow === 0;

                  return (
                    <div
                      key={line.itemId}
                      className={`grid grid-cols-[1fr_80px_80px_80px_110px] gap-0 border-b border-gray-50 last:border-none transition-colors ${
                        isFullyReceiving ? 'bg-emerald-50/40' : isPartial ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      {/* Part info */}
                      <div className="px-5 py-4 flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Package className="h-4 w-4 text-gray-300" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-gray-900 font-mono truncate">{line.partNumber}</p>
                          <p className="text-[11px] text-gray-400 truncate font-medium">{line.description || '—'}</p>
                        </div>
                      </div>

                      {/* Ordered */}
                      <div className="px-3 py-4 flex items-center justify-center">
                        <span className="text-sm font-bold text-gray-600 tabular-nums">{line.quantityOrdered}</span>
                      </div>

                      {/* Previously received */}
                      <div className="px-3 py-4 flex items-center justify-center">
                        <span className="text-sm font-bold text-gray-400 tabular-nums">{line.receivedQty}</span>
                      </div>

                      {/* Balance */}
                      <div className="px-3 py-4 flex items-center justify-center">
                        <span className={`text-sm font-black tabular-nums ${balance > 0 ? 'text-amber-700' : 'text-emerald-600'}`}>
                          {balance}
                        </span>
                      </div>

                      {/* Qty input */}
                      <div className="px-3 py-3 flex items-center justify-center">
                        <input
                          type="number"
                          min={0}
                          max={balance}
                          value={line.receivingNow === 0 ? '' : line.receivingNow}
                          placeholder="0"
                          onChange={e => updateLine(line.itemId, parseInt(e.target.value) || 0)}
                          className={`w-20 text-center py-2 px-2 rounded-xl border-2 text-sm font-black tabular-nums outline-none transition-all ${
                            isFullyReceiving
                              ? 'border-emerald-400 bg-emerald-50 text-emerald-700 focus:ring-2 focus:ring-emerald-200'
                              : isPartial
                              ? 'border-amber-300 bg-amber-50 text-amber-700 focus:ring-2 focus:ring-amber-200'
                              : 'border-gray-200 bg-white text-gray-900 focus:border-gray-900 focus:ring-2 focus:ring-gray-100'
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Info note */}
              <div className="flex items-start gap-2 mt-3 px-1">
                <Info className="h-3.5 w-3.5 text-gray-300 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-gray-400 font-medium">
                  Input pre-filled with the outstanding balance. Adjust if only partial delivery received.
                  Stock quantities and movement log will update on confirm.
                </p>
              </div>
            </section>
          )}

          {/* Empty state — PO selected but all items fulfilled */}
          {selectedPO && lines.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3" />
              <p className="text-sm font-black text-gray-700">All items fully received</p>
              <p className="text-xs text-gray-400 mt-1">This PO has no outstanding items.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-7 py-5 border-t border-gray-100 bg-white flex-shrink-0">
          {/* Summary */}
          {anyReceiving && (
            <div className="flex items-center justify-between mb-4 px-5 py-3.5 bg-gray-900 rounded-2xl text-white">
              <div className="flex items-center gap-3">
                <ArrowDownToLine className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-widest opacity-70">
                  Receiving {lines.filter(l => l.receivingNow > 0).length} line{lines.filter(l => l.receivingNow > 0).length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xl font-black tabular-nums">{totalReceiving} units</span>
                {totalValue > 0 && (
                  <span className="block text-xs opacity-50 tabular-nums">
                    ₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 text-sm font-black text-gray-500 hover:text-gray-900 rounded-2xl border border-gray-100 hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => receiveMutation.mutate()}
              disabled={!anyReceiving || receiveMutation.isPending}
              className="flex-[2] flex items-center justify-center gap-2 py-3 text-sm font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-2xl shadow-lg shadow-emerald-200 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {receiveMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <ArrowDownToLine className="h-4 w-4" />
                  Confirm Receipt — {totalReceiving} units
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
