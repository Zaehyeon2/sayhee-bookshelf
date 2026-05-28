import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PublicMovieCard } from '@/components/PublicMovieCard'

const baseProps = {
  id: 1,
  slug: 's',
  title: '인터스텔라',
  director: '크리스토퍼 놀란',
  genre: 'SF',
  rating: 5,
  oneLineReview: '시간이 흐른다',
  coverUrl: null,
  publishedAt: Date.now(),
  authorDisplayName: '앨리스',
}

describe('PublicMovieCard', () => {
  it('renders title, director, displayName, rating', () => {
    render(<PublicMovieCard item={baseProps} />)
    expect(screen.getByText('인터스텔라')).toBeInTheDocument()
    expect(screen.getByText('크리스토퍼 놀란')).toBeInTheDocument()
    expect(screen.getByText('앨리스')).toBeInTheDocument()
  })

  it('renders oneLineReview when present', () => {
    render(<PublicMovieCard item={baseProps} />)
    expect(screen.getByText('시간이 흐른다')).toBeInTheDocument()
  })

  it('omits oneLineReview block when null', () => {
    render(<PublicMovieCard item={{ ...baseProps, oneLineReview: null }} />)
    expect(screen.queryByText('시간이 흐른다')).not.toBeInTheDocument()
  })

  it('is clickable — wraps in anchor with /works movie search href', () => {
    const { container } = render(<PublicMovieCard item={baseProps} />)
    const anchor = container.querySelector('a')
    expect(anchor).not.toBeNull()
    expect(anchor!.getAttribute('href')).toBe(
      `/works?type=movie&q=${encodeURIComponent('인터스텔라')}`
    )
  })

  it('escapes HTML in oneLineReview (XSS guard)', () => {
    render(<PublicMovieCard item={{ ...baseProps, oneLineReview: '<script>alert(1)</script>' }} />)
    expect(screen.queryByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
  })

  it('renders oneLineReview inside a <blockquote> when present', () => {
    const { container } = render(<PublicMovieCard item={baseProps} />)
    const bq = container.querySelector('blockquote')
    expect(bq).not.toBeNull()
    expect(bq!.textContent).toContain('시간이 흐른다')
  })

  it('omits <blockquote> when oneLineReview is null', () => {
    const { container } = render(<PublicMovieCard item={{ ...baseProps, oneLineReview: null }} />)
    expect(container.querySelector('blockquote')).toBeNull()
  })
})
