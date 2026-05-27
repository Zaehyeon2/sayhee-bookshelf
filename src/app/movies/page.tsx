import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db/client'
import { countMovies, countSearchMovies, listMovies, searchMovies } from '@/lib/db/queries'
import { MovieCard } from '@/components/MovieCard'
import { SearchBox } from '@/components/SearchBox'
import { Filters } from '@/components/Filters'
import { Pagination } from '@/components/Pagination'
import { excerpt } from '@/lib/excerpt'
import { EmptyState } from '@/components/EmptyState'
import { getCurrentUser } from '@/lib/auth'
import { MOVIE_GENRES } from '@/lib/genres'

const PAGE_SIZE = 24

function parseYear(value: string | undefined): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function parsePage(value: string | undefined): number {
  if (!value) return 1
  const n = Number(value)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

interface SP {
  searchParams: Promise<{
    genre?: string
    tag?: string
    year?: string
    q?: string
    sort?: string
    page?: string
  }>
}

export default async function MoviesPage({ searchParams }: SP) {
  const me = await getCurrentUser()
  if (!me) redirect('/login?next=/movies')
  const sp = await searchParams
  const page = parsePage(sp.page)
  const q = sp.q?.trim() ?? ''
  const isSearch = q.length > 0
  const offset = (page - 1) * PAGE_SIZE

  let movies
  let total: number

  if (isSearch) {
    const [list, count] = await Promise.all([
      searchMovies(db, me.id, q, { limit: PAGE_SIZE, offset }),
      countSearchMovies(db, me.id, q),
    ])
    movies = list
    total = count
  } else {
    const filters = {
      genre: sp.genre,
      tag: sp.tag,
      year: parseYear(sp.year),
      sort: sp.sort === 'rating' ? ('rating' as const) : ('date' as const),
    }
    const [list, count] = await Promise.all([
      listMovies(db, me.id, { ...filters, limit: PAGE_SIZE, offset }),
      countMovies(db, me.id, { genre: filters.genre, tag: filters.tag, year: filters.year }),
    ])
    movies = list
    total = count
  }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const title = sp.q
    ? `"${sp.q}" 검색 결과`
    : sp.genre
      ? `장르 · ${sp.genre}`
      : sp.tag
        ? `태그 · ${sp.tag}`
        : '전체 영화'

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <SearchBox />
        <Filters basePath="/movies" genres={MOVIE_GENRES} />
      </Suspense>
      <div className="flex items-baseline justify-between">
        <h2 className="text-[22px] font-bold text-[var(--color-text-strong)]">{title}</h2>
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-[var(--color-text-weak)] font-tabular">{total}편</span>
          <Link
            href="/movies/new"
            className="inline-flex items-center h-9 px-3 rounded-[var(--radius-toss-sm)] bg-[var(--color-toss-blue)] text-white text-[13px] font-semibold hover:bg-[var(--color-toss-blue-hover)] active:scale-[0.97] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50"
          >
            새 영화
          </Link>
        </div>
      </div>
      {movies.length === 0 ? (
        isSearch ? (
          <EmptyState
            emoji="🔍"
            title="찾는 영화가 없어요"
            description={`'${q}' 와 일치하는 결과가 없습니다`}
          />
        ) : (
          <EmptyState
            emoji="🎬"
            title="아직 영화가 없어요"
            description="첫 감상을 남겨보세요"
            action={{ href: '/movies/new', label: '새 감상' }}
          />
        )
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {movies.map((m) => {
              const matchesMeta = isSearch
                ? m.title.toLowerCase().includes(q.toLowerCase()) ||
                  m.director.toLowerCase().includes(q.toLowerCase())
                : true
              const snippet =
                isSearch && !matchesMeta ? (excerpt(m.content, q) ?? undefined) : undefined
              return (
                <MovieCard key={m.id} movie={m} snippet={snippet} query={isSearch ? q : undefined} />
              )
            })}
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/movies"
            preservedQuery={{
              genre: sp.genre,
              tag: sp.tag,
              year: sp.year,
              sort: sp.sort,
              q: isSearch ? q : undefined,
            }}
          />
        </>
      )}
    </div>
  )
}
