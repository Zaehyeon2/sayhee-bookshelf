import { createExternalSearchHandler } from '@/lib/external/route-factory'
import { searchGamesExternal } from '@/lib/external/games'

export const GET = createExternalSearchHandler<number>({
  source: 'rawg',
  adapter: searchGamesExternal,
  logTag: 'external/games/search',
})
