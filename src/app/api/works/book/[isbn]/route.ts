import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { IsbnParamSchema } from '@/lib/validations'
import {
  listBookReviewsByIsbn,
  countBookReviewsByIsbn,
  getBookRatingDistributionByIsbn,
} from '@/lib/db/queries'

const PAGE_SIZE = 24

export async function GET(req: Request, { params }: { params: Promise<{ isbn: string }> }) {
  try {
    await requireUser()
    const { isbn: rawIsbn } = await params
    const parsedIsbn = IsbnParamSchema.safeParse(rawIsbn)
    if (!parsedIsbn.success) {
      return NextResponse.json({ error: 'invalid isbn' }, { status: 400 })
    }
    const url = new URL(req.url)
    const pageRaw = Number(url.searchParams.get('page') ?? '1')
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1
    const offset = (page - 1) * PAGE_SIZE
    const [items, total, distribution] = await Promise.all([
      listBookReviewsByIsbn(db, parsedIsbn.data, { limit: PAGE_SIZE, offset }),
      countBookReviewsByIsbn(db, parsedIsbn.data),
      getBookRatingDistributionByIsbn(db, parsedIsbn.data),
    ])
    return NextResponse.json({
      isbn: parsedIsbn.data,
      items,
      total,
      page,
      pageSize: PAGE_SIZE,
      distribution,
    })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
