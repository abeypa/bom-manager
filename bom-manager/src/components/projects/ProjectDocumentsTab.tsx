import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText, Upload, Plus, Trash2, ExternalLink, CheckCircle,
  Clock, AlertCircle, XCircle, Edit2, X, Save, ChevronDown,
} from 'lucide-react';
import { projectDocsApi, DocType, DocStatus, ProjectDocument } from '@/api/project-documents';
import { useToast } from '@/context/ToastContext';

const DOC_TYPES: DocType[] = ['RFQ', 'Customer Requirement', 'Offer', 'LOI', 'PO', 'Misc'];

const STATUS_CONFIG: Record<DocStatus, { label: string; color: string; icon: React.ReactNode }> = {
  'Draft':        { label: 'Draft',        color: 'bg-gray-100 text-gray-600 border-gray-200',       icon: <Clock className="w-3 h-3" /> },
  'Under Review': { label: 'Under Review', color: 'bg-amber-50 text-amber-700 border-amber-200',     icon: <AlertCircle className="w-3 h-3" /> },
  'Approved':     { label: 'Approved',     color: 'bg-green-50 text-green-700 border-green-200',     icon: <CheckCircle className="w-3 h-3" /> },
  'Superseded':   { label: 'Superseded',   color: 'bg-red-50 text-red-500 border-red-200',           icon: <XCircle className="w-3 h-3" /> },
};

const TYPE_COLORS: Record<string, string> = {
  'RFQ':                  'bg-blue-50 text-blue-700 border-blue-200',
  'Customer Requirement': 'bg-purple-50 text-purple-700 border-purple-200',
  'Offer':                'bg-teal-50 text-teal-700 border-teal-200',
  'LOI':                  'bg-indigo-50 text-indigo-700 border-indigo-200',
  'PO':                   'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Misc':                 'bg-gray-50 text-gray-600 border-gray-200',
};

interface Props { projectId: number; }

interface FormState {
  doc_type: DocType;
  title: string;
  version: string;
  revision_date: string;
  status: DocStatus;
  notes: string;
}

const EMPTY_FORM: FormState = {
  doc_type: 'RFQ',
  title: '',
  version: 'v1.0',
  revision_date: '',
  status: 'Draft',
  notes: '',
};

export default function ProjectDocumentsTab({ projectId }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [filterType, setFilterType] = useState<string>('All');

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['project-docs', projectId],
    queryFn: () => projectDocsApi.getByProject(projectId),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      let filePath: string | null = null;
      if (pendingFile) {
        setUploading(true);
        try {
          filePath = await projectDocsApi.uploadFile(pendingFile, projectId, form.doc_type);
        } finally {
          setUploading(false);
        }
      }
      const payload = {
        project_id: projectId,
        doc_type: form.doc_type,
        title: form.title,
        version: form.version,
        revision_date: form.revision_date || null,
        status: form.status,
        notes: form.notes || null,
        ...(filePath ? { file_path: filePath } : {}),
      };
      if (editId) {
        return projectDocsApi.update(editId, payload);
      }
      return projectDocsApi.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-docs', projectId] });
      setShowForm(false);
      setEditId(null);
      setForm(EMPTY_FORM);
      setPendingFile(null);
      showToast('success', editId ? 'Document updated' : 'Document added');
    },
    onError: (err: any) => showToast('error', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: projectDocsApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-docs', projectId] });
      showToast('success', 'Document removed');
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: DocStatus }) =>
      projectDocsApi.update(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-docs', projectId] }),
  });

  const openEdit = (doc: ProjectDocument) => {
    setEditId(doc.id);
    setForm({
      doc_type: doc.doc_type,
      title: doc.title,
      version: doc.version,
      revision_date: doc.revision_date || '',
      status: doc.status,
      notes: doc.notes || '',
    });
    setPendingFile(null);
    setShowForm(true);
  };

  const filtered = filterType === 'All' ? docs : docs.filter(d => d.doc_type === filterType);

  // Group by type for display
  const grouped = DOC_TYPES.reduce<Record<string, ProjectDocument[]>>((acc, t) => {
    const items = filtered.filter(d => d.doc_type === t);
    if (items.length) acc[t] = items;
    return acc;
  }, {});

  return (
    <div className="card p-8 space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg text-gray-900">Project Documents</h3>
          <div className="flex items-center gap-1 mt-2">
            {['All', ...DOC_TYPES].map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                  filterType === t
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-400 border-gray-100 hover:border-gray-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => { setEditId(null); setForm(EMPTY_FORM); setPendingFile(null); setShowForm(true); }}
          className="btn-primary flex items-center gap-2"
        >
          <Upload className="w-4 h-4" /> Upload Document
        </button>
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div className="bg-gray-50 rounded-[2rem] p-7 border border-gray-100 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
              {editId ? 'Edit Document' : 'Add Document'}
            </h3>
            <button onClick={() => { setShowForm(false); setEditId(null); }}
              className="p-2 text-gray-400 hover:text-gray-900 rounded-xl hover:bg-white transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Document Type *</label>
              <select
                value={form.doc_type}
                onChange={e => setForm(p => ({ ...p, doc_type: e.target.value as DocType }))}
                className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-gray-900 appearance-none"
              >
                {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g. RFQ from Tata Motors"
                className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Version</label>
              <input
                type="text"
                value={form.version}
                onChange={e => setForm(p => ({ ...p, version: e.target.value }))}
                placeholder="v1.0"
                className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Revision Date</label>
              <input
                type="date"
                value={form.revision_date}
                onChange={e => setForm(p => ({ ...p, revision_date: e.target.value }))}
                className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(p => ({ ...p, status: e.target.value as DocStatus }))}
                className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-gray-900 appearance-none"
              >
                {(Object.keys(STATUS_CONFIG) as DocStatus[]).map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">
                Attach File (PDF / DOCX)
              </label>
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xlsx,.xls"
                  onChange={e => setPendingFile(e.target.files?.[0] || null)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 transition-all"
                >
                  <Upload className="w-4 h-4" />
                  {pendingFile ? pendingFile.name : 'Choose file…'}
                </button>
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                rows={2}
                placeholder="Any context or remarks…"
                className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-gray-900 resize-none"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-5">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!form.title || saveMutation.isPending || uploading}
              className="flex items-center gap-2 px-8 py-3.5 bg-gray-900 text-white text-[10px] font-black rounded-2xl uppercase tracking-widest disabled:opacity-50 shadow-xl shadow-gray-200"
            >
              <Save className="w-4 h-4" />
              {saveMutation.isPending || uploading ? 'Saving…' : 'Save Document'}
            </button>
            <button
              onClick={() => { setShowForm(false); setEditId(null); }}
              className="px-6 py-3.5 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Document List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-10 h-10 border-4 border-gray-900 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-3xl">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 mt-4">No documents yet</p>
          <p className="text-sm text-gray-400">Upload CAD, PDFs, datasheets here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([type, items]) => (
            <div key={type}>
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-xl border ${TYPE_COLORS[type] || ''}`}>
                  {type}
                </span>
                <span className="text-[10px] text-gray-400 font-bold">{items.length} document{items.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-2">
                {items.map(doc => {
                  const sc = STATUS_CONFIG[doc.status];
                  return (
                    <div
                      key={doc.id}
                      className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center justify-between group hover:border-gray-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center border border-gray-100 shrink-0">
                          <FileText className="w-5 h-5 text-gray-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="text-sm font-black text-gray-900 truncate">{doc.title}</span>
                            <span className="text-[9px] font-black text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-lg">{doc.version}</span>
                            <span className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-xl border ${sc.color}`}>
                              {sc.icon}{sc.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-gray-400 font-bold">
                            {doc.revision_date && <span>{new Date(doc.revision_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                            {doc.uploaded_by && <span>· {doc.uploaded_by.split('@')[0]}</span>}
                            {doc.notes && <span className="italic truncate max-w-[200px]">· {doc.notes}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-4">
                        {/* Quick status toggle */}
                        {doc.status !== 'Approved' && (
                          <button
                            onClick={() => statusMutation.mutate({ id: doc.id, status: 'Approved' })}
                            className="opacity-0 group-hover:opacity-100 px-3 py-1.5 text-[9px] font-black text-green-700 bg-green-50 border border-green-200 rounded-xl uppercase tracking-widest transition-all hover:bg-green-100"
                          >
                            Approve
                          </button>
                        )}
                        {doc.file_path && (
                          <a
                            href={doc.file_path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                            title="Open file"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          onClick={() => openEdit(doc)}
                          className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete "${doc.title}"?`)) deleteMutation.mutate(doc.id);
                          }}
                          className="p-2 text-gray-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
