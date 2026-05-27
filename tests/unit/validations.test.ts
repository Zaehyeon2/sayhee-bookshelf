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

  it('isPublic: boolean false stays false, string "false" coerces to true', () => {
    const r1 = CreateBookSchema.safeParse({ ...validBase, isPublic: false })
    const r2 = CreateBookSchema.safeParse({ ...validBase, isPublic: 'false' })
    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
    // z.coerce.boolean()은 "false" 문자열도 truthy로 처리 — 명시적 boolean false만 거짓이 됨.
    // 폼은 boolean을 보내므로 실용적으로 OK.
    if (r1.success) expect(r1.data.isPublic).toBe(false)
    // z.coerce.boolean() converts the string 'false' to true (Boolean('false') === true).
    // 폼은 boolean을 보내므로 실용적으로 OK.
    if (r2.success) expect(r2.data.isPublic).toBe(true)
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
