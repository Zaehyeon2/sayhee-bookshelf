import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '독후감',
  description: '내가 읽은 책의 기록',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <header className="border-b bg-white">
          <nav className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
            <a href="/" className="text-lg font-semibold">📚 독후감</a>
            <a href="/books" className="text-sm text-neutral-600 hover:text-neutral-900">목록</a>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  )
}
