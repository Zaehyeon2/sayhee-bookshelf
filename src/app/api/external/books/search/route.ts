import { createExternalSearchHandler } from '@/lib/external/route-factory'
import { searchBooksExternal } from '@/lib/external/books'

export const GET = createExternalSearchHandler<string>({
  source: 'nl-kr',
  adapter: searchBooksExternal,
  logTag: 'external/books/search',
})
