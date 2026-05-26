'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Spinner } from '@/components/Spinner'

function LoginForm() {
  const router = useRouter()
  const sp = useSearchParams()
  const [username, setUsername] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: pw }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? '아이디 또는 비밀번호가 올바르지 않습니다')
      setLoading(false)
      return
    }
    const data = await res.json().catch(() => ({}))
    const next = sp.get('next')
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
    const dest = data.mustChangePassword ? '/settings/password' : safeNext
    router.push(dest)
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-sm pt-16">
      <div className="rounded-[var(--radius-toss-lg)] bg-[var(--color-surface)] p-8 shadow-[var(--shadow-toss)]">
        <div className="text-center text-[40px] leading-none">🔒</div>
        <h1 className="mt-4 text-center text-[22px] font-bold text-[var(--color-text-strong)]">
          로그인
        </h1>
        <p className="mt-1 text-center text-[13px] text-[var(--color-text-weak)]">
          아이디와 비밀번호를 입력하세요
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="아이디"
            autoComplete="username"
            autoFocus
            required
            className="w-full h-12 px-4 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[16px] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition"
          />
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="비밀번호"
            autoComplete="current-password"
            required
            className="w-full h-12 px-4 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[16px] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition"
          />
          {error && <p className="text-[13px] text-[var(--color-danger)] font-medium">{error}</p>}
          <button
            type="submit"
            disabled={loading || username.length === 0 || pw.length === 0}
            className="inline-flex w-full h-12 items-center justify-center gap-2 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[15px] font-semibold hover:bg-[var(--color-toss-blue-hover)] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
          >
            {loading && <Spinner />}
            {loading ? '확인 중' : '로그인'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
