import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db/client'
import { deleteMovie, getMovieById, updateMovie } from '@/lib/db/queries'
import { UpdateMovieSchema } from '@/lib/validations'
import { requireOwnMovie } from '@/lib/auth-helpers'
import { requireIdParam, requireJsonBody, withApiHandler } from '@/lib/api-handler'
import { PUBLIC_FEED_TAGS } from '@/lib/public-feed-cache'
import { WORKS_MOVIE_TAG } from '@/lib/works-detail-cache'

type Params = { params: Promise<{ id: string }> }

export const GET = withApiHandler('getMovie', async (_req: Request, { params }: Params) => {
  const movieId = await requireIdParam(params)
  const { user } = await requireOwnMovie(movieId)
  const movie = await getMovieById(db, user.id, movieId)
  if (!movie) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(movie)
})

export const PATCH = withApiHandler('updateMovie', async (req: Request, { params }: Params) => {
  const movieId = await requireIdParam(params)
  const { user } = await requireOwnMovie(movieId)
  const input = await requireJsonBody(req, UpdateMovieSchema)
  const updated = await updateMovie(db, user.id, movieId, input)
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
  revalidateTag(PUBLIC_FEED_TAGS.movies, 'max')
  revalidateTag(WORKS_MOVIE_TAG, 'max')
  return NextResponse.json({ id: updated.id, slug: updated.slug })
})

export const DELETE = withApiHandler('deleteMovie', async (_req: Request, { params }: Params) => {
  const movieId = await requireIdParam(params)
  const { user } = await requireOwnMovie(movieId)
  const ok = await deleteMovie(db, user.id, movieId)
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
  revalidateTag(PUBLIC_FEED_TAGS.movies, 'max')
  revalidateTag(WORKS_MOVIE_TAG, 'max')
  return NextResponse.json({ ok: true })
})
