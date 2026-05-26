import { describe, it, expect } from 'vitest'
import { excerpt } from '@/lib/excerpt'

describe('excerpt', () => {
  it('매치 없으면 null', () => {
    expect(excerpt('헤세의 데미안에 대해', '카뮈')).toBeNull()
  })

  it('짧은 본문은 그대로 반환 (대소문자 무관)', () => {
    expect(excerpt('this is a Short body', 'short')).toBe('this is a Short body')
  })

  it('긴 본문에서 매치 부근만 잘라서 ellipsis 추가', () => {
    const long = `${'서론. '.repeat(50)}여기서 에피쿠로스를 만난다. ${'결론. '.repeat(50)}`
    const out = excerpt(long, '에피쿠로스', 60)
    expect(out).toBeTruthy()
    expect(out!.startsWith('…')).toBe(true)
    expect(out!.endsWith('…')).toBe(true)
    expect(out!.includes('에피쿠로스')).toBe(true)
  })

  it('마크다운 잡음 (#, *, ```) 제거', () => {
    const md = '# 제목\n\n**굵게** 그리고 *기울임*. ```code``` 그리고 _밑줄_.'
    const out = excerpt(md, '기울임')
    expect(out).toBeTruthy()
    expect(out!.includes('#')).toBe(false)
    expect(out!.includes('*')).toBe(false)
    expect(out!.includes('```')).toBe(false)
  })

  it('빈 본문이나 빈 쿼리는 null', () => {
    expect(excerpt('', 'q')).toBeNull()
    expect(excerpt('content', '')).toBeNull()
  })
})
