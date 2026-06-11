import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import {
  countSearchWritings,
  countWritings,
  createWriting,
  listWritings,
  searchWritings,
} from '@/lib/db/queries'
import { CreateWritingSchema, ListWritingsQuerySchema } from '@/lib/validations'
import { requireUser } from '@/lib/auth-helpers'
import { requireJsonBody, requireQuery, withApiHandler } from '@/lib/api-handler'

const PAGE_SIZE = 24

export const GET = withApiHandler('listWritings', async (req: Request) => {
  const user = await requireUser()
  const { q, page } = requireQuery(req, ListWritingsQuerySchema)
  const currentPage = page ?? 1
  const offset = (currentPage - 1) * PAGE_SIZE

  if (q && q.trim().length > 0) {
    const [results, total] = await Promise.all([
      searchWritings(db, user.id, q.trim(), { limit: PAGE_SIZE, offset }),
      countSearchWritings(db, user.id, q.trim()),
    ])
    return NextResponse.json({ results, total, page: currentPage, pageSize: PAGE_SIZE })
  }
  const [list, total] = await Promise.all([
    listWritings(db, user.id, { limit: PAGE_SIZE, offset }),
    countWritings(db, user.id),
  ])
  return NextResponse.json({ results: list, total, page: currentPage, pageSize: PAGE_SIZE })
})

export const POST = withApiHandler('createWriting', async (req: Request) => {
  const user = await requireUser()
  const input = await requireJsonBody(req, CreateWritingSchema)
  const writing = await createWriting(db, user.id, input)
  return NextResponse.json({ id: writing.id, slug: writing.slug }, { status: 201 })
})
