import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db/client'
import { countBooks, countSearchBooks, createBook, listBooks, searchBooks } from '@/lib/db/queries'
import { CreateBookSchema, ListBooksQuerySchema } from '@/lib/validations'
import { requireUser } from '@/lib/auth-helpers'
import { withApiHandler } from '@/lib/api-handler'
import { PUBLIC_FEED_TAGS } from '@/lib/public-feed-cache'
import { WORKS_BOOK_TAG } from '@/lib/works-detail-cache'

const PAGE_SIZE = 24

export const GET = withApiHandler('listBooks', async (req: Request) => {
  const user = await requireUser()
  const url = new URL(req.url)
  const parsed = ListBooksQuerySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 쿼리 파라미터' }, { status: 400 })
  }
  const { q, genre, tag, year, sort, page } = parsed.data
  const currentPage = page ?? 1
  const offset = (currentPage - 1) * PAGE_SIZE

  if (q && q.trim().length > 0) {
    const [results, total] = await Promise.all([
      searchBooks(db, user.id, q.trim(), { limit: PAGE_SIZE, offset }),
      countSearchBooks(db, user.id, q.trim()),
    ])
    return NextResponse.json({ results, total, page: currentPage, pageSize: PAGE_SIZE })
  }
  const filters = { genre, tag, year, sort: sort ?? ('date' as const) }
  const [list, total] = await Promise.all([
    listBooks(db, user.id, { ...filters, limit: PAGE_SIZE, offset }),
    countBooks(db, user.id, { genre, tag, year }),
  ])
  return NextResponse.json({ results: list, total, page: currentPage, pageSize: PAGE_SIZE })
})

export const POST = withApiHandler('createBook', async (req: Request) => {
  const user = await requireUser()
  const body = await req.json().catch(() => null)
  const parsed = CreateBookSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '입력값이 올바르지 않습니다', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }
  const book = await createBook(db, user.id, parsed.data)
  revalidateTag(PUBLIC_FEED_TAGS.books, 'max')
  revalidateTag(WORKS_BOOK_TAG, 'max')
  return NextResponse.json({ id: book.id, slug: book.slug }, { status: 201 })
})
