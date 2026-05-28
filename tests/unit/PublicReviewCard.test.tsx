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
  coverUrl: null,
  isbn: '9788937460449',
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

  it('clickable — navigates to detail page when isbn is present', () => {
    const { container } = render(<PublicReviewCard item={baseProps} />)
    const anchor = container.querySelector('a')
    expect(anchor).not.toBeNull()
    expect(anchor!.getAttribute('href')).toBe('/works/book/9788937460449')
  })

  it('clickable — falls back to /works search when isbn is null', () => {
    const { container } = render(<PublicReviewCard item={{ ...baseProps, isbn: null }} />)
    const anchor = container.querySelector('a')
    expect(anchor!.getAttribute('href')).toBe(
      `/works?type=book&q=${encodeURIComponent('데미안')}`,
    )
  })

  it('escapes HTML in oneLineReview (XSS guard)', () => {
    render(<PublicReviewCard item={{ ...baseProps, oneLineReview: '<script>alert(1)</script>' }} />)
    expect(screen.queryByText('<script>alert(1)</script>')).toBeInTheDocument()
    // React-rendered text node — no <script> element exists in the DOM
    expect(document.querySelector('script')).toBeNull()
  })

  it('renders oneLineReview inside a <blockquote> when present', () => {
    const { container } = render(<PublicReviewCard item={baseProps} />)
    const bq = container.querySelector('blockquote')
    expect(bq).not.toBeNull()
    expect(bq!.textContent).toContain('인생 책')
  })

  it('omits <blockquote> when oneLineReview is null', () => {
    const { container } = render(<PublicReviewCard item={{ ...baseProps, oneLineReview: null }} />)
    expect(container.querySelector('blockquote')).toBeNull()
  })
})
