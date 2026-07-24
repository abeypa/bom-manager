import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }))

import {
  chatCompletion,
  DEFAULT_MODEL,
  loadSettings,
  RECOMMENDED_MODELS,
  saveSettings,
  saveSettingsToDB,
} from '@/lib/openrouter'

const storage = new Map<string, string>()

beforeEach(() => {
  storage.clear()
  supabaseMock.from.mockReset()
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

  it('migrates retired model ids already stored in the browser', () => {
    storage.set('bom-ai:openrouter', JSON.stringify({
      apiKey: 'test-key',
      model: 'anthropic/claude-3.5-sonnet',
    }))

    expect(loadSettings().model).toBe(DEFAULT_MODEL)
  })

  it('repairs the unavailable Ling 3.0 model id', () => {
    storage.set('bom-ai:openrouter', JSON.stringify({
      apiKey: 'test-key',
      model: 'inclusionai/ling-3.0-flash',
    }))

    expect(loadSettings().model).toBe('inclusionai/ling-2.6-flash')
  })

  it('surfaces provider errors returned with HTTP 200', async () => {
    saveSettings({ apiKey: 'test-key', model: DEFAULT_MODEL })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 502, message: 'Provider unavailable' }, choices: [] }),
      { status: 200 },
    )))

    await expect(chatCompletion({ messages: [], tools: [] }))
      .rejects.toThrow('Provider unavailable')
  })

  it('rejects successful responses that contain no assistant message', async () => {
    saveSettings({ apiKey: 'test-key', model: DEFAULT_MODEL })
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

    await expect(saveSettingsToDB({ apiKey: 'test-key', model: DEFAULT_MODEL }))
      .rejects.toThrow('permission denied')
  })
})
