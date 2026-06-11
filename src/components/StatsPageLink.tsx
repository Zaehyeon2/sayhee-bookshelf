import Link from 'next/link'

/**
 * 통계 페이지 진입 링크 — 리스트 헤딩 줄(권수·새 항목 버튼 옆)에 배치.
 * 네비 드롭다운은 hover 기반이라 터치 태블릿(md 이상이면서 hover 불가)에서
 * 통계 진입 경로가 없음 — 모든 환경에서 보이는 가시 경로를 리스트에 둔다.
 */
export function StatsPageLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center h-9 px-3 rounded-[var(--radius-toss-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[13px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] hover:bg-[var(--color-surface-2)] active:scale-[0.97] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
    >
      📊 통계
    </Link>
  )
}
