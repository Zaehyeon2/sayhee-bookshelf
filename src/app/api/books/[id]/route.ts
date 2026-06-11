import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db/client'
import { deleteBook, getBookById, updateBook } from '@/lib/db/queries'
import { UpdateBookSchema } from '@/lib/validations'
import { requireOwnBook } from '@/lib/auth-helpers'
import { requireIdParam, requireJsonBody, withApiHandler } from '@/lib/api-handler'
import { PUBLIC_FEED_TAGS } from '@/lib/public-feed-cache'
import { WORKS_BOOK_TAG } from '@/lib/works-detail-cache'

type Params = { params: Promise<{ id: string }> }

export const GET = withApiHandler('getBook', async (_req: Request, { params }: Params) => {
  const bookId = await requireIdParam(params)
  const { user } = await requireOwnBook(bookId)
  const book = await getBookById(db, user.id, bookId)
  if (!book) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(book)
})

export const PATCH = withApiHandler('updateBook', async (req: Request, { params }: Params) => {
  const bookId = await requireIdParam(params)
  const { user } = await requireOwnBook(bookId)
  const input = await requireJsonBody(req, UpdateBookSchema)
  const updated = await updateBook(db, user.id, bookId, input)
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
  revalidateTag(PUBLIC_FEED_TAGS.books, 'max')
  revalidateTag(WORKS_BOOK_TAG, 'max')
  return NextResponse.json({ id: updated.id, slug: updated.slug })
})

export const DELETE = withApiHandler('deleteBook', async (_req: Request, { params }: Params) => {
  const bookId = await requireIdParam(params)
  const { user } = await requireOwnBook(bookId)
  const ok = await deleteBook(db, user.id, bookId)
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
  revalidateTag(PUBLIC_FEED_TAGS.books, 'max')
  revalidateTag(WORKS_BOOK_TAG, 'max')
  return NextResponse.json({ ok: true })
})
