import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db/client'
import { deleteBook, getBookById, updateBook } from '@/lib/db/queries'
import { UpdateBookSchema } from '@/lib/validations'
import { requireOwnBook, HttpError } from '@/lib/auth-helpers'
import { PUBLIC_FEED_TAGS } from '@/lib/public-feed-cache'
import { WORKS_BOOK_TAG } from '@/lib/works-detail-cache'

type Params = { params: Promise<{ id: string }> }

function isValidId(n: number): boolean {
  return Number.isSafeInteger(n) && n > 0
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const bookId = Number(id)
    if (!isValidId(bookId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    const { user } = await requireOwnBook(bookId)
    const book = await getBookById(db, user.id, bookId)
    if (!book) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(book)
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const bookId = Number(id)
    if (!isValidId(bookId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    const { user } = await requireOwnBook(bookId)
    const body = await req.json().catch(() => null)
    const parsed = UpdateBookSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: '입력이 유효하지 않습니다', issues: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const updated = await updateBook(db, user.id, bookId, parsed.data)
    if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
    revalidateTag(PUBLIC_FEED_TAGS.books, 'max')
    revalidateTag(WORKS_BOOK_TAG, 'max')
    return NextResponse.json({ id: updated.id, slug: updated.slug })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    console.error('updateBook failed', e)
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const bookId = Number(id)
    if (!isValidId(bookId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    const { user } = await requireOwnBook(bookId)
    const ok = await deleteBook(db, user.id, bookId)
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
    revalidateTag(PUBLIC_FEED_TAGS.books, 'max')
    revalidateTag(WORKS_BOOK_TAG, 'max')
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    console.error('deleteBook failed', e)
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
