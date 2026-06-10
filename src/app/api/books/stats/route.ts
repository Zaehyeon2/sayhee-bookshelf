import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getBookDashboard } from '@/lib/db/queries'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { currentKstYear } from '@/lib/kst'

export async function GET() {
  try {
    const user = await requireUser()
    // 연도는 KST 기준 — 홈(getUserStats 호출부)과 동일 소스, 서버 TZ 무관
    const dashboard = await getBookDashboard(db, user.id, currentKstYear())
    return NextResponse.json(dashboard)
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
