/**
 * Build a short, query-centered excerpt from a markdown content blob.
 * Strips fenced code blocks and common markdown punctuation so the excerpt
 * reads like prose. Case-insensitive match; returns null if `q` is not in
 * `content`. The caller decides whether to show an excerpt or fall back to
 * other UI (e.g. only show when the title/author didn't already match).
 */
export function excerpt(content: string, q: string, ctx = 80): string | null {
  if (!content || !q) return null

  // Strip fenced code blocks first (they're noisy in snippets), then
  // remove common inline markdown punctuation. We don't try to be a full
  // markdown parser — just enough to make the snippet legible.
  const stripped = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*_~`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  const lower = stripped.toLowerCase()
  const idx = lower.indexOf(q.toLowerCase())
  if (idx === -1) return null

  const half = Math.floor(ctx / 2)
  const start = Math.max(0, idx - half)
  const end = Math.min(stripped.length, idx + q.length + half)
  const head = start > 0 ? '…' : ''
  const tail = end < stripped.length ? '…' : ''
  return head + stripped.slice(start, end).trim() + tail
}
