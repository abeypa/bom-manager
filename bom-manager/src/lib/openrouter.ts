import { supabase } from './supabase'

export type ORContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }

export interface ORMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | ORContentPart[] | null
  name?: string
  tool_calls?: ORToolCall[]
  tool_call_id?: string
}

export interface ORToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface ORTool {
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, any> }
}

export interface ORCompletionResponse {
  id: string
  model: string
  error?: {
    code?: number | string
    message?: string
    metadata?: Record<string, unknown>
  }
  choices: Array<{
    finish_reason: string
    message: {
      role: 'assistant'
      content: string | null
      tool_calls?: ORToolCall[]
    }
  }>
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export interface AISettings {
  apiKey: string
  model: string
}

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1'
const STORAGE_KEY = 'bom-ai:openrouter'

export const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5'

export const RECOMMENDED_MODELS = [
  { id: 'inclusionai/ling-3.0-flash:free', label: 'Ling 3.0 Flash (free, text only)', vision: false },
  { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5 (recommended) - vision', vision: true },
  { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4 - vision', vision: true },
  { id: 'openai/gpt-4o', label: 'GPT-4o - vision', vision: true },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini - vision', vision: true },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash - vision', vision: true },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (text only)', vision: false },
]

function getConfiguredModelId(model: unknown): string {
  const modelId = typeof model === 'string' ? model.trim() : ''
  return modelId || DEFAULT_MODEL
}

function unavailableModelMessage(modelId: string) {
  const lingSuggestion = modelId === 'inclusionai/ling-3.0-flash'
    ? ' To use Ling 3.0 Flash, explicitly select "inclusionai/ling-3.0-flash:free" in AI Settings.'
    : ''
  return (
    `The configured model "${modelId}" has no active OpenRouter endpoints.` +
    lingSuggestion +
    ' The app did not change your selected model automatically.'
  )
}

export function modelSupportsVision(modelId: string): boolean {
  const model = RECOMMENDED_MODELS.find((entry) => entry.id === modelId)
  if (model) return model.vision
  return true
}

export function loadSettings(): AISettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { apiKey: '', model: DEFAULT_MODEL }
    const parsed = JSON.parse(raw)
    return {
      apiKey: parsed.apiKey || '',
      model: getConfiguredModelId(parsed.model),
    }
  } catch {
    return { apiKey: '', model: DEFAULT_MODEL }
  }
}

export function saveSettings(settings: AISettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    apiKey: settings.apiKey || '',
    model: getConfiguredModelId(settings.model),
  }))
}

export function isConfigured(): boolean {
  const { apiKey, model } = loadSettings()
  return !!apiKey && !!model
}

export async function loadSettingsFromDB(): Promise<AISettings | null> {
  try {
    const { data, error } = await (supabase as any)
      .from('app_settings')
      .select('key, value')
      .in('key', ['ai_api_key', 'ai_model'])

    if (error) return null

    const rows = Array.isArray(data) ? data : []
    const apiKey = rows.find((row: any) => row.key === 'ai_api_key')?.value || ''
    const model = getConfiguredModelId(rows.find((row: any) => row.key === 'ai_model')?.value)

    if (!apiKey && !model) return null
    return { apiKey, model }
  } catch {
    return null
  }
}

export async function saveSettingsToDB(settings: AISettings): Promise<void> {
  const payload = [
    { key: 'ai_model', value: getConfiguredModelId(settings.model), updated_at: new Date().toISOString() },
  ]

  if (settings.apiKey) {
    payload.push({ key: 'ai_api_key', value: settings.apiKey, updated_at: new Date().toISOString() })
  }

  const { error } = await (supabase as any).from('app_settings').upsert(payload)
  if (error) throw error
}

function getOpenRouterError(payload: any): string | null {
  const error = payload?.error
  if (error?.message) {
    const message = String(error.message)
    const metadata = error.metadata || {}
    const provider = metadata.provider_name || metadata.provider
    const errorType = metadata.error_type
    const raw = metadata.raw
    let detail = ''

    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        detail = String(parsed?.error?.message || parsed?.message || '')
      } catch {
        detail = raw
      }
    }

    const context = [
      provider ? `provider: ${provider}` : '',
      errorType ? `type: ${errorType}` : '',
      detail && detail !== message ? detail.slice(0, 500) : '',
    ].filter(Boolean)
    return context.length ? `${message} (${context.join('; ')})` : message
  }

  const choice = payload?.choices?.[0]
  if (choice?.finish_reason === 'error') {
    return 'The model provider stopped before producing a response.'
  }
  return null
}

async function readResponsePayload(res: Response): Promise<any> {
  const body = await res.text()
  if (!body) return null
  try {
    return JSON.parse(body)
  } catch {
    if (!res.ok) return { error: { message: body.slice(0, 1_000) } }
    throw new Error('OpenRouter returned an invalid JSON response.')
  }
}

export async function validateOpenRouterModel(apiKey: string, model: string): Promise<void> {
  const modelId = getConfiguredModelId(model)
  const separatorIndex = modelId.indexOf('/')
  if (separatorIndex <= 0 || separatorIndex === modelId.length - 1) {
    throw new Error('Model id must use the provider/model format.')
  }

  const author = encodeURIComponent(modelId.slice(0, separatorIndex))
  const slug = encodeURIComponent(modelId.slice(separatorIndex + 1))
  const response = await fetch(`${OPENROUTER_API_BASE}/models/${author}/${slug}/endpoints`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'BOM Manager',
    },
  })
  const payload = await readResponsePayload(response)
  const endpoints = payload?.data?.endpoints

  if (response.status === 404 || (response.ok && Array.isArray(endpoints) && endpoints.length === 0)) {
    throw new Error(unavailableModelMessage(modelId))
  }
  if (!response.ok) {
    throw new Error(`OpenRouter could not validate model "${modelId}": ${getOpenRouterError(payload) || `HTTP ${response.status}`}`)
  }
  if (!Array.isArray(endpoints)) {
    throw new Error(`OpenRouter returned an invalid endpoint response for model "${modelId}".`)
  }
}

export async function chatCompletion(opts: {
  messages: ORMessage[]
  tools: ORTool[]
  toolChoice?: 'auto' | 'none' | 'required'
  signal?: AbortSignal
}): Promise<ORCompletionResponse> {
  let { apiKey, model } = loadSettings()

  if (!apiKey || !model) {
    const dbSettings = await loadSettingsFromDB()
    if (dbSettings?.apiKey) {
      saveSettings(dbSettings)
      apiKey = dbSettings.apiKey
      model = dbSettings.model
    }
  }

  if (!apiKey || !model) {
    throw new Error('AI not configured - set the OpenRouter API key and model in AI Settings.')
  }

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'BOM Manager',
    },
    body: JSON.stringify({
      model,
      messages: opts.messages,
      tools: opts.tools,
      tool_choice: opts.toolChoice || 'auto',
      temperature: 0.2,
    }),
    signal: opts.signal,
  })

  const payload = await readResponsePayload(res)
  const providerError = getOpenRouterError(payload)
  if (!res.ok || providerError) {
    if (res.status === 404 && /no endpoints found/i.test(providerError || '')) {
      throw new Error(`OpenRouter 404: ${unavailableModelMessage(model)}`)
    }
    throw new Error(`OpenRouter ${res.status}: ${providerError || 'Request failed.'}`)
  }
  if (!Array.isArray(payload?.choices) || !payload.choices[0]?.message) {
    throw new Error('OpenRouter returned no assistant response.')
  }

  return payload as ORCompletionResponse
}
