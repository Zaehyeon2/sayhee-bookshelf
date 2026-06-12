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
  OwnRow extends { id: number },
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
    /** 단건 태그 이름 조회 — GET이 requireOwn row에 태그만 붙일 때 사용 (getById 재조회 회피) */
    tagsOf: (db: Db, id: number) => Promise<string[]>
    resolveTagId: (db: Db, tagName: string) => Promise<number | null>
  }
  /** GET 전용 — 소유권 검증과 동시에 row를 반환해 핸들러의 재조회를 없앤다 (*Ownership.forApi 직접 전달) */
  requireOwn: (id: number) => Promise<{ user: User; row: OwnRow }>
  /** PATCH/DELETE의 404 본문 — *Ownership.notFoundMessage를 전달해 GET(404)과 문구 단일 소스 유지 */
  notFoundMessage: string
  /** 도메인 캐시 태그 2개 (public feed + works detail) — 기존 문자열 그대로 */
  revalidateTags: readonly string[]
}

export function createMediaRouteHandlers<
  CreateInput,
  UpdateInput,
  Entity extends { id: number; slug: string },
  Row,
  OwnRow extends { id: number },
>(deps: MediaRouteDeps<CreateInput, UpdateInput, Entity, Row, OwnRow>) {
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
    // requireOwn이 소유권 검증과 동시에 row를 반환 — getById 재조회 제거 (Turso 왕복 1회 절감).
    // tagsOf는 id로만 조회하며 requireOwn 실패 시 결과가 버려지므로 병렬 실행해도 누출 없음.
    const [{ row: entity }, tags] = await Promise.all([
      deps.requireOwn(id),
      deps.queries.tagsOf(db, id),
    ])
    return NextResponse.json({ ...entity, tags })
  })

  const itemPATCH = withApiHandler(deps.labels.update, async (req: Request, { params }: Params) => {
    const id = await requireIdParam(params)
    // 소유권 검증은 update 내부 SELECT/UPDATE의 WHERE (id, authorUserId)가 수행 —
    // requireOwn 선조회 왕복 제거. 미소유/미존재 모두 null → 404 (기존과 동일 응답).
    const user = await requireUser()
    const input = await requireJsonBody(req, deps.updateSchema)
    const updated = await deps.queries.update(db, user.id, id, input)
    if (!updated) return NextResponse.json({ error: deps.notFoundMessage }, { status: 404 })
    revalidateAll()
    return NextResponse.json({ id: updated.id, slug: updated.slug })
  })

  const itemDELETE = withApiHandler(
    deps.labels.delete,
    async (_req: Request, { params }: Params) => {
      const id = await requireIdParam(params)
      // 소유권 검증은 DELETE WHERE (id, authorUserId)가 수행 — requireOwn 선조회 왕복 제거.
      const user = await requireUser()
      const ok = await deps.queries.delete(db, user.id, id)
      if (!ok) return NextResponse.json({ error: deps.notFoundMessage }, { status: 404 })
      revalidateAll()
      return NextResponse.json({ ok: true })
    },
  )

  return { listGET, createPOST, itemGET, itemPATCH, itemDELETE }
}
