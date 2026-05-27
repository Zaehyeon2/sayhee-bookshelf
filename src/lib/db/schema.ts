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
    // 비밀번호 변경/관리자 리셋 때마다 1씩 증가. JWT의 tv 클레임과 매칭되지 않으면 세션 무효화.
    tokenVersion: integer('token_version').notNull().default(0),
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
    oneLineReview: text('one_line_review'),
    isPublic: integer('is_public').notNull().default(1),
    publishedAt: integer('published_at'),
    slug: text('slug').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    authorUserIdx: index('idx_books_author_user').on(t.authorUserId),
    userSlugUnique: uniqueIndex('idx_books_user_slug').on(t.authorUserId, t.slug),
    // composite indexes — listBooks 기본 정렬/필터를 cover
    userDateIdx: index('idx_books_user_date').on(t.authorUserId, sql`${t.readDate} DESC`),
    userGenreIdx: index('idx_books_user_genre').on(t.authorUserId, t.genre),
    userRatingIdx: index('idx_books_user_rating').on(t.authorUserId, sql`${t.rating} DESC`),
    publicPublishedIdx: index('idx_books_public_published').on(
      t.isPublic,
      sql`${t.publishedAt} DESC`,
    ),
    ratingCheck: check('rating_range', sql`${t.rating} BETWEEN 1 AND 10`),
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
    userSlugUnique: uniqueIndex('idx_writings_user_slug').on(t.authorUserId, t.slug),
    // listWritings 기본 정렬 cover
    userCreatedIdx: index('idx_writings_user_created').on(t.authorUserId, sql`${t.createdAt} DESC`),
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
  movies: many(movies),
}))
export const booksRelations = relations(books, ({ one, many }) => ({
  author: one(users, { fields: [books.authorUserId], references: [users.id] }),
  bookTags: many(bookTags),
}))
export const tagsRelations = relations(tags, ({ many }) => ({
  bookTags: many(bookTags),
  writingTags: many(writingTags),
  movieTags: many(movieTags),
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

export const movies = sqliteTable(
  'movies',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    authorUserId: integer('author_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    director: text('director').notNull(),
    genre: text('genre').notNull(),
    watchedDate: text('watched_date').notNull(),
    rating: integer('rating').notNull(),
    content: text('content').notNull().default(''),
    oneLineReview: text('one_line_review'),
    isPublic: integer('is_public').notNull().default(1),
    publishedAt: integer('published_at'),
    slug: text('slug').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    authorUserIdx: index('idx_movies_author_user').on(t.authorUserId),
    userSlugUnique: uniqueIndex('idx_movies_user_slug').on(t.authorUserId, t.slug),
    userDateIdx: index('idx_movies_user_date').on(t.authorUserId, sql`${t.watchedDate} DESC`),
    userGenreIdx: index('idx_movies_user_genre').on(t.authorUserId, t.genre),
    userRatingIdx: index('idx_movies_user_rating').on(t.authorUserId, sql`${t.rating} DESC`),
    publicPublishedIdx: index('idx_movies_public_published').on(
      t.isPublic,
      sql`${t.publishedAt} DESC`,
    ),
    ratingCheck: check('movies_rating_range', sql`${t.rating} BETWEEN 1 AND 10`),
  }),
)

export const movieTags = sqliteTable(
  'movie_tags',
  {
    movieId: integer('movie_id')
      .notNull()
      .references(() => movies.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.movieId, t.tagId] }),
    tagIdx: index('idx_movie_tags_tag').on(t.tagId),
  }),
)

export const moviesRelations = relations(movies, ({ one, many }) => ({
  author: one(users, { fields: [movies.authorUserId], references: [users.id] }),
  movieTags: many(movieTags),
}))

export const movieTagsRelations = relations(movieTags, ({ one }) => ({
  movie: one(movies, { fields: [movieTags.movieId], references: [movies.id] }),
  tag: one(tags, { fields: [movieTags.tagId], references: [tags.id] }),
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
export type Movie = typeof movies.$inferSelect
export type NewMovie = typeof movies.$inferInsert
export type MovieTag = typeof movieTags.$inferSelect
export type NewMovieTag = typeof movieTags.$inferInsert
