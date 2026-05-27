import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GenreBadge } from '@/components/GenreBadge'
import { RatingStars } from '@/components/RatingStars'

describe('GenreBadge', () => {
  it('장르 이름을 표시한다', () => {
    render(<GenreBadge genre="소설" />)
    expect(screen.getByText('소설')).toBeDefined()
  })
})

describe('RatingStars', () => {
  it('aria-label에 반쪽별 점수가 노출된다 (value=3 → 1.5/5)', () => {
    const { container } = render(<RatingStars value={3} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('aria-label')).toBe('별점 1.5/5')
  })

  it('value=10이면 5점 만점', () => {
    const { container } = render(<RatingStars value={10} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('aria-label')).toBe('별점 5/5')
  })

  it('value=1이면 반쪽 별 하나만', () => {
    const { container } = render(<RatingStars value={1} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('aria-label')).toBe('별점 0.5/5')
  })

  it('non-editable 모드에서는 버튼이 없다', () => {
    const { container } = render(<RatingStars value={4} />)
    expect(container.querySelectorAll('button').length).toBe(0)
  })

  it('editable 모드에서는 반쪽별마다 클릭존이 있다 (5 stars × 2)', () => {
    const { container } = render(<RatingStars value={4} onChange={() => {}} />)
    expect(container.querySelectorAll('button').length).toBe(10)
  })
})
