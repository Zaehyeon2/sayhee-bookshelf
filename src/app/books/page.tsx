import { Suspense } from 'react'
import { db } from '@/lib/db/client'
import { listBooks, searchBooks } from '@/lib/db/queries'
import { BookCard } from '@/components/BookCard'
import { SearchBox } from '@/components/SearchBox'
import { Filters } from '@/components/Filters'
import { excerpt } from '@/lib/excerpt'
import { EmptyState } from '@/components/EmptyState'

function parseYear(value: string | undefined): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

interface SP {
  searchParams: Promise<{ genre?: string; tag?: string; year?: string; q?: string; sort?: string }>
}

export default async function BooksPage({ searchParams }: SP) {
  const sp = await searchParams
  let books
  if (sp.q && sp.q.trim()) {
    books = await searchBooks(db, sp.q.trim())
  } else {
    books = await listBooks(db, {
      genre: sp.genre,
      tag: sp.tag,
      year: parseYear(sp.year),
      sort: sp.sort === 'rating' ? 'rating' : 'date',
    })
  }

  const title =
    sp.q ? `"${sp.q}" 검색 결과`
    : sp.genre ? `장르 · ${sp.genre}`
    : sp.tag ? `태그 · ${sp.tag}`
    : '전체 책'

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <SearchBox />
        <Filters />
      </Suspense>
      <div className="flex items-baseline justify-between">
        <h2 className="text-[22px] font-bold text-[var(--color-text-strong)]">{title}</h2>
        <span className="text-[13px] text-[var(--color-text-weak)] font-tabular">{books.length}권</span>
      </div>
      {books.length === 0 ? (
        sp.q ? (
          <EmptyState
            emoji="🔍"
            title="찾는 책이 없어요"
            description={`'${sp.q}' 와 일치하는 결과가 없습니다`}
          />
        ) : (
          <EmptyState
            emoji="📭"
            title="아직 책이 없어요"
            description="첫 독후감을 남겨보세요"
            action={{ href: '/admin/new', label: '새 독후감' }}
          />
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {books.map((b) => {
            const q = sp.q?.trim()
            // Show a body snippet only when title/author didn't already match —
            // otherwise the snippet would be noise next to a self-explanatory hit.
            const matchesMeta = q
              ? b.title.toLowerCase().includes(q.toLowerCase()) ||
                b.author.toLowerCase().includes(q.toLowerCase())
              : true
            const snippet = q && !matchesMeta ? excerpt(b.content, q) ?? undefined : undefined
            return <BookCard key={b.id} book={b} snippet={snippet} query={q} />
          })}
        </div>
      )}
    </div>
  )
}
