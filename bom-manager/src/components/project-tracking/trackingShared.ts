// Shared helpers for the Project Tracking tabs.

export const formatDate = (value?: string | null) => {
  if (!value) return 'Not set'
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export const formatDateTime = (value?: string | null) => {
  if (!value) return 'No updates yet'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Tracking status tones for work items / supplier assignments */
export const statusTone: Record<string, string> = {
  closed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  blocked: 'bg-red-50 text-red-700 border-red-200',
  waiting_supplier: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-sky-50 text-sky-700 border-sky-200',
  not_started: 'bg-slate-100 text-slate-600 border-slate-200',
}

/** Issue status tones */
export const issueStatusTone: Record<string, string> = {
  open: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-sky-50 text-sky-700 border-sky-200',
  resolved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-slate-100 text-slate-600 border-slate-200',
}

/** Issue severity tones */
export const severityTone: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600 border-slate-200',
  medium: 'bg-sky-50 text-sky-700 border-sky-200',
  high: 'bg-amber-50 text-amber-700 border-amber-200',
  critical: 'bg-red-50 text-red-700 border-red-200',
}

/** PO status tones for delivery tracking */
export const poStatusTone: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-600 border-slate-200',
  Released: 'bg-sky-50 text-sky-700 border-sky-200',
  Pending: 'bg-slate-100 text-slate-600 border-slate-200',
  Sent: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Confirmed: 'bg-violet-50 text-violet-700 border-violet-200',
  Partial: 'bg-amber-50 text-amber-700 border-amber-200',
  Received: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-red-50 text-red-600 border-red-200',
}

export const chipClass = (toneMap: Record<string, string>, key?: string | null, fallback = 'bg-slate-100 text-slate-600 border-slate-200') =>
  `inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${toneMap[key || ''] || fallback}`

export const downloadCsv = (filename: string, rows: string[]) => {
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
