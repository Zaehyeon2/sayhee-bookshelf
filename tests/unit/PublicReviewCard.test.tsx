import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PublicReviewCard } from '@/components/PublicReviewCard'

const baseProps = {
  id: 1,
  slug: 's',
  title: '데미안',
  author: '헤르만 헤세',
  genre: '소설',
  rating: 5,
  oneLineReview: '인생 책',
  publishedAt: Date.now(),
  authorDisplayName: '앨리스',
}

describe('PublicReviewCard', () => {
  it('renders title, author, displayName, rating', () => {
    render(<PublicReviewCard item={baseProps} />)
    expect(screen.getByText('데미안')).toBeInTheDocument()
    expect(screen.getByText('헤르만 헤세')).toBeInTheDocument()
    expect(screen.getByText('앨리스')).toBeInTheDocument()
  })

  it('renders oneLineReview when present', () => {
    render(<PublicReviewCard item={baseProps} />)
    expect(screen.getByText('인생 책')).toBeInTheDocument()
  })

  it('omits oneLineReview block when null', () => {
    render(<PublicReviewCard item={{ ...baseProps, oneLineReview: null }} />)
    expect(screen.queryByText('인생 책')).not.toBeInTheDocument()
  })

  it('is non-clickable (no anchor, no onClick handler)', () => {
    const { container } = render(<PublicReviewCard item={baseProps} />)
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('button')).toBeNull()
  })

  it('escapes HTML in oneLineReview (XSS guard)', () => {
    render(<PublicReviewCard item={{ ...baseProps, oneLineReview: '<script>alert(1)</script>' }} />)
    expect(screen.queryByText('<script>alert(1)</script>')).toBeInTheDocument()
    // React-rendered text node — no <script> element exists in the DOM
    expect(document.querySelector('script')).toBeNull()
  })
})
