import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm'
import { writings, writingTags, tags } from '../schema'
import { toSlug } from '@/lib/slug'
import type { CreateWritingInput, UpdateWritingInput } from '@/lib/validations'
import { escapeLikePattern, insertWithSlugRetry, isWritingSlugUniqueViolation } from './shared'
import type { Db, WritingWithTags } from './shared'
import { attachWritingTags, attachWritingTagsBatch, replaceWritingTagsTx } from './tags'
import { deleteBlobIfManaged } from '@/lib/blob'

export async function createWriting(
  db: Db,
  authorUserId: number,
  input: CreateWritingInput,
): Promise<WritingWithTags> {
  const base = toSlug(input.title)
  const now = Date.now()

  return insertWithSlugRetry(base, isWritingSlugUniqueViolation, (slug) =>
    db.transaction(async (tx) => {
      const inserted = await tx
        .insert(writings)
        .values({
          authorUserId,
          title: input.title,
          body: input.body ?? '',
          coverUrl: input.coverUrl ?? null,
          slug,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      const writing = inserted[0]
      await replaceWritingTagsTx(tx, writing.id, input.tags ?? [])
      const tagRows = await tx
        .select({ name: tags.name })
        .from(writingTags)
        .innerJoin(tags, eq(writingTags.tagId, tags.id))
        .where(eq(writingTags.writingId, writing.id))
      return { ...writing, tags: tagRows.map((r) => r.name) }
    }),
  )
}

export async function updateWriting(
  db: Db,
  authorUserId: number,
  id: number,
  input: UpdateWritingInput,
): Promise<WritingWithTags | null> {
  const txResult = await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(writings)
      .where(and(eq(writings.id, id), eq(writings.authorUserId, authorUserId)))
      .limit(1)
    if (existing.length === 0) return null
    const oldCover = existing[0].coverUrl

    const now = Date.now()
    const updated = await tx
      .update(writings)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.body !== undefined && { body: input.body }),
        ...(input.coverUrl !== undefined && { coverUrl: input.coverUrl }),
        updatedAt: now,
      })
      .where(and(eq(writings.id, id), eq(writings.authorUserId, authorUserId)))
      .returning()

    const writing = updated[0]
    if (input.tags !== undefined) {
      await replaceWritingTagsTx(tx, id, input.tags)
    }
    const tagRows = await tx
      .select({ name: tags.name })
      .from(writingTags)
      .innerJoin(tags, eq(writingTags.tagId, tags.id))
      .where(eq(writingTags.writingId, id))
    return { writing: { ...writing, tags: tagRows.map((r) => r.name) }, oldCover }
  })

  if (!txResult) return null
  const { writing, oldCover } = txResult
  // 트랜잭션 커밋 후에만 옛 Blob 정리 — 외부 I/O는 트랜잭션 밖. cover가 실제로 바뀐 경우만.
  if (input.coverUrl !== undefined && oldCover && oldCover !== input.coverUrl) {
    await deleteBlobIfManaged(oldCover)
  }
  return writing
}

export async function deleteWriting(db: Db, authorUserId: number, id: number): Promise<boolean> {
  const result = await db
    .delete(writings)
    .where(and(eq(writings.id, id), eq(writings.authorUserId, authorUserId)))
    .returning({ id: writings.id, coverUrl: writings.coverUrl })
  const row = result[0]
  if (!row) return false
  await deleteBlobIfManaged(row.coverUrl)
  return true
}

export async function getWritingBySlug(
  db: Db,
  authorUserId: number,
  slug: string,
): Promise<WritingWithTags | null> {
  const rows = await db
    .select()
    .from(writings)
    .where(and(eq(writings.slug, slug), eq(writings.authorUserId, authorUserId)))
    .limit(1)
  if (rows.length === 0) return null
  const writing = rows[0]
  const tagNames = await attachWritingTags(db, writing.id)
  return { ...writing, tags: tagNames }
}

export async function getWritingById(
  db: Db,
  authorUserId: number,
  id: number,
): Promise<WritingWithTags | null> {
  const rows = await db
    .select()
    .from(writings)
    .where(and(eq(writings.id, id), eq(writings.authorUserId, authorUserId)))
    .limit(1)
  if (rows.length === 0) return null
  const writing = rows[0]
  const tagNames = await attachWritingTags(db, writing.id)
  return { ...writing, tags: tagNames }
}

export async function listWritings(
  db: Db,
  authorUserId: number,
  opts: { limit?: number; offset?: number } = {},
): Promise<WritingWithTags[]> {
  let q = db
    // body는 카드 미리보기(마크다운 strip 후 ~80자)에만 쓰임 — full body(글당 수 KB) 대신
    // 앞 600자만 전송해 Turso payload 절감. searchWritings는 매치 위치 발췌가 필요해 full 유지.
    // 나머지 컬럼은 테이블에서 파생 — 새 컬럼이 목록에서 누락되는 drift 방지.
    .select({
      ...getTableColumns(writings),
      body: sql<string>`substr(${writings.body}, 1, 600)`,
    })
    .from(writings)
    .where(eq(writings.authorUserId, authorUserId))
    .orderBy(desc(writings.createdAt))
    .$dynamic()
  if (opts.limit !== undefined) q = q.limit(opts.limit)
  if (opts.offset !== undefined) q = q.offset(opts.offset)
  const rows = await q

  const tagMap = await attachWritingTagsBatch(
    db,
    rows.map((r) => r.id),
  )
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }))
}

export async function searchWritings(
  db: Db,
  authorUserId: number,
  q: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<WritingWithTags[]> {
  const pattern = `%${escapeLikePattern(q)}%`
  let query = db
    .select()
    .from(writings)
    .where(
      and(
        eq(writings.authorUserId, authorUserId),
        sql`(${writings.title} LIKE ${pattern} ESCAPE '\\' OR ${writings.body} LIKE ${pattern} ESCAPE '\\')`,
      ),
    )
    .orderBy(
      sql`CASE WHEN ${writings.title} LIKE ${pattern} ESCAPE '\\' THEN 1 ELSE 2 END`,
      desc(writings.createdAt),
    )
    .$dynamic()
  if (opts.limit !== undefined) query = query.limit(opts.limit)
  if (opts.offset !== undefined) query = query.offset(opts.offset)
  const rows = await query

  const tagMap = await attachWritingTagsBatch(
    db,
    rows.map((r) => r.id),
  )
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }))
}

export async function countSearchWritings(
  db: Db,
  authorUserId: number,
  q: string,
): Promise<number> {
  const pattern = `%${escapeLikePattern(q)}%`
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(writings)
    .where(
      and(
        eq(writings.authorUserId, authorUserId),
        sql`(${writings.title} LIKE ${pattern} ESCAPE '\\' OR ${writings.body} LIKE ${pattern} ESCAPE '\\')`,
      ),
    )
  return Number(rows[0]?.n ?? 0)
}

export async function countWritings(db: Db, authorUserId: number): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(writings)
    .where(eq(writings.authorUserId, authorUserId))
  return Number(rows[0]?.n ?? 0)
}
