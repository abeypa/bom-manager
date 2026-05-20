import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSearch, Loader2, XCircle } from 'lucide-react'
import { purchaseOrdersApi } from '@/api/purchase-orders'
import { auditPurchaseOrderPdf, type POPdfAuditResult } from '@/lib/po-pdf-audit'

interface POPdfAuditCardProps {
  projectId: number
  projectPOs: any[]
}

const statusStyle = {
  match: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  missing_pdf: 'bg-red-50 text-red-700 border-red-200',
  error: 'bg-red-50 text-red-700 border-red-200',
}

export default function POPdfAuditCard({ projectId, projectPOs }: POPdfAuditCardProps) {
  const attachedPOs = useMemo(() => projectPOs.filter((po) => Boolean(po.bep_po_pdf_url)), [projectPOs])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<POPdfAuditResult[]>([])
  const [activePoId, setActivePoId] = useState<number | null>(null)

  const selectedIds = selected.size > 0 ? Array.from(selected) : attachedPOs.map((po) => po.id)
  const summary = {
    match: results.filter((r) => r.status === 'match').length,
    warning: results.filter((r) => r.status === 'warning').length,
    error: results.filter((r) => r.status === 'error' || r.status === 'missing_pdf').length,
  }

  const toggleSelected = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const runAudit = async () => {
    if (selectedIds.length === 0) return
    setRunning(true)
    setResults([])
    try {
      const out: POPdfAuditResult[] = []
      for (const poId of selectedIds) {
        setActivePoId(poId)
        const fullPO = await purchaseOrdersApi.getById(poId)
        const result = await auditPurchaseOrderPdf(fullPO)
        out.push(result)
        setResults([...out])
      }
    } finally {
      setActivePoId(null)
      setRunning(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 bg-blue-50/70 border-b border-blue-100 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white border border-blue-100 flex items-center justify-center text-blue-700 shadow-sm">
            <FileSearch size={20} />
          </div>
          <div>
            <h3 className="font-black text-gray-900 tracking-tight">AI PO / PDF Match Audit</h3>
            <p className="text-xs text-gray-500 mt-1">
              Select attached POs and compare stored PO number, supplier, totals, quantities, price, and line count against the PDF.
            </p>
          </div>
        </div>
        <button
          onClick={runAudit}
          disabled={running || attachedPOs.length === 0}
          className="btn btn-primary min-w-[180px] disabled:opacity-50"
        >
          {running ? <Loader2 size={15} className="animate-spin mr-2" /> : <FileSearch size={15} className="mr-2" />}
          {running ? 'Checking...' : `Run Audit (${selectedIds.length})`}
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex flex-wrap gap-2">
          {attachedPOs.map((po) => {
            const checked = selected.size === 0 || selected.has(po.id)
            return (
              <button
                key={po.id}
                onClick={() => toggleSelected(po.id)}
                className={`px-3 py-2 rounded-xl border text-[11px] font-black font-mono transition-all ${
                  checked ? 'bg-navy-900 text-white border-navy-900' : 'bg-white text-gray-500 border-gray-200 hover:border-navy-300'
                }`}
              >
                {po.po_number}
              </button>
            )
          })}
          {attachedPOs.length === 0 && (
            <div className="text-sm font-bold text-gray-400">No attached PO PDFs found for this project.</div>
          )}
        </div>

        {running && activePoId && (
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 text-xs font-bold text-blue-700">
            Reading PDF for PO #{projectPOs.find((po) => po.id === activePoId)?.po_number || activePoId}...
          </div>
        )}

        {results.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <AuditStat label="Matched" value={summary.match} tone="emerald" />
            <AuditStat label="Needs Review" value={summary.warning} tone="amber" />
            <AuditStat label="Errors" value={summary.error} tone="red" />
          </div>
        )}

        <div className="space-y-3">
          {results.map((result) => (
            <div key={result.po_id} className="rounded-2xl border border-gray-100 bg-gray-50/40 p-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="flex items-center gap-3">
                  {result.status === 'match' ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : result.status === 'warning' ? (
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-600" />
                  )}
                  <div>
                    <div className="font-black text-sm text-gray-900 font-mono">{result.po_number}</div>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                      <span>DB {result.db_line_count} lines / PDF {result.pdf_line_count} lines</span>
                      <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-gray-500">
                        {result.po_status}
                      </span>
                    </div>
                  </div>
                </div>
                <span className={`badge border ${statusStyle[result.status]} !px-3`}>
                  {result.status === 'match' ? 'Matched' : result.status === 'warning' ? `${result.issues.length} issue(s)` : 'Error'}
                </span>
              </div>

              {result.issues.length > 0 ? (
                <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100 bg-white">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase tracking-widest">Check</th>
                        <th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase tracking-widest">System</th>
                        <th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase tracking-widest">PDF</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {result.issues.map((issue, index) => (
                        <tr key={`${issue.label}-${index}`}>
                          <td className="px-3 py-2 text-xs font-black text-gray-800">{issue.label}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">{issue.expected}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">{issue.actual}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-3 text-xs font-bold text-emerald-700">PDF and PO data match on all checked fields.</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AuditStat({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'red' }) {
  const cls = tone === 'emerald'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
    : tone === 'amber'
      ? 'bg-amber-50 text-amber-700 border-amber-100'
      : 'bg-red-50 text-red-700 border-red-100'
  return (
    <div className={`rounded-xl border px-4 py-3 ${cls}`}>
      <div className="text-[9px] font-black uppercase tracking-widest opacity-70">{label}</div>
      <div className="text-2xl font-black font-mono mt-1">{value}</div>
    </div>
  )
}
