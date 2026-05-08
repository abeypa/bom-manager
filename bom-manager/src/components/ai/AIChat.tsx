import { useState, useRef, useEffect } from 'react'
import {
  Bot, X, Send, Settings as SettingsIcon, Trash2, Check, X as XIcon,
  Loader2, AlertTriangle, FileText
} from 'lucide-react'
import { useAIStore, ChatMessage } from '@/store/useAIStore'
import { sendUserMessage, approvePending, rejectPending } from '@/lib/ai-runner'
import { isConfigured } from '@/lib/openrouter'
import AISettings from './AISettings'

export default function AIChat() {
  const open = useAIStore(s => s.open)
  const setOpen = useAIStore(s => s.setOpen)
  const messages = useAIStore(s => s.messages)
  const pending = useAIStore(s => s.pending)
  const busy = useAIStore(s => s.busy)
  const reset = useAIStore(s => s.reset)

  const [input, setInput] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages.length, pending.length])

  const submit = async () => {
    const t = input.trim()
    if (!t || busy) return
    if (!isConfigured()) { setShowSettings(true); return }
    setInput('')
    await sendUserMessage(t)
  }

  if (!open) return null

  const visibleMessages = messages.filter(m => m.role !== 'system' && m.role !== 'tool')
  const openPending = pending.filter(p => p.status === 'pending')

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50 w-[420px] max-w-[calc(100vw-2rem)] h-[640px] max-h-[calc(100vh-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
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
          {visibleMessages.length === 0 && (
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

        {/* Footer / input */}
        <div className="border-t border-slate-100 p-3 bg-white">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder={isConfigured() ? 'Ask about BOMs, POs, stock…' : 'Configure your OpenRouter key to start.'}
              rows={1}
              className="flex-1 text-sm resize-none px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 max-h-32"
            />
            <button
              onClick={submit}
              disabled={busy || !input.trim()}
              className="p-2.5 bg-navy-700 hover:bg-navy-800 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={14} />
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 leading-tight">
            Enter to send · Shift+Enter for newline · Writes always need your approval.
          </p>
        </div>
      </div>

      {showSettings && <AISettings onClose={() => setShowSettings(false)} />}
    </>
  )
}

function MessageBubble({ m }: { m: ChatMessage }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-navy-700 text-white text-sm rounded-2xl rounded-br-sm px-3.5 py-2 whitespace-pre-wrap">
          {m.content}
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
