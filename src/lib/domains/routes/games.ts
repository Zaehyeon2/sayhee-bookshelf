import { gameOwnership } from '@/lib/auth-helpers'
import {
  countGames,
  countSearchGames,
  createGame,
  deleteGame,
  listGameTags,
  listGames,
  resolveGameTagId,
  searchGames,
  updateGame,
} from '@/lib/db/queries'
import { createMediaRouteHandlers } from '@/lib/domains/api'
import { PUBLIC_FEED_TAGS } from '@/lib/public-feed-cache'
import { CreateGameSchema, ListGamesQuerySchema, UpdateGameSchema } from '@/lib/validations'
import { WORKS_GAME_TAG } from '@/lib/works-detail-cache'

export const gameRouteHandlers = createMediaRouteHandlers({
  labels: {
    list: 'listGames',
    create: 'createGame',
    get: 'getGame',
    update: 'updateGame',
    delete: 'deleteGame',
  },
  createSchema: CreateGameSchema,
  updateSchema: UpdateGameSchema,
  listQuerySchema: ListGamesQuerySchema,
  queries: {
    search: searchGames,
    countSearch: countSearchGames,
    list: listGames,
    count: countGames,
    create: createGame,
    update: updateGame,
    delete: deleteGame,
    tagsOf: listGameTags,
    resolveTagId: resolveGameTagId,
  },
  requireOwn: gameOwnership.forApi,
  notFoundMessage: gameOwnership.notFoundMessage,
  revalidateTags: [PUBLIC_FEED_TAGS.games, WORKS_GAME_TAG],
})
