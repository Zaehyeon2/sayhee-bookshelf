import { z } from 'zod'
import { GENRES } from './genres'

const dateRe = /^\d{4}-\d{2}-\d{2}$/

export const CreateBookSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력하세요').max(200),
  author: z.string().trim().min(1, '작가를 입력하세요').max(100),
  genre: z.enum(GENRES),
  readDate: z.string().regex(dateRe, '날짜 형식은 YYYY-MM-DD'),
  rating: z.number().int().min(1).max(5),
  content: z.string().default(''),
  tags: z
    .array(z.string())
    .default([])
    .transform((arr) =>
      Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0)))
    ),
})

export type CreateBookInput = z.infer<typeof CreateBookSchema>

// UpdateBookSchema: all fields optional, no defaults — so parse({}) returns {}
export const UpdateBookSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력하세요').max(200).optional(),
  author: z.string().trim().min(1, '작가를 입력하세요').max(100).optional(),
  genre: z.enum(GENRES).optional(),
  readDate: z.string().regex(dateRe, '날짜 형식은 YYYY-MM-DD').optional(),
  rating: z.number().int().min(1).max(5).optional(),
  content: z.string().optional(),
  tags: z
    .array(z.string())
    .transform((arr) =>
      Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0)))
    )
    .optional(),
})

export type UpdateBookInput = z.infer<typeof UpdateBookSchema>

export const LoginSchema = z.object({
  password: z.string().min(1),
})
