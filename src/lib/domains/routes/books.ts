import { requireOwnBook } from '@/lib/auth-helpers'
import {
  countBooks,
  countSearchBooks,
  createBook,
  deleteBook,
  getBookById,
  listBooks,
  resolveBookTagId,
  searchBooks,
  updateBook,
} from '@/lib/db/queries'
import { createMediaRouteHandlers } from '@/lib/domains/api'
import { PUBLIC_FEED_TAGS } from '@/lib/public-feed-cache'
import { CreateBookSchema, ListBooksQuerySchema, UpdateBookSchema } from '@/lib/validations'
import { WORKS_BOOK_TAG } from '@/lib/works-detail-cache'

export const bookRouteHandlers = createMediaRouteHandlers({
  labels: {
    list: 'listBooks',
    create: 'createBook',
    get: 'getBook',
    update: 'updateBook',
    delete: 'deleteBook',
  },
  createSchema: CreateBookSchema,
  updateSchema: UpdateBookSchema,
  listQuerySchema: ListBooksQuerySchema,
  queries: {
    search: searchBooks,
    countSearch: countSearchBooks,
    list: listBooks,
    count: countBooks,
    create: createBook,
    update: updateBook,
    delete: deleteBook,
    getById: getBookById,
    resolveTagId: resolveBookTagId,
  },
  requireOwn: requireOwnBook,
  revalidateTags: [PUBLIC_FEED_TAGS.books, WORKS_BOOK_TAG],
})
