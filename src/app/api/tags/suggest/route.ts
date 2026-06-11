import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { suggestTags } from '@/lib/db/queries'
import { requireUser } from '@/lib/auth-helpers'
import { withApiHandler } from '@/lib/api-handler'

export const GET = withApiHandler('suggestTags', async (req: Request) => {
  const user = await requireUser()
  const url = new URL(req.url)
  const q = url.searchParams.get('q') ?? ''
  if (!q.trim()) return NextResponse.json({ tags: [] })
  const tags = await suggestTags(db, user.id, q.trim())
  return NextResponse.json({ tags })
})
