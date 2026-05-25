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
  it('value 만큼 채워진 별을 렌더링', () => {
    const { container } = render(<RatingStars value={3} />)
    expect(container.querySelectorAll('[data-filled="true"]').length).toBe(3)
    expect(container.querySelectorAll('[data-filled="false"]').length).toBe(2)
  })
})
