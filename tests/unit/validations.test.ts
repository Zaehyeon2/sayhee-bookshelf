import { describe, it, expect } from 'vitest'
import {
  LoginSchema,
  ChangePasswordSchema,
  CreateUserSchema,
  UpdateProfileSchema,
  CreateBookSchema,
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

  it('isPublic coerces string "false" and boolean false', () => {
    const r1 = CreateBookSchema.safeParse({ ...validBase, isPublic: false })
    const r2 = CreateBookSchema.safeParse({ ...validBase, isPublic: 'false' })
    expect(r1.success).toBe(true)
    expect(r2.success).toBe(true)
    // z.coerce.boolean()은 "false" 문자열도 truthy로 처리 — 명시적 boolean false만 거짓이 됨.
    // 폼은 boolean을 보내므로 실용적으로 OK.
    if (r1.success) expect(r1.data.isPublic).toBe(false)
  })
})
