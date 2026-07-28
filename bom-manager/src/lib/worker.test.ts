import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../../worker'

describe('OpenRouter Worker configuration errors', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns JSON instead of throwing when Supabase runtime bindings are missing', async () => {
    const response = await worker.fetch(
      new Request('https://bom.test/api/openrouter/chat', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
        body: '{}',
      }),
      {
        ASSETS: { fetch: () => Promise.resolve(new Response('asset')) },
      } as any,
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('content-type')).toContain('application/json')
    await expect(response.json()).resolves.toEqual({
      error: 'AI proxy is missing Cloudflare runtime bindings: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY',
    })
  })

  it('forwards the plaintext settings key without requiring an encryption secret', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: 'user-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/rest/v1/app_settings')) {
        return new Response(JSON.stringify([
          { key: 'ai_api_key', value: '  sk-or-test  ' },
        ]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer sk-or-test')
      return new Response(JSON.stringify({
        id: 'generation-1',
        model: 'provider/model',
        choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'OK' } }],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const response = await worker.fetch(
      new Request('https://bom.test/api/openrouter/chat', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer session-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'provider/model', messages: [], tools: [] }),
      }),
      {
        ASSETS: { fetch: () => Promise.resolve(new Response('asset')) },
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'public-anon-key',
      } as any,
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ id: 'generation-1' })
  })
})
