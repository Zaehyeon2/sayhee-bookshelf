import { describe, it, expect } from 'vitest'
import { CreateBookSchema, UpdateBookSchema } from '@/lib/validations'

const valid = {
  title: '이방인',
  author: '알베르 카뮈',
  genre: '소설',
  readDate: '2026-05-01',
  rating: 5,
  content: '인상 깊었다.',
  tags: ['실존주의', '여름'],
}

describe('CreateBookSchema', () => {
  it('유효한 입력 통과', () => {
    expect(CreateBookSchema.parse(valid)).toMatchObject(valid)
  })
  it('잘못된 장르 거부', () => {
    expect(() => CreateBookSchema.parse({ ...valid, genre: '경제경영' })).toThrow()
  })
  it('별점 범위 밖 거부', () => {
    expect(() => CreateBookSchema.parse({ ...valid, rating: 6 })).toThrow()
    expect(() => CreateBookSchema.parse({ ...valid, rating: 0 })).toThrow()
  })
  it('날짜 형식 강제', () => {
    expect(() => CreateBookSchema.parse({ ...valid, readDate: '2026/05/01' })).toThrow()
  })
  it('빈 제목 거부', () => {
    expect(() => CreateBookSchema.parse({ ...valid, title: '' })).toThrow()
  })
  it('태그 공백 trim + 중복 제거', () => {
    const r = CreateBookSchema.parse({ ...valid, tags: [' a ', 'a', 'b'] })
    expect(r.tags).toEqual(['a', 'b'])
  })
})

describe('UpdateBookSchema', () => {
  it('모든 필드 optional', () => {
    expect(UpdateBookSchema.parse({})).toEqual({})
    expect(UpdateBookSchema.parse({ rating: 3 })).toEqual({ rating: 3 })
  })
})
