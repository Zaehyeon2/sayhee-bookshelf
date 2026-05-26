import { z } from 'zod'
import { GENRES } from './genres'
import { isValidUsername } from './username-normalize'

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
    .transform((arr) => Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0)))),
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
    .transform((arr) => Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0))))
    .optional(),
})

export type UpdateBookInput = z.infer<typeof UpdateBookSchema>

export const LoginSchema = z.object({
  username: z.string().trim().min(2).max(20),
  password: z.string().min(8),
})

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    newPasswordConfirm: z.string().min(8),
  })
  .refine((d) => d.newPassword === d.newPasswordConfirm, {
    message: '새 비밀번호가 일치하지 않습니다',
    path: ['newPasswordConfirm'],
  })

export const CreateUserSchema = z.object({
  username: z.string().trim().refine(isValidUsername, '아이디는 2~20자, 공백·/·?·#·@·& 금지'),
  displayName: z.string().trim().min(1).max(30).optional(),
})

export const UpdateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(30),
})

export const CreateWritingSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력하세요').max(200),
  body: z.string().max(50000).default(''),
  tags: z
    .array(z.string())
    .default([])
    .transform((arr) => Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0)))),
})

export type CreateWritingInput = z.infer<typeof CreateWritingSchema>

export const UpdateWritingSchema = z.object({
  title: z.string().trim().min(1, '제목을 입력하세요').max(200).optional(),
  body: z.string().max(50000).optional(),
  tags: z
    .array(z.string())
    .transform((arr) => Array.from(new Set(arr.map((t) => t.trim()).filter((t) => t.length > 0))))
    .optional(),
})

export type UpdateWritingInput = z.infer<typeof UpdateWritingSchema>
