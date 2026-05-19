import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  FileText,
  Loader2,
  PackageSearch,
  Plus,
  Save,
  Upload,
  X,
} from 'lucide-react'
import { projectsApi } from '@/api/projects'
import { poIngestionApi } from '@/api/po-ingestion'
import { fileToAttachment, isPDFFile } from '@/lib/ai-attachments'
import { parsePurchaseOrderText, ParsedPODocument } from '@/lib/po-ingestion-parser'
import { useToast } from '@/context/ToastContext'

export default function POIngestion() {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [projectId, setProjectId] = useState('')
  const [notes, setNotes] = useState('')
  const [documents, setDocuments] = useState<ParsedPODocument[]>([])
  const [parseBusy, setParseBusy] = useState(false)
  const [activeDoc, setActiveDoc] = useState(0)

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: projectsApi.getProjects,
  })

  const { data: recentBatches = [] } = useQuery({
    queryKey: ['po-ingestion-batches'],
    queryFn: () => poIngestionApi.listRecentBatches(8),
  })

  const saveMutation = useMutation({
    mutationFn: () => poIngestionApi.createBatch({
      projectId: Number(projectId),
      notes,
      documents,
    }),
    onSuccess: (batch: any) => {
      showToast('success', `PO ingestion batch saved (${String(batch.id).slice(0, 8)}).`)
      setDocuments([])
      setNotes('')
      setActiveDoc(0)
      queryClient.invalidateQueries({ queryKey: ['po-ingestion-batches'] })
    },
    onError: (error: any) => {
      showToast('error', error?.message || 'Failed to save ingestion batch')
    },
  })

  const totals = useMemo(() => {
    const lines = documents.reduce((sum, doc) => sum + doc.lines.length, 0)
    const value = documents.reduce((sum, doc) => {
      const docValue = doc.total_amount ?? doc.lines.reduce((lineSum, line) => lineSum + (line.total_amount || 0), 0)
      return sum + docValue
    }, 0)
    const warnings = documents.reduce((sum, doc) => sum + doc.parse_warnings.length, 0)
    return { lines, value, warnings }
  }, [documents])

  const parseFiles = async (files: FileList | File[]) => {
    const fileList = Array.from(files)
    if (!fileList.length) return
    setParseBusy(true)
    try {
      const parsed: ParsedPODocument[] = []
      for (const file of fileList) {
        if (!isPDFFile(file)) {
          parsed.push({
            file_name: file.name,
            file_size: file.size,
            mime_type: file.type,
            page_count: undefined,
            po_number: null,
            supplier_name: null,
            po_date: null,
            currency: 'INR',
            subtotal: null,
            total_amount: null,
            parse_status: 'needs_ocr',
            parse_warnings: ['Only text-based PDFs are parsed in this first version. Convert this file to PDF text or process it with OCR later.'],
            raw_text: '',
            lines: [],
          })
          continue
        }

        const attachment = await fileToAttachment(file)
        if (attachment.kind !== 'pdf') continue
        parsed.push(parsePurchaseOrderText({
          fileName: attachment.name,
          fileSize: attachment.size,
          mimeType: file.type,
          pageCount: attachment.pageCount,
          text: attachment.text,
        }))
      }
      setDocuments(current => [...current, ...parsed])
      setActiveDoc(documents.length)
    } catch (error: any) {
      showToast('error', error?.message || 'Failed to parse selected files')
    } finally {
      setParseBusy(false)
    }
  }

  const removeDocument = (index: number) => {
    setDocuments(docs => docs.filter((_, i) => i !== index))
    setActiveDoc(0)
  }

  const currentDoc = documents[activeDoc]

  return (
    <div className="page-container py-8 page-enter">
      <header className="page-header">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-navy-900 rounded-2xl flex items-center justify-center shadow-lg shadow-navy-900/10">
            <PackageSearch className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="page-title">PO Ingestion</h1>
            <p className="text-sm text-secondary mt-1">Upload multiple supplier POs, extract line items, and stage them for matching.</p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-8">
        <aside className="space-y-6">
          <div className="card p-5 space-y-5">
            <div>
              <label className="label-caps mb-2 block">Target Project</label>
              <select
                className="input"
                value={projectId}
                onChange={event => setProjectId(event.target.value)}
              >
                <option value="">Select project...</option>
                {projects.map((project: any) => (
                  <option key={project.id} value={project.id}>
                    {project.project_number} - {project.project_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label-caps mb-2 block">Batch Notes</label>
              <textarea
                className="input min-h-[88px] resize-none"
                value={notes}
                onChange={event => setNotes(event.target.value)}
                placeholder="Supplier batch, project phase, or import context..."
              />
            </div>

            <label className="flex flex-col items-center justify-center min-h-[160px] border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 hover:bg-white hover:border-navy-300 transition-all cursor-pointer text-center px-5">
              {parseBusy ? (
                <Loader2 className="h-8 w-8 animate-spin text-navy-600 mb-3" />
              ) : (
                <Upload className="h-8 w-8 text-navy-500 mb-3" />
              )}
              <span className="text-sm font-black text-navy-900">{parseBusy ? 'Reading files...' : 'Upload PO PDFs'}</span>
              <span className="text-[10px] font-bold text-tertiary uppercase tracking-widest mt-1">Multiple files supported</span>
              <input
                type="file"
                multiple
                accept="application/pdf,.pdf"
                hidden
                disabled={parseBusy}
                onChange={event => {
                  if (event.target.files) parseFiles(event.target.files)
                  event.currentTarget.value = ''
                }}
              />
            </label>

            <button
              className="btn btn-primary w-full"
              disabled={!projectId || documents.length === 0 || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Review Batch
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Metric label="Docs" value={documents.length.toString()} />
            <Metric label="Lines" value={totals.lines.toString()} />
            <Metric label="Warn" value={totals.warnings.toString()} tone={totals.warnings ? 'amber' : 'slate'} />
          </div>

          <div className="card p-5">
            <h2 className="section-title mb-4">Recent Batches</h2>
            <div className="space-y-2">
              {recentBatches.length === 0 ? (
                <p className="text-xs text-tertiary">No ingestion batches saved yet.</p>
              ) : recentBatches.map((batch: any) => (
                <div key={batch.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-black text-navy-900 truncate">
                      {batch.project?.project_number || 'Project'} / {String(batch.id).slice(0, 8)}
                    </p>
                    <span className="badge badge-slate !px-2">{batch.status}</span>
                  </div>
                  <p className="text-[10px] text-tertiary mt-1">
                    {batch.summary?.documents || 0} docs / {batch.summary?.lines || 0} lines
                  </p>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="space-y-6 min-w-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatusCard icon={FileText} label="Documents staged" value={documents.length.toString()} />
            <StatusCard icon={FileSearch} label="Extracted line items" value={totals.lines.toString()} />
            <StatusCard icon={CheckCircle2} label="Review value" value={`INR ${totals.value.toLocaleString('en-IN')}`} />
          </div>

          {documents.length === 0 ? (
            <div className="empty-state py-24">
              <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mb-6 border border-slate-100 shadow-inner">
                <Plus size={40} className="text-tertiary" />
              </div>
              <h3 className="section-title mb-2">No POs staged</h3>
              <p className="text-secondary max-w-md text-center">
                Select a project, upload one or more text-based PO PDFs, then review extracted headers and line items here.
              </p>
            </div>
          ) : (
            <>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {documents.map((doc, index) => (
                  <button
                    key={`${doc.file_name}-${index}`}
                    onClick={() => setActiveDoc(index)}
                    className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black transition-all ${
                      activeDoc === index
                        ? 'bg-navy-900 text-white border-navy-900'
                        : 'bg-white text-secondary border-slate-200 hover:border-navy-200'
                    }`}
                  >
                    {doc.parse_status === 'parsed' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    {doc.po_number || doc.file_name}
                  </button>
                ))}
              </div>

              {currentDoc && (
                <section className="card overflow-hidden">
                  <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="section-title !mb-0 truncate">{currentDoc.file_name}</h2>
                        <span className={`badge ${currentDoc.parse_status === 'parsed' ? 'badge-success' : 'badge-amber'}`}>
                          {currentDoc.parse_status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                        <DocMeta label="PO No." value={currentDoc.po_number || 'Needs review'} />
                        <DocMeta label="Supplier" value={currentDoc.supplier_name || 'Needs review'} />
                        <DocMeta label="PO Date" value={currentDoc.po_date || 'Needs review'} />
                        <DocMeta label="Currency" value={currentDoc.currency} />
                        <DocMeta label="Total" value={(currentDoc.total_amount || 0).toLocaleString('en-IN')} />
                      </div>
                    </div>
                    <button
                      className="btn btn-icon btn-sm btn-ghost text-red-500"
                      onClick={() => removeDocument(activeDoc)}
                      title="Remove staged document"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {currentDoc.parse_warnings.length > 0 && (
                    <div className="p-4 bg-amber-50 border-b border-amber-100 text-amber-800 text-xs font-semibold space-y-1">
                      {currentDoc.parse_warnings.map(warning => (
                        <div key={warning} className="flex items-center gap-2">
                          <AlertTriangle size={13} />
                          {warning}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="data-table-modern">
                      <thead>
                        <tr>
                          <th>Line</th>
                          <th>Item Code</th>
                          <th>Description</th>
                          <th className="text-right">Qty</th>
                          <th className="text-right">Unit Price</th>
                          <th className="text-right">Disc.</th>
                          <th className="text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentDoc.lines.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-12 text-tertiary">
                              No line items detected. This document can still be saved for OCR/review.
                            </td>
                          </tr>
                        ) : currentDoc.lines.map(line => (
                          <tr key={`${currentDoc.file_name}-${line.line_no}`}>
                            <td className="font-mono text-tertiary">{line.line_no}</td>
                            <td className="font-mono font-black text-navy-900">{line.item_code || '-'}</td>
                            <td>
                              <div className="max-w-xl">
                                <p className="font-semibold text-secondary">{line.description || '-'}</p>
                                <p className="text-[10px] text-tertiary truncate mt-1">{line.raw_line}</p>
                              </div>
                            </td>
                            <td className="text-right tabular-nums">{line.quantity ?? '-'}</td>
                            <td className="text-right tabular-nums">{line.unit_price?.toLocaleString('en-IN') ?? '-'}</td>
                            <td className="text-right tabular-nums">{line.discount_percent || 0}%</td>
                            <td className="text-right font-black tabular-nums">{line.total_amount?.toLocaleString('en-IN') ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}

function Metric({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'amber' }) {
  return (
    <div className={`rounded-2xl border p-4 text-center ${tone === 'amber' ? 'bg-amber-50 border-amber-100' : 'bg-white border-slate-100'}`}>
      <p className="text-2xl font-black text-navy-900 tabular-nums">{value}</p>
      <p className="label-caps !text-[8px] mt-1">{label}</p>
    </div>
  )
}

function StatusCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-navy-50 text-navy-600 flex items-center justify-center">
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="label-caps !text-[9px]">{label}</p>
        <p className="text-xl font-black text-navy-900 tabular-nums truncate">{value}</p>
      </div>
    </div>
  )
}

function DocMeta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-caps !text-[8px] mb-1">{label}</p>
      <p className="font-black text-navy-900 truncate">{value}</p>
    </div>
  )
}
