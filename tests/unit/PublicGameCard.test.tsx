import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PublicGameCard } from '@/components/PublicGameCard'

const baseProps = {
  id: 1,
  slug: 's',
  title: '엘든 링',
  developer: '프롬소프트웨어',
  genre: 'RPG',
  rating: 5,
  oneLineReview: '시간이 흐른다',
  coverUrl: null,
  rawgId: 157336,
  publishedAt: Date.now(),
  authorDisplayName: '앨리스',
}

describe('PublicGameCard', () => {
  it('renders title, developer, displayName, rating', () => {
    render(<PublicGameCard item={baseProps} />)
    expect(screen.getByText('엘든 링')).toBeInTheDocument()
    expect(screen.getByText('프롬소프트웨어')).toBeInTheDocument()
    expect(screen.getByText('앨리스')).toBeInTheDocument()
  })

  it('renders oneLineReview when present', () => {
    render(<PublicGameCard item={baseProps} />)
    expect(screen.getByText('시간이 흐른다')).toBeInTheDocument()
  })

  it('omits oneLineReview block when null', () => {
    render(<PublicGameCard item={{ ...baseProps, oneLineReview: null }} />)
    expect(screen.queryByText('시간이 흐른다')).not.toBeInTheDocument()
  })

  it('clickable — navigates to detail page when rawgId is present', () => {
    const { container } = render(<PublicGameCard item={baseProps} />)
    const anchor = container.querySelector('a')
    expect(anchor).not.toBeNull()
    expect(anchor!.getAttribute('href')).toBe('/works/game/157336')
  })

  it('clickable — falls back to /works search when rawgId is null', () => {
    const { container } = render(<PublicGameCard item={{ ...baseProps, rawgId: null }} />)
    const anchor = container.querySelector('a')
    expect(anchor!.getAttribute('href')).toBe(
      `/works?type=game&q=${encodeURIComponent('엘든 링')}`,
    )
  })

  it('escapes HTML in oneLineReview (XSS guard)', () => {
    render(<PublicGameCard item={{ ...baseProps, oneLineReview: '<script>alert(1)</script>' }} />)
    expect(screen.queryByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
  })

  it('renders oneLineReview inside a <blockquote> when present', () => {
    const { container } = render(<PublicGameCard item={baseProps} />)
    const bq = container.querySelector('blockquote')
    expect(bq).not.toBeNull()
    expect(bq!.textContent).toContain('시간이 흐른다')
  })

  it('omits <blockquote> when oneLineReview is null', () => {
    const { container } = render(<PublicGameCard item={{ ...baseProps, oneLineReview: null }} />)
    expect(container.querySelector('blockquote')).toBeNull()
  })
})
