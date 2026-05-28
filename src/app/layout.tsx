import type { Metadata } from 'next'
import Link from 'next/link'
import localFont from 'next/font/local'
import { Suspense } from 'react'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Toaster } from 'sonner'
import { ThemeToggle } from '@/components/ThemeToggle'
import { MobileMenu } from '@/components/MobileMenu'
import { getCurrentUser } from '@/lib/auth'
import './globals.css'

const pretendard = localFont({
  src: '../../public/fonts/PretendardVariable.woff2',
  weight: '45 920',
  display: 'swap',
  variable: '--font-pretendard',
  preload: true,
})

export const metadata: Metadata = {
  title: {
    default: '누구의 서재',
    template: '%s · 서재',
  },
  description: '개인 독서 기록',
}

const themeBootstrap = `(function(){try{var s=localStorage.getItem('theme');var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={pretendard.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-screen">
        <header className="sticky top-0 z-10 bg-[var(--color-header-bg)] backdrop-blur border-b border-[var(--color-border-subtle)]">
          <nav className="mx-auto max-w-5xl px-5 h-14 flex items-center justify-between">
            <Link
              href="/"
              className="text-[17px] font-bold text-[var(--color-text-strong)] tracking-tight rounded-[var(--radius-toss-sm)] px-2 py-1 -mx-2 -my-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
            >
              📚 누구의 서재
            </Link>
            <Suspense fallback={<NavSkeleton />}>
              <NavUser />
            </Suspense>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
        <Toaster theme="system" position="top-center" richColors closeButton />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}

function NavSkeleton() {
  // user 조회 동안 ThemeToggle은 보이게 — 로그인 상태 모를 때 안전한 fallback.
  return (
    <div className="flex items-center gap-1">
      <ThemeToggle />
    </div>
  )
}

async function NavUser() {
  const me = await getCurrentUser()
  return (
    <>
      {/* Desktop nav — md 이상 */}
      <div data-testid="desktop-nav" className="hidden md:flex items-center gap-1">
        {me ? (
          <>
            <Link
              href="/books"
              className="px-3 h-11 inline-flex items-center text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
            >
              📚 내 책장
            </Link>
            <Link
              href="/movies"
              className="px-3 h-11 inline-flex items-center text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
            >
              🎬 내 영화관
            </Link>
            <Link
              href="/works"
              className="px-3 h-11 inline-flex items-center text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
            >
              🔍 작품 검색
            </Link>
            <Link
              href="/writings"
              className="px-3 h-11 inline-flex items-center text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
            >
              ✏️ 글방
            </Link>
            <UserMenu displayName={me.displayName} role={me.role as 'admin' | 'member'} />
          </>
        ) : (
          <Link
            href="/login"
            className="px-3 h-11 inline-flex items-center text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition"
          >
            로그인
          </Link>
        )}
        <ThemeToggle />
      </div>

      {/* Mobile nav — md 미만 */}
      <div data-testid="mobile-nav" className="flex md:hidden items-center gap-1">
        <ThemeToggle />
        {me ? (
          <MobileMenu displayName={me.displayName} role={me.role as 'admin' | 'member'} />
        ) : (
          <Link
            href="/login"
            className="px-3 h-11 inline-flex items-center text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition"
          >
            로그인
          </Link>
        )}
      </div>
    </>
  )
}


function UserMenu({ displayName, role }: { displayName: string; role: 'admin' | 'member' }) {
  return (
    <details className="relative">
      <summary className="list-none cursor-pointer px-3 h-11 inline-flex items-center text-[14px] font-medium text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition">
        {displayName} ▾
      </summary>
      <div className="absolute right-0 mt-1 w-48 rounded-[var(--radius-toss)] bg-[var(--color-surface)] shadow-[var(--shadow-toss)] border border-[var(--color-border-subtle)] py-1 text-[14px]">
        <Link
          href="/settings/profile"
          className="block px-4 py-2 hover:bg-[var(--color-surface-2)]"
        >
          프로필 변경
        </Link>
        <Link
          href="/settings/password"
          className="block px-4 py-2 hover:bg-[var(--color-surface-2)]"
        >
          비밀번호 변경
        </Link>
        {role === 'admin' && (
          <Link href="/admin/users" className="block px-4 py-2 hover:bg-[var(--color-surface-2)]">
            사용자 관리
          </Link>
        )}
        <form
          action="/api/logout"
          method="POST"
          className="border-t border-[var(--color-border-subtle)] mt-1 pt-1"
        >
          <button
            type="submit"
            className="w-full text-left px-4 py-2 hover:bg-[var(--color-surface-2)]"
          >
            로그아웃
          </button>
        </form>
      </div>
    </details>
  )
}
