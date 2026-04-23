import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  X, Truck, IndianRupee, Calendar, Upload, FileText,
  ExternalLink, Package, CheckCircle2, PlusCircle,
  Trash2, CreditCard, AlertTriangle, ChevronDown, Edit2,
  Hash,
} from 'lucide-react';
import { purchaseOrdersApi } from '../../api/purchase-orders';
import { poPaymentsApi, POPayment, PaymentType, PaymentMode, receivePoItem, issueOutPoItem } from '../../api/po-payments';
import { uploadFile, getSignedUrl } from '../../api/storage';
import { useToast } from '../../context/ToastContext';

interface PODetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  poId: number;
  onStatusUpdated?: () => void;
}

type Tab = 'overview' | 'items' | 'delivery' | 'payments';

const STATUS_COLORS: Record<string, string> = {
  Draft:     'bg-gray-100 text-gray-700 border-gray-200',
  Released:  'bg-blue-100 text-blue-700 border-blue-200',
  Sent:      'bg-indigo-100 text-indigo-700 border-indigo-200',
  Confirmed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Partial:   'bg-amber-100 text-amber-700 border-amber-200',
  Received:  'bg-green-100 text-green-700 border-green-200',
  Cancelled: 'bg-red-100 text-red-700 border-red-200',
};

const PAYMENT_TYPE_COLORS: Record<string, string> = {
  Advance: 'bg-blue-50 text-blue-700 border-blue-200',
  Partial: 'bg-amber-50 text-amber-700 border-amber-200',
  Final:   'bg-green-50 text-green-700 border-green-200',
  Refund:  'bg-red-50 text-red-700 border-red-200',
};

export default function PODetailModal({
  isOpen,
  onClose,
  poId,
  onStatusUpdated,
}: PODetailModalProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [po, setPo] = useState<any>(null);
  const [payments, setPayments] = useState<POPayment[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isUpdating, setIsUpdating] = useState(false);

  // Modal flow state logic
  const [receiveModalItem, setReceiveModalItem] = useState<any>(null);
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false);
  const [issueOutModalItem, setIssueOutModalItem] = useState<any>(null);
  const [isIssueOutModalOpen, setIsIssueOutModalOpen] = useState(false);
  const [currentAvailableStock, setCurrentAvailableStock] = useState<number>(0);

  const handleOpenReceiveModal = (item: any) => {
    setReceiveModalItem(item);
    setIsReceiveModalOpen(true);
  };

  const handleOpenIssueOutModal = async (item: any) => {
    setIssueOutModalItem(item);
    setIsIssueOutModalOpen(true);
    setCurrentAvailableStock(0);
    // Fetch live stock
    try {
      const { supabase } = await import('../../lib/supabase');
      const { data } = await supabase.from(item.part_type).select('stock_quantity').eq('id', item.part_id).single();
      if (data) setCurrentAvailableStock(data.stock_quantity || 0);
    } catch {}
  };
  
  const handleIssueOutSubmit = async (formData: {
    quantity: number;
    issueDate: string;
    notes?: string;
  }) => {
    if (!issueOutModalItem) return;
  
    if (formData.quantity <= 0 || formData.quantity > currentAvailableStock) {
      showToast('error', `Quantity must be between 1 and ${currentAvailableStock}`);
      return;
    }
  
    try {
      await issueOutPoItem(
        issueOutModalItem.id.toString(),
        formData.quantity,
        formData.issueDate,
        formData.notes
      );
  
      setIsIssueOutModalOpen(false);
      setIssueOutModalItem(null);
      showToast('success', 'Part issued to project successfully');
  
      await loadData();
      if (onStatusUpdated) onStatusUpdated();
    } catch (error: any) {
      console.error('Failed to issue part:', error);
      showToast('error', error.message || 'Error issuing part. Please try again.');
    }
  };
  
  const handleReceiveSubmit = async (formData: {
    quantity: number;
    receiptDate: string;
    notes?: string;
  }) => {
    if (!receiveModalItem) return;
  
    const pending = Math.max(0, receiveModalItem.quantity - (receiveModalItem.received_qty || 0));
    if (formData.quantity <= 0 || formData.quantity > pending) {
      showToast('error', `Quantity must be between 1 and ${pending}`);
      return;
    }
  
    try {
      await receivePoItem(
        receiveModalItem.id.toString(),
        formData.quantity,
        formData.receiptDate,
        formData.notes
      );
  
      setIsReceiveModalOpen(false);
      setReceiveModalItem(null);
      showToast('success', 'Receipt recorded successfully');
      
      // Refresh the PO data so RECEIVED / PENDING update instantly
      await loadData();
      if (onStatusUpdated) onStatusUpdated();
    } catch (error: any) {
      console.error('Failed to record receipt:', error);
      showToast('error', error.message || 'Error recording receipt. Please try again.');
    }
  };

  // Overview state
  const [bepPoPdfUrl, setBepPoPdfUrl] = useState('');   // stored value (path or external URL)
  const [viewPdfUrl, setViewPdfUrl] = useState('');      // always a usable URL for the browser
  const [poNumberInput, setPoNumberInput] = useState('');
  const [isEditingPoNumber, setIsEditingPoNumber] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Delivery state
  const [actualDeliveryDate, setActualDeliveryDate] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [receiveQtys, setReceiveQtys] = useState<Record<number, number>>({});
  const [isReceiving, setIsReceiving] = useState(false);

  // Payment state
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newPayment, setNewPayment] = useState({
    amount: '',
    payment_type: 'Advance' as PaymentType,
    payment_mode: 'Bank Transfer' as PaymentMode,
    payment_date: new Date().toISOString().split('T')[0],
    reference_number: '',
    notes: '',
  });

  const uniqueProjects = React.useMemo(() => {
    if (!po?.purchase_order_items) return [];
    
    const projectsMap = new Map();
    // primary project attached directly
    if (po.project) {
       projectsMap.set(po.project_id, { id: po.project_id, name: po.project.project_name, projectCode: po.project.project_number });
    }
    
    // projects from parts
    po.purchase_order_items.forEach((item: any) => {
      const proj = item.project_part?.project_subsection?.section?.project;
      if (proj && proj.id) {
         projectsMap.set(proj.id, { id: proj.id, name: proj.project_name, projectCode: proj.project_number });
      }
    });
    
    return Array.from(projectsMap.values());
  }, [po]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [poData, paymentsData, receiptsData] = await Promise.all([
        purchaseOrdersApi.getById(poId) as Promise<any>,
        poPaymentsApi.getByPO(poId),
        poPaymentsApi.getReceiptsByPO(poId),
      ]);
      setPo(poData);
      setPayments(paymentsData);
      setReceipts(receiptsData);
      setPoNumberInput(poData.po_number || '');

      // ── Resolve a usable view URL from the stored value ──
      const stored = poData.bep_po_pdf_url || '';
      setBepPoPdfUrl(stored);
      if (!stored) {
        setViewPdfUrl('');
      } else if (!stored.startsWith('http')) {
        // It's a raw storage path — sign it fresh
        const fresh = await getSignedUrl(stored, 3600);
        setViewPdfUrl(fresh || stored);
      } else if (stored.includes('/storage/v1/object/sign/drawings/')) {
        // Legacy: old signed URL saved in DB — extract path and re-sign
        const match = stored.match(/\/drawings\/(.+?)(?:\?|$)/);
        if (match) {
          const fresh = await getSignedUrl(match[1], 3600);
          setViewPdfUrl(fresh || stored);
        } else {
          setViewPdfUrl(stored);
        }
      } else {
        // External URL (manually pasted) — use as-is
        setViewPdfUrl(stored);
      }
      setActualDeliveryDate(
        poData.actual_delivery_date
          ? new Date(poData.actual_delivery_date).toISOString().split('T')[0]
          : ''
      );
      setExpectedDeliveryDate(
        poData.expected_delivery_date
          ? new Date(poData.expected_delivery_date).toISOString().split('T')[0]
          : ''
      );
      setDeliveryNotes(poData.delivery_notes || '');
    } catch {
      showToast('error', 'Failed to load PO details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && poId) loadData();
  }, [isOpen, poId]);

  // ── Status helpers ────────────────────────────────────────────────────────

  const handleStatusUpdate = async (newStatus: string) => {
    try {
      setIsUpdating(true);
      if (newStatus === 'Released' && !po?.bep_po_pdf_url) {
        showToast('error', 'Attach BEP PO PDF before releasing');
        return;
      }
      await purchaseOrdersApi.updateStatus(poId, newStatus as any);
      showToast('success', `Status → ${newStatus}`);
      
      // Invalidate project queries to refresh BOM tree status badges
      if (po?.project_id) {
        queryClient.invalidateQueries({ queryKey: ['bom-tree', po.project_id] });
        queryClient.invalidateQueries({ queryKey: ['project', po.project_id] });
        queryClient.invalidateQueries({ queryKey: ['project-pos', po.project_id] });
        queryClient.invalidateQueries({ queryKey: ['po-line-items', po.project_id] });
        queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      }

      await loadData();
      onStatusUpdated?.();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  // ── PDF / PO number ───────────────────────────────────────────────────────

  const handleSavePoNumber = async () => {
    try {
      setIsUpdating(true);
      await purchaseOrdersApi.updatePurchaseOrder(poId, { po_number: poNumberInput });
      showToast('success', 'PO number updated');
      setIsEditingPoNumber(false);
      await loadData();
      onStatusUpdated?.();
    } catch {
      showToast('error', 'Failed to update PO number');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSavePdf = async () => {
    try {
      setIsUpdating(true);
      await purchaseOrdersApi.updatePurchaseOrder(poId, { bep_po_pdf_url: bepPoPdfUrl });
      showToast('success', 'Document URL saved');
      await loadData();
    } catch {
      showToast('error', 'Failed to save document URL');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploading(true);
      const result = await uploadFile(file, 'purchase_orders', poId, 'pdf', { overwrite: true });
      if (result.success && result.filePath) {
        // Save the storage PATH (not the signed URL) so it never expires in the DB
        setBepPoPdfUrl(result.filePath);
        setViewPdfUrl(result.signedUrl || result.filePath);
        await purchaseOrdersApi.updatePurchaseOrder(poId, { bep_po_pdf_url: result.filePath });
        showToast('success', 'PDF uploaded and attached!');
        await loadData();
      } else if (result.error) {
        showToast('error', result.error);
      }
    } catch (err: any) {
      showToast('error', `Upload failed: ${err.message}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Delivery ─────────────────────────────────────────────────────────────

  const handleSaveDelivery = async () => {
    try {
      setIsUpdating(true);
      await poPaymentsApi.updateDelivery(poId, {
        actual_delivery_date: actualDeliveryDate
          ? new Date(actualDeliveryDate).toISOString()
          : undefined,
        expected_delivery_date: expectedDeliveryDate
          ? new Date(expectedDeliveryDate).toISOString()
          : undefined,
        delivery_notes: deliveryNotes,
      });
      showToast('success', 'Delivery info saved');
      await loadData();
    } catch {
      showToast('error', 'Failed to save delivery info');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReceiveItems = async () => {
    const items = Object.entries(receiveQtys)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ id: parseInt(id), received_qty: qty }));

    if (!items.length) {
      showToast('error', 'Enter quantities to receive');
      return;
    }
    try {
      setIsReceiving(true);
      await poPaymentsApi.receiveItems(poId, items);
      showToast('success', 'Stock updated successfully');
      setReceiveQtys({});
      await loadData();
      onStatusUpdated?.();
    } catch (err: any) {
      showToast('error', err.message);
    } finally {
      setIsReceiving(false);
    }
  };

  // ── Payments ─────────────────────────────────────────────────────────────

  const handleAddPayment = async () => {
    if (!newPayment.amount || parseFloat(newPayment.amount) <= 0) {
      showToast('error', 'Enter a valid amount');
      return;
    }
    try {
      setIsUpdating(true);
      await poPaymentsApi.add({
        purchase_order_id: poId,
        amount: parseFloat(newPayment.amount),
        payment_type: newPayment.payment_type,
        payment_mode: newPayment.payment_mode,
        payment_date: new Date(newPayment.payment_date).toISOString(),
        reference_number: newPayment.reference_number || null,
        notes: newPayment.notes || null,
      });
      showToast('success', 'Payment recorded');
      setShowAddPayment(false);
      setNewPayment({
        amount: '',
        payment_type: 'Advance',
        payment_mode: 'Bank Transfer',
        payment_date: new Date().toISOString().split('T')[0],
        reference_number: '',
        notes: '',
      });
      await loadData();
    } catch {
      showToast('error', 'Failed to record payment');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeletePayment = async (id: number) => {
    if (!confirm('Delete this payment entry?')) return;
    try {
      await poPaymentsApi.delete(id);
      showToast('success', 'Payment removed');
      await loadData();
    } catch {
      showToast('error', 'Failed to delete payment');
    }
  };

  if (!isOpen) return null;

  const totalPaid = payments.reduce((sum, p) => sum + (p.payment_type === 'Refund' ? -p.amount : p.amount), 0);
  const balanceDue = (po?.grand_total || 0) - totalPaid;
  const paymentPct = po?.grand_total ? Math.min(100, (totalPaid / po.grand_total) * 100) : 0;

  const daysUntilDelivery = po?.expected_delivery_date
    ? Math.ceil((new Date(po.expected_delivery_date).getTime() - Date.now()) / 86400000)
    : null;
  const isOverdue = daysUntilDelivery !== null && daysUntilDelivery < 0 && po?.status !== 'Received';

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <FileText className="w-4 h-4" /> },
    { id: 'items',    label: 'Items', icon: <Package className="w-4 h-4" /> },
    { id: 'delivery', label: 'Delivery', icon: <Truck className="w-4 h-4" /> },
    { id: 'payments', label: 'Payments', icon: <CreditCard className="w-4 h-4" /> },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-[2.5rem] w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">

        {/* ── Header ── */}
        <div className="px-10 py-7 border-b flex items-center justify-between bg-gray-50/50 shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-1.5">
              {isEditingPoNumber ? (
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-gray-400" />
                  <input
                    className="text-2xl font-black tracking-tight border-b-2 border-primary-600 outline-none bg-transparent w-48"
                    value={poNumberInput}
                    onChange={e => setPoNumberInput(e.target.value)}
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleSavePoNumber()}
                  />
                  <button
                    onClick={handleSavePoNumber}
                    disabled={isUpdating}
                    className="px-3 py-1 bg-gray-900 text-white text-[10px] font-black rounded-xl uppercase tracking-widest"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => { setIsEditingPoNumber(false); setPoNumberInput(po?.po_number || ''); }}
                    className="text-gray-400 hover:text-gray-700 text-xs font-bold"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditingPoNumber(true)}
                  className="flex items-center gap-2 group"
                >
                  <h1 className="text-2xl font-black tracking-tight text-gray-900">PO #{po?.po_number}</h1>
                  <Edit2 className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )}
              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${STATUS_COLORS[po?.status] || ''}`}>
                {po?.status}
              </span>

              {po?.payment_status && (
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                  po.payment_status === 'Paid' ? 'bg-green-50 text-green-700 border-green-200' :
                  po.payment_status === 'Partial' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  'bg-gray-50 text-gray-500 border-gray-200'
                }`}>
                  {po.payment_status}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 font-medium flex items-center gap-2">
              <Truck className="w-4 h-4" />{po?.suppliers?.name}
              <span className="text-gray-300">·</span>
              <Calendar className="w-4 h-4" />
              {po?.po_date && new Date(po.po_date).toLocaleDateString('en-IN')}
            </p>
            
            {uniqueProjects.length > 0 && (
              <div className="flex items-center gap-2 mt-4">
                <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Released for Project(s):</span>
                <div className="flex flex-wrap gap-2">
                  {uniqueProjects.map(project => (
                    <span key={project.id} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-[10px] font-black uppercase tracking-widest rounded-full border border-gray-200 shadow-sm">
                      {project.name || project.projectCode} ({project.projectCode})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-3 hover:bg-white rounded-2xl transition-all">
            <X className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-gray-100 px-10 shrink-0 bg-white">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-auto p-10">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-10 h-10 border-4 border-gray-900 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* ════════════ OVERVIEW TAB ════════════ */}
              {activeTab === 'overview' && (
                <div className="space-y-8">
                  {/* Key metrics */}
                  <div className="grid grid-cols-3 gap-5">
                    <div className="bg-gray-50 rounded-[2rem] p-6 flex flex-col gap-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">PO Value</p>
                      <p className="text-2xl font-black text-gray-900 tabular-nums">
                        ₹{po?.grand_total?.toLocaleString('en-IN')}
                      </p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">{po?.currency}</p>
                    </div>
                    <div className={`rounded-[2rem] p-6 flex flex-col gap-1 ${isOverdue ? 'bg-red-50' : 'bg-gray-50'}`}>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Expected Delivery</p>
                      <p className="text-lg font-black text-gray-900">
                        {po?.expected_delivery_date
                          ? new Date(po.expected_delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                          : '—'}
                      </p>
                      {isOverdue && (
                        <p className="text-[10px] font-black text-red-600 flex items-center gap-1 animate-pulse">
                          <AlertTriangle className="w-3 h-3" /> {Math.abs(daysUntilDelivery!)} days overdue
                        </p>
                      )}
                      {daysUntilDelivery !== null && !isOverdue && (
                        <p className="text-[10px] font-bold text-gray-400 uppercase">{daysUntilDelivery} days remaining</p>
                      )}
                    </div>
                    <div className="bg-gray-50 rounded-[2rem] p-6 flex flex-col gap-1">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payment</p>
                      <p className="text-2xl font-black text-gray-900 tabular-nums">
                        ₹{totalPaid.toLocaleString('en-IN')}
                      </p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">
                        of ₹{po?.grand_total?.toLocaleString('en-IN')} paid
                      </p>
                    </div>
                  </div>

                  {/* PO Document */}
                  <div className="bg-gray-50 rounded-[2rem] p-7">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">PO Document</h3>
                      {viewPdfUrl && (
                        <a href={viewPdfUrl} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-[10px] font-black text-blue-600 uppercase tracking-widest underline underline-offset-4"
                        >
                          <ExternalLink className="w-3 h-3" />View PDF
                        </a>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <FileText className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={bepPoPdfUrl}
                          onChange={e => setBepPoPdfUrl(e.target.value)}
                          placeholder="Paste PDF URL or upload file below..."
                          className="w-full bg-white border border-gray-200 rounded-2xl px-12 py-3.5 text-xs font-bold focus:ring-2 focus:ring-gray-900 outline-none"
                        />
                      </div>
                      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="application/pdf" className="hidden" />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="flex items-center gap-1.5 px-5 py-3.5 bg-white border border-gray-200 text-[10px] font-black rounded-2xl uppercase tracking-widest"
                      >
                        <Upload className="w-4 h-4" />{isUploading ? 'Uploading...' : 'Upload'}
                      </button>
                      <button
                        onClick={handleSavePdf}
                        disabled={isUpdating || bepPoPdfUrl === po?.bep_po_pdf_url}
                        className="px-6 py-3.5 bg-gray-900 text-white text-[10px] font-black rounded-2xl uppercase tracking-widest disabled:opacity-40"
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  {/* Status controls */}
                  <div>
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Status Actions</h3>
                    <div className="flex flex-wrap gap-3">
                      {po?.status === 'Draft' && (
                        <button
                          onClick={() => handleStatusUpdate('Released')}
                          disabled={isUpdating || !po?.bep_po_pdf_url}
                          className="px-6 py-3 bg-blue-600 text-white text-[10px] font-black rounded-2xl uppercase tracking-widest shadow-lg shadow-blue-200 disabled:opacity-40"
                          title={!po?.bep_po_pdf_url ? 'Attach PDF first' : ''}
                        >
                          Release PO
                        </button>
                      )}
                      {po?.status === 'Released' && (
                        <button onClick={() => handleStatusUpdate('Sent')} disabled={isUpdating}
                          className="px-6 py-3 bg-indigo-600 text-white text-[10px] font-black rounded-2xl uppercase tracking-widest">
                          Mark Sent
                        </button>
                      )}
                      {po?.status === 'Sent' && (
                        <button onClick={() => handleStatusUpdate('Confirmed')} disabled={isUpdating}
                          className="px-6 py-3 bg-emerald-600 text-white text-[10px] font-black rounded-2xl uppercase tracking-widest">
                          Confirm by Supplier
                        </button>
                      )}
                      {!['Received', 'Cancelled'].includes(po?.status) && (
                        <button onClick={() => handleStatusUpdate('Cancelled')} disabled={isUpdating}
                          className="px-6 py-3 bg-white border border-red-200 text-red-600 text-[10px] font-black rounded-2xl uppercase tracking-widest">
                          Cancel PO
                        </button>
                      )}
                      {po?.status === 'Cancelled' && (
                        <div className="px-6 py-3 bg-red-50 text-red-600 text-[10px] font-black rounded-2xl uppercase tracking-widest border border-red-100">
                          This PO is cancelled
                        </div>
                      )}
                    </div>
                    {po?.status === 'Draft' && !po?.bep_po_pdf_url && (
                      <p className="text-[10px] text-amber-600 font-bold mt-3 flex items-center gap-1.5">
                        <AlertTriangle className="w-3 h-3" />Attach BEP PO PDF to enable release
                      </p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'items' && (
                <div className="space-y-5">
                  <div className="border border-gray-100 rounded-3xl overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-gray-50 pb-2">
                        <tr>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Part</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Description</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Unit Price</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Disc. %</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Ordered</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Received</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Pending</th>
                          <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(po?.purchase_order_items || []).map((item: any) => (
                          <tr key={item.id} className="hover:bg-gray-50/50">
                            <td className="px-6 py-4">
                              <div className="font-black text-sm text-gray-900 font-mono">{item.part_number}</div>
                              {item.manufacturer_part_number && (
                                <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-1">
                                  MPN: {item.manufacturer_part_number}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 text-xs text-gray-500 max-w-[200px] truncate">{item.description || '—'}</td>
                            <td className="px-6 py-4 font-bold text-sm tabular-nums text-gray-500">
                               ₹{item.unit_price?.toLocaleString('en-IN')}
                            </td>
                            <td className="px-6 py-4 font-bold text-sm tabular-nums text-indigo-600">
                               {item.discount_percent || 0}%
                            </td>
                            <td className="px-6 py-4 font-black text-sm tabular-nums">{item.quantity}</td>
                            <td className="px-6 py-4">
                              <span className={`font-black text-sm tabular-nums ${
                                (item.received_qty || 0) >= item.quantity ? 'text-green-600' :
                                (item.received_qty || 0) > 0 ? 'text-amber-600' : 'text-gray-300'
                              }`}>{item.received_qty || 0}</span>
                            </td>
                            <td className="px-6 py-4 font-bold text-sm tabular-nums text-gray-500">
                              {Math.max(0, item.quantity - (item.received_qty || 0))}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleOpenReceiveModal(item)}
                                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black rounded-lg uppercase tracking-widest shadow-md shadow-blue-200 transition-all transform active:scale-95"
                                >
                                  Data IN
                                </button>
                                
                                <button
                                  onClick={() => handleOpenIssueOutModal(item)}
                                  className="inline-flex items-center px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-[11px] font-black rounded-lg uppercase tracking-widest transition-all transform active:scale-95"
                                >
                                  Issue Out
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="bg-gray-50 rounded-2xl p-4 flex justify-between items-center">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{po?.purchase_order_items?.length || 0} line items</span>
                    <span className="text-lg font-black text-gray-900">PO Total: ₹{po?.grand_total?.toLocaleString('en-IN')}</span>
                  </div>

                  {/* ── Receipt History (Audit Trail) ── */}
                  <div className="mt-8 space-y-4">
                    <div className="flex items-center justify-between px-2">
                       <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                         <Package className="w-4 h-4" /> Receipt History Audit trail
                       </h3>
                       <span className="text-[10px] font-bold text-gray-400">{receipts.length} transactions</span>
                    </div>
                    
                    {receipts.length > 0 ? (
                      <div className="border border-gray-100 rounded-3xl overflow-hidden bg-white">
                        <table className="w-full text-left">
                          <thead className="bg-gray-50/50">
                            <tr>
                              {['Date', 'Part', 'Quantity', 'Notes', 'RecordedBy'].map(h => (
                                <th key={h} className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {receipts.map((r, idx) => (
                              <tr key={r.id || idx} className="hover:bg-gray-50/30">
                                <td className="px-6 py-4 text-xs font-bold text-gray-600">
                                  {new Date(r.receipt_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </td>
                                <td className="px-6 py-4">
                                  <div className="text-xs font-black text-gray-900 font-mono">{r.purchase_order_items?.part_number || 'N/A'}</div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="bg-green-50 text-green-700 px-3 py-1 rounded-full text-xs font-black">
                                    +{r.quantity}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-xs text-gray-500 italic max-w-[200px] truncate">
                                  {r.notes || '—'}
                                </td>
                                <td className="px-6 py-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                  {r.created_by_email || 'System'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-10 border-2 border-dashed border-gray-100 rounded-[2rem] text-center">
                        <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">No receipt history recorded yet</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ════════════ DELIVERY TAB ════════════ */}
              {activeTab === 'delivery' && (
                <div className="space-y-8">
                  {/* Delivery info form */}
                  <div className="bg-gray-50 rounded-[2rem] p-7 space-y-5">
                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Delivery Information</h3>
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Expected Delivery</label>
                        <input
                          type="date"
                          value={expectedDeliveryDate}
                          onChange={e => setExpectedDeliveryDate(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold focus:ring-2 focus:ring-gray-900 outline-none"
                        />
                        {isOverdue && (
                          <p className="text-[10px] text-red-600 font-black mt-1.5 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />{Math.abs(daysUntilDelivery!)} days overdue
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Actual Delivery Date</label>
                        <input
                          type="date"
                          value={actualDeliveryDate}
                          onChange={e => setActualDeliveryDate(e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold focus:ring-2 focus:ring-gray-900 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Delivery Notes</label>
                      <textarea
                        value={deliveryNotes}
                        onChange={e => setDeliveryNotes(e.target.value)}
                        rows={3}
                        placeholder="Courier details, condition of goods, discrepancies..."
                        className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-4 text-sm font-medium resize-none focus:ring-2 focus:ring-gray-900 outline-none"
                      />
                    </div>
                    <button
                      onClick={handleSaveDelivery}
                      disabled={isUpdating}
                      className="px-8 py-3.5 bg-gray-900 text-white text-[10px] font-black rounded-2xl uppercase tracking-widest disabled:opacity-50"
                    >
                      {isUpdating ? 'Saving...' : 'Save Delivery Info'}
                    </button>
                  </div>

                  {/* Receive items */}
                  {['Confirmed', 'Partial', 'Sent'].includes(po?.status) && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Receive Items</h3>
                      <p className="text-xs text-gray-500 font-medium">Enter quantities received. Stock will be updated automatically.</p>
                      <div className="border border-gray-100 rounded-3xl overflow-hidden">
                        <table className="w-full text-left">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Part</th>
                              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Ordered</th>
                              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Already Received</th>
                              <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Receive Now</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {(po?.purchase_order_items || []).map((item: any) => {
                              const remaining = item.quantity - (item.received_qty || 0);
                              return (
                                <tr key={item.id}>
                                  <td className="px-6 py-4 font-black text-sm font-mono">{item.part_number}</td>
                                  <td className="px-6 py-4 text-center font-bold">{item.quantity}</td>
                                  <td className="px-6 py-4 text-center">
                                    <span className={`font-black ${item.received_qty ? 'text-amber-600' : 'text-gray-300'}`}>
                                      {item.received_qty || 0}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-center">
                                    {remaining > 0 ? (
                                      <input
                                        type="number"
                                        min={0}
                                        max={remaining}
                                        value={receiveQtys[item.id] ?? ''}
                                        onChange={e => setReceiveQtys(prev => ({ ...prev, [item.id]: parseInt(e.target.value) || 0 }))}
                                        placeholder={`max ${remaining}`}
                                        className="w-24 mx-auto block bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-center outline-none focus:ring-2 focus:ring-gray-900"
                                      />
                                    ) : (
                                      <span className="text-green-600 font-black text-xs">✓ Complete</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <button
                        onClick={handleReceiveItems}
                        disabled={isReceiving}
                        className="flex items-center gap-2 px-8 py-4 bg-emerald-600 text-white text-[10px] font-black rounded-2xl uppercase tracking-widest shadow-lg shadow-emerald-200 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {isReceiving ? 'Updating Stock...' : 'Confirm Receipt & Update Stock'}
                      </button>
                    </div>
                  )}

                  {po?.status === 'Received' && (
                    <div className="bg-green-50 border border-green-200 rounded-2xl p-6 flex items-center gap-4">
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                      <div>
                        <p className="font-black text-green-900 text-sm uppercase tracking-widest">All items received</p>
                        {po?.actual_delivery_date && (
                          <p className="text-xs text-green-700 font-bold mt-1">
                            On {new Date(po.actual_delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ════════════ PAYMENTS TAB ════════════ */}
              {activeTab === 'payments' && (
                <div className="space-y-8">
                  {/* Summary cards */}
                  <div className="grid grid-cols-3 gap-5">
                    <div className="bg-gray-50 rounded-[2rem] p-6">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">PO Total</p>
                      <p className="text-2xl font-black text-gray-900 tabular-nums">₹{po?.grand_total?.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="bg-emerald-50 rounded-[2rem] p-6">
                      <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-2">Total Paid</p>
                      <p className="text-2xl font-black text-emerald-900 tabular-nums">₹{totalPaid.toLocaleString('en-IN')}</p>
                    </div>
                    <div className={`rounded-[2rem] p-6 ${balanceDue > 0 ? 'bg-amber-50' : 'bg-green-50'}`}>
                      <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${balanceDue > 0 ? 'text-amber-700' : 'text-green-700'}`}>Balance Due</p>
                      <p className={`text-2xl font-black tabular-nums ${balanceDue > 0 ? 'text-amber-900' : 'text-green-900'}`}>₹{balanceDue.toLocaleString('en-IN')}</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payment progress</span>
                      <span className="text-xs font-black text-gray-900">{paymentPct.toFixed(0)}%</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${paymentPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Add payment form */}
                  {showAddPayment ? (
                    <div className="bg-gray-50 rounded-[2rem] p-7 space-y-5 animate-in fade-in duration-300">
                      <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Record Payment</h3>
                      <div className="grid grid-cols-2 gap-5">
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Amount (₹) *</label>
                          <input
                            type="number"
                            step="0.01"
                            value={newPayment.amount}
                            onChange={e => setNewPayment(p => ({ ...p, amount: e.target.value }))}
                            placeholder="0.00"
                            className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-3 text-sm font-black tabular-nums outline-none focus:ring-2 focus:ring-gray-900"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Payment Date</label>
                          <input
                            type="date"
                            value={newPayment.payment_date}
                            onChange={e => setNewPayment(p => ({ ...p, payment_date: e.target.value }))}
                            className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-gray-900"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Payment Type</label>
                          <select
                            value={newPayment.payment_type}
                            onChange={e => setNewPayment(p => ({ ...p, payment_type: e.target.value as PaymentType }))}
                            className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-gray-900 appearance-none"
                          >
                            {['Advance', 'Partial', 'Final', 'Refund'].map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Payment Mode</label>
                          <select
                            value={newPayment.payment_mode}
                            onChange={e => setNewPayment(p => ({ ...p, payment_mode: e.target.value as PaymentMode }))}
                            className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-gray-900 appearance-none"
                          >
                            {['Bank Transfer', 'Cheque', 'Cash', 'UPI', 'Credit Card', 'Other'].map(m => (
                              <option key={m} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Reference / Cheque No.</label>
                          <input
                            type="text"
                            value={newPayment.reference_number}
                            onChange={e => setNewPayment(p => ({ ...p, reference_number: e.target.value }))}
                            placeholder="UTR, cheque number..."
                            className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-gray-900"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Notes</label>
                          <input
                            type="text"
                            value={newPayment.notes}
                            onChange={e => setNewPayment(p => ({ ...p, notes: e.target.value }))}
                            placeholder="Optional remark..."
                            className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-gray-900"
                          />
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={handleAddPayment}
                          disabled={isUpdating}
                          className="px-8 py-3.5 bg-gray-900 text-white text-[10px] font-black rounded-2xl uppercase tracking-widest disabled:opacity-50"
                        >
                          {isUpdating ? 'Saving...' : 'Record Payment'}
                        </button>
                        <button
                          onClick={() => setShowAddPayment(false)}
                          className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-900"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddPayment(true)}
                      className="flex items-center gap-2 px-6 py-3.5 bg-white border border-gray-200 text-[10px] font-black rounded-2xl uppercase tracking-widest hover:bg-gray-50 shadow-sm"
                    >
                      <PlusCircle className="w-4 h-4" />Add Payment Entry
                    </button>
                  )}

                  {/* Payment history */}
                  {payments.length > 0 && (
                    <div className="space-y-3">
                      <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Payment History</h3>
                      {payments.map(payment => (
                        <div key={payment.id} className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between group hover:border-gray-300 transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center border border-gray-100">
                              <CreditCard className="w-4 h-4 text-gray-400" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg border ${PAYMENT_TYPE_COLORS[payment.payment_type]}`}>
                                  {payment.payment_type}
                                </span>
                                <span className="text-[10px] text-gray-400 font-bold uppercase">{payment.payment_mode}</span>
                                {payment.reference_number && (
                                  <span className="text-[10px] font-mono text-gray-500">#{payment.reference_number}</span>
                                )}
                              </div>
                              <p className="text-[10px] text-gray-400 font-bold">
                                {new Date(payment.payment_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                {payment.notes && <span className="ml-2 italic">· {payment.notes}</span>}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`text-lg font-black tabular-nums ${payment.payment_type === 'Refund' ? 'text-red-600' : 'text-emerald-700'}`}>
                              {payment.payment_type === 'Refund' ? '-' : ''}₹{payment.amount.toLocaleString('en-IN')}
                            </span>
                            <button
                              onClick={() => handleDeletePayment(payment.id)}
                              className="p-2 text-gray-200 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100 rounded-xl hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {payments.length === 0 && !showAddPayment && (
                    <div className="text-center py-12 border-2 border-dashed border-gray-100 rounded-[2rem]">
                      <CreditCard className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No payments recorded</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-10 py-5 border-t flex justify-between items-center bg-white shrink-0">
          <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">
            Last updated: {po?.updated_date ? new Date(po.updated_date).toLocaleString('en-IN') : '—'}
          </p>
          <button
            onClick={onClose}
            className="px-10 py-3 bg-gray-900 text-white text-[10px] font-black rounded-2xl uppercase tracking-widest hover:bg-gray-800 transition-all"
          >
            Close
          </button>
        </div>
      </div>

      {/* RECEIVE MODAL */}
      {isReceiveModalOpen && receiveModalItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full mx-4 overflow-hidden border border-gray-100">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-white">
              <h3 className="font-black text-gray-900 tracking-tight text-lg">Record Receipt</h3>
              <button
                onClick={() => { setIsReceiveModalOpen(false); setReceiveModalItem(null); }}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100/50">
                <label className="block text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1.5">Receiving Part</label>
                <div className="font-bold text-sm text-blue-900">
                  <span className="font-mono bg-white px-2 py-0.5 rounded shadow-sm border border-blue-100 mr-2">{receiveModalItem.part_number || receiveModalItem.id}</span>
                  <span className="opacity-80">{receiveModalItem.description || 'No description'}</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                  Quantity to Receive <span className="text-amber-600">(MAX {Math.max(0, receiveModalItem.quantity - (receiveModalItem.received_qty || 0))})</span>
                </label>
                <input
                  type="number"
                  id="receive-quantity"
                  defaultValue={Math.max(0, receiveModalItem.quantity - (receiveModalItem.received_qty || 0))}
                  min="1"
                  max={Math.max(0, receiveModalItem.quantity - (receiveModalItem.received_qty || 0))}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 text-base font-bold focus:bg-white focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Receipt Date</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    id="receive-date"
                    defaultValue={new Date().toISOString().split('T')[0]}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-12 pr-5 py-3.5 text-sm font-bold focus:bg-white focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Notes (optional)</label>
                <textarea
                  id="receive-notes"
                  rows={3}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 text-sm font-medium focus:bg-white focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none transition-all resize-none"
                  placeholder="Invoice references, GRN info..."
                />
              </div>
            </div>

            <div className="px-6 py-5 bg-gray-50/80 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => { setIsReceiveModalOpen(false); setReceiveModalItem(null); }}
                className="flex-1 py-3.5 px-4 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 text-gray-700 text-xs font-black rounded-2xl uppercase tracking-widest transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const qty = parseInt((document.getElementById('receive-quantity') as HTMLInputElement).value);
                  const date = (document.getElementById('receive-date') as HTMLInputElement).value;
                  const notes = (document.getElementById('receive-notes') as HTMLTextAreaElement).value.trim();

                  handleReceiveSubmit({
                    quantity: qty,
                    receiptDate: date,
                    notes: notes || undefined
                  });
                }}
                className="flex-1 py-3.5 px-4 bg-blue-600 hover:bg-blue-700 hover:shadow-lg hover:shadow-blue-200 text-white text-xs font-black rounded-2xl uppercase tracking-widest transition-all focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
              >
                Confirm Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ISSUE OUT MODAL */}
      {isIssueOutModalOpen && issueOutModalItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full mx-4 overflow-hidden border border-gray-100">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-white">
              <h3 className="font-black text-gray-900 tracking-tight text-lg">Issue Out to Project</h3>
              <button
                onClick={() => { setIsIssueOutModalOpen(false); setIssueOutModalItem(null); }}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-red-50/50 p-4 rounded-2xl border border-red-100/50">
                <label className="block text-[10px] font-black text-red-400 uppercase tracking-widest mb-1.5">Issuing Part</label>
                <div className="font-bold text-sm text-red-900">
                  <span className="font-mono bg-white px-2 py-0.5 rounded shadow-sm border border-red-100 mr-2">{issueOutModalItem.part_number || issueOutModalItem.id}</span>
                  <span className="opacity-80">{issueOutModalItem.description || 'No description'}</span>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                  Quantity to Issue Out <span className="text-red-600">(MAX {currentAvailableStock})</span>
                </label>
                <input
                  type="number"
                  id="issue-quantity"
                  defaultValue="1"
                  min="1"
                  max={currentAvailableStock}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 text-base font-bold focus:bg-white focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Issue Date</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="date"
                    id="issue-date"
                    defaultValue={new Date().toISOString().split('T')[0]}
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-12 pr-5 py-3.5 text-sm font-bold focus:bg-white focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Notes (optional)</label>
                <textarea
                  id="issue-notes"
                  rows={3}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 text-sm font-medium focus:bg-white focus:ring-2 focus:ring-red-600 focus:border-transparent outline-none transition-all resize-none"
                  placeholder="Project usage, reason, etc."
                />
              </div>
            </div>

            <div className="px-6 py-5 bg-gray-50/80 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => { setIsIssueOutModalOpen(false); setIssueOutModalItem(null); }}
                className="flex-1 py-3.5 px-4 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 text-gray-700 text-xs font-black rounded-2xl uppercase tracking-widest transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const qty = parseInt((document.getElementById('issue-quantity') as HTMLInputElement).value);
                  const date = (document.getElementById('issue-date') as HTMLInputElement).value;
                  const notes = (document.getElementById('issue-notes') as HTMLTextAreaElement).value.trim();

                  handleIssueOutSubmit({
                    quantity: qty,
                    issueDate: date,
                    notes: notes || undefined
                  });
                }}
                className="flex-1 py-3.5 px-4 bg-red-600 hover:bg-red-700 hover:shadow-lg hover:shadow-red-200 text-white text-xs font-black rounded-2xl uppercase tracking-widest transition-all focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
              >
                Confirm Issue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
