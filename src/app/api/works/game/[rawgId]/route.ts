import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { requireUser } from '@/lib/auth-helpers'
import { RawgIdParamSchema, PageParamSchema } from '@/lib/validations'
import {
  listGameReviewsByRawgId,
  countGameReviewsByRawgId,
  getGameRatingDistributionByRawgId,
} from '@/lib/db/queries'
import { withApiHandler } from '@/lib/api-handler'

const PAGE_SIZE = 24

export const GET = withApiHandler(
  'getGameReviews',
  async (req: Request, { params }: { params: Promise<{ rawgId: string }> }) => {
    await requireUser()
    const { rawgId: rawRawgId } = await params
    const parsedRawg = RawgIdParamSchema.safeParse(rawRawgId)
    if (!parsedRawg.success) {
      return NextResponse.json({ error: '잘못된 RAWG ID' }, { status: 400 })
    }
    const url = new URL(req.url)
    const page = PageParamSchema.parse(url.searchParams.get('page') ?? '1')
    const offset = (page - 1) * PAGE_SIZE
    const [items, total, distribution] = await Promise.all([
      listGameReviewsByRawgId(db, parsedRawg.data, { limit: PAGE_SIZE, offset }),
      countGameReviewsByRawgId(db, parsedRawg.data),
      getGameRatingDistributionByRawgId(db, parsedRawg.data),
    ])
    return NextResponse.json({
      rawgId: parsedRawg.data,
      items,
      total,
      page,
      pageSize: PAGE_SIZE,
      distribution,
    })
  },
)
