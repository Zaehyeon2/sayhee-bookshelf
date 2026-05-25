import { describe, it, expect } from 'vitest'
import { toSlug, uniqueSlug } from '@/lib/slug'

describe('toSlug', () => {
  it('영문은 소문자 + 하이픈으로 변환', () => {
    expect(toSlug('The Stranger')).toBe('the-stranger')
  })
  it('한글은 유지하고 공백만 하이픈으로', () => {
    expect(toSlug('이방인 카뮈')).toBe('이방인-카뮈')
  })
  it('특수문자는 제거', () => {
    expect(toSlug('Hello, World!')).toBe('hello-world')
  })
  it('연속 하이픈은 한 번으로 압축', () => {
    expect(toSlug('a  --  b')).toBe('a-b')
  })
  it('앞뒤 하이픈은 제거', () => {
    expect(toSlug('-test-')).toBe('test')
  })
  it('빈 문자열은 "untitled"', () => {
    expect(toSlug('')).toBe('untitled')
    expect(toSlug('!!!')).toBe('untitled')
  })
  it('50자로 자른다', () => {
    expect(toSlug('a'.repeat(100)).length).toBeLessThanOrEqual(50)
  })
})

describe('uniqueSlug', () => {
  it('중복 없으면 그대로', () => {
    expect(uniqueSlug('foo', [])).toBe('foo')
  })
  it('중복이면 -2 접미사', () => {
    expect(uniqueSlug('foo', ['foo'])).toBe('foo-2')
  })
  it('-2도 있으면 -3', () => {
    expect(uniqueSlug('foo', ['foo', 'foo-2'])).toBe('foo-3')
  })
})
