import type { Metadata } from 'next'
import Link from 'next/link'
import { ThemeToggle } from '@/components/ThemeToggle'
import './globals.css'

export const metadata: Metadata = {
  title: '세희의 서재',
  description: '세희가 읽은 책의 기록',
}

const themeBootstrap = `(function(){try{var s=localStorage.getItem('theme');var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';}catch(e){}})();`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
      </head>
      <body className="min-h-screen">
        <header className="sticky top-0 z-10 bg-[var(--color-header-bg)] backdrop-blur border-b border-[var(--color-border-subtle)]">
          <nav className="mx-auto max-w-5xl px-5 h-14 flex items-center justify-between">
            <Link href="/" className="text-[17px] font-bold text-[var(--color-text-strong)] tracking-tight rounded-[var(--radius-toss-sm)] px-2 py-1 -mx-2 -my-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50">
              📚 세희의 서재
            </Link>
            <div className="flex items-center gap-1">
              <Link
                href="/books"
                className="px-3 h-11 inline-flex items-center text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
              >
                목록
              </Link>
              <Link
                href="/admin/new"
                className="px-3 h-11 inline-flex items-center text-[14px] font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-strong)] rounded-[var(--radius-toss-sm)] hover:bg-[var(--color-surface-2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
              >
                관리
              </Link>
              <ThemeToggle />
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
      </body>
    </html>
  )
}
