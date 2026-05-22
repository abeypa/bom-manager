import { useEffect, useState } from 'react'
import { X, Cpu, ShieldCheck, KeyRound } from 'lucide-react'
import {
  loadSettings,
  saveSettings,
  saveSettingsToDB,
  RECOMMENDED_MODELS,
  getAIProxyConfigStatus,
  saveAIProxyApiKey,
  clearAIProxyApiKey,
  type AIProxyConfigStatus,
} from '@/lib/openrouter'
import { useRole } from '@/hooks/useRole'

export default function AISettings({ onClose }: { onClose: () => void }) {
  const { isAdmin } = useRole() as any
  const initial = loadSettings()
  const [model, setModel] = useState(initial.model)
  const [apiKey, setApiKey] = useState('')
  const [status, setStatus] = useState<AIProxyConfigStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const next = await getAIProxyConfigStatus()
        if (alive) setStatus(next)
      } catch {
        if (alive) setStatus(null)
      } finally {
        if (alive) setLoadingStatus(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const save = async () => {
    const trimmedModel = model.trim()
    const trimmedKey = apiKey.trim()

    if (!trimmedModel) {
      alert('Model id is required.')
      return
    }

    setSaving(true)
    try {
      await saveSettingsToDB({ model: trimmedModel })
      saveSettings({ model: trimmedModel })

      if (trimmedKey) {
        const nextStatus = await saveAIProxyApiKey(trimmedKey)
        setStatus(nextStatus)
        setApiKey('')
      }

      onClose()
    } catch (e: any) {
      alert(`Failed to save: ${e?.message || 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  const clearKey = async () => {
    if (!window.confirm('Clear the stored OpenRouter API key for all users?')) return
    setSaving(true)
    try {
      const nextStatus = await clearAIProxyApiKey()
      setStatus(nextStatus)
      setApiKey('')
    } catch (e: any) {
      alert(`Failed to clear key: ${e?.message || 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  const statusLabel = loadingStatus
    ? 'Checking...'
    : status?.configured
      ? `Configured (${status.source === 'app_settings' ? 'saved from AI settings' : 'worker secret'})`
      : 'Not configured'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">AI assistant settings</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <ShieldCheck size={16} className="text-blue-500 mt-0.5 shrink-0" />
            <div className="text-[12px] text-blue-900 leading-relaxed">
              <strong>{isAdmin ? 'Write-only secret flow.' : 'Managed by admin.'}</strong> The OpenRouter API
              key is never shown back to the browser after save. Admins can rotate it here, but users only see whether
              AI is configured.
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-2">
              <KeyRound size={12} /> OpenRouter API key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={isAdmin ? 'Enter a new key to save or rotate' : 'Managed by admin'}
              disabled={!isAdmin}
              className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 font-mono disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
              autoComplete="off"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500">
                Status: <span className="font-semibold text-slate-700">{statusLabel}</span>
              </p>
              {isAdmin && status?.configured && (
                <button
                  type="button"
                  onClick={clearKey}
                  disabled={saving}
                  className="text-[11px] font-semibold text-red-600 hover:text-red-700 disabled:opacity-60"
                >
                  Clear stored key
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-2">
              <Cpu size={12} /> Model
            </label>
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="provider/model-id (e.g. anthropic/claude-3.5-sonnet)"
              disabled={!isAdmin}
              className="w-full text-sm px-3 py-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20 font-mono disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
              spellCheck={false}
              autoComplete="off"
            />
            {isAdmin && (
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={RECOMMENDED_MODELS.some((m) => m.id === model) ? model : ''}
                  onChange={(e) => {
                    if (e.target.value) setModel(e.target.value)
                  }}
                  className="flex-1 text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500/20"
                >
                  <option value="">Pick from recommended...</option>
                  {RECOMMENDED_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <a
                  href="https://openrouter.ai/models"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-navy-600 hover:text-navy-800 underline whitespace-nowrap"
                >
                  Browse models -&gt;
                </a>
              </div>
            )}
            <p className="text-[11px] text-slate-500 mt-2">
              Tool/function calling support is required. Verify the model on{' '}
              <a
                href="https://openrouter.ai/models"
                target="_blank"
                rel="noreferrer"
                className="text-navy-600 underline"
              >
                openrouter.ai/models
              </a>
              .
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-900 leading-relaxed">
            <strong>Safety:</strong> The assistant can read your data freely, but every write
            (add part, change PO status, stock movement, etc.) is held for your explicit
            approval before it runs.
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            {isAdmin ? 'Cancel' : 'Close'}
          </button>
          {isAdmin && (
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-navy-700 hover:bg-navy-800 rounded-lg disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save for all users'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
