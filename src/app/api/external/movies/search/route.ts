import { createExternalSearchHandler } from '@/lib/external/route-factory'
import { searchMoviesExternal } from '@/lib/external/movies'

export const GET = createExternalSearchHandler<number>({
  source: 'tmdb',
  adapter: searchMoviesExternal,
  logTag: 'external/movies/search',
})
