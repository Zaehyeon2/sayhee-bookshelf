import { describe, it, expect, test } from 'vitest'
import {
  LoginSchema,
  ChangePasswordSchema,
  CreateUserSchema,
  UpdateProfileSchema,
  CreateBookSchema,
  UpdateBookSchema,
  CreateMovieSchema,
  UpdateMovieSchema,
  ListMoviesQuerySchema,
  FeedQuerySchema,
  ExternalIdsQuerySchema,
  ExternalSearchQuerySchema,
} from '@/lib/validations'

describe('LoginSchema', () => {
  it('requires username and password', () => {
    expect(LoginSchema.safeParse({ username: 'sehee', password: 'pass1234' }).success).toBe(true)
    expect(LoginSchema.safeParse({ password: 'pass1234' }).success).toBe(false)
    expect(LoginSchema.safeParse({ username: 'sehee' }).success).toBe(false)
  })
  it('rejects too-short password', () => {
    expect(LoginSchema.safeParse({ username: 'sehee', password: '123' }).success).toBe(false)
  })
})

describe('ChangePasswordSchema', () => {
  it('requires confirm matches', () => {
    const ok = ChangePasswordSchema.safeParse({
      currentPassword: 'old12345',
      newPassword: 'new12345',
      newPasswordConfirm: 'new12345',
    })
    expect(ok.success).toBe(true)
  })
  it('rejects mismatched confirm', () => {
    const result = ChangePasswordSchema.safeParse({
      currentPassword: 'old12345',
      newPassword: 'new12345',
      newPasswordConfirm: 'wrong___',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('일치'))).toBe(true)
    }
  })
})

describe('CreateUserSchema', () => {
  it('accepts valid username', () => {
    expect(CreateUserSchema.safeParse({ username: '세희' }).success).toBe(true)
    expect(CreateUserSchema.safeParse({ username: 'sehee', displayName: '세희' }).success).toBe(
      true,
    )
  })
  it('rejects forbidden chars', () => {
    expect(CreateUserSchema.safeParse({ username: 'a/b' }).success).toBe(false)
  })
})

describe('UpdateProfileSchema', () => {
  it('requires displayName 1~30', () => {
    expect(UpdateProfileSchema.safeParse({ displayName: '세' }).success).toBe(true)
    expect(UpdateProfileSchema.safeParse({ displayName: '' }).success).toBe(false)
    expect(UpdateProfileSchema.safeParse({ displayName: 'a'.repeat(31) }).success).toBe(false)
  })
})

describe('CreateBookSchema — public feed fields', () => {
  const validBase = {
    title: 'T',
    author: 'A',
    genre: '소설',
    readDate: '2026-05-27',
    rating: 4,
  }

  it('accepts oneLineReview up to 150 chars', () => {
    const r = CreateBookSchema.safeParse({ ...validBase, oneLineReview: 'a'.repeat(150) })
    expect(r.success).toBe(true)
  })

  it('rejects oneLineReview over 150 chars', () => {
    const r = CreateBookSchema.safeParse({ ...validBase, oneLineReview: 'a'.repeat(151) })
    expect(r.success).toBe(false)
  })

  it('normalizes empty oneLineReview to null', () => {
    const r = CreateBookSchema.safeParse({ ...validBase, oneLineReview: '   ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.oneLineReview).toBeNull()
  })

  it('trims whitespace around oneLineReview', () => {
    const r = CreateBookSchema.safeParse({ ...validBase, oneLineReview: '  좋아요  ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.oneLineReview).toBe('좋아요')
  })

  it('isPublic defaults to true when omitted', () => {
    const r = CreateBookSchema.safeParse(validBase)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.isPublic).toBe(true)
  })

  it('isPublic: boolean only — string values rejected to prevent silent publish leak', () => {
    const r1 = CreateBookSchema.safeParse({ ...validBase, isPublic: false })
    const r2 = CreateBookSchema.safeParse({ ...validBase, isPublic: 'false' })
    const r3 = CreateBookSchema.safeParse({ ...validBase, isPublic: true })
    expect(r1.success).toBe(true)
    if (r1.success) expect(r1.data.isPublic).toBe(false)
    expect(r3.success).toBe(true)
    if (r3.success) expect(r3.data.isPublic).toBe(true)
    // 문자열 'false'는 거부 — `z.coerce.boolean()`은 비빈 문자열을 truthy로 변환해
    // privacy 침해로 이어지므로 strict boolean만 허용한다.
    expect(r2.success).toBe(false)
  })
})

describe('CreateMovieSchema', () => {
  const valid = {
    title: '인셉션',
    director: '크리스토퍼 놀란',
    genre: 'SF',
    watchedDate: '2026-01-15',
    rating: 9,
    content: '',
    tags: [],
  }

  test('valid input parses', () => {
    expect(CreateMovieSchema.safeParse(valid).success).toBe(true)
  })
  test('rating below 1 rejected', () => {
    expect(CreateMovieSchema.safeParse({ ...valid, rating: 0 }).success).toBe(false)
  })
  test('rating above 10 rejected', () => {
    expect(CreateMovieSchema.safeParse({ ...valid, rating: 11 }).success).toBe(false)
  })
  test('rating non-integer rejected', () => {
    expect(CreateMovieSchema.safeParse({ ...valid, rating: 5.5 }).success).toBe(false)
  })
  test('invalid genre rejected (book genre not allowed)', () => {
    expect(CreateMovieSchema.safeParse({ ...valid, genre: '소설' }).success).toBe(false)
  })
  test('invalid date format rejected', () => {
    expect(CreateMovieSchema.safeParse({ ...valid, watchedDate: '2026/01/15' }).success).toBe(false)
  })
  test('isPublic defaults to true', () => {
    const parsed = CreateMovieSchema.parse(valid)
    expect(parsed.isPublic).toBe(true)
  })
  test('empty oneLineReview becomes null', () => {
    const parsed = CreateMovieSchema.parse({ ...valid, oneLineReview: '   ' })
    expect(parsed.oneLineReview).toBeNull()
  })
  test('oneLineReview over 150 chars rejected', () => {
    const long = 'x'.repeat(151)
    expect(CreateMovieSchema.safeParse({ ...valid, oneLineReview: long }).success).toBe(false)
  })
  test('tags are deduplicated and trimmed', () => {
    const parsed = CreateMovieSchema.parse({ ...valid, tags: [' 액션 ', '액션', 'SF', ''] })
    expect(parsed.tags).toEqual(['액션', 'SF'])
  })
})

describe('UpdateMovieSchema', () => {
  test('empty object parses to empty (partial update)', () => {
    const parsed = UpdateMovieSchema.parse({})
    expect(parsed).toEqual({})
  })
  test('single field update works', () => {
    const parsed = UpdateMovieSchema.parse({ title: '새 제목' })
    expect(parsed.title).toBe('새 제목')
  })
  test('omitting oneLineReview does not produce null (partial update preserves)', () => {
    const parsed = UpdateMovieSchema.parse({})
    expect(parsed).not.toHaveProperty('oneLineReview')
  })
  test('explicit empty string oneLineReview becomes null', () => {
    const parsed = UpdateMovieSchema.parse({ oneLineReview: '' })
    expect(parsed.oneLineReview).toBeNull()
  })
  test('whitespace-only oneLineReview becomes null', () => {
    const parsed = UpdateMovieSchema.parse({ oneLineReview: '   ' })
    expect(parsed.oneLineReview).toBeNull()
  })
})

describe('UpdateBookSchema oneLineReview guard', () => {
  test('omitting oneLineReview does not produce null', () => {
    const parsed = UpdateBookSchema.parse({})
    expect(parsed).not.toHaveProperty('oneLineReview')
  })
  test('explicit empty string oneLineReview becomes null', () => {
    const parsed = UpdateBookSchema.parse({ oneLineReview: '' })
    expect(parsed.oneLineReview).toBeNull()
  })
  test('whitespace-only oneLineReview becomes null', () => {
    const parsed = UpdateBookSchema.parse({ oneLineReview: '   ' })
    expect(parsed.oneLineReview).toBeNull()
  })
})

describe('ListMoviesQuerySchema', () => {
  test('genre must be MOVIE_GENRES', () => {
    expect(ListMoviesQuerySchema.safeParse({ genre: '액션' }).success).toBe(true)
    expect(ListMoviesQuerySchema.safeParse({ genre: '소설' }).success).toBe(false)
  })
  test('page coerced from string', () => {
    const parsed = ListMoviesQuerySchema.parse({ page: '3' })
    expect(parsed.page).toBe(3)
  })
})

describe('FeedQuerySchema', () => {
  test('type defaults to book', () => {
    expect(FeedQuerySchema.parse({}).type).toBe('book')
  })
  test('type=movie accepted', () => {
    expect(FeedQuerySchema.parse({ type: 'movie' }).type).toBe('movie')
  })
  test('unknown type rejected', () => {
    expect(FeedQuerySchema.safeParse({ type: 'foo' }).success).toBe(false)
  })
})

describe('external metadata fields', () => {
  const baseBook = {
    title: '책',
    author: '저자',
    genre: '소설',
    readDate: '2026-01-01',
    rating: 8,
  }
  const baseMovie = {
    title: '영화',
    director: '감독',
    genre: '드라마',
    watchedDate: '2026-01-01',
    rating: 8,
  }

  it('accepts isbn/coverUrl/externalSource on CreateBookSchema', () => {
    const r = CreateBookSchema.parse({
      ...baseBook,
      isbn: '9781234567890',
      coverUrl: 'https://example.com/x.jpg',
      externalSource: 'naver',
    })
    expect(r.isbn).toBe('9781234567890')
    expect(r.externalSource).toBe('naver')
  })

  it('rejects non-http coverUrl', () => {
    expect(() =>
      CreateBookSchema.parse({ ...baseBook, coverUrl: 'javascript:alert(1)' }),
    ).toThrow()
    expect(() =>
      CreateBookSchema.parse({ ...baseBook, coverUrl: 'ftp://x/y.jpg' }),
    ).toThrow()
  })

  it('rejects invalid externalSource enum', () => {
    expect(() =>
      CreateBookSchema.parse({ ...baseBook, externalSource: 'tmdb' }),
    ).toThrow()
  })

  it('accepts null to clear coverUrl in update', () => {
    const r = UpdateBookSchema.parse({ coverUrl: null, isbn: null })
    expect(r.coverUrl).toBeNull()
  })

  it('accepts tmdbId positive integer on CreateMovieSchema', () => {
    const r = CreateMovieSchema.parse({ ...baseMovie, tmdbId: 12345, externalSource: 'tmdb' })
    expect(r.tmdbId).toBe(12345)
  })

  it('rejects non-positive tmdbId', () => {
    expect(() => CreateMovieSchema.parse({ ...baseMovie, tmdbId: 0 })).toThrow()
    expect(() => CreateMovieSchema.parse({ ...baseMovie, tmdbId: -1 })).toThrow()
  })

  it('UpdateMovieSchema accepts null tmdbId', () => {
    const r = UpdateMovieSchema.parse({ tmdbId: null })
    expect(r.tmdbId).toBeNull()
  })

  it('accepts case-insensitive http(s) scheme on coverUrl', () => {
    const r = CreateBookSchema.parse({
      ...baseBook,
      coverUrl: 'HTTPS://Example.com/x.jpg',
    })
    expect(r.coverUrl?.toLowerCase()).toContain('https://')
  })

  it('trims whitespace around coverUrl before validation', () => {
    const r = CreateBookSchema.parse({
      ...baseBook,
      coverUrl: '  https://example.com/x.jpg  ',
    })
    expect(r.coverUrl).toBe('https://example.com/x.jpg')
  })
})

describe('ExternalSearchQuerySchema', () => {
  it('accepts q with 2-80 chars', () => {
    expect(ExternalSearchQuerySchema.parse({ q: '해리포터' }).q).toBe('해리포터')
  })
  it('rejects q under 2 chars', () => {
    expect(() => ExternalSearchQuerySchema.parse({ q: 'a' })).toThrow()
  })
  it('rejects q over 80 chars', () => {
    expect(() => ExternalSearchQuerySchema.parse({ q: 'x'.repeat(81) })).toThrow()
  })
  it('accepts q at boundaries (2 and 80 chars)', () => {
    expect(ExternalSearchQuerySchema.parse({ q: 'ab' }).q).toBe('ab')
    expect(ExternalSearchQuerySchema.parse({ q: 'x'.repeat(80) }).q).toHaveLength(80)
  })
})

describe('ExternalIdsQuerySchema', () => {
  it('parses comma-separated string ids', () => {
    const r = ExternalIdsQuerySchema.parse({ ids: 'isbn1,isbn2,isbn3' })
    expect(r.ids).toEqual(['isbn1', 'isbn2', 'isbn3'])
  })
  it('trims and dedupes', () => {
    const r = ExternalIdsQuerySchema.parse({ ids: ' a , b ,a, ' })
    expect(r.ids).toEqual(['a', 'b'])
  })
  it('rejects empty', () => {
    expect(() => ExternalIdsQuerySchema.parse({ ids: '' })).toThrow()
  })
  it('caps at 50 ids', () => {
    const many = Array.from({ length: 51 }, (_, i) => `id${i}`).join(',')
    expect(() => ExternalIdsQuerySchema.parse({ ids: many })).toThrow()
  })
})
