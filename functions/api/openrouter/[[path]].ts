import worker from '../../../bom-manager/worker'

/**
 * Cloudflare Pages Functions adapter for repository-root deployments.
 */
export async function onRequest(context: {
  request: Request
  env: Record<string, unknown>
}): Promise<Response> {
  return worker.fetch(context.request, context.env as any)
}
