'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function LoginForm() {
  const router = useRouter()
  const sp = useSearchParams()
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
      body: JSON.stringify({ password: pw }),
    })
    setLoading(false)
    if (!res.ok) {
      setError('로그인 실패')
      return
    }
    const from = sp.get('from')
    const dest = from && from.startsWith('/') && !from.startsWith('//') ? from : '/admin/new'
    router.push(dest)
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-sm pt-16">
      <div className="rounded-[var(--radius-toss-lg)] bg-[var(--color-surface)] p-8 shadow-[var(--shadow-toss)]">
        <div className="text-center text-[40px] leading-none">🔒</div>
        <h1 className="mt-4 text-center text-[22px] font-bold text-[var(--color-text-strong)]">
          관리자 로그인
        </h1>
        <p className="mt-1 text-center text-[13px] text-[var(--color-text-weak)]">
          비밀번호를 입력하세요
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="비밀번호"
            autoFocus
            className="w-full h-12 px-4 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[16px] placeholder:text-[var(--color-text-placeholder)] focus:border-[var(--color-toss-blue)] focus:ring-2 focus:ring-[var(--color-toss-blue)]/15 outline-none transition"
          />
          {error && <p className="text-[13px] text-[var(--color-danger)] font-medium">{error}</p>}
          <button
            type="submit"
            disabled={loading || pw.length === 0}
            className="w-full h-12 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[15px] font-semibold hover:bg-[var(--color-toss-blue-hover)] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 transition"
          >
            {loading ? '확인 중…' : '로그인'}
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
