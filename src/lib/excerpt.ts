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

  // content에서 제거한 것과 동일한 마크다운 punctuation을 q에서도 제거한 뒤 매칭.
  // 안 하면 q에 *, _, ` 등이 포함될 때 stripped content와 매칭 실패 → 매칭된 결과인데도
  // 스니펫이 조용히 사라진다(DB LIKE는 raw content로 매칭하므로 카드 자체는 노출됨).
  const normalizedQ = q
    .replace(/[#*_~`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  if (!normalizedQ) return null

  const lower = stripped.toLowerCase()
  const idx = lower.indexOf(normalizedQ)
  if (idx === -1) return null

  const half = Math.floor(ctx / 2)
  const start = Math.max(0, idx - half)
  const end = Math.min(stripped.length, idx + normalizedQ.length + half)
  const head = start > 0 ? '…' : ''
  const tail = end < stripped.length ? '…' : ''
  return head + stripped.slice(start, end).trim() + tail
}
