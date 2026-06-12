import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import type { z } from 'zod'
import { requireIdParam, requireJsonBody, requireQuery, withApiHandler } from '@/lib/api-handler'
import { requireUser } from '@/lib/auth-helpers'
import { db } from '@/lib/db/client'
import type { Db } from '@/lib/db/queries/shared'
import type { User } from '@/lib/db/schema'
import { MEDIA_PAGE_SIZE as PAGE_SIZE } from './config'

type Params = { params: Promise<{ id: string }> }

interface ListQueryShape {
  q?: string
  genre?: string
  tag?: string
  year?: number
  sort?: 'date' | 'rating'
  page?: number
}

type ListFilters = {
  genre?: string
  tag?: string
  year?: number
  sort?: 'date' | 'rating'
  limit?: number
  offset?: number
  tagId?: number | null
}

export interface MediaRouteDeps<
  CreateInput,
  UpdateInput,
  Entity extends { id: number; slug: string },
  Row,
> {
  /** withApiHandler 라벨 — 기존 라벨 문자열 그대로 (예: listGames/createGame/getGame/updateGame/deleteGame) */
  labels: { list: string; create: string; get: string; update: string; delete: string }
  createSchema: z.ZodType<CreateInput, unknown>
  updateSchema: z.ZodType<UpdateInput, unknown>
  listQuerySchema: z.ZodType<ListQueryShape, unknown>
  queries: {
    search: (
      db: Db,
      userId: number,
      q: string,
      opts: { limit: number; offset: number },
    ) => Promise<Row[]>
    countSearch: (db: Db, userId: number, q: string) => Promise<number>
    list: (db: Db, userId: number, filters: ListFilters) => Promise<Row[]>
    /**
     * tag(name)와 tagId는 동시에 전달될 수 있음 — 의도된 설계.
     * tagId를 선조회하지 않는 호출자는 tag name으로 fallback 조회한다 (백로그 8).
     */
    count: (
      db: Db,
      userId: number,
      filters: { genre?: string; tag?: string; year?: number; tagId?: number | null },
    ) => Promise<number>
    create: (db: Db, userId: number, input: CreateInput) => Promise<Entity>
    update: (db: Db, userId: number, id: number, input: UpdateInput) => Promise<Entity | null>
    delete: (db: Db, userId: number, id: number) => Promise<boolean>
    getById: (db: Db, userId: number, id: number) => Promise<Row | null>
    resolveTagId: (db: Db, tagName: string) => Promise<number | null>
  }
  requireOwn: (id: number) => Promise<{ user: User }>
  /** 도메인 캐시 태그 2개 (public feed + works detail) — 기존 문자열 그대로 */
  revalidateTags: readonly string[]
}

export function createMediaRouteHandlers<
  CreateInput,
  UpdateInput,
  Entity extends { id: number; slug: string },
  Row,
>(deps: MediaRouteDeps<CreateInput, UpdateInput, Entity, Row>) {
  const revalidateAll = () => {
    for (const tag of deps.revalidateTags) revalidateTag(tag, 'max')
  }

  const listGET = withApiHandler(deps.labels.list, async (req: Request) => {
    const user = await requireUser()
    const { q, genre, tag, year, sort, page } = requireQuery(req, deps.listQuerySchema)
    const currentPage = page ?? 1
    const offset = (currentPage - 1) * PAGE_SIZE

    if (q && q.trim().length > 0) {
      const [results, total] = await Promise.all([
        deps.queries.search(db, user.id, q.trim(), { limit: PAGE_SIZE, offset }),
        deps.queries.countSearch(db, user.id, q.trim()),
      ])
      return NextResponse.json({ results, total, page: currentPage, pageSize: PAGE_SIZE })
    }
    // tagId 선조회 1회 — list/count가 같은 tag lookup을 반복하지 않게 (백로그 8)
    const tagId = tag ? await deps.queries.resolveTagId(db, tag) : undefined
    const filters = { genre, tag, year, sort: sort ?? ('date' as const), tagId }
    const [list, total] = await Promise.all([
      deps.queries.list(db, user.id, { ...filters, limit: PAGE_SIZE, offset }),
      deps.queries.count(db, user.id, { genre, tag, year, tagId }),
    ])
    return NextResponse.json({ results: list, total, page: currentPage, pageSize: PAGE_SIZE })
  })

  const createPOST = withApiHandler(deps.labels.create, async (req: Request) => {
    const user = await requireUser()
    const input = await requireJsonBody(req, deps.createSchema)
    const entity = await deps.queries.create(db, user.id, input)
    revalidateAll()
    return NextResponse.json({ id: entity.id, slug: entity.slug }, { status: 201 })
  })

  const itemGET = withApiHandler(deps.labels.get, async (_req: Request, { params }: Params) => {
    const id = await requireIdParam(params)
    const { user } = await deps.requireOwn(id)
    const entity = await deps.queries.getById(db, user.id, id)
    if (!entity) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(entity)
  })

  const itemPATCH = withApiHandler(deps.labels.update, async (req: Request, { params }: Params) => {
    const id = await requireIdParam(params)
    const { user } = await deps.requireOwn(id)
    const input = await requireJsonBody(req, deps.updateSchema)
    const updated = await deps.queries.update(db, user.id, id, input)
    if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
    revalidateAll()
    return NextResponse.json({ id: updated.id, slug: updated.slug })
  })

  const itemDELETE = withApiHandler(
    deps.labels.delete,
    async (_req: Request, { params }: Params) => {
      const id = await requireIdParam(params)
      const { user } = await deps.requireOwn(id)
      const ok = await deps.queries.delete(db, user.id, id)
      if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
      revalidateAll()
      return NextResponse.json({ ok: true })
    },
  )

  return { listGET, createPOST, itemGET, itemPATCH, itemDELETE }
}
