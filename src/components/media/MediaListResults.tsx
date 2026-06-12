import Link from 'next/link'
import { db } from '@/lib/db/client'
import { SearchBox } from '@/components/SearchBox'
import { Filters } from '@/components/Filters'
import { Pagination } from '@/components/Pagination'
import { excerpt } from '@/lib/excerpt'
import { EmptyState } from '@/components/EmptyState'
import { CardGridSkeleton } from '@/components/CardGridSkeleton'
import { Skeleton } from '@/components/Skeleton'
import { StatsPageLink } from '@/components/StatsPageLink'
import { MEDIA_PAGE_SIZE as PAGE_SIZE } from '@/lib/domains/config'
import type { MediaPageConfig } from './mediaPageConfig'

type ListSP = {
  genre?: string
  tag?: string
  year?: string
  q?: string
  sort?: string
  page?: string
}

export function MediaResultsSkeleton() {
  return (
    <>
      <div className="flex items-baseline justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-5 w-10" />
      </div>
      <CardGridSkeleton />
    </>
  )
}

function Controls<Row extends { id: number; slug: string }>({
  config,
}: {
  config: MediaPageConfig<Row>
}) {
  return (
    <>
      <SearchBox basePath={config.basePath} placeholder={config.searchPlaceholder} />
      <Filters basePath={config.basePath} genres={config.genres} />
    </>
  )
}

async function Results<Row extends { id: number; slug: string; title: string; rating: number }>({
  config,
  sp,
  userId,
}: {
  config: MediaPageConfig<Row>
  sp: ListSP
  userId: number
}) {
  const parsed = config.listQuerySchema.safeParse(sp)
  const validated = parsed.success ? parsed.data : {}
  const page = validated.page ?? 1
  const q = validated.q?.trim() ?? ''
  const isSearch = q.length > 0
  const offset = (page - 1) * PAGE_SIZE

  let items: Row[]
  let total: number

  if (isSearch) {
    const [list, count] = await Promise.all([
      config.queries.search(db, userId, q, { limit: PAGE_SIZE, offset }),
      config.queries.countSearch(db, userId, q),
    ])
    items = list
    total = count
  } else {
    // tagId 선조회 1회 — list/count가 같은 tag lookup을 반복하지 않게 (API route와 동일 패턴, 백로그 8)
    const tagId = validated.tag ? await config.queries.resolveTagId(db, validated.tag) : undefined
    const filters = {
      genre: validated.genre,
      tag: validated.tag,
      year: validated.year,
      sort: validated.sort ?? ('date' as const),
      tagId,
    }
    const [list, count] = await Promise.all([
      config.queries.list(db, userId, { ...filters, limit: PAGE_SIZE, offset }),
      config.queries.count(db, userId, {
        genre: filters.genre,
        tag: filters.tag,
        year: filters.year,
        tagId,
      }),
    ])
    items = list
    total = count
  }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const title = isSearch
    ? `"${q}" 검색 결과`
    : validated.genre
      ? `장르 · ${validated.genre}`
      : validated.tag
        ? `태그 · ${validated.tag}`
        : config.allTitle

  return (
    <>
      <div className="flex items-baseline justify-between">
        <h2 className="text-[22px] font-bold text-[var(--color-text-strong)]">{title}</h2>
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-[var(--color-text-weak)] font-tabular">
            {total}
            {config.countUnit}
          </span>
          <StatsPageLink href={`${config.basePath}/stats`} />
          <Link
            href={`${config.basePath}/new`}
            className="inline-flex items-center h-9 px-3 rounded-[var(--radius-field)] bg-[var(--color-accent)] text-white text-[13px] font-semibold hover:bg-[var(--color-accent-hover)] active:scale-[0.97] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            {config.newLabel}
          </Link>
        </div>
      </div>
      {items.length === 0 ? (
        isSearch ? (
          <EmptyState
            emoji={config.emptySearch.emoji}
            title={config.emptySearch.title}
            description={config.emptySearch.description(q)}
          />
        ) : (
          <EmptyState
            emoji={config.emptyList.emoji}
            title={config.emptyList.title}
            description={config.emptyList.description}
            action={{ href: `${config.basePath}/new`, label: config.emptyList.actionLabel }}
          />
        )
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {items.map((item) => {
              // 검색어가 제목·인물에 안 잡히면 본문 매치 — 그때만 발췌 스니펫 표시
              const matchesMeta =
                !isSearch ||
                item.title.toLowerCase().includes(q.toLowerCase()) ||
                config.personOf(item).toLowerCase().includes(q.toLowerCase())
              const snippet = matchesMeta
                ? undefined
                : (excerpt(config.contentOf(item), q) ?? undefined)
              return config.renderCard({
                key: item.id,
                item,
                snippet,
                query: isSearch ? q : undefined,
              })
            })}
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath={config.basePath}
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
    </>
  )
}

export const MediaListPageBody = { Controls, Results }
