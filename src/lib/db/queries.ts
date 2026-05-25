import { eq, like, desc, inArray, and, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { books, tags, bookTags } from './schema'
import type * as schema from './schema'
import { toSlug, uniqueSlug } from '@/lib/slug'
import type { CreateBookInput, UpdateBookInput } from '@/lib/validations'

export type BookWithTags = typeof books.$inferSelect & { tags: string[] }

type Db = LibSQLDatabase<typeof schema>

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function attachTags(db: Db, bookId: number): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(bookTags)
    .innerJoin(tags, eq(bookTags.tagId, tags.id))
    .where(eq(bookTags.bookId, bookId))
  return rows.map((r) => r.name)
}

async function getOrCreateTag(db: Db, name: string): Promise<number> {
  const existing = await db
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.name, name))
    .limit(1)
  if (existing.length > 0) return existing[0].id
  const inserted = await db.insert(tags).values({ name }).returning({ id: tags.id })
  return inserted[0].id
}

async function replaceBookTags(db: Db, bookId: number, tagNames: string[]): Promise<void> {
  await db.delete(bookTags).where(eq(bookTags.bookId, bookId))
  for (const name of tagNames) {
    const tagId = await getOrCreateTag(db, name)
    await db.insert(bookTags).values({ bookId, tagId })
  }
}

async function existingSlugs(db: Db): Promise<string[]> {
  const rows = await db.select({ slug: books.slug }).from(books)
  return rows.map((r) => r.slug)
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createBook(db: Db, input: CreateBookInput): Promise<BookWithTags> {
  const slugBase = toSlug(input.title)
  const allSlugs = await existingSlugs(db)
  const slug = uniqueSlug(slugBase, allSlugs)

  const now = Date.now()
  const inserted = await db
    .insert(books)
    .values({
      title: input.title,
      author: input.author,
      genre: input.genre,
      readDate: input.readDate,
      rating: input.rating,
      content: input.content ?? '',
      slug,
      createdAt: now,
      updatedAt: now,
    })
    .returning()

  const book = inserted[0]
  await replaceBookTags(db, book.id, input.tags ?? [])
  const tagNames = await attachTags(db, book.id)
  return { ...book, tags: tagNames }
}

export async function updateBook(
  db: Db,
  id: number,
  input: UpdateBookInput,
): Promise<BookWithTags | null> {
  const existing = await db.select().from(books).where(eq(books.id, id)).limit(1)
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
    .where(eq(books.id, id))
    .returning()

  const book = updated[0]
  if (input.tags !== undefined) {
    await replaceBookTags(db, id, input.tags)
  }
  const tagNames = await attachTags(db, id)
  return { ...book, tags: tagNames }
}

export async function deleteBook(db: Db, id: number): Promise<boolean> {
  const result = await db.delete(books).where(eq(books.id, id)).returning({ id: books.id })
  return result.length > 0
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getBookBySlug(db: Db, slug: string): Promise<BookWithTags | null> {
  const rows = await db.select().from(books).where(eq(books.slug, slug)).limit(1)
  if (rows.length === 0) return null
  const book = rows[0]
  const tagNames = await attachTags(db, book.id)
  return { ...book, tags: tagNames }
}

export async function getBookById(db: Db, id: number): Promise<BookWithTags | null> {
  const rows = await db.select().from(books).where(eq(books.id, id)).limit(1)
  if (rows.length === 0) return null
  const book = rows[0]
  const tagNames = await attachTags(db, book.id)
  return { ...book, tags: tagNames }
}

export async function listBooks(
  db: Db,
  filters: { genre?: string; tag?: string; year?: number; sort?: 'date' | 'rating' },
): Promise<BookWithTags[]> {
  const conditions = []

  if (filters.genre) {
    conditions.push(eq(books.genre, filters.genre))
  }
  if (filters.year) {
    conditions.push(like(books.readDate, `${filters.year}-%`))
  }

  if (filters.tag) {
    // Need inner join to filter by tag — query books that have the given tag
    const tagRows = await db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.name, filters.tag))
      .limit(1)
    if (tagRows.length === 0) return []
    const tagId = tagRows[0].id

    const joinCondition = and(eq(bookTags.bookId, books.id), eq(bookTags.tagId, tagId))
    const whereCondition = conditions.length > 0 ? and(...conditions) : undefined

    const rows = await db
      .select({ book: books })
      .from(books)
      .innerJoin(bookTags, joinCondition!)
      .where(whereCondition)
      .orderBy(
        filters.sort === 'rating' ? desc(books.rating) : desc(books.readDate),
      )

    const result: BookWithTags[] = []
    for (const row of rows) {
      const tagNames = await attachTags(db, row.book.id)
      result.push({ ...row.book, tags: tagNames })
    }
    return result
  }

  // No tag filter — simple query
  const whereCondition = conditions.length > 0 ? and(...conditions) : undefined
  const rows = await db
    .select()
    .from(books)
    .where(whereCondition)
    .orderBy(
      filters.sort === 'rating' ? desc(books.rating) : desc(books.readDate),
    )

  const result: BookWithTags[] = []
  for (const row of rows) {
    const tagNames = await attachTags(db, row.id)
    result.push({ ...row, tags: tagNames })
  }
  return result
}

export async function searchBooks(db: Db, q: string): Promise<BookWithTags[]> {
  const pattern = `%${q}%`
  const rows = await db
    .select()
    .from(books)
    .where(
      sql`${books.title} LIKE ${pattern} OR ${books.author} LIKE ${pattern}`,
    )
    .orderBy(desc(books.readDate))

  const result: BookWithTags[] = []
  for (const row of rows) {
    const tagNames = await attachTags(db, row.id)
    result.push({ ...row, tags: tagNames })
  }
  return result
}

export async function suggestTags(db: Db, q: string): Promise<string[]> {
  const pattern = `${q}%`
  const rows = await db
    .select({ name: tags.name })
    .from(tags)
    .where(like(tags.name, pattern))
    .limit(8)
  return rows.map((r) => r.name)
}

export async function listTagsForBook(db: Db, bookId: number): Promise<string[]> {
  return attachTags(db, bookId)
}

export async function listGenresWithCounts(
  db: Db,
): Promise<{ genre: string; count: number }[]> {
  const rows = await db
    .select({
      genre: books.genre,
      count: sql<number>`COUNT(*)`,
    })
    .from(books)
    .groupBy(books.genre)
    .orderBy(desc(sql`COUNT(*)`))
  return rows.map((r) => ({ genre: r.genre, count: Number(r.count) }))
}
