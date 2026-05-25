import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { suggestTags } from '@/lib/db/queries'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = url.searchParams.get('q') ?? ''
  if (!q.trim()) return NextResponse.json({ tags: [] })
  const tags = await suggestTags(db, q.trim())
  return NextResponse.json({ tags })
}
