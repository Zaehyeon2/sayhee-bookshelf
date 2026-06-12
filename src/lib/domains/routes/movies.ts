import { requireOwnMovie } from '@/lib/auth-helpers'
import {
  countMovies,
  countSearchMovies,
  createMovie,
  deleteMovie,
  getMovieById,
  listMovies,
  resolveMovieTagId,
  searchMovies,
  updateMovie,
} from '@/lib/db/queries'
import { createMediaRouteHandlers } from '@/lib/domains/api'
import { PUBLIC_FEED_TAGS } from '@/lib/public-feed-cache'
import { CreateMovieSchema, ListMoviesQuerySchema, UpdateMovieSchema } from '@/lib/validations'
import { WORKS_MOVIE_TAG } from '@/lib/works-detail-cache'

export const movieRouteHandlers = createMediaRouteHandlers({
  labels: {
    list: 'listMovies',
    create: 'createMovie',
    get: 'getMovie',
    update: 'updateMovie',
    delete: 'deleteMovie',
  },
  createSchema: CreateMovieSchema,
  updateSchema: UpdateMovieSchema,
  listQuerySchema: ListMoviesQuerySchema,
  queries: {
    search: searchMovies,
    countSearch: countSearchMovies,
    list: listMovies,
    count: countMovies,
    create: createMovie,
    update: updateMovie,
    delete: deleteMovie,
    getById: getMovieById,
    resolveTagId: resolveMovieTagId,
  },
  requireOwn: requireOwnMovie,
  revalidateTags: [PUBLIC_FEED_TAGS.movies, WORKS_MOVIE_TAG],
})
