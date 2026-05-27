import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import {
  listRecentPublicBooks,
  countPublicBooks,
  listRecentPublicMovies,
  countPublicMovies,
} from '@/lib/db/queries'
import { FeedQuerySchema } from '@/lib/validations'
import { requireUser, HttpError } from '@/lib/auth-helpers'

const PAGE_SIZE = 24

export async function GET(req: Request) {
  try {
    await requireUser()
    const url = new URL(req.url)
    const parsed = FeedQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return NextResponse.json({ error: '잘못된 쿼리 파라미터' }, { status: 400 })
    }
    const { type, page } = parsed.data
    const currentPage = page ?? 1
    const offset = (currentPage - 1) * PAGE_SIZE

    if (type === 'movie') {
      const [items, total] = await Promise.all([
        listRecentPublicMovies(db, { limit: PAGE_SIZE, offset }),
        countPublicMovies(db),
      ])
      return NextResponse.json({ items, total, page: currentPage, pageSize: PAGE_SIZE, type })
    }

    const [items, total] = await Promise.all([
      listRecentPublicBooks(db, { limit: PAGE_SIZE, offset }),
      countPublicBooks(db),
    ])
    return NextResponse.json({ items, total, page: currentPage, pageSize: PAGE_SIZE, type })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
