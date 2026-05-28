/**
 * Log adapter/route errors with a structured shape, mirroring src/lib/external/route-factory.ts
 * SECURITY: adapters MUST NOT interpolate request URLs (cert_key, Bearer token) into thrown
 * messages. Logging only name/message/stack avoids accidentally surfacing such content.
 */
export function logAdapterError(tag: string, e: unknown): void {
  const err = e instanceof Error ? e : new Error(String(e))
  console.error(`[${tag}] error:`, {
    name: err.name,
    message: err.message,
    stack: err.stack,
  })
}
