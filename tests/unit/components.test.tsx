import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GenreBadge } from '@/components/GenreBadge'
import { RatingStars } from '@/components/RatingStars'
import { Filters } from '@/components/Filters'
import { BOOK_GENRES, MOVIE_GENRES } from '@/lib/genres'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

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

describe('Filters', () => {
  it('renders given movie genres as chips', () => {
    render(<Filters basePath="/movies" genres={MOVIE_GENRES} />)
    expect(screen.getByText('액션')).toBeInTheDocument()
    expect(screen.queryByText('소설')).toBeNull()
  })

  it('book mode renders book genres', () => {
    render(<Filters basePath="/books" genres={BOOK_GENRES} />)
    expect(screen.getByText('소설')).toBeInTheDocument()
    expect(screen.queryByText('액션')).toBeNull()
  })
})
