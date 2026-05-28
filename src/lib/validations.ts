import { z } from 'zod'
import { BOOK_GENRES, MOVIE_GENRES } from './genres'
import { isValidUsername } from './username-normalize'

const dateRe = /^\d{4}-\d{2}-\d{2}$/

export const MAX_TAGS = 20
export const MAX_TAG_LEN = 30
export const MAX_CONTENT_LEN = 50_000
export const MAX_SEARCH_Q = 100
export const MAX_SLUG_LEN = 80

const tagsArraySchema = z
  .array(z.string().max(MAX_TAG_LEN, '태그는 최대 30자입니다'))
  .max(MAX_TAGS, '태그는 최대 20개까지 등록할 수 있습니다')

export const CreateBookSchema = z
  .object({
    title: z.string().trim().min(1, '제목을 입력하세요').max(200),
    author: z.string().trim().min(1, '작가를 입력하세요').max(100),
    genre: z.enum(BOOK_GENRES),
    readDate: z.string().regex(dateRe, '날짜 형식은 YYYY-MM-DD'),
    rating: z.number().int().min(1).max(10),
    content: z.string().max(MAX_CONTENT_LEN, '본문이 너무 깁니다').default(''),
    tags: tagsArraySchema
      .default([])
      .transform((arr) =>
        Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0))),
      ),
    oneLineReview: z
      .string()
      .trim()
      .max(150, '한줄평은 150자 이내로 입력해주세요')
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    isPublic: z.boolean().optional().default(true),
  })
  .strict()

export type CreateBookInput = z.infer<typeof CreateBookSchema>

// UpdateBookSchema: all fields optional, no defaults — so parse({}) returns {}
export const UpdateBookSchema = z
  .object({
    title: z.string().trim().min(1, '제목을 입력하세요').max(200).optional(),
    author: z.string().trim().min(1, '작가를 입력하세요').max(100).optional(),
    genre: z.enum(BOOK_GENRES).optional(),
    readDate: z.string().regex(dateRe, '날짜 형식은 YYYY-MM-DD').optional(),
    rating: z.number().int().min(1).max(10).optional(),
    content: z.string().max(MAX_CONTENT_LEN, '본문이 너무 깁니다').optional(),
    tags: tagsArraySchema
      .transform((arr) => Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0))))
      .optional(),
    oneLineReview: z
      .string()
      .trim()
      .max(150, '한줄평은 150자 이내로 입력해주세요')
      .optional()
      .transform((v) => (v === undefined ? undefined : v.length > 0 ? v : null)),
    isPublic: z.boolean().optional(),
  })
  .strict()

export type UpdateBookInput = z.infer<typeof UpdateBookSchema>

export const CreateMovieSchema = z
  .object({
    title: z.string().trim().min(1, '제목을 입력하세요').max(200),
    director: z.string().trim().min(1, '감독을 입력하세요').max(100),
    genre: z.enum(MOVIE_GENRES),
    watchedDate: z.string().regex(dateRe, '날짜 형식은 YYYY-MM-DD'),
    rating: z.number().int().min(1).max(10),
    content: z.string().max(MAX_CONTENT_LEN, '본문이 너무 깁니다').default(''),
    tags: tagsArraySchema
      .default([])
      .transform((arr) =>
        Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0))),
      ),
    oneLineReview: z
      .string()
      .trim()
      .max(150, '한줄평은 150자 이내로 입력해주세요')
      .optional()
      .transform((v) => (v && v.length > 0 ? v : null)),
    isPublic: z.boolean().optional().default(true),
  })
  .strict()

export type CreateMovieInput = z.infer<typeof CreateMovieSchema>

export const UpdateMovieSchema = z
  .object({
    title: z.string().trim().min(1, '제목을 입력하세요').max(200).optional(),
    director: z.string().trim().min(1, '감독을 입력하세요').max(100).optional(),
    genre: z.enum(MOVIE_GENRES).optional(),
    watchedDate: z.string().regex(dateRe, '날짜 형식은 YYYY-MM-DD').optional(),
    rating: z.number().int().min(1).max(10).optional(),
    content: z.string().max(MAX_CONTENT_LEN, '본문이 너무 깁니다').optional(),
    tags: tagsArraySchema
      .transform((arr) => Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0))))
      .optional(),
    oneLineReview: z
      .string()
      .trim()
      .max(150, '한줄평은 150자 이내로 입력해주세요')
      .optional()
      .transform((v) => (v === undefined ? undefined : v.length > 0 ? v : null)),
    isPublic: z.boolean().optional(),
  })
  .strict()

export type UpdateMovieInput = z.infer<typeof UpdateMovieSchema>

export const ListMoviesQuerySchema = z.object({
  q: z.string().max(MAX_SEARCH_Q).optional(),
  genre: z.enum(MOVIE_GENRES).optional(),
  tag: z.string().max(MAX_TAG_LEN).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  sort: z.enum(['date', 'rating']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
})

export const FeedQuerySchema = z.object({
  type: z.enum(['book', 'movie']).default('book'),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
})

export const LoginSchema = z
  .object({
    username: z.string().trim().min(2).max(20),
    password: z.string().min(8).max(200),
  })
  .strict()

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: z.string().min(8).max(200),
    newPasswordConfirm: z.string().min(8).max(200),
  })
  .strict()
  .refine((d) => d.newPassword === d.newPasswordConfirm, {
    message: '새 비밀번호가 일치하지 않습니다',
    path: ['newPasswordConfirm'],
  })

export const CreateUserSchema = z
  .object({
    username: z.string().trim().refine(isValidUsername, '아이디는 2~20자, 공백·/·?·#·@·& 금지'),
    displayName: z.string().trim().min(1).max(30).optional(),
  })
  .strict()

export const UpdateProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(30),
  })
  .strict()

export const CreateWritingSchema = z
  .object({
    title: z.string().trim().min(1, '제목을 입력하세요').max(200),
    body: z.string().max(MAX_CONTENT_LEN, '본문이 너무 깁니다').default(''),
    tags: tagsArraySchema
      .default([])
      .transform((arr) =>
        Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0))),
      ),
  })
  .strict()

export type CreateWritingInput = z.infer<typeof CreateWritingSchema>

export const UpdateWritingSchema = z
  .object({
    title: z.string().trim().min(1, '제목을 입력하세요').max(200).optional(),
    body: z.string().max(MAX_CONTENT_LEN, '본문이 너무 깁니다').optional(),
    tags: tagsArraySchema
      .transform((arr) => Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0))))
      .optional(),
  })
  .strict()

export type UpdateWritingInput = z.infer<typeof UpdateWritingSchema>

/** GET /api/books?... 쿼리스트링 검증 — 길이/범위 가드. */
export const ListBooksQuerySchema = z.object({
  q: z.string().max(MAX_SEARCH_Q).optional(),
  genre: z.enum(BOOK_GENRES).optional(),
  tag: z.string().max(MAX_TAG_LEN).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  sort: z.enum(['date', 'rating']).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
})

export const ListWritingsQuerySchema = z.object({
  q: z.string().max(MAX_SEARCH_Q).optional(),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
})

export const SuggestTagsQuerySchema = z.object({
  q: z.string().max(MAX_TAG_LEN).optional(),
})

export const SlugParamSchema = z.string().min(1).max(MAX_SLUG_LEN)

export const limits = {
  MAX_TAGS,
  MAX_TAG_LEN,
  MAX_CONTENT_LEN,
  MAX_SEARCH_Q,
  MAX_SLUG_LEN,
} as const
