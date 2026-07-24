import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  auth: {
    getSession: vi.fn(),
  },
}))

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }))

import {
  chatCompletion,
  DEFAULT_MODEL,
  loadSettings,
  RECOMMENDED_MODELS,
  saveSettings,
  saveSettingsToDB,
  validateOpenRouterModel,
} from '@/lib/openrouter'

const storage = new Map<string, string>()

beforeEach(() => {
  storage.clear()
  supabaseMock.from.mockReset()
  supabaseMock.auth.getSession.mockReset()
  supabaseMock.auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'supabase-session-token' } },
  })
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  vi.stubGlobal('window', { location: { origin: 'https://bom.test' } })
})

describe('OpenRouter client', () => {
  it('uses a currently recommended model as the default', () => {
    expect(RECOMMENDED_MODELS.some(model => model.id === DEFAULT_MODEL)).toBe(true)
    expect(DEFAULT_MODEL).not.toContain('claude-3.5')
  })

  it('offers the routable Ling 3.0 free endpoint without rewriting configured models', () => {
    expect(RECOMMENDED_MODELS.some(model => model.id === 'inclusionai/ling-3.0-flash:free')).toBe(true)
  })

  it.each([
    'anthropic/claude-3.5-sonnet',
    'inclusionai/ling-3.0-flash',
    'inclusionai/ling-2.6-flash',
    'custom-provider/custom-model',
  ])('preserves the configured model id %s', model => {
    storage.set('bom-ai:openrouter', JSON.stringify({ apiKey: 'test-key', model }))

    expect(loadSettings().model).toBe(model)
    expect(storage.get('bom-ai:openrouter')).not.toContain('test-key')
  })

  it('sends the configured model through the authenticated proxy without substitution', async () => {
    const model = 'inclusionai/ling-3.0-flash'
    saveSettings({ model })
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'gen-1',
      model,
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'OK' } }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await chatCompletion({ messages: [], tools: [] })

    const request = fetchMock.mock.calls[0][1]
    expect(fetchMock.mock.calls[0][0]).toBe('/api/openrouter/chat')
    expect(request.headers.Authorization).toBe('Bearer supabase-session-token')
    expect(JSON.parse(String(request.body)).model).toBe(model)
  })

  it('does not call the AI proxy without a signed-in session', async () => {
    saveSettings({ model: DEFAULT_MODEL })
    supabaseMock.auth.getSession.mockResolvedValue({ data: { session: null } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(chatCompletion({ messages: [], tools: [] }))
      .rejects.toThrow('session has expired')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('validates the exact configured model endpoint before saving', async () => {
    const model = 'inclusionai/ling-3.0-flash:free'
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { id: model, endpoints: [{ name: 'ExampleProvider' }] },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await validateOpenRouterModel(model)

    expect(fetchMock.mock.calls[0][0]).toContain(
      '/api/openrouter/model-endpoints?model=inclusionai%2Fling-3.0-flash%3Afree',
    )
  })

  it('explains the valid Ling variant without changing the selected model', async () => {
    const model = 'inclusionai/ling-3.0-flash'
    saveSettings({ model })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: { id: model, endpoints: [] },
    }), { status: 200 })))

    await expect(validateOpenRouterModel(model))
      .rejects.toThrow('inclusionai/ling-3.0-flash:free')
    expect(loadSettings().model).toBe(model)
  })

  it('surfaces provider errors returned with HTTP 200', async () => {
    saveSettings({ model: DEFAULT_MODEL })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 502, message: 'Provider unavailable' }, choices: [] }),
      { status: 200 },
    )))

    await expect(chatCompletion({ messages: [], tools: [] }))
      .rejects.toThrow('Provider unavailable')
  })

  it('includes safe provider diagnostics in request errors', async () => {
    saveSettings({ model: DEFAULT_MODEL })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        message: 'Provider returned error',
        metadata: {
          provider_name: 'ExampleProvider',
          error_type: 'invalid_request',
          raw: JSON.stringify({ error: { message: 'Too many tools' } }),
        },
      },
    }), { status: 400 })))

    await expect(chatCompletion({ messages: [], tools: [] }))
      .rejects.toThrow('provider: ExampleProvider; type: invalid_request; Too many tools')
  })

  it('rejects successful responses that contain no assistant message', async () => {
    saveSettings({ model: DEFAULT_MODEL })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ id: 'gen-1', model: DEFAULT_MODEL, choices: [] }),
      { status: 200 },
    )))

    await expect(chatCompletion({ messages: [], tools: [] }))
      .rejects.toThrow('no assistant response')
  })

  it('does not report database settings as saved when upsert fails', async () => {
    supabaseMock.from.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: new Error('permission denied') }),
    })

    await expect(saveSettingsToDB({ model: DEFAULT_MODEL }))
      .rejects.toThrow('permission denied')
  })
})
