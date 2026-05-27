import { describe, it, expect, beforeEach } from 'vitest'
import {
  createMovie as queryCreateMovie,
  updateMovie,
  deleteMovie,
  getMovieById,
  getMovieBySlug,
  listMovies,
  countMovies,
} from '@/lib/db/queries'
import { makeTestDb, type TestDb } from '../setup-db'
import { createUser, createMovie } from '../factories'

describe('movie queries — user scoping (data isolation)', () => {
  let db: TestDb

  beforeEach(async () => {
    ;({ db } = await makeTestDb())
  })

  it('listMovies returns only own user movies', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createMovie(db, a.id, { title: 'A1' })
    await createMovie(db, a.id, { title: 'A2' })
    await createMovie(db, b.id, { title: 'B1' })

    const aList = await listMovies(db, a.id, {})
    const bList = await listMovies(db, b.id, {})
    expect(aList.map((x) => x.title).sort()).toEqual(['A1', 'A2'])
    expect(bList.map((x) => x.title)).toEqual(['B1'])
  })

  it('countMovies scoped to user', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createMovie(db, a.id, { title: 'A1' })
    await createMovie(db, a.id, { title: 'A2' })
    await createMovie(db, b.id, { title: 'B1' })

    expect(await countMovies(db, a.id, {})).toBe(2)
    expect(await countMovies(db, b.id, {})).toBe(1)
  })

  it('getMovieById returns undefined for other user movie', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const aMovie = await createMovie(db, a.id, { title: 'Alice Movie' })

    expect(await getMovieById(db, a.id, aMovie.id)).not.toBeUndefined()
    expect(await getMovieById(db, b.id, aMovie.id)).toBeUndefined()
  })

  it('getMovieBySlug returns undefined for other user movie', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    await createMovie(db, a.id, { slug: 'shared-slug' })

    expect(await getMovieBySlug(db, a.id, 'shared-slug')).not.toBeUndefined()
    expect(await getMovieBySlug(db, b.id, 'shared-slug')).toBeUndefined()
  })

  it('updateMovie scoped to owner — returns undefined for other user', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const aMovie = await createMovie(db, a.id, { title: 'orig' })

    // bob attempts to update alice's movie → undefined (null)
    const result = await updateMovie(db, b.id, aMovie.id, { title: 'hijacked', oneLineReview: null })
    expect(result).toBeNull()

    // alice's movie unchanged
    const after = await getMovieBySlug(db, a.id, aMovie.slug)
    expect(after?.title).toBe('orig')
  })

  it('deleteMovie scoped to owner — returns false for other user', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const aMovie = await createMovie(db, a.id)

    expect(await deleteMovie(db, b.id, aMovie.id)).toBe(false)
    expect(await deleteMovie(db, a.id, aMovie.id)).toBe(true)
  })

  it('createMovie slug collision retries with -2 suffix', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })

    // Both users create movie with same title → same base slug, but per-user uniqueness means no collision
    const aMovie = await queryCreateMovie(db, a.id, {
      title: '인터스텔라',
      director: '놀란',
      genre: '드라마',
      watchedDate: '2026-01-01',
      rating: 9,
      content: '',
      tags: [],
      oneLineReview: null,
      isPublic: true,
    })
    const bMovie = await queryCreateMovie(db, b.id, {
      title: '인터스텔라',
      director: '놀란',
      genre: '드라마',
      watchedDate: '2026-01-01',
      rating: 9,
      content: '',
      tags: [],
      oneLineReview: null,
      isPublic: true,
    })
    // Same slug is allowed for different users (composite unique)
    expect(aMovie.slug).toBe(bMovie.slug)
    expect(aMovie.authorUserId).not.toBe(bMovie.authorUserId)

    // Same user, same title → slug retry produces -2
    const aMovie2 = await queryCreateMovie(db, a.id, {
      title: '인터스텔라',
      director: '놀란',
      genre: '드라마',
      watchedDate: '2026-01-01',
      rating: 9,
      content: '',
      tags: [],
      oneLineReview: null,
      isPublic: true,
    })
    expect(aMovie2.slug).toBe(`${aMovie.slug}-2`)
  })

  it('createMovie tag sync inserts and re-uses existing tags', async () => {
    const a = await createUser(db, { username: 'alice' })

    const m1 = await queryCreateMovie(db, a.id, {
      title: '매트릭스',
      director: '워쇼스키',
      genre: 'SF',
      watchedDate: '2026-01-01',
      rating: 9,
      content: '',
      tags: ['sci-fi', 'action'],
      oneLineReview: null,
      isPublic: true,
    })
    expect(m1.tags.sort()).toEqual(['action', 'sci-fi'])

    // Second movie reuses same tags (no duplicate tag rows in tags table)
    const m2 = await queryCreateMovie(db, a.id, {
      title: '매트릭스 리로디드',
      director: '워쇼스키',
      genre: 'SF',
      watchedDate: '2026-01-02',
      rating: 8,
      content: '',
      tags: ['sci-fi'],
      oneLineReview: null,
      isPublic: true,
    })
    expect(m2.tags).toEqual(['sci-fi'])
  })

  it('getMovieBySlug returns movie WITH tags attached', async () => {
    const a = await createUser(db, { username: 'alice' })

    const created = await queryCreateMovie(db, a.id, {
      title: '기생충',
      director: '봉준호',
      genre: '드라마',
      watchedDate: '2026-02-01',
      rating: 10,
      content: '최고의 영화',
      tags: ['한국영화', '드라마'],
      oneLineReview: '명작',
      isPublic: true,
    })

    const fetched = await getMovieBySlug(db, a.id, created.slug)
    expect(fetched).not.toBeUndefined()
    expect(fetched?.tags.sort()).toEqual(['드라마', '한국영화'])
    expect(fetched?.title).toBe('기생충')
  })
})
