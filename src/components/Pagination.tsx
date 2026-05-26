import Link from 'next/link'

interface Props {
  currentPage: number
  totalPages: number
  basePath: string // e.g. '/books'
  /** searchParams except 'page' — preserved across page links */
  preservedQuery?: Record<string, string | undefined>
}

function buildHref(
  basePath: string,
  page: number,
  preserved: Record<string, string | undefined> | undefined,
): string {
  const params = new URLSearchParams()
  if (preserved) {
    for (const [k, v] of Object.entries(preserved)) {
      if (v !== undefined && v !== '') params.set(k, v)
    }
  }
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

const linkCls =
  'inline-flex items-center h-9 px-3 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] text-[13px] font-semibold text-[var(--color-text-strong)] shadow-[var(--shadow-toss)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50'

const disabledCls =
  'inline-flex items-center h-9 px-3 rounded-[var(--radius-toss-sm)] text-[13px] font-medium text-[var(--color-text-weak)] cursor-not-allowed select-none'

export function Pagination({ currentPage, totalPages, basePath, preservedQuery }: Props) {
  if (totalPages <= 1) return null

  const prevPage = Math.max(1, currentPage - 1)
  const nextPage = Math.min(totalPages, currentPage + 1)
  const atFirst = currentPage <= 1
  const atLast = currentPage >= totalPages

  return (
    <nav aria-label="페이지네이션" className="mt-8 flex items-center justify-center gap-2">
      {atFirst ? (
        <span className={disabledCls} aria-disabled>
          ← 이전
        </span>
      ) : (
        <Link
          href={buildHref(basePath, prevPage, preservedQuery)}
          className={linkCls}
          aria-label="이전 페이지"
        >
          ← 이전
        </Link>
      )}
      <span className="px-2 text-[13px] text-[var(--color-text-muted)] font-tabular tabular-nums">
        <span className="font-semibold text-[var(--color-text-strong)]">{currentPage}</span>
        <span className="mx-1 text-[var(--color-text-weak)]">/</span>
        <span>{totalPages}</span>
      </span>
      {atLast ? (
        <span className={disabledCls} aria-disabled>
          다음 →
        </span>
      ) : (
        <Link
          href={buildHref(basePath, nextPage, preservedQuery)}
          className={linkCls}
          aria-label="다음 페이지"
        >
          다음 →
        </Link>
      )}
    </nav>
  )
}
