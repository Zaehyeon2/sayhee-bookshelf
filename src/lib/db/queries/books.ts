import { and, desc, eq, inArray, like, sql } from 'drizzle-orm'
import { books, bookTags, tags, users } from '../schema'
import { toSlug } from '@/lib/slug'
import type { CreateBookInput, UpdateBookInput } from '@/lib/validations'
import { escapeLikePattern, isSlugUniqueViolation } from './shared'
import type { Db, BookWithTags } from './shared'
import { attachTags, attachTagsBatch, replaceBookTagsTx } from './tags'

export interface ListBookFilters {
  genre?: string
  tag?: string
  year?: number
  sort?: 'date' | 'rating'
  limit?: number
  offset?: number
}

export type PublicBookCard = {
  id: number
  slug: string
  title: string
  author: string
  genre: string
  rating: number
  oneLineReview: string | null
  publishedAt: number
  authorDisplayName: string
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
        const isPublic = input.isPublic ? 1 : 0
        const publishedAt = isPublic === 1 ? now : null
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
            oneLineReview: input.oneLineReview ?? null,
            isbn: input.isbn ?? null,
            coverUrl: input.coverUrl ?? null,
            externalSource: input.externalSource ?? null,
            isPublic,
            publishedAt,
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
    const prev = existing[0]

    const now = Date.now()

    // isPublic transition 판정: `publishedAt`은 **최초 1회만** 설정(처음 공개되는 시점).
    // 이후 재공개에서도 보존 — 토글 spam으로 피드 상단을 점유하는 vanity attack 방지.
    let nextIsPublic: number | undefined
    let nextPublishedAt: number | null | undefined
    if (input.isPublic !== undefined) {
      nextIsPublic = input.isPublic ? 1 : 0
      if (nextIsPublic === 1 && prev.publishedAt === null) {
        nextPublishedAt = now
      }
      // else: nextPublishedAt 그대로 undefined → SET에서 제외돼 기존 값 보존
    }

    const updated = await tx
      .update(books)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.author !== undefined && { author: input.author }),
        ...(input.genre !== undefined && { genre: input.genre }),
        ...(input.readDate !== undefined && { readDate: input.readDate }),
        ...(input.rating !== undefined && { rating: input.rating }),
        ...(input.content !== undefined && { content: input.content }),
        ...(input.oneLineReview !== undefined && { oneLineReview: input.oneLineReview }),
        ...(input.isbn !== undefined && { isbn: input.isbn }),
        ...(input.coverUrl !== undefined && { coverUrl: input.coverUrl }),
        ...(input.externalSource !== undefined && { externalSource: input.externalSource }),
        ...(nextIsPublic !== undefined && { isPublic: nextIsPublic }),
        ...(nextPublishedAt !== undefined && { publishedAt: nextPublishedAt }),
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

    let q = db
      .select({ book: books })
      .from(books)
      .innerJoin(
        bookTags,
        sql`${bookTags.bookId} = ${books.id} AND ${bookTags.tagId} = ${tagId}`,
      )
      .where(and(...conditions))
      .orderBy(
        ...(filters.sort === 'rating'
          ? [desc(books.rating), desc(books.readDate), desc(books.id)]
          : [desc(books.readDate), desc(books.id)]),
      )
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
    .orderBy(
      ...(filters.sort === 'rating'
        ? [desc(books.rating), desc(books.readDate), desc(books.id)]
        : [desc(books.readDate), desc(books.id)]),
    )
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

// ─── public feed ───────────────────────────────────────────────────────────
// MULTITENANT INVARIANT EXCEPTION: 아래 두 함수는 authorUserId 필터가 없는 유일한
// read 경로. 다른 모든 list/get은 본인 스코프(authorUserId 매칭) 유지.

export async function listRecentPublicBooks(
  db: Db,
  opts: { limit: number; offset?: number },
): Promise<PublicBookCard[]> {
  let q = db
    .select({
      id: books.id,
      slug: books.slug,
      title: books.title,
      author: books.author,
      genre: books.genre,
      rating: books.rating,
      oneLineReview: books.oneLineReview,
      publishedAt: books.publishedAt,
      authorDisplayName: users.displayName,
    })
    .from(books)
    .innerJoin(users, eq(books.authorUserId, users.id))
    .where(and(eq(books.isPublic, 1), sql`${books.publishedAt} IS NOT NULL`))
    .orderBy(desc(books.publishedAt))
    .$dynamic()
  q = q.limit(opts.limit)
  if (opts.offset !== undefined) q = q.offset(opts.offset)
  const rows = await q
  // publishedAt은 위 WHERE로 NOT NULL 보장 — 타입을 number로 narrow
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt as number }))
}

export async function countPublicBooks(db: Db): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(books)
    .where(and(eq(books.isPublic, 1), sql`${books.publishedAt} IS NOT NULL`))
  return Number(rows[0]?.n ?? 0)
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
        sql`${bookTags.bookId} = ${books.id} AND ${bookTags.tagId} = ${tagId}`,
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

/**
 * 본인 books 중 주어진 isbn들 각각 몇 번 기록했는지 반환.
 * 멀티테넌트 invariant: authorUserId로 필터.
 */
export async function countBooksByExternalIds(
  db: Db,
  authorUserId: number,
  isbns: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (isbns.length === 0) return counts
  const rows = await db
    .select({ isbn: books.isbn, n: sql<number>`COUNT(*)` })
    .from(books)
    .where(and(eq(books.authorUserId, authorUserId), inArray(books.isbn, isbns)))
    .groupBy(books.isbn)
  for (const r of rows) {
    if (r.isbn != null) counts.set(r.isbn, Number(r.n))
  }
  return counts
}
