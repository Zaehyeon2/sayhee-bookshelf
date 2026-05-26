import { describe, it, expect } from 'vitest'
import {
  LoginSchema,
  ChangePasswordSchema,
  CreateUserSchema,
  UpdateProfileSchema,
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
    expect(CreateUserSchema.safeParse({ username: 'sehee', displayName: '세희' }).success).toBe(true)
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
