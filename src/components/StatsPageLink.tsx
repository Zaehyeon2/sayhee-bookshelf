import Link from 'next/link'

/**
 * 리스트 페이지 상단의 통계 페이지 진입 링크.
 * 네비 드롭다운은 hover 기반이라 터치 태블릿(md 이상이면서 hover 불가)에서
 * 통계 진입 경로가 없음 — 모든 환경에서 보이는 가시 경로를 리스트에 둔다.
 */
export function StatsPageLink({ href }: { href: string }) {
  return (
    <div className="flex justify-end -mb-2">
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-[13px] text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] transition rounded-[var(--radius-toss-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
      >
        📊 통계 보기 →
      </Link>
    </div>
  )
}
