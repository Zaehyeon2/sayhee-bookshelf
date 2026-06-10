import Link from 'next/link'

interface SubItem {
  href: string
  label: string
}

interface Props {
  href: string
  label: string
  subItems: SubItem[]
}

/**
 * 데스크톱 네비 항목 + hover/focus 드롭다운.
 * 본 링크 클릭은 기존처럼 목록으로 이동, 마우스 올리거나 키보드 포커스가 들어오면
 * 서브 메뉴(통계 보기 등) 노출. CSS group-hover/focus-within만 사용 — 클라이언트 JS 없음.
 */
export function NavDropdown({ href, label, subItems }: Props) {
  return (
    <div className="relative group">
      <Link
        href={href}
        className="px-3 h-11 inline-flex items-center text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
      >
        {label}
        <span
          aria-hidden
          className="ml-1 text-[10px] text-[var(--color-text-weak)] transition-transform group-hover:rotate-180"
        >
          ▾
        </span>
      </Link>
      <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity absolute left-0 top-full pt-1 z-50">
        <div className="w-44 rounded-[var(--radius-toss)] bg-[var(--color-surface)] shadow-[var(--shadow-toss)] border border-[var(--color-border-subtle)] py-1 text-[14px]">
          {subItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-4 py-2.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-toss-blue)]/50"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
