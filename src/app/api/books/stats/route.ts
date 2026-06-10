import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { getBookDashboard } from '@/lib/db/queries'
import { requireUser, HttpError } from '@/lib/auth-helpers'

export async function GET() {
  try {
    const user = await requireUser()
    const dashboard = await getBookDashboard(db, user.id)
    return NextResponse.json(dashboard)
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
