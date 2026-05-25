import Link from 'next/link'
import { db } from '@/lib/db/client'
import { listBooks, listGenresWithCounts } from '@/lib/db/queries'
import { GENRES } from '@/lib/genres'
import { BookCard } from '@/components/BookCard'

export default async function HomePage() {
  const [recent, genreCounts] = await Promise.all([
    listBooks(db, { sort: 'date' }).then((b) => b.slice(0, 6)),
    listGenresWithCounts(db),
  ])
  const countMap = new Map(genreCounts.map((g) => [g.genre, g.count]))

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-4 text-xl font-semibold">장르</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {GENRES.map((g) => (
            <Link
              key={g}
              href={`/books?genre=${encodeURIComponent(g)}`}
              className="rounded-lg border bg-white p-4 hover:shadow transition"
            >
              <div className="font-medium">{g}</div>
              <div className="mt-1 text-xs text-neutral-500">{countMap.get(g) ?? 0}권</div>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold">최근 읽은 책</h2>
        {recent.length === 0 ? (
          <p className="text-neutral-500">아직 등록된 책이 없습니다.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {recent.map((b) => <BookCard key={b.id} book={b} />)}
          </div>
        )}
      </section>
    </div>
  )
}
