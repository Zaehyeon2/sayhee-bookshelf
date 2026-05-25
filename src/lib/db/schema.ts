import { sqliteTable, integer, text, primaryKey, index, check } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { relations } from 'drizzle-orm'

export const books = sqliteTable(
  'books',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    author: text('author').notNull(),
    genre: text('genre').notNull(),
    readDate: text('read_date').notNull(),         // 'YYYY-MM-DD'
    rating: integer('rating').notNull(),
    content: text('content').notNull().default(''),
    slug: text('slug').notNull().unique(),
    createdAt: integer('created_at').notNull(),    // unix ms
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    titleIdx: index('idx_books_title').on(t.title),
    authorIdx: index('idx_books_author').on(t.author),
    genreIdx: index('idx_books_genre').on(t.genre),
    dateIdx: index('idx_books_date').on(t.readDate),
    ratingCheck: check('rating_range', sql`${t.rating} BETWEEN 1 AND 5`),
  })
)

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
})

export const bookTags = sqliteTable(
  'book_tags',
  {
    bookId: integer('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.bookId, t.tagId] }),
    tagIdx: index('idx_book_tags_tag').on(t.tagId),
  })
)

export const booksRelations = relations(books, ({ many }) => ({
  bookTags: many(bookTags),
}))
export const tagsRelations = relations(tags, ({ many }) => ({
  bookTags: many(bookTags),
}))
export const bookTagsRelations = relations(bookTags, ({ one }) => ({
  book: one(books, { fields: [bookTags.bookId], references: [books.id] }),
  tag: one(tags, { fields: [bookTags.tagId], references: [tags.id] }),
}))

export type Book = typeof books.$inferSelect
export type NewBook = typeof books.$inferInsert
export type Tag = typeof tags.$inferSelect
