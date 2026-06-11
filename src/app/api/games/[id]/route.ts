import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { db } from '@/lib/db/client'
import { deleteGame, getGameById, updateGame } from '@/lib/db/queries'
import { UpdateGameSchema } from '@/lib/validations'
import { requireOwnGame } from '@/lib/auth-helpers'
import { requireIdParam, requireJsonBody, withApiHandler } from '@/lib/api-handler'
import { PUBLIC_FEED_TAGS } from '@/lib/public-feed-cache'
import { WORKS_GAME_TAG } from '@/lib/works-detail-cache'

type Params = { params: Promise<{ id: string }> }

export const GET = withApiHandler('getGame', async (_req: Request, { params }: Params) => {
  const gameId = await requireIdParam(params)
  const { user } = await requireOwnGame(gameId)
  const game = await getGameById(db, user.id, gameId)
  if (!game) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(game)
})

export const PATCH = withApiHandler('updateGame', async (req: Request, { params }: Params) => {
  const gameId = await requireIdParam(params)
  const { user } = await requireOwnGame(gameId)
  const input = await requireJsonBody(req, UpdateGameSchema)
  const updated = await updateGame(db, user.id, gameId, input)
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
  revalidateTag(PUBLIC_FEED_TAGS.games, 'max')
  revalidateTag(WORKS_GAME_TAG, 'max')
  return NextResponse.json({ id: updated.id, slug: updated.slug })
})

export const DELETE = withApiHandler('deleteGame', async (_req: Request, { params }: Params) => {
  const gameId = await requireIdParam(params)
  const { user } = await requireOwnGame(gameId)
  const ok = await deleteGame(db, user.id, gameId)
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
  revalidateTag(PUBLIC_FEED_TAGS.games, 'max')
  revalidateTag(WORKS_GAME_TAG, 'max')
  return NextResponse.json({ ok: true })
})
