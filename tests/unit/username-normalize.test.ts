import { describe, it, expect } from 'vitest'
import { normalizeUsername, isValidUsername } from '@/lib/username-normalize'

describe('normalizeUsername', () => {
  it('lowercases ASCII', () => {
    expect(normalizeUsername('Sehee')).toBe('sehee')
  })
  it('trims whitespace', () => {
    expect(normalizeUsername('  sehee  ')).toBe('sehee')
  })
  it('NFC normalizes decomposed Hangul', () => {
    // 세 = 세 (Jamo NFD), 희 = 희 (Jamo NFD)
    const decomposed = '세희'
    expect(normalizeUsername(decomposed)).toBe('세희')
  })
  it('keeps composed Hangul as is', () => {
    expect(normalizeUsername('세희')).toBe('세희')
  })
})

describe('isValidUsername', () => {
  it('accepts 2~20 chars (Korean OK)', () => {
    expect(isValidUsername('세희')).toBe(true)
    expect(isValidUsername('sehee_2')).toBe(true)
    expect(isValidUsername('ab')).toBe(true) // exactly 2
    expect(isValidUsername('a'.repeat(20))).toBe(true) // exactly 20
  })
  it('rejects too short / too long', () => {
    expect(isValidUsername('a')).toBe(false)
    expect(isValidUsername('a'.repeat(21))).toBe(false)
  })
  it('rejects forbidden chars', () => {
    expect(isValidUsername('a b')).toBe(false) // space
    expect(isValidUsername('a/b')).toBe(false)
    expect(isValidUsername('a?b')).toBe(false)
    expect(isValidUsername('a#b')).toBe(false)
    expect(isValidUsername('a@b')).toBe(false)
    expect(isValidUsername('a&b')).toBe(false)
  })
})
