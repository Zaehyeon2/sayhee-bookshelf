import { z } from 'zod'
import { BOOK_GENRES, MOVIE_GENRES, GAME_GENRES } from './genres'
import { isValidUsername } from './username-normalize'
import { canonicalIsbn } from './isbn'
import { isManagedBlobUrl } from './image-constraints'
import {
  coverUrlSchema,
  createListQuerySchema,
  MAX_CONTENT_LEN,
  MAX_TAG_LEN,
  MAX_TAGS,
  mediaCreateBaseFields,
  mediaDateSchema,
  mediaUpdateBaseFields,
  personSchema,
} from './domains/schemas'
import { DOMAIN_TYPES } from './domains/config'

// 상수 단일 정의처는 domains/schemas.ts — 여기서는 재export만 (이중 정의 금지)
export { MAX_TAGS, MAX_TAG_LEN, MAX_CONTENT_LEN } from './domains/schemas'

export const MAX_SEARCH_Q = 100
export const MAX_SLUG_LEN = 80
export const MAX_EXTERNAL_IDS = 50

// 글방(writings)은 미디어 base 필드를 공유하지 않으므로 tags 스키마를 로컬 정의로 유지.
const tagsArraySchema = z
  .array(z.string().max(MAX_TAG_LEN, '태그는 최대 30자입니다'))
  .max(MAX_TAGS, '태그는 최대 20개까지 등록할 수 있습니다')

// 글방 cover는 항상 업로드된 Vercel Blob URL — 외부 URL은 next/image allow-list 밖이라
// 렌더 시 400. 직접 API 호출 방어를 위해 managed Blob host로 제한 (books/movies는
// 외부 cover라 공유 coverUrlSchema 그대로 사용).
const writingCoverUrlSchema = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => isManagedBlobUrl(u), { message: '업로드된 이미지만 사용할 수 있습니다' })
  .nullable()
  .optional()

// 저장 전 canonical 13자리로 정규화 — 수동 입력 10자리가 works 집계 버킷을 가르지 않게 함.
// .optional()을 .transform() 뒤에 둬야 최상위가 ZodOptional로 유지돼 추론 시 키가 optional이 됨.
// (.optional().transform() 순서면 ZodEffects가 최상위라 키가 required로 잘못 추론됨)
const isbnSchema = z
  .string()
  .trim()
  .max(40)
  .nullable()
  .transform((v) => (v ? canonicalIsbn(v) : v))
  .optional()

export const CreateBookSchema = z
  .object({
    ...mediaCreateBaseFields,
    author: personSchema('작가를 입력하세요'),
    genre: z.enum(BOOK_GENRES),
    readDate: mediaDateSchema,
    isbn: isbnSchema,
    externalSource: z.enum(['naver']).nullable().optional(),
  })
  .strict()

export type CreateBookInput = z.infer<typeof CreateBookSchema>

// UpdateBookSchema: all fields optional, no defaults — so parse({}) returns {}
export const UpdateBookSchema = z
  .object({
    ...mediaUpdateBaseFields,
    author: personSchema('작가를 입력하세요').optional(),
    genre: z.enum(BOOK_GENRES).optional(),
    readDate: mediaDateSchema.optional(),
    isbn: isbnSchema,
    externalSource: z.enum(['naver']).nullable().optional(),
  })
  .strict()

export type UpdateBookInput = z.infer<typeof UpdateBookSchema>

export const CreateMovieSchema = z
  .object({
    ...mediaCreateBaseFields,
    director: personSchema('감독을 입력하세요'),
    genre: z.enum(MOVIE_GENRES),
    watchedDate: mediaDateSchema,
    tmdbId: z.number().int().positive().nullable().optional(),
    externalSource: z.enum(['tmdb']).nullable().optional(),
  })
  .strict()

export type CreateMovieInput = z.infer<typeof CreateMovieSchema>

export const UpdateMovieSchema = z
  .object({
    ...mediaUpdateBaseFields,
    director: personSchema('감독을 입력하세요').optional(),
    genre: z.enum(MOVIE_GENRES).optional(),
    watchedDate: mediaDateSchema.optional(),
    tmdbId: z.number().int().positive().nullable().optional(),
    externalSource: z.enum(['tmdb']).nullable().optional(),
  })
  .strict()

export type UpdateMovieInput = z.infer<typeof UpdateMovieSchema>

export const ListMoviesQuerySchema = createListQuerySchema(MOVIE_GENRES, MAX_SEARCH_Q)

export const CreateGameSchema = z
  .object({
    ...mediaCreateBaseFields,
    developer: personSchema('개발사를 입력하세요'),
    genre: z.enum(GAME_GENRES),
    playedDate: mediaDateSchema,
    rawgId: z.number().int().positive().nullable().optional(),
    externalSource: z.enum(['rawg']).nullable().optional(),
  })
  .strict()

export type CreateGameInput = z.infer<typeof CreateGameSchema>

export const UpdateGameSchema = z
  .object({
    ...mediaUpdateBaseFields,
    developer: personSchema('개발사를 입력하세요').optional(),
    genre: z.enum(GAME_GENRES).optional(),
    playedDate: mediaDateSchema.optional(),
    rawgId: z.number().int().positive().nullable().optional(),
    externalSource: z.enum(['rawg']).nullable().optional(),
  })
  .strict()

export type UpdateGameInput = z.infer<typeof UpdateGameSchema>

export const ListGamesQuerySchema = createListQuerySchema(GAME_GENRES, MAX_SEARCH_Q)

export const FeedQuerySchema = z.object({
  type: z.enum(DOMAIN_TYPES).default('book'),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
})

export const WorksSearchQuerySchema = z.object({
  type: z.enum(DOMAIN_TYPES).default('book'),
  q: z.string().trim().min(1).max(MAX_SEARCH_Q),
  page: z.coerce.number().int().min(1).max(10_000).optional(),
})

export const PageParamSchema = z.coerce.number().int().min(1).max(10_000).catch(1)

// API [id] 라우트 공용 — 양의 safe integer만 유효한 리소스 id
export function isValidId(n: number): boolean {
  return Number.isSafeInteger(n) && n > 0
}

export const IsbnParamSchema = z.string().regex(/^\d{10}(\d{3})?$/)
export const TmdbIdParamSchema = z.coerce.number().int().positive()
export const RawgIdParamSchema = z.coerce.number().int().positive()

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
    coverUrl: writingCoverUrlSchema,
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
    coverUrl: writingCoverUrlSchema,
  })
  .strict()

export type UpdateWritingInput = z.infer<typeof UpdateWritingSchema>

/** GET /api/books?... 쿼리스트링 검증 — 길이/범위 가드. */
export const ListBooksQuerySchema = createListQuerySchema(BOOK_GENRES, MAX_SEARCH_Q)

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
  MAX_EXTERNAL_IDS,
} as const

export const ExternalSearchQuerySchema = z.object({
  q: z.string().trim().min(2, '검색어는 2자 이상').max(80, '검색어는 80자 이하'),
})

export const ExternalIdsQuerySchema = z.object({
  ids: z
    .string()
    .min(1)
    .transform((s) =>
      Array.from(
        new Set(
          s
            .split(',')
            .map((x) => x.trim())
            .filter((x) => x.length > 0),
        ),
      ),
    )
    .refine((arr) => arr.length >= 1 && arr.length <= MAX_EXTERNAL_IDS, {
      message: `id는 1~${MAX_EXTERNAL_IDS}개`,
    }),
})
