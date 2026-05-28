import { describe, it, expect, vi, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GenreBadge } from '@/components/GenreBadge'
import { RatingStars } from '@/components/RatingStars'
import { Filters } from '@/components/Filters'
import { MovieCard } from '@/components/MovieCard'
import { PublicMovieCard } from '@/components/PublicMovieCard'
import { MovieForm } from '@/components/MovieForm'
import type { MovieWithTags } from '@/lib/db/queries'
import type { PublicMovieCard as PublicMovieItem } from '@/lib/db/queries'
import { BOOK_GENRES, MOVIE_GENRES } from '@/lib/genres'

vi.mock('@/components/MarkdownEditor', () => ({
  MarkdownEditor: vi.fn().mockImplementation(() => null),
}))

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

describe('MovieCard', () => {
  const movie: MovieWithTags = {
    id: 1,
    slug: 'inception',
    title: '인셉션',
    director: '크리스토퍼 놀란',
    genre: 'SF',
    watchedDate: '2026-01-15',
    rating: 9,
    content: '',
    oneLineReview: null,
    isPublic: 1,
    publishedAt: Date.now(),
    authorUserId: 1,
    tmdbId: null,
    coverUrl: null,
    externalSource: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: ['액션', '꿈'],
  }

  test('renders title, director, watchedDate', () => {
    render(<MovieCard movie={movie} />)
    expect(screen.getByText('인셉션')).toBeInTheDocument()
    expect(screen.getByText('크리스토퍼 놀란')).toBeInTheDocument()
    expect(screen.getByText('2026-01-15')).toBeInTheDocument()
  })

  test('links to /movies/[slug]', () => {
    render(<MovieCard movie={movie} />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/movies/inception')
  })

  test('shows public badge when isPublic=1', () => {
    render(<MovieCard movie={movie} />)
    expect(screen.getByText(/공개/)).toBeInTheDocument()
  })

  test('omits public badge when isPublic=0', () => {
    render(<MovieCard movie={{ ...movie, isPublic: 0 }} />)
    expect(screen.queryByText(/🌐/)).toBeNull()
  })

  test('renders up to 3 tags', () => {
    render(<MovieCard movie={{ ...movie, tags: ['a', 'b', 'c', 'd'] }} />)
    expect(screen.getByText(/#a/)).toBeInTheDocument()
    expect(screen.queryByText(/#d/)).toBeNull()
  })
})

describe('PublicMovieCard', () => {
  const item: PublicMovieItem = {
    id: 1,
    slug: 'inception',
    title: '인셉션',
    director: '크리스토퍼 놀란',
    genre: 'SF',
    rating: 9,
    oneLineReview: '꿈 안의 꿈',
    coverUrl: null,
    publishedAt: Date.now() - 60_000,
    authorDisplayName: '앨리스',
  }

  test('renders director (not author)', () => {
    render(<PublicMovieCard item={item} />)
    expect(screen.getByText('크리스토퍼 놀란')).toBeInTheDocument()
  })

  test('renders oneLineReview when present', () => {
    render(<PublicMovieCard item={item} />)
    expect(screen.getByText('꿈 안의 꿈')).toBeInTheDocument()
  })

  test('omits oneLineReview when null', () => {
    render(<PublicMovieCard item={{ ...item, oneLineReview: null }} />)
    expect(screen.queryByText('꿈 안의 꿈')).toBeNull()
  })

  test('renders authorDisplayName', () => {
    render(<PublicMovieCard item={item} />)
    expect(screen.getByText('앨리스')).toBeInTheDocument()
  })
})

describe('MovieForm', () => {
  test('create mode: isPublic defaults to true', () => {
    render(<MovieForm mode="create" />)
    const toggle = screen.getByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })

  test('create mode: rating defaults to 6 (half-star scale)', () => {
    render(<MovieForm mode="create" />)
    // RatingStars renders aria-label with the score; default rating=6 → 3/5
    const ratingEl = document.querySelector('[aria-label="별점 3/5"]')
    expect(ratingEl).not.toBeNull()
  })

  test('renders genre options from MOVIE_GENRES', () => {
    render(<MovieForm mode="create" />)
    // ExternalMovieSearchBar (cmdk) also registers a combobox role, so query
    // the native <select> tag explicitly rather than by role.
    const select = document.querySelector('select')
    expect(select).not.toBeNull()
    expect(screen.getByRole('option', { name: '액션' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '소설' })).toBeNull()
  })
})
