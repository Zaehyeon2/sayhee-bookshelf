import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { IsbnParamSchema, PageParamSchema } from '@/lib/validations'
import { canonicalIsbn } from '@/lib/isbn'
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
      return NextResponse.json({ error: '잘못된 ISBN' }, { status: 400 })
    }
    // 10자리로 들어와도 저장 시 canonical 13자리이므로 동일 형태로 조회.
    const isbn = canonicalIsbn(parsedIsbn.data)
    const url = new URL(req.url)
    const page = PageParamSchema.parse(url.searchParams.get('page') ?? '1')
    const offset = (page - 1) * PAGE_SIZE
    const [items, total, distribution] = await Promise.all([
      listBookReviewsByIsbn(db, isbn, { limit: PAGE_SIZE, offset }),
      countBookReviewsByIsbn(db, isbn),
      getBookRatingDistributionByIsbn(db, isbn),
    ])
    return NextResponse.json({
      isbn,
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
