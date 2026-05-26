import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { createBook, listBooks, searchBooks } from '@/lib/db/queries'
import { CreateBookSchema } from '@/lib/validations'
import { requireUser, HttpError } from '@/lib/auth-helpers'

export async function GET(req: Request) {
  try {
    const user = await requireUser()
    const url = new URL(req.url)
    const q = url.searchParams.get('q')
    if (q && q.trim().length > 0) {
      const results = await searchBooks(db, user.id, q.trim())
      return NextResponse.json(results)
    }
    const genre = url.searchParams.get('genre') ?? undefined
    const tag = url.searchParams.get('tag') ?? undefined
    const yearStr = url.searchParams.get('year')
    const year = yearStr ? Number(yearStr) : undefined
    const sortParam = url.searchParams.get('sort')
    const sort = sortParam === 'rating' ? 'rating' : 'date'
    const list = await listBooks(db, user.id, { genre, tag, year, sort })
    return NextResponse.json(list)
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}

export async function POST(req: Request) {
  try {
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
    return NextResponse.json({ id: book.id, slug: book.slug }, { status: 201 })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    console.error('createBook failed', e)
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
