import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { TmdbIdParamSchema, PageParamSchema } from '@/lib/validations'
import {
  listMovieReviewsByTmdbId,
  countMovieReviewsByTmdbId,
  getMovieRatingDistributionByTmdbId,
} from '@/lib/db/queries'

const PAGE_SIZE = 24

export async function GET(req: Request, { params }: { params: Promise<{ tmdbId: string }> }) {
  try {
    await requireUser()
    const { tmdbId: rawTmdbId } = await params
    const parsedTmdb = TmdbIdParamSchema.safeParse(rawTmdbId)
    if (!parsedTmdb.success) {
      return NextResponse.json({ error: '잘못된 TMDB ID' }, { status: 400 })
    }
    const url = new URL(req.url)
    const page = PageParamSchema.parse(url.searchParams.get('page') ?? '1')
    const offset = (page - 1) * PAGE_SIZE
    const [items, total, distribution] = await Promise.all([
      listMovieReviewsByTmdbId(db, parsedTmdb.data, { limit: PAGE_SIZE, offset }),
      countMovieReviewsByTmdbId(db, parsedTmdb.data),
      getMovieRatingDistributionByTmdbId(db, parsedTmdb.data),
    ])
    return NextResponse.json({
      tmdbId: parsedTmdb.data,
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
