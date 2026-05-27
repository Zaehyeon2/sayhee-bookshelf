import { and, desc, eq, sql } from 'drizzle-orm'
import { writings, writingTags, tags } from '../schema'
import { toSlug } from '@/lib/slug'
import type { CreateWritingInput, UpdateWritingInput } from '@/lib/validations'
import { escapeLikePattern, isWritingSlugUniqueViolation } from './shared'
import type { Db, WritingWithTags } from './shared'
import { attachWritingTags, attachWritingTagsBatch, replaceWritingTagsTx } from './tags'

export async function createWriting(
  db: Db,
  authorUserId: number,
  input: CreateWritingInput,
): Promise<WritingWithTags> {
  const base = toSlug(input.title)
  const now = Date.now()

  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    try {
      const result = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(writings)
          .values({
            authorUserId,
            title: input.title,
            body: input.body ?? '',
            slug: candidate,
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
      })
      return result
    } catch (e) {
      if (isWritingSlugUniqueViolation(e)) continue
      throw e
    }
  }
  throw new Error(`Could not generate unique slug after 100 attempts for title: ${input.title}`)
}

export async function updateWriting(
  db: Db,
  authorUserId: number,
  id: number,
  input: UpdateWritingInput,
): Promise<WritingWithTags | null> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(writings)
      .where(and(eq(writings.id, id), eq(writings.authorUserId, authorUserId)))
      .limit(1)
    if (existing.length === 0) return null

    const now = Date.now()
    const updated = await tx
      .update(writings)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.body !== undefined && { body: input.body }),
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
    return { ...writing, tags: tagRows.map((r) => r.name) }
  })
}

export async function deleteWriting(db: Db, authorUserId: number, id: number): Promise<boolean> {
  const result = await db
    .delete(writings)
    .where(and(eq(writings.id, id), eq(writings.authorUserId, authorUserId)))
    .returning({ id: writings.id })
  return result.length > 0
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
    .select()
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
