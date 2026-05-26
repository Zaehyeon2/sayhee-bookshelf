import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { suggestTags } from '@/lib/db/queries'
import { requireUser, HttpError } from '@/lib/auth-helpers'

export async function GET(req: Request) {
  try {
    const user = await requireUser()
    const url = new URL(req.url)
    const q = url.searchParams.get('q') ?? ''
    if (!q.trim()) return NextResponse.json({ tags: [] })
    const tags = await suggestTags(db, user.id, q.trim())
    return NextResponse.json({ tags })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
