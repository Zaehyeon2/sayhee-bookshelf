import { z } from 'zod'

const dateRe = /^\d{4}-\d{2}-\d{2}$/

export const MAX_TAGS = 20
export const MAX_TAG_LEN = 30
export const MAX_CONTENT_LEN = 50_000

const tagsArraySchema = z
  .array(z.string().max(MAX_TAG_LEN, '태그는 최대 30자입니다'))
  .max(MAX_TAGS, '태그는 최대 20개까지 등록할 수 있습니다')

const dedupeTags = (arr: string[]) =>
  Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0)))

export const coverUrlSchema = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), { message: 'http/https URL만 허용됩니다' })
  .nullable()
  .optional()

export const mediaDateSchema = z.string().regex(dateRe, '날짜 형식은 YYYY-MM-DD')

export const personSchema = (message: string) => z.string().trim().min(1, message).max(100)

/** Create 스키마 공통 필드 — 도메인 파일이 spread 후 person/date/genre/externalId를 extend */
export const mediaCreateBaseFields = {
  title: z.string().trim().min(1, '제목을 입력하세요').max(200),
  rating: z.number().int().min(1).max(10),
  content: z.string().max(MAX_CONTENT_LEN, '본문이 너무 깁니다').default(''),
  tags: tagsArraySchema.default([]).transform(dedupeTags),
  oneLineReview: z
    .string()
    .trim()
    .max(150, '한줄평은 150자 이내로 입력해주세요')
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  isPublic: z.boolean().optional().default(true),
  coverUrl: coverUrlSchema,
}

/** Update 스키마 공통 필드 — all optional, no defaults (parse({}) === {}) */
export const mediaUpdateBaseFields = {
  title: z.string().trim().min(1, '제목을 입력하세요').max(200).optional(),
  rating: z.number().int().min(1).max(10).optional(),
  content: z.string().max(MAX_CONTENT_LEN, '본문이 너무 깁니다').optional(),
  tags: tagsArraySchema.transform(dedupeTags).optional(),
  oneLineReview: z
    .string()
    .trim()
    .max(150, '한줄평은 150자 이내로 입력해주세요')
    .optional()
    .transform((v) => (v === undefined ? undefined : v.length > 0 ? v : null)),
  isPublic: z.boolean().optional(),
  coverUrl: coverUrlSchema,
}

/** 목록 쿼리스트링 스키마 — genre enum만 도메인별 (제네릭 함수라 추론 유지) */
export function createListQuerySchema<G extends readonly [string, ...string[]]>(
  genres: G,
  maxSearchQ: number,
) {
  return z.object({
    q: z.string().max(maxSearchQ).optional(),
    genre: z.enum(genres).optional(),
    tag: z.string().max(MAX_TAG_LEN).optional(),
    year: z.coerce.number().int().min(1900).max(2100).optional(),
    sort: z.enum(['date', 'rating']).optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional(),
  })
}
