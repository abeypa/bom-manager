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

  it('reports a missing encryption secret after authenticating without a service-role key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'user-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ))

    const response = await worker.fetch(
      new Request('https://bom.test/api/openrouter/config', {
        headers: { Authorization: 'Bearer session-token' },
      }),
      {
        ASSETS: { fetch: () => Promise.resolve(new Response('asset')) },
        VITE_SUPABASE_URL: 'https://example.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'public-anon-key',
      } as any,
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'AI Settings storage is missing Cloudflare secrets: OPENROUTER_CONFIG_SECRET',
    })
  })
})
