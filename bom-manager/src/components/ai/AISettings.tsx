import { useState } from 'react'
import { X, KeyRound, Cpu } from 'lucide-react'
import { loadSettings, saveSettings, RECOMMENDED_MODELS } from '@/lib/openrouter'

export default function AISettings({ onClose }: { onClose: () => void }) {
  const initial = loadSettings()
  const [apiKey, setApiKey] = useState(initial.apiKey)
  const [model, setModel] = useState(initial.model)
  const [showKey, setShowKey] = useState(false)

  const save = () => {
    saveSettings({ apiKey: apiKey.trim(), model })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">AI assistant settings</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-2">
              <KeyRound size={12} /> OpenRouter API key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-or-v1-…"
                className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(s => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-500 hover:text-slate-800 px-2"
              >
                {showKey ? 'hide' : 'show'}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Get a key at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-navy-600 underline">openrouter.ai/keys</a>.
              Stored locally in your browser only — never sent to our servers.
            </p>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-2">
              <Cpu size={12} /> Model
            </label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20"
            >
              {RECOMMENDED_MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-2">Tool/function calling required. Claude 3.5 Sonnet recommended.</p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-900 leading-relaxed">
            <strong>Safety:</strong> The assistant can read your data freely, but every write
            (add part, change PO status, stock movement, etc.) is held for your explicit
            approval before it runs.
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900">Cancel</button>
          <button onClick={save} className="px-4 py-2 text-sm font-semibold text-white bg-navy-700 hover:bg-navy-800 rounded-lg">Save</button>
        </div>
      </div>
    </div>
  )
}
