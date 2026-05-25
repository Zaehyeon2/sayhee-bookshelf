import { notFound } from 'next/navigation'
import { db } from '@/lib/db/client'
import { getBookBySlug } from '@/lib/db/queries'
import { GenreBadge } from '@/components/GenreBadge'
import { RatingStars } from '@/components/RatingStars'
import { MarkdownViewer } from '@/components/MarkdownViewer'
import Link from 'next/link'

export default async function BookDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const book = await getBookBySlug(db, decodeURIComponent(slug))
  if (!book) notFound()

  return (
    <article className="prose max-w-none">
      <header className="not-prose mb-6">
        <div className="flex items-center gap-2">
          <GenreBadge genre={book.genre} />
          <time className="text-sm text-neutral-500">{book.readDate}</time>
        </div>
        <h1 className="mt-2 text-3xl font-bold">{book.title}</h1>
        <p className="mt-1 text-lg text-neutral-700">{book.author}</p>
        <div className="mt-2"><RatingStars value={book.rating} /></div>
        {book.tags.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {book.tags.map((t) => (
              <li key={t}>
                <Link href={`/books?tag=${encodeURIComponent(t)}`} className="text-sm text-neutral-500 hover:text-neutral-800">
                  #{t}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </header>
      {book.content ? (
        <MarkdownViewer initialValue={book.content} />
      ) : (
        <p className="text-neutral-500">본문이 없습니다.</p>
      )}
    </article>
  )
}
