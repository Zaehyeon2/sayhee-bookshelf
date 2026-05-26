import Link from 'next/link'
import { highlightMatch } from '@/lib/highlight'
import type { WritingWithTags } from '@/lib/db/queries'

function bodyPreview(body: string, max = 80): string {
  const stripped = body
    .replace(/^#+\s+/gm, '')
    .replace(/[*_`~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return stripped.length > max ? `${stripped.slice(0, max)}…` : stripped
}

interface Props {
  writing: WritingWithTags
  /** body 매칭이 있을 때 표시할 발췌. 없으면 일반 미리보기. */
  snippet?: string
  /** 검색어 — 제목/스니펫에 highlight. */
  query?: string
}

export function WritingCard({ writing, snippet, query }: Props) {
  const previewText = snippet ?? bodyPreview(writing.body)
  return (
    <Link
      href={`/writings/${encodeURIComponent(writing.slug)}`}
      className="group block rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] active:scale-[0.99] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
    >
      <h3 className="text-[17px] font-bold leading-snug line-clamp-2 text-[var(--color-text-strong)] group-hover:text-[var(--color-toss-blue)] transition">
        {query ? highlightMatch(writing.title, query) : writing.title}
      </h3>
      <p className="mt-2 text-[13px] text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
        {previewText
          ? query
            ? highlightMatch(previewText, query)
            : previewText
          : '본문이 없습니다.'}
      </p>
      <div className="mt-4 flex items-center justify-between text-[12px] text-[var(--color-text-weak)] font-tabular">
        <time>{new Date(writing.createdAt).toISOString().slice(0, 10)}</time>
        {writing.tags.length > 0 && (
          <span className="truncate max-w-[60%] text-right">
            #{writing.tags.slice(0, 3).join(' #')}
          </span>
        )}
      </div>
    </Link>
  )
}
