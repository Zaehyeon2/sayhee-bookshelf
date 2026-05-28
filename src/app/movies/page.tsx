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
import { ListMoviesQuerySchema } from '@/lib/validations'

const PAGE_SIZE = 24

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
  // ListMoviesQuerySchema로 검증 — 잘못된 genre/year/page 등은 무시하고 기본값으로 fallback해
  // 페이지가 빈 결과로 깨지지 않게 한다. /api/movies와 검증 경계 일치.
  const parsed = ListMoviesQuerySchema.safeParse(sp)
  const validated = parsed.success ? parsed.data : {}
  const page = validated.page ?? 1
  const q = validated.q?.trim() ?? ''
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
      genre: validated.genre,
      tag: validated.tag,
      year: validated.year,
      sort: validated.sort ?? ('date' as const),
    }
    const [list, count] = await Promise.all([
      listMovies(db, me.id, { ...filters, limit: PAGE_SIZE, offset }),
      countMovies(db, me.id, { genre: filters.genre, tag: filters.tag, year: filters.year }),
    ])
    movies = list
    total = count
  }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const title = isSearch
    ? `"${q}" 검색 결과`
    : validated.genre
      ? `장르 · ${validated.genre}`
      : validated.tag
        ? `태그 · ${validated.tag}`
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
                <MovieCard
                  key={m.id}
                  movie={m}
                  snippet={snippet}
                  query={isSearch ? q : undefined}
                />
              )
            })}
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/movies"
            preservedQuery={{
              genre: validated.genre,
              tag: validated.tag,
              year: validated.year !== undefined ? String(validated.year) : undefined,
              sort: validated.sort,
              q: isSearch ? q : undefined,
            }}
          />
        </>
      )}
    </div>
  )
}
