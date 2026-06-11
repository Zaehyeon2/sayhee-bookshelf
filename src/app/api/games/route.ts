import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db/client'
import {
  countGames,
  countSearchGames,
  createGame,
  listGames,
  searchGames,
} from '@/lib/db/queries'
import { CreateGameSchema, ListGamesQuerySchema } from '@/lib/validations'
import { requireUser } from '@/lib/auth-helpers'
import { requireJsonBody, requireQuery, withApiHandler } from '@/lib/api-handler'
import { PUBLIC_FEED_TAGS } from '@/lib/public-feed-cache'
import { WORKS_GAME_TAG } from '@/lib/works-detail-cache'

const PAGE_SIZE = 24

export const GET = withApiHandler('listGames', async (req: Request) => {
  const user = await requireUser()
  const { q, genre, tag, year, sort, page } = requireQuery(req, ListGamesQuerySchema)
  const currentPage = page ?? 1
  const offset = (currentPage - 1) * PAGE_SIZE

  if (q && q.trim().length > 0) {
    const [results, total] = await Promise.all([
      searchGames(db, user.id, q.trim(), { limit: PAGE_SIZE, offset }),
      countSearchGames(db, user.id, q.trim()),
    ])
    return NextResponse.json({ results, total, page: currentPage, pageSize: PAGE_SIZE })
  }
  const filters = { genre, tag, year, sort: sort ?? ('date' as const) }
  const [list, total] = await Promise.all([
    listGames(db, user.id, { ...filters, limit: PAGE_SIZE, offset }),
    countGames(db, user.id, { genre, tag, year }),
  ])
  return NextResponse.json({ results: list, total, page: currentPage, pageSize: PAGE_SIZE })
})

export const POST = withApiHandler('createGame', async (req: Request) => {
  const user = await requireUser()
  const input = await requireJsonBody(req, CreateGameSchema)
  const game = await createGame(db, user.id, input)
  revalidateTag(PUBLIC_FEED_TAGS.games, 'max')
  revalidateTag(WORKS_GAME_TAG, 'max')
  return NextResponse.json({ id: game.id, slug: game.slug }, { status: 201 })
})
