import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Edit2, Trash2, GitBranch, FileText, AlertTriangle,
  CheckCircle2, Clock, PauseCircle, XCircle, ChevronDown, ChevronRight,
  Settings, Zap, Code2, Truck, Layers, ClipboardList
} from 'lucide-react';
import { jobOrdersApi, JobOrder, JobOrderFull, JOStatus } from '@/api/job-orders';
import JobOrderModal from '@/components/projects/JobOrderModal';
import { useToast } from '@/context/ToastContext';

const STATUS_CONFIG: Record<JOStatus, { color: string; icon: React.ReactNode }> = {
  Draft:      { color: 'bg-gray-100 text-gray-700 border-gray-200',    icon: <Clock className="w-3 h-3" /> },
  Issued:     { color: 'bg-blue-100 text-blue-700 border-blue-200',    icon: <FileText className="w-3 h-3" /> },
  'In-Build': { color: 'bg-teal-100 text-teal-700 border-teal-200', icon: <Settings className="w-3 h-3" /> },
  Completed:  { color: 'bg-green-100 text-green-700 border-green-200', icon: <CheckCircle2 className="w-3 h-3" /> },
  'On Hold':  { color: 'bg-amber-100 text-amber-700 border-amber-200', icon: <PauseCircle className="w-3 h-3" /> },
  Cancelled:  { color: 'bg-red-100 text-red-600 border-red-200',       icon: <XCircle className="w-3 h-3" /> },
};

const SECTION_ICONS: Record<string, React.ReactNode> = {
  Mechanical: <Settings className="w-3.5 h-3.5" />,
  Electrical: <Zap className="w-3.5 h-3.5" />,
  Software:   <Code2 className="w-3.5 h-3.5" />,
  Vehicle:    <Truck className="w-3.5 h-3.5" />,
  General:    <Layers className="w-3.5 h-3.5" />,
};

interface Props {
  projectId: number;
  projectNumber: string;
}

export default function JobOrderTab({ projectId, projectNumber }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingJO, setEditingJO] = useState<JobOrderFull | null>(null);
  const [expandedJO, setExpandedJO] = useState<number | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['Mechanical', 'Electrical']));
  const [loadingFull, setLoadingFull] = useState<number | null>(null);
  const [fullJO, setFullJO] = useState<Record<number, JobOrderFull>>({});

  const { data: jos = [], isLoading } = useQuery({
    queryKey: ['job-orders', projectId],
    queryFn: () => jobOrdersApi.getByProject(projectId),
  });

  const deleteMutation = useMutation({
    mutationFn: jobOrdersApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-orders', projectId] });
      showToast('success', 'Job Order deleted');
    },
  });

  const openEdit = async (jo: JobOrder) => {
    setLoadingFull(jo.id);
    try {
      const full = await jobOrdersApi.getById(jo.id);
      setEditingJO(full);
      setModalOpen(true);
    } catch {
      showToast('error', 'Failed to load JO');
    } finally {
      setLoadingFull(null);
    }
  };

  const toggleExpand = async (joId: number) => {
    if (expandedJO === joId) {
      setExpandedJO(null);
      return;
    }
    setExpandedJO(joId);
    if (!fullJO[joId]) {
      setLoadingFull(joId);
      try {
        const full = await jobOrdersApi.getById(joId);
        setFullJO(prev => ({ ...prev, [joId]: full }));
      } finally {
        setLoadingFull(null);
      }
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(section) ? next.delete(section) : next.add(section);
      return next;
    });
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setEditingJO(null);
    qc.invalidateQueries({ queryKey: ['job-orders', projectId] });
    // Refresh any expanded full JO
    if (expandedJO && fullJO[expandedJO]) {
      jobOrdersApi.getById(expandedJO).then(full => {
        setFullJO(prev => ({ ...prev, [expandedJO]: full }));
      });
    }
  };

  return (
    <div className="card p-8 space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-lg text-gray-900">Job Orders</h3>
        <button
          onClick={() => { setEditingJO(null); setModalOpen(true); }}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Create Job Order
        </button>
      </div>

      {/* JO List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-10 h-10 border-4 border-gray-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : jos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ClipboardList className="h-12 w-12 mx-auto text-gray-300" />
          <p className="mt-4">No job orders created yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {jos.map(jo => {
            const sc = STATUS_CONFIG[jo.status as JOStatus] || STATUS_CONFIG['Draft'];
            const isExpanded = expandedJO === jo.id;
            const full = fullJO[jo.id];

            return (
              <div key={jo.id} className="border border-gray-100 rounded-[2rem] overflow-hidden bg-white shadow-sm hover:shadow-md transition-all">
                {/* JO header row */}
                <div
                  className="px-8 py-5 flex items-center justify-between cursor-pointer hover:bg-gray-50/50 transition-all"
                  onClick={() => toggleExpand(jo.id)}
                >
                  <div className="flex items-center gap-5">
                    <div className="text-gray-300">
                      {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-base font-black text-gray-900 font-mono">{jo.jo_number}</span>
                        <span className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-xl border ${sc.color}`}>
                          {sc.icon}{jo.status}
                        </span>
                        <span className="text-[10px] font-black text-gray-400 bg-gray-50 px-2 py-0.5 rounded-lg border border-gray-100">
                          {jo.revision}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-gray-400 font-bold">
                        {jo.model_number && <span>{jo.model_number}</span>}
                        {jo.serial_number && <span>· S/N: {jo.serial_number}</span>}
                        {jo.issue_date && <span>· {new Date(jo.issue_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                        {jo.title && <span className="italic">· {jo.title}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {loadingFull === jo.id && (
                      <div className="w-5 h-5 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
                    )}
                    <button
                      onClick={() => openEdit(jo)}
                      className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all"
                      title="Edit JO"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete JO ${jo.jo_number}?`)) deleteMutation.mutate(jo.id);
                      }}
                      className="p-2 text-gray-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded view */}
                {isExpanded && (
                  <div className="border-t border-gray-50 bg-gray-50/30">
                    {!full ? (
                      <div className="flex items-center justify-center py-10">
                        <div className="w-8 h-8 border-3 border-gray-400 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : (
                      <div className="p-8 space-y-6">

                        {/* Header summary cards */}
                        <div className="grid grid-cols-4 gap-3">
                          {[
                            { label: 'Model', value: full.model_number },
                            { label: 'INCO Terms', value: full.inco_terms },
                            { label: 'Warranty', value: full.warranty },
                            { label: 'Delivery', value: full.delivery_months ? `${full.delivery_months} months` : null },
                          ].filter(c => c.value).map(c => (
                            <div key={c.label} className="bg-white rounded-2xl p-4 border border-gray-100">
                              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{c.label}</p>
                              <p className="text-sm font-black text-gray-900">{c.value}</p>
                            </div>
                          ))}
                        </div>

                        {/* Parameters by section */}
                        {full.parameters.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Parameters</h4>
                            {Array.from(new Set(full.parameters.map(p => p.section))).map(section => {
                              const secParams = full.parameters.filter(p => p.section === section);
                              const isOpen = expandedSections.has(section);
                              const tbd = secParams.filter(p => p.is_tbd).length;
                              const hold = secParams.filter(p => p.is_hold).length;

                              return (
                                <div key={section} className="border border-gray-100 rounded-2xl overflow-hidden bg-white">
                                  <div
                                    className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-all"
                                    onClick={() => toggleSection(section)}
                                  >
                                    <div className="flex items-center gap-3">
                                      <span className="text-gray-400">{SECTION_ICONS[section] || <Layers className="w-3.5 h-3.5" />}</span>
                                      <span className="text-xs font-black text-gray-900 uppercase tracking-tight">{section}</span>
                                      <span className="text-[9px] font-bold text-gray-400">{secParams.length} params</span>
                                      {tbd > 0 && <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-lg">{tbd} TBD</span>}
                                      {hold > 0 && <span className="text-[9px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded-lg">{hold} HOLD</span>}
                                    </div>
                                    {isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                  </div>
                                  {isOpen && (
                                    <table className="w-full text-left border-t border-gray-50">
                                      <thead className="bg-gray-50/50">
                                        <tr>
                                          <th className="px-5 py-2.5 text-[9px] font-black text-gray-400 uppercase tracking-widest w-[30%]">Parameter</th>
                                          <th className="px-5 py-2.5 text-[9px] font-black text-gray-400 uppercase tracking-widest w-[35%]">Value</th>
                                          <th className="px-5 py-2.5 text-[9px] font-black text-gray-400 uppercase tracking-widest w-[10%]">Unit</th>
                                          <th className="px-5 py-2.5 text-[9px] font-black text-gray-400 uppercase tracking-widest w-[15%]">Vendor</th>
                                          <th className="px-5 py-2.5 w-[10%]" />
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-50">
                                        {secParams.map(param => (
                                          <tr
                                            key={param.id}
                                            className={`${
                                              param.is_hold ? 'bg-red-50/40' :
                                              param.is_tbd  ? 'bg-amber-50/40' : ''
                                            }`}
                                          >
                                            <td className="px-5 py-3 text-sm font-bold text-gray-900">{param.parameter_name}</td>
                                            <td className="px-5 py-3 text-sm text-gray-700">{param.value || <span className="text-gray-300 italic text-xs">—</span>}</td>
                                            <td className="px-5 py-3 text-xs text-gray-400 font-mono">{param.unit || ''}</td>
                                            <td className="px-5 py-3 text-xs text-gray-500">{param.vendor || ''}</td>
                                            <td className="px-5 py-3">
                                              <div className="flex gap-1">
                                                {param.is_tbd && (
                                                  <span className="text-[8px] font-black px-1.5 py-0.5 bg-amber-400 text-white rounded-md">TBD</span>
                                                )}
                                                {param.is_hold && (
                                                  <span className="text-[8px] font-black px-1.5 py-0.5 bg-red-500 text-white rounded-md">HOLD</span>
                                                )}
                                              </div>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Brand list summary */}
                        {full.brand_list.filter(b => b.make).length > 0 && (
                          <div>
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Brand List</h4>
                            <div className="grid grid-cols-3 gap-2">
                              {full.brand_list.filter(b => b.make).map(b => (
                                <div key={b.id} className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between">
                                  <span className="text-xs font-bold text-gray-500">{b.component}</span>
                                  <span className="text-xs font-black text-gray-900">{b.make}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Scope summary */}
                        {full.scope_items.filter(s => s.description).length > 0 && (
                          <div>
                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Scope of Supply</h4>
                            <div className="space-y-2">
                              {(['BEP','BBK','BEPI','Customer','Other'] as const).map(supplier => {
                                const items = full.scope_items.filter(s => s.supplier === supplier && s.description);
                                if (!items.length) return null;
                                return (
                                  <div key={supplier} className="bg-white border border-gray-100 rounded-2xl p-4">
                                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">{supplier}</p>
                                    <div className="space-y-1">
                                      {items.map(item => (
                                        <div key={item.id} className="flex items-center gap-3 text-xs">
                                          <span className="font-black text-gray-600 w-8 text-center bg-gray-50 rounded-lg py-0.5">{item.qty}</span>
                                          <span className="flex-1 text-gray-700">{item.description}</span>
                                          <span className={`text-[8px] font-black px-2 py-0.5 rounded-lg border ${
                                            item.status === 'Confirmed' ? 'bg-green-50 text-green-700 border-green-200' :
                                            item.status === 'TBD'       ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                            item.status === 'Hold'      ? 'bg-red-50 text-red-600 border-red-200' :
                                            'bg-gray-50 text-gray-500 border-gray-200'
                                          }`}>{item.status}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Special requirements */}
                        {full.special_requirements && (
                          <div className="bg-white border border-gray-100 rounded-2xl p-5">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Special Requirements</p>
                            <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">{full.special_requirements}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <JobOrderModal
        isOpen={modalOpen}
        onClose={handleModalClose}
        projectId={projectId}
        projectNumber={projectNumber}
        existingJO={editingJO}
      />
    </div>
  );
}
