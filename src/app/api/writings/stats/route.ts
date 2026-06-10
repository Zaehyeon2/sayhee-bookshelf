import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getWritingDashboard } from '@/lib/db/queries'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { currentKstYear } from '@/lib/kst'

export async function GET() {
  try {
    const user = await requireUser()
    // "올해" 연도는 KST 기준 — 홈과 동일 소스 (월별 타임라인은 UTC now 기준 유지)
    const dashboard = await getWritingDashboard(db, user.id, new Date(), currentKstYear())
    return NextResponse.json(dashboard)
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
