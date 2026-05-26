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
// db.transaction 콜백의 인자 타입 — SQLiteTransaction은 Db와 일부 메서드(batch)가 다르므로
// Db로 alias하지 않고 트랜잭션 콜백 시그니처에서 추론한다.
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/**
 * LIKE 패턴 escape — SQL의 `%`, `_`, 그리고 escape 문자 자체를 안전하게 처리.
 * 모든 LIKE 호출은 이 함수를 거치고 SQL에는 `ESCAPE '\'`를 명시해야 함.
 */
function escapeLikePattern(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

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

/**
 * INSERT...ON CONFLICT...RETURNING으로 단일 statement에서 atomic하게 처리.
 * libSQL은 RETURNING을 지원하며, DO UPDATE를 통해 conflict 발생 시에도 row를 반환한다.
 */
async function getOrCreateTag(db: Tx, name: string): Promise<number> {
  const result = await db
    .insert(tags)
    .values({ name })
    .onConflictDoUpdate({ target: tags.name, set: { name } })
    .returning({ id: tags.id })
  if (!result[0]) throw new Error(`Tag upsert failed for ${name}`)
  return result[0].id
}

async function replaceBookTagsTx(tx: Tx, bookId: number, tagNames: string[]): Promise<void> {
  await tx.delete(bookTags).where(eq(bookTags.bookId, bookId))
  for (const name of tagNames) {
    const tagId = await getOrCreateTag(tx, name)
    await tx.insert(bookTags).values({ bookId, tagId })
  }
}

/**
 * libSQL/Turso의 UNIQUE constraint 에러 메시지는 driver/version에 따라
 * - `UNIQUE constraint failed: books.author_user_id, books.slug`
 * - `idx_books_user_slug` (인덱스 이름 포함)
 * - 양쪽 조합
 * 등으로 다양하다. 컬럼 시그니처와 인덱스 이름을 모두 매칭한다.
 */
function isSlugUniqueViolation(e: unknown): boolean {
  const seen = new WeakSet<object>()
  let current: unknown = e
  while (current != null && typeof current === 'object') {
    if (seen.has(current as object)) break
    seen.add(current as object)
    const err = current as { code?: string; message?: string; cause?: unknown }
    const msg = err.message ?? ''
    const isUnique =
      err.code === 'SQLITE_CONSTRAINT' ||
      err.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      /UNIQUE constraint/i.test(msg)
    if (
      isUnique &&
      (msg.includes('idx_books_user_slug') ||
        (msg.includes('books.author_user_id') && msg.includes('books.slug')) ||
        (msg.includes('author_user_id') && msg.includes('slug')))
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
      // book INSERT + tags 교체를 단일 트랜잭션으로 묶어 중간 실패 시 부분 상태가 남지 않게 함.
      const result = await db.transaction(async (tx) => {
        const inserted = await tx
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
        await replaceBookTagsTx(tx, book.id, input.tags ?? [])
        const tagRows = await tx
          .select({ name: tags.name })
          .from(bookTags)
          .innerJoin(tags, eq(bookTags.tagId, tags.id))
          .where(eq(bookTags.bookId, book.id))
        return { ...book, tags: tagRows.map((r) => r.name) }
      })
      return result
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
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(books)
      .where(and(eq(books.id, id), eq(books.authorUserId, authorUserId)))
      .limit(1)
    if (existing.length === 0) return null

    const now = Date.now()
    const updated = await tx
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
      await replaceBookTagsTx(tx, id, input.tags)
    }
    const tagRows = await tx
      .select({ name: tags.name })
      .from(bookTags)
      .innerJoin(tags, eq(bookTags.tagId, tags.id))
      .where(eq(bookTags.bookId, id))
    return { ...book, tags: tagRows.map((r) => r.name) }
  })
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

export interface ListBookFilters {
  genre?: string
  tag?: string
  year?: number
  sort?: 'date' | 'rating'
  limit?: number
  offset?: number
}

export async function listBooks(
  db: Db,
  authorUserId: number,
  filters: ListBookFilters,
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

    let q = db
      .select({ book: books })
      .from(books)
      .innerJoin(bookTags, joinCondition!)
      .where(and(...conditions))
      .orderBy(filters.sort === 'rating' ? desc(books.rating) : desc(books.readDate))
      .$dynamic()
    if (filters.limit !== undefined) q = q.limit(filters.limit)
    if (filters.offset !== undefined) q = q.offset(filters.offset)
    const rows = await q

    const tagMap = await attachTagsBatch(
      db,
      rows.map((r) => r.book.id),
    )
    return rows.map((r) => ({ ...r.book, tags: tagMap.get(r.book.id) ?? [] }))
  }

  let q = db
    .select()
    .from(books)
    .where(and(...conditions))
    .orderBy(filters.sort === 'rating' ? desc(books.rating) : desc(books.readDate))
    .$dynamic()
  if (filters.limit !== undefined) q = q.limit(filters.limit)
  if (filters.offset !== undefined) q = q.offset(filters.offset)
  const rows = await q

  const tagMap = await attachTagsBatch(
    db,
    rows.map((r) => r.id),
  )
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }))
}

export async function searchBooks(
  db: Db,
  authorUserId: number,
  q: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<BookWithTags[]> {
  const pattern = `%${escapeLikePattern(q)}%`
  let query = db
    .select()
    .from(books)
    .where(
      and(
        eq(books.authorUserId, authorUserId),
        sql`(${books.title} LIKE ${pattern} ESCAPE '\\' OR ${books.author} LIKE ${pattern} ESCAPE '\\' OR ${books.content} LIKE ${pattern} ESCAPE '\\')`,
      ),
    )
    .orderBy(
      sql`CASE
        WHEN ${books.title} LIKE ${pattern} ESCAPE '\\' THEN 1
        WHEN ${books.author} LIKE ${pattern} ESCAPE '\\' THEN 2
        ELSE 3
      END`,
      desc(books.readDate),
    )
    .$dynamic()
  if (opts.limit !== undefined) query = query.limit(opts.limit)
  if (opts.offset !== undefined) query = query.offset(opts.offset)
  const rows = await query

  const tagMap = await attachTagsBatch(
    db,
    rows.map((r) => r.id),
  )
  return rows.map((r) => ({ ...r, tags: tagMap.get(r.id) ?? [] }))
}

export async function countSearchBooks(db: Db, authorUserId: number, q: string): Promise<number> {
  const pattern = `%${escapeLikePattern(q)}%`
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(books)
    .where(
      and(
        eq(books.authorUserId, authorUserId),
        sql`(${books.title} LIKE ${pattern} ESCAPE '\\' OR ${books.author} LIKE ${pattern} ESCAPE '\\' OR ${books.content} LIKE ${pattern} ESCAPE '\\')`,
      ),
    )
  return Number(rows[0]?.n ?? 0)
}

export async function suggestTags(db: Db, authorUserId: number, q: string): Promise<string[]> {
  const pattern = `${escapeLikePattern(q)}%`
  // 본인 풀(책 + 글)의 태그 합집합에서 자동완성
  const rows = await db.all(sql`
    SELECT DISTINCT t.name
    FROM ${tags} t
    WHERE t.name LIKE ${pattern} ESCAPE '\\'
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

async function replaceWritingTagsTx(tx: Tx, writingId: number, tagNames: string[]): Promise<void> {
  await tx.delete(writingTags).where(eq(writingTags.writingId, writingId))
  for (const name of tagNames) {
    const tagId = await getOrCreateTag(tx, name)
    await tx.insert(writingTags).values({ writingId, tagId })
  }
}

function isWritingSlugUniqueViolation(e: unknown): boolean {
  const seen = new WeakSet<object>()
  let current: unknown = e
  while (current != null && typeof current === 'object') {
    if (seen.has(current as object)) break
    seen.add(current as object)
    const err = current as { code?: string; message?: string; cause?: unknown }
    const msg = err.message ?? ''
    const isUnique =
      err.code === 'SQLITE_CONSTRAINT' ||
      err.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      /UNIQUE constraint/i.test(msg)
    if (
      isUnique &&
      (msg.includes('idx_writings_user_slug') ||
        (msg.includes('writings.author_user_id') && msg.includes('writings.slug')) ||
        (msg.includes('author_user_id') && msg.includes('slug')))
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

export async function listTagsForWriting(db: Db, writingId: number): Promise<string[]> {
  return attachWritingTags(db, writingId)
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

// ─── stats ─────────────────────────────────────────────────────────────────

export interface UserStats {
  booksTotal: number
  booksThisYear: number
  avgRating: number // 0 when no books
  writingsTotal: number
  writingsThisYear: number
}

/**
 * 모든 사용자 통계를 단일 쿼리로 계산. 책/글 row를 가져오지 않고 인덱스 위에서 COUNT/AVG만 수행.
 *
 * year 비교는 `strftime('%Y', ..., 'unixepoch', 'localtime')`를 사용 — SQLite에 'localtime'
 * modifier를 명시해 UTC가 아닌 서버 로컬 타임존에서 연도를 계산한다. 이렇게 해야 JS의
 * `new Date().getFullYear()` (역시 로컬)와 일관된다.
 */
export async function getUserStats(
  db: Db,
  authorUserId: number,
  year: number = new Date().getFullYear(),
): Promise<UserStats> {
  const yearPrefix = `${year}-%`
  const yearStr = String(year)

  const rows = await db.all(sql`
    SELECT
      (SELECT COUNT(*) FROM ${books} WHERE ${books.authorUserId} = ${authorUserId}) AS books_total,
      (SELECT COUNT(*) FROM ${books}
         WHERE ${books.authorUserId} = ${authorUserId}
           AND ${books.readDate} LIKE ${yearPrefix}) AS books_year,
      (SELECT AVG(${books.rating}) FROM ${books}
         WHERE ${books.authorUserId} = ${authorUserId}) AS avg_rating,
      (SELECT COUNT(*) FROM ${writings}
         WHERE ${writings.authorUserId} = ${authorUserId}) AS writings_total,
      (SELECT COUNT(*) FROM ${writings}
         WHERE ${writings.authorUserId} = ${authorUserId}
           AND strftime('%Y', ${writings.createdAt} / 1000, 'unixepoch', 'localtime') = ${yearStr})
        AS writings_year
  `)

  const r = (rows as Array<Record<string, number | null>>)[0] ?? {}
  return {
    booksTotal: Number(r.books_total ?? 0),
    booksThisYear: Number(r.books_year ?? 0),
    avgRating: Number(r.avg_rating ?? 0),
    writingsTotal: Number(r.writings_total ?? 0),
    writingsThisYear: Number(r.writings_year ?? 0),
  }
}

/**
 * 사용자의 책 총 개수 (페이지네이션용). genre/year/tag 필터를 적용한 count도 지원해
 * 필터 활성화 시 totalPages가 정확하게 계산되도록 한다.
 */
export async function countBooks(
  db: Db,
  authorUserId: number,
  filters: { genre?: string; tag?: string; year?: number } = {},
): Promise<number> {
  const conditions = [eq(books.authorUserId, authorUserId)]
  if (filters.genre) conditions.push(eq(books.genre, filters.genre))
  if (filters.year) conditions.push(like(books.readDate, `${filters.year}-%`))

  if (filters.tag) {
    const tagRows = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.name, filters.tag))
      .limit(1)
    if (tagRows.length === 0) return 0
    const tagId = tagRows[0].id
    const rows = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(books)
      .innerJoin(
        bookTags,
        and(eq(bookTags.bookId, books.id), eq(bookTags.tagId, tagId))!,
      )
      .where(and(...conditions))
    return Number(rows[0]?.n ?? 0)
  }

  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(books)
    .where(and(...conditions))
  return Number(rows[0]?.n ?? 0)
}

export async function countWritings(db: Db, authorUserId: number): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(writings)
    .where(eq(writings.authorUserId, authorUserId))
  return Number(rows[0]?.n ?? 0)
}
