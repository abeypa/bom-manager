import React, { useState, useEffect, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, Save, Plus, Trash2, ChevronDown, ChevronRight,
  AlertTriangle, PauseCircle, GitBranch, Hash,
  Settings, Zap, Code2, Truck, Layers, Package,
  GripVertical, Copy,
} from 'lucide-react';
import {
  jobOrdersApi,
  JobOrder, JobOrderFull,
  JOSection, JOStatus,
  ScopeSupplier, ScopeStatus,
} from '@/api/job-orders';
import { useToast } from '@/context/ToastContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParamRow {
  _key: string; // local only
  section: string;
  parameter_name: string;
  value: string;
  unit: string;
  vendor: string;
  notes: string;
  is_tbd: boolean;
  is_hold: boolean;
}

interface BrandRow {
  _key: string;
  component: string;
  make: string;
  notes: string;
}

interface ScopeRow {
  _key: string;
  supplier: ScopeSupplier;
  qty: string;
  description: string;
  status: ScopeStatus;
  notes: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SECTIONS = ['Mechanical', 'Electrical', 'Software', 'Vehicle', 'General'];
const SECTION_ICONS: Record<string, React.ReactNode> = {
  Mechanical: <Settings className="w-4 h-4" />,
  Electrical: <Zap className="w-4 h-4" />,
  Software:   <Code2 className="w-4 h-4" />,
  Vehicle:    <Truck className="w-4 h-4" />,
  General:    <Layers className="w-4 h-4" />,
};

const JO_STATUSES: JOStatus[] = ['Draft', 'Issued', 'In-Build', 'Completed', 'On Hold', 'Cancelled'];
const STATUS_COLORS: Record<string, string> = {
  Draft:     'bg-gray-100 text-gray-700',
  Issued:    'bg-blue-100 text-blue-700',
  'In-Build':'bg-teal-100 text-teal-700',
  Completed: 'bg-green-100 text-green-700',
  'On Hold': 'bg-amber-100 text-amber-700',
  Cancelled: 'bg-red-100 text-red-700',
};

const DEFAULT_BRAND_COMPONENTS = [
  'Motor', 'Bearing', 'Plummer Block', 'Pneumatic (Cylinder/Valves)',
  'VFD / Drive', 'PLC', 'HMI', 'Light Barriers',
  'Power Contactors', 'Thermal Overload', 'MCB', 'Push Buttons',
  'Cables', 'Control Transformer', 'Junction Box',
];

const uid = () => Math.random().toString(36).slice(2);

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  projectNumber: string;
  existingJO?: JobOrderFull | null;
}

export default function JobOrderModal({ isOpen, onClose, projectId, projectNumber, existingJO }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();

  // ── Header fields ──
  const [header, setHeader] = useState<Partial<JobOrder>>({});
  const [activeSection, setActiveSection] = useState<string | null>('Mechanical');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // ── Parameters ──
  const [params, setParams] = useState<ParamRow[]>([]);
  const [newParamSection, setNewParamSection] = useState('Mechanical');
  const [customSection, setCustomSection] = useState('');

  // ── Brand list ──
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [brandCollapased, setBrandCollapsed] = useState(false);

  // ── Scope of supply ──
  const [scope, setScope] = useState<ScopeRow[]>([]);
  const [scopeCollapsed, setScopeCollapsed] = useState(false);

  // ── Active tab ──
  const [activeTab, setActiveTab] = useState<'header' | 'parameters' | 'brands' | 'scope'>('header');

  // ── Populate from existing JO ──
  useEffect(() => {
    if (!isOpen) return;
    if (existingJO) {
      setHeader(existingJO);
      setParams(existingJO.parameters.map(p => ({
        _key: uid(),
        section: p.section,
        parameter_name: p.parameter_name,
        value: p.value || '',
        unit: p.unit || '',
        vendor: p.vendor || '',
        notes: p.notes || '',
        is_tbd: p.is_tbd,
        is_hold: p.is_hold,
      })));
      setBrands(existingJO.brand_list.map(b => ({
        _key: uid(), component: b.component, make: b.make || '', notes: b.notes || '',
      })));
      setScope(existingJO.scope_items.map(s => ({
        _key: uid(), supplier: s.supplier, qty: s.qty, description: s.description,
        status: s.status, notes: s.notes || '',
      })));
    } else {
      const joNum = `JO-${projectNumber}-001`;
      setHeader({
        jo_number: joNum,
        revision: 'Orig',
        status: 'Draft',
        manuals_usb_qty: 1,
        manuals_hardcopy_qty: 3,
        paint_machine: 'RAL 5012',
        paint_moving: 'RAL 2011 Orange',
        paint_panel: 'RAL 7035',
      });
      setParams([]);
      setBrands(DEFAULT_BRAND_COMPONENTS.map(c => ({ _key: uid(), component: c, make: '', notes: '' })));
      setScope([]);
    }
  }, [isOpen, existingJO, projectNumber]);

  // ── Save ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      let jo: JobOrder;
      if (existingJO) {
        jo = await jobOrdersApi.update(existingJO.id, { ...header, project_id: projectId });
      } else {
        jo = await jobOrdersApi.create({ ...header, project_id: projectId });
      }
      await Promise.all([
        jobOrdersApi.saveParameters(jo.id, params.map((p, i) => ({
          section: p.section,
          parameter_name: p.parameter_name,
          value: p.value || null,
          unit: p.unit || null,
          vendor: p.vendor || null,
          notes: p.notes || null,
          sort_order: i,
          is_tbd: p.is_tbd,
          is_hold: p.is_hold,
        }))),
        jobOrdersApi.saveBrandList(jo.id, brands.filter(b => b.component).map((b, i) => ({
          component: b.component, make: b.make || null, notes: b.notes || null, sort_order: i,
        }))),
        jobOrdersApi.saveScopeItems(jo.id, scope.filter(s => s.description).map((s, i) => ({
          supplier: s.supplier, qty: s.qty, description: s.description,
          status: s.status, notes: s.notes || null, sort_order: i,
        }))),
      ]);
      return jo;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-orders', projectId] });
      showToast('success', existingJO ? 'JO updated' : 'Job Order created');
      onClose();
    },
    onError: (err: any) => showToast('error', err.message),
  });

  const bumpRevision = useMutation({
    mutationFn: () => jobOrdersApi.bumpRevision(existingJO!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-orders', projectId] });
      showToast('success', 'New revision created');
      onClose();
    },
  });

  // ── Parameter helpers ──
  const addParam = () => {
    const sec = customSection.trim() || newParamSection;
    setParams(p => [...p, {
      _key: uid(), section: sec, parameter_name: '', value: '',
      unit: '', vendor: '', notes: '', is_tbd: false, is_hold: false,
    }]);
    setCustomSection('');
  };

  const updateParam = (key: string, field: keyof ParamRow, val: any) =>
    setParams(p => p.map(r => r._key === key ? { ...r, [field]: val } : r));

  const removeParam = (key: string) =>
    setParams(p => p.filter(r => r._key !== key));

  const duplicateParam = (key: string) => {
    const idx = params.findIndex(r => r._key === key);
    const copy = { ...params[idx], _key: uid() };
    setParams(p => [...p.slice(0, idx + 1), copy, ...p.slice(idx + 1)]);
  };

  // ── Brand helpers ──
  const updateBrand = (key: string, field: keyof BrandRow, val: string) =>
    setBrands(b => b.map(r => r._key === key ? { ...r, [field]: val } : r));

  const addBrand = () =>
    setBrands(b => [...b, { _key: uid(), component: '', make: '', notes: '' }]);

  const removeBrand = (key: string) =>
    setBrands(b => b.filter(r => r._key !== key));

  // ── Scope helpers ──
  const addScope = () =>
    setScope(s => [...s, { _key: uid(), supplier: 'BEP', qty: '1', description: '', status: 'Confirmed', notes: '' }]);

  const updateScope = (key: string, field: keyof ScopeRow, val: any) =>
    setScope(s => s.map(r => r._key === key ? { ...r, [field]: val } : r));

  const removeScope = (key: string) =>
    setScope(s => s.filter(r => r._key !== key));

  // Group params by section for display
  const sectionNames = Array.from(new Set(params.map(p => p.section)));

  if (!isOpen) return null;

  const inputCls = "w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-gray-900 transition-all";
  const labelCls = "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1.5";

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-[2.5rem] w-full max-w-5xl max-h-[94vh] overflow-hidden flex flex-col shadow-2xl">

        {/* ── Modal Header ── */}
        <div className="px-10 py-6 border-b flex items-center justify-between bg-gray-50/50 shrink-0">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                {existingJO ? `JO: ${existingJO.jo_number}` : 'New Job Order'}
              </h2>
              {header.revision && (
                <span className="text-[10px] font-black px-3 py-1 bg-gray-900 text-white rounded-xl uppercase tracking-widest">
                  {header.revision}
                </span>
              )}
              {header.status && (
                <span className={`text-[10px] font-black px-3 py-1 rounded-xl uppercase tracking-widest ${STATUS_COLORS[header.status] || 'bg-gray-100 text-gray-700'}`}>
                  {header.status}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
              {params.length} parameters · {brands.filter(b => b.make).length} brand entries · {scope.filter(s => s.description).length} scope items
            </p>
          </div>
          <div className="flex items-center gap-2">
            {existingJO && (
              <button
                onClick={() => bumpRevision.mutate()}
                disabled={bumpRevision.isPending}
                className="flex items-center gap-2 px-5 py-2.5 border border-teal-200 text-teal-700 bg-teal-50 text-[10px] font-black rounded-2xl uppercase tracking-widest hover:bg-teal-100 transition-all"
              >
                <GitBranch className="w-4 h-4" />
                Bump Revision
              </button>
            )}
            <button onClick={onClose} className="p-2.5 text-gray-400 hover:text-gray-900 hover:bg-white rounded-2xl transition-all">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-gray-100 px-10 shrink-0 bg-white">
          {[
            { id: 'header',     label: 'Header',          count: null },
            { id: 'parameters', label: 'Parameters',      count: params.length },
            { id: 'brands',     label: 'Brand List',      count: brands.filter(b => b.make).length },
            { id: 'scope',      label: 'Scope of Supply', count: scope.filter(s => s.description).length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-4 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab.label}
              {tab.count !== null && tab.count > 0 && (
                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-[9px] font-black">{tab.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <div className="flex-1 overflow-auto p-10">

          {/* ════ HEADER TAB ════ */}
          {activeTab === 'header' && (
            <div className="space-y-8">
              {/* JO Identity */}
              <section>
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">JO Identity</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="jo_number" className={labelCls}>JO Number *</label>
                    <input id="jo_number" className={inputCls} value={header.jo_number || ''} onChange={e => setHeader(h => ({ ...h, jo_number: e.target.value }))} placeholder="JO-3602SA-001" />
                  </div>
                  <div>
                    <label htmlFor="model_number" className={labelCls}>Model Number</label>
                    <input id="model_number" className={inputCls} value={header.model_number || ''} onChange={e => setHeader(h => ({ ...h, model_number: e.target.value }))} placeholder="3602 SA" />
                  </div>
                  <div>
                    <label htmlFor="serial_number" className={labelCls}>Serial Number</label>
                    <input id="serial_number" className={inputCls} value={header.serial_number || ''} onChange={e => setHeader(h => ({ ...h, serial_number: e.target.value }))} placeholder="503737" />
                  </div>
                  <div>
                    <label htmlFor="title" className={labelCls}>Title</label>
                    <input id="title" className={inputCls} value={header.title || ''} onChange={e => setHeader(h => ({ ...h, title: e.target.value }))} placeholder="Single Axle RB EIM" />
                  </div>
                  <div>
                    <label htmlFor="reference_projects" className={labelCls}>Reference Projects</label>
                    <input id="reference_projects" className={inputCls} value={header.reference_projects || ''} onChange={e => setHeader(h => ({ ...h, reference_projects: e.target.value }))} placeholder="509605, 510000" />
                  </div>
                  <div>
                    <label htmlFor="status" className={labelCls}>Status</label>
                    <select id="status" className={inputCls + ' appearance-none cursor-pointer'} value={header.status || 'Draft'} onChange={e => setHeader(h => ({ ...h, status: e.target.value as JOStatus }))}>
                      {JO_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="issue_date" className={labelCls}>Issue Date</label>
                    <input id="issue_date" type="date" className={inputCls} value={header.issue_date || ''} onChange={e => setHeader(h => ({ ...h, issue_date: e.target.value || null }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Revision</label>
                    <input className={inputCls} value={header.revision || 'Orig'} onChange={e => setHeader(h => ({ ...h, revision: e.target.value }))} placeholder="Orig / Rev.1 / Rev.2" />
                  </div>
                </div>
              </section>

              {/* Contact */}
              <section>
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Contact</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>Contact Name</label>
                    <input className={inputCls} value={header.contact_name || ''} onChange={e => setHeader(h => ({ ...h, contact_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Title / Function</label>
                    <input className={inputCls} value={header.contact_title || ''} onChange={e => setHeader(h => ({ ...h, contact_title: e.target.value }))} placeholder="Country Manager — BEP India" />
                  </div>
                </div>
              </section>

              {/* Commercial */}
              <section>
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Commercial Terms</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>INCO Terms</label>
                    <input className={inputCls} value={header.inco_terms || ''} onChange={e => setHeader(h => ({ ...h, inco_terms: e.target.value }))} placeholder="FCR Mumbai" />
                  </div>
                  <div>
                    <label className={labelCls}>Warranty</label>
                    <input className={inputCls} value={header.warranty || ''} onChange={e => setHeader(h => ({ ...h, warranty: e.target.value }))} placeholder="24 months after FAC" />
                  </div>
                  <div>
                    <label className={labelCls}>Delivery (months)</label>
                    <input type="number" className={inputCls} value={header.delivery_months || ''} onChange={e => setHeader(h => ({ ...h, delivery_months: parseInt(e.target.value) || null }))} placeholder="6" />
                  </div>
                  <div>
                    <label className={labelCls}>Shipping To</label>
                    <input className={inputCls} value={header.shipping_to || ''} onChange={e => setHeader(h => ({ ...h, shipping_to: e.target.value }))} placeholder="FCR Mumbai" />
                  </div>
                </div>
              </section>

              {/* Paint */}
              <section>
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Paint / Finish</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>Machine Color</label>
                    <input className={inputCls} value={header.paint_machine || ''} onChange={e => setHeader(h => ({ ...h, paint_machine: e.target.value }))} placeholder="RAL 5012" />
                  </div>
                  <div>
                    <label className={labelCls}>Moving / Safety Color</label>
                    <input className={inputCls} value={header.paint_moving || ''} onChange={e => setHeader(h => ({ ...h, paint_moving: e.target.value }))} placeholder="RAL 2011 Orange" />
                  </div>
                  <div>
                    <label className={labelCls}>Panel Color</label>
                    <input className={inputCls} value={header.paint_panel || ''} onChange={e => setHeader(h => ({ ...h, paint_panel: e.target.value }))} placeholder="RAL 7035" />
                  </div>
                </div>
              </section>

              {/* Manuals */}
              <section>
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Manuals / Documentation</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>USB Copies (qty)</label>
                    <input type="number" className={inputCls} value={header.manuals_usb_qty ?? 1} onChange={e => setHeader(h => ({ ...h, manuals_usb_qty: parseInt(e.target.value) }))} />
                  </div>
                  <div>
                    <label className={labelCls}>Hard Copies (qty)</label>
                    <input type="number" className={inputCls} value={header.manuals_hardcopy_qty ?? 3} onChange={e => setHeader(h => ({ ...h, manuals_hardcopy_qty: parseInt(e.target.value) }))} />
                  </div>
                </div>
              </section>

              {/* Special requirements */}
              <section>
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Special Requirements</h3>
                <textarea
                  className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-4 text-sm font-medium outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                  rows={5}
                  value={header.special_requirements || ''}
                  onChange={e => setHeader(h => ({ ...h, special_requirements: e.target.value }))}
                  placeholder="List all special requirements, customer notes, constraints…"
                />
              </section>
            </div>
          )}

          {/* ════ PARAMETERS TAB ════ */}
          {activeTab === 'parameters' && (
            <div className="space-y-6">
              {/* Add row toolbar */}
              <div className="flex items-end gap-3 p-5 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="flex-1">
                  <label className={labelCls}>Section</label>
                  <div className="flex gap-2">
                    <select
                      value={newParamSection}
                      onChange={e => setNewParamSection(e.target.value)}
                      className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-gray-900 appearance-none"
                    >
                      {SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <input
                      className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-gray-900"
                      placeholder="Or type custom section…"
                      value={customSection}
                      onChange={e => setCustomSection(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  onClick={addParam}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white text-[10px] font-black rounded-xl uppercase tracking-widest hover:bg-gray-800 active:scale-95 transition-all whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" /> Add Row
                </button>
              </div>

              {params.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-[2rem]">
                  <Layers className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">No parameters yet</p>
                  <p className="text-xs text-gray-400">Add rows for Mechanical, Electrical, Software, Vehicle specs</p>
                </div>
              ) : (
                /* Group by section */
                sectionNames.map(sec => {
                  const secParams = params.filter(p => p.section === sec);
                  const isCollapsed = collapsedSections.has(sec);
                  return (
                    <div key={sec} className="border border-gray-100 rounded-[2rem] overflow-hidden">
                      {/* Section header */}
                      <div
                        className="flex items-center justify-between px-6 py-4 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-all"
                        onClick={() => setCollapsedSections(prev => {
                          const next = new Set(prev);
                          next.has(sec) ? next.delete(sec) : next.add(sec);
                          return next;
                        })}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-gray-400">{SECTION_ICONS[sec] || <Layers className="w-4 h-4" />}</span>
                          <span className="text-sm font-black text-gray-900 uppercase tracking-tight">{sec}</span>
                          <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">{secParams.length}</span>
                        </div>
                        {isCollapsed ? <ChevronRight className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>

                      {!isCollapsed && (
                        <table className="w-full text-left">
                          <thead className="bg-white border-b border-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest w-[24%]">Parameter</th>
                              <th className="px-4 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest w-[28%]">Value</th>
                              <th className="px-4 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest w-[8%]">Unit</th>
                              <th className="px-4 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest w-[14%]">Vendor</th>
                              <th className="px-4 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest w-[14%]">Notes</th>
                              <th className="px-4 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest w-[12%]">Flags</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {secParams.map(row => (
                              <tr
                                key={row._key}
                                className={`group transition-all ${
                                  row.is_hold ? 'bg-red-50/50' :
                                  row.is_tbd  ? 'bg-amber-50/50' : 'hover:bg-gray-50/50'
                                }`}
                              >
                                <td className="px-4 py-2">
                                  <input
                                    className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-gray-900 outline-none text-sm font-bold py-1 transition-all"
                                    value={row.parameter_name}
                                    onChange={e => updateParam(row._key, 'parameter_name', e.target.value)}
                                    placeholder="Parameter name…"
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <input
                                    className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-gray-900 outline-none text-sm py-1 transition-all"
                                    value={row.value}
                                    onChange={e => updateParam(row._key, 'value', e.target.value)}
                                    placeholder="Value…"
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <input
                                    className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-gray-900 outline-none text-sm py-1 transition-all"
                                    value={row.unit}
                                    onChange={e => updateParam(row._key, 'unit', e.target.value)}
                                    placeholder="mm"
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <input
                                    className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-gray-900 outline-none text-sm py-1 transition-all"
                                    value={row.vendor}
                                    onChange={e => updateParam(row._key, 'vendor', e.target.value)}
                                    placeholder="Vendor"
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <input
                                    className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-gray-900 outline-none text-sm py-1 transition-all"
                                    value={row.notes}
                                    onChange={e => updateParam(row._key, 'notes', e.target.value)}
                                    placeholder="Notes"
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <div className="flex items-center gap-1">
                                    {/* TBD flag */}
                                    <button
                                      onClick={() => updateParam(row._key, 'is_tbd', !row.is_tbd)}
                                      title="Toggle TBD"
                                      className={`w-7 h-7 rounded-lg text-[9px] font-black border transition-all ${
                                        row.is_tbd
                                          ? 'bg-amber-400 text-white border-amber-400'
                                          : 'bg-white text-gray-300 border-gray-200 hover:border-amber-300'
                                      }`}
                                    >TBD</button>
                                    {/* HOLD flag */}
                                    <button
                                      onClick={() => updateParam(row._key, 'is_hold', !row.is_hold)}
                                      title="Toggle HOLD"
                                      className={`w-7 h-7 rounded-lg text-[9px] font-black border transition-all ${
                                        row.is_hold
                                          ? 'bg-red-500 text-white border-red-500'
                                          : 'bg-white text-gray-300 border-gray-200 hover:border-red-300'
                                      }`}
                                    >HLD</button>
                                    <button
                                      onClick={() => duplicateParam(row._key)}
                                      className="w-6 h-6 rounded-lg text-gray-300 hover:text-gray-700 hover:bg-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                                      title="Duplicate row"
                                    ><Copy className="w-3 h-3" /></button>
                                    <button
                                      onClick={() => removeParam(row._key)}
                                      className="w-6 h-6 rounded-lg text-gray-200 hover:text-red-500 hover:bg-red-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                                    ><Trash2 className="w-3 h-3" /></button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  );
                })
              )}

              {/* Legend */}
              {params.length > 0 && (
                <div className="flex items-center gap-4 px-2">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-amber-50 border border-amber-200 rounded" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">TBD — To be determined</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-red-50 border border-red-200 rounded" />
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">HOLD — On hold</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════ BRAND LIST TAB ════ */}
          {activeTab === 'brands' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 font-medium">Specify the approved make/vendor for each component.</p>
                <button
                  onClick={addBrand}
                  className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white text-[10px] font-black rounded-xl uppercase tracking-widest"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Component
                </button>
              </div>
              <div className="border border-gray-100 rounded-[2rem] overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest w-[35%]">Component</th>
                      <th className="px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest w-[35%]">Make / Brand</th>
                      <th className="px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest w-[25%]">Notes</th>
                      <th className="px-6 py-4 w-[5%]" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {brands.map(row => (
                      <tr key={row._key} className="group hover:bg-gray-50/50">
                        <td className="px-6 py-2.5">
                          <input
                            className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-gray-900 outline-none text-sm font-bold py-1 transition-all"
                            value={row.component}
                            onChange={e => updateBrand(row._key, 'component', e.target.value)}
                            placeholder="Component name…"
                          />
                        </td>
                        <td className="px-6 py-2.5">
                          <input
                            className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-gray-900 outline-none text-sm py-1 transition-all"
                            value={row.make}
                            onChange={e => updateBrand(row._key, 'make', e.target.value)}
                            placeholder="e.g. AB / Marathon / Festo"
                          />
                        </td>
                        <td className="px-6 py-2.5">
                          <input
                            className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-gray-900 outline-none text-sm py-1 transition-all"
                            value={row.notes}
                            onChange={e => updateBrand(row._key, 'notes', e.target.value)}
                            placeholder="Notes…"
                          />
                        </td>
                        <td className="px-6 py-2.5">
                          <button
                            onClick={() => removeBrand(row._key)}
                            className="p-1.5 text-gray-200 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ════ SCOPE OF SUPPLY TAB ════ */}
          {activeTab === 'scope' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 font-medium">Define what each supplier is responsible for delivering.</p>
                <button
                  onClick={addScope}
                  className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white text-[10px] font-black rounded-xl uppercase tracking-widest"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </button>
              </div>

              {/* Group by supplier */}
              {(['BEP', 'BBK', 'BEPI', 'Customer', 'Other'] as ScopeSupplier[]).map(supplier => {
                const items = scope.filter(s => s.supplier === supplier);
                if (!items.length) return null;
                return (
                  <div key={supplier} className="border border-gray-100 rounded-[2rem] overflow-hidden">
                    <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                      <span className="text-sm font-black text-gray-900 uppercase tracking-tight">{supplier} Scope</span>
                      <span className="ml-3 text-[10px] text-gray-400 font-bold">{items.length} item{items.length !== 1 ? 's' : ''}</span>
                    </div>
                    <table className="w-full text-left">
                      <thead className="bg-white border-b border-gray-50">
                        <tr>
                          <th className="px-5 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest w-[8%]">Qty</th>
                          <th className="px-5 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest w-[42%]">Description</th>
                          <th className="px-5 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest w-[15%]">Status</th>
                          <th className="px-5 py-3 text-[9px] font-black text-gray-400 uppercase tracking-widest w-[27%]">Notes</th>
                          <th className="px-5 py-3 w-[8%]" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {items.map(row => (
                          <tr key={row._key} className={`group transition-all ${
                            row.status === 'Hold' ? 'bg-red-50/30' :
                            row.status === 'TBD'  ? 'bg-amber-50/30' : 'hover:bg-gray-50/50'
                          }`}>
                            <td className="px-5 py-2">
                              <input className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-gray-900 outline-none text-sm font-black py-1 tabular-nums text-center transition-all"
                                value={row.qty} onChange={e => updateScope(row._key, 'qty', e.target.value)} placeholder="1" />
                            </td>
                            <td className="px-5 py-2">
                              <input className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-gray-900 outline-none text-sm py-1 transition-all"
                                value={row.description} onChange={e => updateScope(row._key, 'description', e.target.value)} placeholder="Item description…" />
                            </td>
                            <td className="px-5 py-2">
                              <select
                                value={row.status}
                                onChange={e => updateScope(row._key, 'status', e.target.value as ScopeStatus)}
                                className={`text-[10px] font-black uppercase tracking-widest rounded-xl px-2 py-1.5 border outline-none cursor-pointer transition-all appearance-none ${
                                  row.status === 'Confirmed' ? 'bg-green-50 text-green-700 border-green-200' :
                                  row.status === 'TBD'       ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                  row.status === 'Hold'      ? 'bg-red-50 text-red-600 border-red-200' :
                                  'bg-gray-50 text-gray-500 border-gray-200'
                                }`}
                              >
                                {(['Confirmed','TBD','Hold','Cancelled'] as ScopeStatus[]).map(s => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-5 py-2">
                              <input className="w-full bg-transparent border-b border-transparent hover:border-gray-200 focus:border-gray-900 outline-none text-sm py-1 transition-all"
                                value={row.notes} onChange={e => updateScope(row._key, 'notes', e.target.value)} placeholder="Notes…" />
                            </td>
                            <td className="px-5 py-2">
                              <button onClick={() => removeScope(row._key)}
                                className="p-1.5 text-gray-200 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}

              {/* Add scope row outside group */}
              {scope.length === 0 && (
                <div className="text-center py-16 border-2 border-dashed border-gray-100 rounded-[2rem]">
                  <Package className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">No scope items yet</p>
                  <p className="text-xs text-gray-400">Define what BEP, BBK, and BEPI are responsible for</p>
                </div>
              )}

              {/* Supplier selector for new rows */}
              {scope.length > 0 && (
                <div className="flex items-center gap-3 pt-2">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Add for:</span>
                  {(['BEP','BBK','BEPI','Customer','Other'] as ScopeSupplier[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setScope(prev => [...prev, { _key: uid(), supplier: s, qty: '1', description: '', status: 'Confirmed', notes: '' }])}
                      className="px-4 py-1.5 text-[10px] font-black uppercase tracking-widest border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-400 transition-all"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-10 py-5 border-t bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            <span>{params.filter(p => p.is_tbd).length > 0 && `${params.filter(p => p.is_tbd).length} TBD`}</span>
            <span>{params.filter(p => p.is_hold).length > 0 && <span className="text-red-500">{params.filter(p => p.is_hold).length} HOLD</span>}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-6 py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!header.jo_number || saveMutation.isPending}
              className="flex items-center gap-2 px-10 py-3.5 bg-gray-900 text-white text-[10px] font-black rounded-2xl uppercase tracking-widest shadow-xl shadow-gray-200 hover:bg-gray-800 disabled:opacity-50 active:scale-95 transition-all"
            >
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? 'Saving…' : (existingJO ? 'Update JO' : 'Create JO')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
