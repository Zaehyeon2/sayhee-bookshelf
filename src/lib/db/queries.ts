import { eq, like, desc, and, sql, inArray } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { books, tags, bookTags, writings, writingTags } from './schema'
import type * as schema from './schema'
import { toSlug } from '@/lib/slug'
import type {
  CreateBookInput,
  UpdateBookInput,
  CreateWritingInput,
  UpdateWritingInput,
} from '@/lib/validations'

export type BookWithTags = typeof books.$inferSelect & { tags: string[] }
export type WritingWithTags = typeof writings.$inferSelect & { tags: string[] }

type Db = LibSQLDatabase<typeof schema>

async function attachTags(db: Db, bookId: number): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(bookTags)
    .innerJoin(tags, eq(bookTags.tagId, tags.id))
    .where(eq(bookTags.bookId, bookId))
  return rows.map((r) => r.name)
}

async function attachTagsBatch(db: Db, bookIds: number[]): Promise<Map<number, string[]>> {
  if (bookIds.length === 0) return new Map()
  const rows = await db
    .select({ bookId: bookTags.bookId, name: tags.name })
    .from(bookTags)
    .innerJoin(tags, eq(bookTags.tagId, tags.id))
    .where(inArray(bookTags.bookId, bookIds))
  const map = new Map<number, string[]>()
  for (const r of rows) {
    const existing = map.get(r.bookId) ?? []
    existing.push(r.name)
    map.set(r.bookId, existing)
  }
  return map
}

async function getOrCreateTag(db: Db, name: string): Promise<number> {
  await db.insert(tags).values({ name }).onConflictDoNothing({ target: tags.name })
  const [row] = await db.select({ id: tags.id }).from(tags).where(eq(tags.name, name)).limit(1)
  if (!row) throw new Error(`Tag insert+select failed for ${name}`)
  return row.id
}

async function replaceBookTags(db: Db, bookId: number, tagNames: string[]): Promise<void> {
  await db.delete(bookTags).where(eq(bookTags.bookId, bookId))
  for (const name of tagNames) {
    const tagId = await getOrCreateTag(db, name)
    await db.insert(bookTags).values({ bookId, tagId })
  }
}

function isSlugUniqueViolation(e: unknown): boolean {
  const seen = new WeakSet<object>()
  let current: unknown = e
  while (current != null && typeof current === 'object') {
    if (seen.has(current as object)) break
    seen.add(current as object)
    const err = current as { code?: string; message?: string; cause?: unknown }
    if (
      err.code === 'SQLITE_CONSTRAINT' &&
      err.message?.includes('idx_books_user_slug')
    ) {
      return true
    }
    current = err.cause
  }
  return false
}

export async function createBook(
  db: Db,
  authorUserId: number,
  input: CreateBookInput,
): Promise<BookWithTags> {
  const base = toSlug(input.title)
  const now = Date.now()

  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    try {
      const inserted = await db
        .insert(books)
        .values({
          authorUserId,
          title: input.title,
          author: input.author,
          genre: input.genre,
          readDate: input.readDate,
          rating: input.rating,
          content: input.content ?? '',
          slug: candidate,
          createdAt: now,
          updatedAt: now,
        })
        .returning()

      const book = inserted[0]
      await replaceBookTags(db, book.id, input.tags ?? [])
      const tagNames = await attachTags(db, book.id)
      return { ...book, tags: tagNames }
    } catch (e) {
      if (isSlugUniqueViolation(e)) continue
      throw e
    }
  }
  throw new Error(`Could not generate unique slug after 100 attempts for title: ${input.title}`)
}

export async function updateBook(
  db: Db,
  authorUserId: number,
  id: number,
  input: UpdateBookInput,
): Promise<BookWithTags | null> {
  const existing = await db
    .select()
    .from(books)
    .where(and(eq(books.id, id), eq(books.authorUserId, authorUserId)))
    .limit(1)
  if (existing.length === 0) return null

  const now = Date.now()
  const updated = await db
    .update(books)
    .set({
      ...(input.title !== undefined && { title: input.title }),
      ...(input.author !== undefined && { author: input.author }),
      ...(input.genre !== undefined && { genre: input.genre }),
      ...(input.readDate !== undefined && { readDate: input.readDate }),
      ...(input.rating !== undefined && { rating: input.rating }),
      ...(input.content !== undefined && { content: input.content }),
      updatedAt: now,
    })
    .where(and(eq(books.id, id), eq(books.authorUserId, authorUserId)))
    .returning()

  const book = updated[0]
  if (input.tags !== undefined) {
    await replaceBookTags(db, id, input.tags)
  }
  const tagNames = await attachTags(db, id)
  return { ...book, tags: tagNames }
}

export async function deleteBook(db: Db, authorUserId: number, id: number): Promise<boolean> {
  const result = await db
    .delete(books)
    .where(and(eq(books.id, id), eq(books.authorUserId, authorUserId)))
    .returning({ id: books.id })
  return result.length > 0
}

export async function getBookBySlug(
  db: Db,
  authorUserId: number,
  slug: string,
): Promise<BookWithTags | null> {
  const rows = await db
    .select()
    .from(books)
    .where(and(eq(books.slug, slug), eq(books.authorUserId, authorUserId)))
    .limit(1)
  if (rows.length === 0) return null
  const book = rows[0]
  const tagNames = await attachTags(db, book.id)
  return { ...book, tags: tagNames }
}

export async function getBookById(
  db: Db,
  authorUserId: number,
  id: number,
): Promise<BookWithTags | null> {
  const rows = await db
    .select()
    .from(books)
    .where(and(eq(books.id, id), eq(books.authorUserId, authorUserId)))
    .limit(1)
  if (rows.length === 0) return null
  const book = rows[0]
  const tagNames = await attachTags(db, book.id)
  return { ...book, tags: tagNames }
}

export async function listBooks(
  db: Db,
  authorUserId: number,
  filters: { genre?: string; tag?: string; year?: number; sort?: 'date' | 'rating' },
): Promise<BookWithTags[]> {
  const conditions = [eq(books.authorUserId, authorUserId)]

  if (filters.genre) {
    conditions.push(eq(books.genre, filters.genre))
  }
  if (filters.year) {
    conditions.push(like(books.readDate, `${filters.year}-%`))
  }

  if (filters.tag) {
    const tagRows = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.name, filters.tag))
      .limit(1)
    if (tagRows.length === 0) return []
    const tagId = tagRows[0].id

    const joinCondition = and(eq(bookTags.bookId, books.id), eq(bookTags.tagId, tagId))

    const rows = await db
      .select({ book: books })
      .from(books)
      .innerJoin(bookTags, joinCondition!)
      .where(and(...conditions))
      .orderBy(
        filters.sort === 'rating' ? desc(books.rating) : desc(books.readDate),
      )

    const tagMap = await attachTagsBatch(db, rows.map((r) => r.book.id))
    return rows.map((r) => ({ ...r.book, tags: tagMap.get(r.book.id) ?? [] }))
  }

  const rows = await db
    .select()
    .from(books)
    .where(and(...conditions))
    .orderBy(
      filters.sort === 'rating' ? desc(books.rating) : desc(books.readDate),
    )

  const tagMap = await attachTagsBatch(db, rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }))
}

export async function searchBooks(
  db: Db,
  authorUserId: number,
  q: string,
): Promise<BookWithTags[]> {
  const pattern = `%${q}%`
  const rows = await db
    .select()
    .from(books)
    .where(
      and(
        eq(books.authorUserId, authorUserId),
        sql`(${books.title} LIKE ${pattern} OR ${books.author} LIKE ${pattern} OR ${books.content} LIKE ${pattern})`,
      ),
    )
    .orderBy(
      sql`CASE
        WHEN ${books.title} LIKE ${pattern} THEN 1
        WHEN ${books.author} LIKE ${pattern} THEN 2
        ELSE 3
      END`,
      desc(books.readDate),
    )

  const tagMap = await attachTagsBatch(db, rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }))
}

export async function suggestTags(
  db: Db,
  authorUserId: number,
  q: string,
): Promise<string[]> {
  const pattern = `${q}%`
  // 본인 풀(책 + 글)의 태그 합집합에서 자동완성
  const rows = await db.all(sql`
    SELECT DISTINCT t.name
    FROM ${tags} t
    WHERE t.name LIKE ${pattern}
      AND (
        EXISTS (
          SELECT 1 FROM ${bookTags} bt
          INNER JOIN ${books} b ON b.id = bt.book_id
          WHERE bt.tag_id = t.id AND b.author_user_id = ${authorUserId}
        )
        OR EXISTS (
          SELECT 1 FROM ${writingTags} wt
          INNER JOIN ${writings} w ON w.id = wt.writing_id
          WHERE wt.tag_id = t.id AND w.author_user_id = ${authorUserId}
        )
      )
    LIMIT 8
  `)
  return (rows as { name: string }[]).map((r) => r.name)
}

export async function listTagsForBook(db: Db, bookId: number): Promise<string[]> {
  return attachTags(db, bookId)
}

export async function listGenresWithCounts(
  db: Db,
  authorUserId: number,
): Promise<{ genre: string; count: number }[]> {
  const rows = await db
    .select({
      genre: books.genre,
      count: sql<number>`COUNT(*)`,
    })
    .from(books)
    .where(eq(books.authorUserId, authorUserId))
    .groupBy(books.genre)
    .orderBy(desc(sql`COUNT(*)`))
  return rows.map((r) => ({ genre: r.genre, count: Number(r.count) }))
}

// ─── writings ──────────────────────────────────────────────────────────────

async function attachWritingTags(db: Db, writingId: number): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(writingTags)
    .innerJoin(tags, eq(writingTags.tagId, tags.id))
    .where(eq(writingTags.writingId, writingId))
  return rows.map((r) => r.name)
}

async function attachWritingTagsBatch(
  db: Db,
  writingIds: number[],
): Promise<Map<number, string[]>> {
  if (writingIds.length === 0) return new Map()
  const rows = await db
    .select({ writingId: writingTags.writingId, name: tags.name })
    .from(writingTags)
    .innerJoin(tags, eq(writingTags.tagId, tags.id))
    .where(inArray(writingTags.writingId, writingIds))
  const map = new Map<number, string[]>()
  for (const r of rows) {
    const existing = map.get(r.writingId) ?? []
    existing.push(r.name)
    map.set(r.writingId, existing)
  }
  return map
}

async function replaceWritingTags(
  db: Db,
  writingId: number,
  tagNames: string[],
): Promise<void> {
  await db.delete(writingTags).where(eq(writingTags.writingId, writingId))
  for (const name of tagNames) {
    const tagId = await getOrCreateTag(db, name)
    await db.insert(writingTags).values({ writingId, tagId })
  }
}

function isWritingSlugUniqueViolation(e: unknown): boolean {
  const seen = new WeakSet<object>()
  let current: unknown = e
  while (current != null && typeof current === 'object') {
    if (seen.has(current as object)) break
    seen.add(current as object)
    const err = current as { code?: string; message?: string; cause?: unknown }
    if (
      err.code === 'SQLITE_CONSTRAINT' &&
      err.message?.includes('idx_writings_user_slug')
    ) {
      return true
    }
    current = err.cause
  }
  return false
}

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
      const inserted = await db
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
      await replaceWritingTags(db, writing.id, input.tags ?? [])
      const tagNames = await attachWritingTags(db, writing.id)
      return { ...writing, tags: tagNames }
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
  const existing = await db
    .select()
    .from(writings)
    .where(and(eq(writings.id, id), eq(writings.authorUserId, authorUserId)))
    .limit(1)
  if (existing.length === 0) return null

  const now = Date.now()
  const updated = await db
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
    await replaceWritingTags(db, id, input.tags)
  }
  const tagNames = await attachWritingTags(db, id)
  return { ...writing, tags: tagNames }
}

export async function deleteWriting(
  db: Db,
  authorUserId: number,
  id: number,
): Promise<boolean> {
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
): Promise<WritingWithTags[]> {
  const rows = await db
    .select()
    .from(writings)
    .where(eq(writings.authorUserId, authorUserId))
    .orderBy(desc(writings.createdAt))

  const tagMap = await attachWritingTagsBatch(db, rows.map((r) => r.id))
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }))
}

export async function listTagsForWriting(db: Db, writingId: number): Promise<string[]> {
  return attachWritingTags(db, writingId)
}
