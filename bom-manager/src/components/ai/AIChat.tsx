import { useState, useRef, useEffect } from 'react'
import {
  Bot, X, Send, Settings as SettingsIcon, Trash2, Check, X as XIcon,
  Loader2, AlertTriangle, FileText, Paperclip, Image as ImageIcon, FileText as PdfIcon,
  Square, ClipboardList, FolderKanban, Tags, Table2, Sparkles, ShoppingCart,
  Zap, ChevronRight,
} from 'lucide-react'
import { useAIStore, ChatMessage } from '@/store/useAIStore'
import { sendUserMessage, approvePending, rejectPending, stopAI } from '@/lib/ai-runner'
import { isConfigured, loadSettings, loadSettingsFromDB, saveSettings, modelSupportsVision } from '@/lib/openrouter'
import {
  fileToAttachment, isImageFile, isPDFFile,
  type Attachment, type ImageAttachment
} from '@/lib/ai-attachments'
import AISettings from './AISettings'
import { supabase } from '@/lib/supabase'

// ── Part categories ────────────────────────────────────────────────────────────
const PART_CATEGORIES = [
  { label: 'Electrical Bought-Out',   prefix: 'EBO', value: 'electrical_bought_out',   color: 'bg-blue-50 border-blue-200 text-blue-800' },
  { label: 'Electrical Manufacture',  prefix: 'EMF', value: 'electrical_manufacture',   color: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
  { label: 'Mechanical Bought-Out',   prefix: 'MBO', value: 'mechanical_bought_out',    color: 'bg-amber-50 border-amber-200 text-amber-800' },
  { label: 'Mechanical Manufacture',  prefix: 'MMF', value: 'mechanical_manufacture',   color: 'bg-orange-50 border-orange-200 text-orange-800' },
  { label: 'Pneumatic',               prefix: 'PBO', value: 'pneumatic_bought_out',     color: 'bg-teal-50 border-teal-200 text-teal-800' },
]

const SMART_COMMANDS = [
  {
    label: 'PO Ingest',
    icon: ClipboardList,
    prompt:
      'PO ingest: I will attach one or more PO PDFs. Ask me for the target project if not clear. For each PO, resolve or create the supplier, create missing master parts, update existing part prices with the PO date, ask me when part category or project table is uncertain, map each part only once in the project, then draft the matching PO after mapping.',
  },
  {
    label: 'Select Project',
    icon: FolderKanban,
    prompt:
      'Help me select the target project for PO ingestion. List matching projects and ask me to choose one before creating or mapping any parts.',
  },
  {
    label: 'Part Category',
    icon: Tags,
    prompt:
      'Help me classify the PO line items into part categories. Use electrical, mechanical, and pneumatic heuristics, but ask me to choose when there is doubt.',
  },
  {
    label: 'Project Table',
    icon: Table2,
    prompt:
      'Help me map the PO parts to the correct project section/subsection table. Show existing project structure and suggest the best target table for each line.',
  },
  {
    label: 'Draft PO',
    icon: ShoppingCart,
    prompt:
      'After the PO parts are mapped to the project, draft the matching PO from the same source PDF. Exclude GST/tax lines and keep the PO in Draft status for review.',
  },
]

export default function AIChat() {
  const open = useAIStore(s => s.open)
  const setOpen = useAIStore(s => s.setOpen)
  const messages = useAIStore(s => s.messages)
  const pending = useAIStore(s => s.pending)
  const busy = useAIStore(s => s.busy)
  const reset = useAIStore(s => s.reset)

  const [input, setInput] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)
  const [attachBusy, setAttachBusy] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addFiles = async (files: FileList | File[]) => {
    setAttachError(null)
    setAttachBusy(true)
    try {
      const list = Array.from(files)
      const out: Attachment[] = []
      for (const f of list) {
        if (!isImageFile(f) && !isPDFFile(f)) {
          setAttachError(`Skipped ${f.name} — only images and PDFs are supported.`)
          continue
        }
        try { out.push(await fileToAttachment(f)) } catch (e: any) {
          setAttachError(e?.message || `Failed to read ${f.name}`)
        }
      }
      if (out.length) setAttachments(a => [...a, ...out])
    } finally {
      setAttachBusy(false)
    }
  }

  const removeAttachment = (i: number) =>
    setAttachments(a => a.filter((_, idx) => idx !== i))

  const runSmartCommand = async (prompt: string) => {
    if (busy) return
    if (!isConfigured()) {
      const dbSettings = await loadSettingsFromDB()
      if (dbSettings?.apiKey) saveSettings(dbSettings)
    }
    if (!isConfigured()) { setShowSettings(true); return }
    const atts = attachments
    setInput('')
    setAttachments([])
    setAttachError(null)
    await sendUserMessage(prompt, atts.length ? atts : undefined)
  }

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length, pending.length])

  const submit = async () => {
    const t = input.trim()
    if ((!t && attachments.length === 0) || busy) return
    // If key not in localStorage yet, try DB sync before giving up
    if (!isConfigured()) {
      const dbSettings = await loadSettingsFromDB()
      if (dbSettings?.apiKey) saveSettings(dbSettings)
    }
    if (!isConfigured()) { setShowSettings(true); return }
    const text = t || '(see attached file)'
    const atts = attachments
    setInput('')
    setAttachments([])
    setAttachError(null)
    await sendUserMessage(text, atts)
  }

  // Send a quick-reply as a user message without typing
  const sendReply = async (text: string) => {
    if (busy) return
    if (!isConfigured()) {
      const dbSettings = await loadSettingsFromDB()
      if (dbSettings?.apiKey) saveSettings(dbSettings)
    }
    if (!isConfigured()) { setShowSettings(true); return }
    await sendUserMessage(text, undefined)
  }

  const visionOk = modelSupportsVision(loadSettings().model)
  const hasImage = attachments.some(a => a.kind === 'image')

  if (!open) return null

  const visibleMessages = messages.filter(m => m.role !== 'system' && m.role !== 'tool')
  const openPending = pending.filter(p => p.status === 'pending')

  return (
    <>
      <div
        className={`fixed bottom-4 right-4 z-50 w-[420px] max-w-[calc(100vw-2rem)] h-[640px] max-h-[calc(100vh-2rem)] bg-white rounded-2xl shadow-2xl border ${dragOver ? 'border-navy-500 ring-4 ring-navy-500/20' : 'border-slate-200'} flex flex-col overflow-hidden`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false)
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-navy-700 to-navy-900 text-white">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-white/10 rounded-lg flex items-center justify-center">
              <Bot size={14} />
            </div>
            <div>
              <p className="text-sm font-bold leading-none">BOM Assistant</p>
              <p className="text-[10px] text-white/60 mt-0.5">All writes require your approval</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowSettings(true)} className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded" title="Settings">
              <SettingsIcon size={14} />
            </button>
            <button onClick={() => { if (confirm('Clear chat history?')) reset() }} className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded" title="Clear chat">
              <Trash2 size={14} />
            </button>
            <button onClick={() => setOpen(false)} className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded" title="Close">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
          {visibleMessages.length === 0 && <SmartCommandPanel busy={busy} runSmartCommand={runSmartCommand} />}
          {false && visibleMessages.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-xs space-y-2">
              <Bot size={28} className="mx-auto text-slate-300" />
              <p className="text-sm font-semibold text-slate-500">Ask me anything about your BOMs</p>
              <div className="text-left max-w-[300px] mx-auto bg-white border border-slate-200 rounded-xl p-3 space-y-1.5">
                <p className="font-bold text-slate-600">Try:</p>
                <p>• "Reconcile project 70020 and tell me the discrepancies"</p>
                <p>• "Show pending procurement grouped by supplier as an HTML report"</p>
                <p>• "Add 5 of part PN-1234 to project 70021 mech subsection"</p>
                <p>• "Stock in 10 of EBO-001"</p>
                <p>• "Release PO #29"</p>
              </div>
            </div>
          )}

          {visibleMessages.map(m => <MessageBubble key={m.id} m={m} />)}

          {openPending.length > 1 && (
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border border-amber-200 rounded-xl p-2 flex items-center gap-2 shadow-sm">
              <span className="text-[11px] font-bold text-amber-700 flex-1">
                {openPending.length} actions waiting
              </span>
              <button
                onClick={async () => {
                  if (!confirm(`Approve and run all ${openPending.length} pending actions?`)) return
                  for (const p of openPending) {
                    if (useAIStore.getState().pending.find(x => x.id === p.id && x.status === 'pending')) {
                      await approvePending(p)
                    }
                  }
                }}
                disabled={busy}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-lg disabled:opacity-50"
              >
                Approve all
              </button>
              <button
                onClick={async () => {
                  if (!confirm(`Reject all ${openPending.length} pending actions?`)) return
                  for (const p of openPending) await rejectPending(p)
                }}
                disabled={busy}
                className="px-3 py-1.5 bg-white border border-slate-300 hover:border-red-400 hover:text-red-600 text-slate-700 text-[11px] font-semibold rounded-lg disabled:opacity-50"
              >
                Reject all
              </button>
            </div>
          )}

          {openPending.map(p => (
            <div key={p.id} className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3 space-y-2 shadow-sm">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Approval needed</p>
                  <p className="text-xs font-semibold text-slate-900 mt-0.5">{p.tool_name}</p>
                  <p className="text-[11px] text-slate-700 mt-1">{p.summary}</p>
                  <details className="mt-1.5">
                    <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-700">View payload</summary>
                    <pre className="text-[10px] bg-white border border-slate-200 rounded p-2 mt-1 overflow-x-auto">{JSON.stringify(p.args, null, 2)}</pre>
                  </details>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => approvePending(p)}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
                >
                  <Check size={12} /> Approve & run
                </button>
                <button
                  onClick={() => rejectPending(p)}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-white border border-slate-300 hover:border-red-400 hover:text-red-600 text-slate-700 text-xs font-semibold rounded-lg disabled:opacity-50"
                >
                  <XIcon size={12} /> Reject
                </button>
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <Loader2 size={12} className="animate-spin" /> Thinking…
            </div>
          )}
        </div>

        {/* Quick-reply chips (context-aware, shown when AI has replied) */}
        {visibleMessages.length > 0 && !busy && (
          <QuickReplies
            lastMessage={visibleMessages.filter(m => m.role === 'assistant').at(-1)}
            onReply={sendReply}
          />
        )}

        {/* Footer / input */}
        <div className="border-t border-slate-100 p-3 bg-white">
          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map((a, i) => (
                <AttachmentChip key={i} a={a} onRemove={() => removeAttachment(i)} />
              ))}
            </div>
          )}
          {hasImage && !visionOk && (
            <div className="mb-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              Selected model has no vision. Switch to a vision-capable model in settings, or attach a PDF instead.
            </div>
          )}
          {attachError && (
            <div className="mb-2 text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
              {attachError}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              hidden
              onChange={e => {
                if (e.target.files) addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={attachBusy}
              className="p-2.5 text-slate-500 hover:text-navy-700 hover:bg-slate-100 rounded-lg disabled:opacity-50"
              title="Attach image or PDF"
              aria-label="Attach file"
            >
              {attachBusy ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
            </button>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onPaste={e => {
                const files = Array.from(e.clipboardData.files || [])
                if (files.length) {
                  e.preventDefault()
                  addFiles(files)
                }
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder={isConfigured() ? 'Ask, paste/drop an image or PDF…' : 'Configure your OpenRouter key to start.'}
              rows={1}
              className="flex-1 text-sm resize-none px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 max-h-32"
            />
            {busy ? (
              <button
                onClick={stopAI}
                className="p-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-sm shadow-red-200/50"
                title="Stop the AI"
                aria-label="Stop"
              >
                <Square size={14} className="fill-white" />
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!input.trim() && attachments.length === 0}
                className="p-2.5 bg-navy-700 hover:bg-navy-800 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                title="Send"
                aria-label="Send"
              >
                <Send size={14} />
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 leading-tight">
            Enter to send · Shift+Enter for newline · {busy ? 'Click ◼ to stop the AI' : 'Drop / paste images & PDFs'} · Writes always need your approval.
          </p>
        </div>
      </div>

      {showSettings && <AISettings onClose={() => setShowSettings(false)} />}
    </>
  )
}

function SmartCommandPanel({
  busy,
  runSmartCommand,
}: {
  busy: boolean
  runSmartCommand: (prompt: string) => void
}) {
  return (
    <div className="py-6 text-slate-500 text-xs space-y-4">
      <div className="text-center">
        <Bot size={28} className="mx-auto text-slate-300" />
        <p className="text-sm font-semibold text-slate-600 mt-2">Smart BOM assistant</p>
        <p className="text-[11px] text-slate-400 mt-1">Attach PO PDFs, then choose a command or type naturally.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {SMART_COMMANDS.map(({ label, icon: Icon, prompt }) => (
          <button
            key={label}
            onClick={() => runSmartCommand(prompt)}
            disabled={busy}
            className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-left hover:border-navy-300 hover:bg-navy-50 transition-all disabled:opacity-50"
          >
            <Icon size={14} className="text-navy-600 shrink-0" />
            <span className="text-[11px] font-bold text-slate-700">{label}</span>
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-1.5">
        <div className="flex items-center gap-2 text-slate-700 font-bold">
          <Sparkles size={13} className="text-navy-600" />
          Smart PO flow
        </div>
        <p>1. Attach one or more PO PDFs.</p>
        <p>2. Click PO Ingest.</p>
        <p>3. I will ask for project, supplier, category, and table choices only when needed.</p>
        <p>4. Approved actions appear here, then the draft PO is created.</p>
      </div>
    </div>
  )
}

// ── Context-aware quick replies ───────────────────────────────────────────────
function QuickReplies({ lastMessage, onReply }: { lastMessage: ChatMessage | undefined; onReply: (t: string) => void }) {
  const [projects, setProjects] = useState<any[]>([])
  const [sections, setSections] = useState<any[]>([])

  const msg = lastMessage?.content?.toLowerCase() ?? ''

  const wantsProject  = /which project|select.*project|target project|project.*should|what project|choose.*project|project.*name|list.*project/i.test(msg)
  const wantsCategory = /part.*(type|category)|category|classify|electrical|mechanical|pneumatic|which type|what type|part classification/i.test(msg)
  const wantsSection  = /which section|which table|subsection|target.*section|section.*for|where.*should|map.*to|place.*in|add.*to.*section/i.test(msg)
  const wantsYesNo    = /shall i|should i|confirm|proceed|go ahead|correct\?|ok\?|ready|approve|want me to|continue/i.test(msg)
  const wantsSkip     = /skip|leave.*blank|not sure|don't know|unsure/i.test(msg)

  useEffect(() => {
    if (wantsProject) {
      ;(supabase as any)
        .from('projects')
        .select('id, project_name, project_number, status')
        .not('status', 'eq', 'cancelled')
        .order('project_number', { ascending: false })
        .limit(10)
        .then(({ data }: any) => setProjects(data || []))
    }
  }, [wantsProject])

  useEffect(() => {
    if (wantsSection) {
      // Extract a project_id from recent messages if the AI mentioned one
      const numMatch = msg.match(/project[^\d]*(\d+)/)
      const projectId = numMatch ? parseInt(numMatch[1]) : null
      const q = (supabase as any)
        .from('project_subsections')
        .select('id, section_name, description, project_id')
        .order('sort_order', { ascending: true })
        .limit(20)
      ;(projectId ? q.eq('project_id', projectId) : q).then(({ data }: any) => setSections(data || []))
    }
  }, [wantsSection, msg])

  const hasAnything = wantsProject || wantsCategory || wantsSection || wantsYesNo || wantsSkip

  if (!hasAnything && !lastMessage) return null
  if (!hasAnything) return null

  return (
    <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 space-y-2">
      <div className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">
        <Zap size={9} className="text-navy-400" /> Quick replies
      </div>

      {/* Yes / No / Skip */}
      {wantsYesNo && (
        <div className="flex flex-wrap gap-1.5">
          <QuickChip label="✓  Yes, proceed" color="bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100" onClick={() => onReply('Yes, proceed.')} />
          <QuickChip label="✗  No, stop" color="bg-red-50 border-red-200 text-red-700 hover:bg-red-100" onClick={() => onReply('No, stop.')} />
          {wantsSkip && <QuickChip label="Skip this" color="bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200" onClick={() => onReply('Skip this item.')} />}
        </div>
      )}

      {/* Project list */}
      {wantsProject && projects.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {projects.map(p => (
            <QuickChip
              key={p.id}
              label={`${p.project_name} (${p.project_number})`}
              color="bg-navy-50 border-navy-200 text-navy-800 hover:bg-navy-100"
              onClick={() => onReply(`Use project: ${p.project_name} (${p.project_number}), id ${p.id}`)}
            />
          ))}
        </div>
      )}

      {/* Part categories */}
      {wantsCategory && (
        <div className="flex flex-wrap gap-1.5">
          {PART_CATEGORIES.map(c => (
            <QuickChip
              key={c.value}
              label={`${c.prefix} — ${c.label}`}
              color={`${c.color} hover:opacity-80`}
              onClick={() => onReply(`Part type: ${c.label} (${c.value})`)}
            />
          ))}
        </div>
      )}

      {/* Section list */}
      {wantsSection && sections.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sections.map(s => (
            <QuickChip
              key={s.id}
              label={s.section_name}
              color="bg-violet-50 border-violet-200 text-violet-800 hover:bg-violet-100"
              onClick={() => onReply(`Use section/table: "${s.section_name}" (subsection id ${s.id})`)}
            />
          ))}
          <QuickChip label="+ Create new section" color="bg-white border-dashed border-slate-300 text-slate-500 hover:border-navy-400 hover:text-navy-700" onClick={() => onReply('Please create a new section for these parts.')} />
        </div>
      )}
    </div>
  )
}

function QuickChip({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 border rounded-lg text-[11px] font-semibold transition-all ${color}`}
    >
      {label}
    </button>
  )
}

function MessageBubble({ m }: { m: ChatMessage }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-navy-700 text-white text-sm rounded-2xl rounded-br-sm px-3.5 py-2 whitespace-pre-wrap space-y-2">
          {m.attachments && m.attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 -m-0.5">
              {m.attachments.map((a, i) => (
                <div key={i} className="bg-white/10 rounded-lg overflow-hidden">
                  {a.kind === 'image' ? (
                    <img src={(a as ImageAttachment).dataUrl} alt={a.name} className="max-w-[160px] max-h-[160px] object-cover" />
                  ) : (
                    <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px]">
                      <PdfIcon size={12} />
                      <span className="font-mono truncate max-w-[140px]">{a.name}</span>
                      <span className="text-white/50">{(a as any).pageCount}p</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {m.content && <div>{m.content}</div>}
        </div>
      </div>
    )
  }
  if (m.role === 'assistant') {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex justify-start">
          <div className="max-w-[85%] bg-white border border-slate-200 text-sm text-slate-800 rounded-2xl rounded-bl-sm px-3.5 py-2 whitespace-pre-wrap">
            {m.content || <em className="text-slate-400">(used a tool…)</em>}
            {m.tool_calls && m.tool_calls.length > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                {m.tool_calls.map(tc => (
                  <div key={tc.id} className="text-[10px] font-mono text-slate-500">
                    → {tc.function.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {m.html && <HTMLReport title={m.html.title} html={m.html.html} />}
      </div>
    )
  }
  return null
}

function AttachmentChip({ a, onRemove }: { a: Attachment; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg pl-1.5 pr-1 py-1 text-[11px]">
      {a.kind === 'image' ? (
        <>
          <img src={(a as ImageAttachment).dataUrl} className="w-7 h-7 object-cover rounded" />
          <span className="truncate max-w-[100px] font-mono">{a.name}</span>
        </>
      ) : (
        <>
          <PdfIcon size={13} className="text-red-500" />
          <span className="truncate max-w-[100px] font-mono">{a.name}</span>
          <span className="text-slate-400">{(a as any).pageCount}p{(a as any).truncated ? ' · trim' : ''}</span>
        </>
      )}
      <button onClick={onRemove} className="p-0.5 text-slate-400 hover:text-red-600">
        <XIcon size={11} />
      </button>
    </div>
  )
}

function HTMLReport({ title, html }: { title: string; html: string }) {
  const printRef = useRef<HTMLIFrameElement>(null)
  const [expanded, setExpanded] = useState(false)
  const fullDoc = `<!doctype html><html><head><meta charset="utf-8"><script src="https://cdn.tailwindcss.com"></script><style>body{font-family:system-ui,sans-serif;padding:1rem;color:#0f172a;}table{border-collapse:collapse;width:100%;}th,td{padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:12px;}th{background:#f8fafc;font-weight:700;text-transform:uppercase;font-size:10px;color:#64748b;letter-spacing:0.05em;}</style></head><body>${html}</body></html>`

  const printIt = () => {
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(fullDoc)
    w.document.close()
    setTimeout(() => w.print(), 300)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <FileText size={12} className="text-slate-500" />
          <p className="text-xs font-bold text-slate-700">{title}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setExpanded(e => !e)} className="text-[10px] text-slate-500 hover:text-slate-800 font-semibold">
            {expanded ? 'collapse' : 'expand'}
          </button>
          <button onClick={printIt} className="text-[10px] text-navy-600 hover:text-navy-800 font-semibold">print / save PDF</button>
        </div>
      </div>
      <iframe
        ref={printRef}
        sandbox=""
        srcDoc={fullDoc}
        title={title}
        className="w-full bg-white"
        style={{ height: expanded ? 600 : 320, border: 'none' }}
      />
    </div>
  )
}
