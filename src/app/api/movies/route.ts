import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { countMovies, countSearchMovies, createMovie, listMovies, searchMovies } from '@/lib/db/queries'
import { CreateMovieSchema, ListMoviesQuerySchema } from '@/lib/validations'
import { requireUser, HttpError } from '@/lib/auth-helpers'

const PAGE_SIZE = 24

export async function GET(req: Request) {
  try {
    const user = await requireUser()
    const url = new URL(req.url)
    const parsed = ListMoviesQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return NextResponse.json({ error: '잘못된 쿼리 파라미터' }, { status: 400 })
    }
    const { q, genre, tag, year, sort, page } = parsed.data
    const currentPage = page ?? 1
    const offset = (currentPage - 1) * PAGE_SIZE

    if (q && q.trim().length > 0) {
      const [results, total] = await Promise.all([
        searchMovies(db, user.id, q.trim(), { limit: PAGE_SIZE, offset }),
        countSearchMovies(db, user.id, q.trim()),
      ])
      return NextResponse.json({ results, total, page: currentPage, pageSize: PAGE_SIZE })
    }
    const filters = { genre, tag, year, sort: sort ?? ('date' as const) }
    const [list, total] = await Promise.all([
      listMovies(db, user.id, { ...filters, limit: PAGE_SIZE, offset }),
      countMovies(db, user.id, { genre, tag, year }),
    ])
    return NextResponse.json({ results: list, total, page: currentPage, pageSize: PAGE_SIZE })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const body = await req.json().catch(() => null)
    const parsed = CreateMovieSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: '입력값이 올바르지 않습니다', issues: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const movie = await createMovie(db, user.id, parsed.data)
    return NextResponse.json({ id: movie.id, slug: movie.slug }, { status: 201 })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    console.error('createMovie failed', e)
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
