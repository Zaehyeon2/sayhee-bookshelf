import {
  sqliteTable,
  integer,
  text,
  primaryKey,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'
import { relations } from 'drizzle-orm'

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('member'), // 'admin' | 'member'
    mustChangePassword: integer('must_change_password').notNull().default(1),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    usernameIdx: uniqueIndex('idx_users_username').on(t.username),
  }),
)

export const books = sqliteTable(
  'books',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    authorUserId: integer('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    author: text('author').notNull(),
    genre: text('genre').notNull(),
    readDate: text('read_date').notNull(),
    rating: integer('rating').notNull(),
    content: text('content').notNull().default(''),
    slug: text('slug').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    titleIdx: index('idx_books_title').on(t.title),
    authorIdx: index('idx_books_author').on(t.author),
    genreIdx: index('idx_books_genre').on(t.genre),
    dateIdx: index('idx_books_date').on(t.readDate),
    authorUserIdx: index('idx_books_author_user').on(t.authorUserId),
    userSlugUnique: uniqueIndex('idx_books_user_slug').on(t.authorUserId, t.slug),
    ratingCheck: check('rating_range', sql`${t.rating} BETWEEN 1 AND 5`),
  }),
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
  }),
)

export const writings = sqliteTable(
  'writings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    authorUserId: integer('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    slug: text('slug').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    authorUserIdx: index('idx_writings_author_user').on(t.authorUserId),
    createdAtIdx: index('idx_writings_created_at').on(t.createdAt),
    userSlugUnique: uniqueIndex('idx_writings_user_slug').on(t.authorUserId, t.slug),
  }),
)

export const writingTags = sqliteTable(
  'writing_tags',
  {
    writingId: integer('writing_id')
      .notNull()
      .references(() => writings.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.writingId, t.tagId] }),
    tagIdx: index('idx_writing_tags_tag').on(t.tagId),
  }),
)

export const usersRelations = relations(users, ({ many }) => ({
  books: many(books),
  writings: many(writings),
}))
export const booksRelations = relations(books, ({ one, many }) => ({
  author: one(users, { fields: [books.authorUserId], references: [users.id] }),
  bookTags: many(bookTags),
}))
export const tagsRelations = relations(tags, ({ many }) => ({
  bookTags: many(bookTags),
  writingTags: many(writingTags),
}))
export const bookTagsRelations = relations(bookTags, ({ one }) => ({
  book: one(books, { fields: [bookTags.bookId], references: [books.id] }),
  tag: one(tags, { fields: [bookTags.tagId], references: [tags.id] }),
}))
export const writingsRelations = relations(writings, ({ one, many }) => ({
  author: one(users, { fields: [writings.authorUserId], references: [users.id] }),
  writingTags: many(writingTags),
}))
export const writingTagsRelations = relations(writingTags, ({ one }) => ({
  writing: one(writings, { fields: [writingTags.writingId], references: [writings.id] }),
  tag: one(tags, { fields: [writingTags.tagId], references: [tags.id] }),
}))

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Book = typeof books.$inferSelect
export type NewBook = typeof books.$inferInsert
export type Tag = typeof tags.$inferSelect
export type NewTag = typeof tags.$inferInsert
export type BookTag = typeof bookTags.$inferSelect
export type NewBookTag = typeof bookTags.$inferInsert
export type Writing = typeof writings.$inferSelect
export type NewWriting = typeof writings.$inferInsert
export type WritingTag = typeof writingTags.$inferSelect
export type NewWritingTag = typeof writingTags.$inferInsert
