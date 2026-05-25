import { db } from '@/lib/db/client'
import { listBooks, searchBooks } from '@/lib/db/queries'
import { BookCard } from '@/components/BookCard'
import { SearchBox } from '@/components/SearchBox'
import { Filters } from '@/components/Filters'

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
    : sp.genre ? `장르: ${sp.genre}`
    : sp.tag ? `태그: ${sp.tag}`
    : '전체 책'

  return (
    <div className="space-y-6">
      <SearchBox />
      <Filters />
      <h2 className="text-xl font-semibold">
        {title}
        <span className="ml-2 text-sm font-normal text-neutral-500">({books.length}권)</span>
      </h2>
      {books.length === 0 ? (
        <p className="text-neutral-500">결과가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {books.map((b) => <BookCard key={b.id} book={b} />)}
        </div>
      )}
    </div>
  )
}
