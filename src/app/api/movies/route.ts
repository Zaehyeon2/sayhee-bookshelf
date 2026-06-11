import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db/client'
import {
  countMovies,
  countSearchMovies,
  createMovie,
  listMovies,
  searchMovies,
} from '@/lib/db/queries'
import { CreateMovieSchema, ListMoviesQuerySchema } from '@/lib/validations'
import { requireUser } from '@/lib/auth-helpers'
import { requireJsonBody, requireQuery, withApiHandler } from '@/lib/api-handler'
import { PUBLIC_FEED_TAGS } from '@/lib/public-feed-cache'
import { WORKS_MOVIE_TAG } from '@/lib/works-detail-cache'

const PAGE_SIZE = 24

export const GET = withApiHandler('listMovies', async (req: Request) => {
  const user = await requireUser()
  const { q, genre, tag, year, sort, page } = requireQuery(req, ListMoviesQuerySchema)
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
})

export const POST = withApiHandler('createMovie', async (req: Request) => {
  const user = await requireUser()
  const input = await requireJsonBody(req, CreateMovieSchema)
  const movie = await createMovie(db, user.id, input)
  revalidateTag(PUBLIC_FEED_TAGS.movies, 'max')
  revalidateTag(WORKS_MOVIE_TAG, 'max')
  return NextResponse.json({ id: movie.id, slug: movie.slug }, { status: 201 })
})
