import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/lib/db/client'
import { getBookBySlug } from '@/lib/db/queries'
import { getCurrentUser } from '@/lib/auth'
import { MediaDetailArticle } from '@/components/media/MediaDetailArticle'
import { buildMediaMetadata, BOOKS_PAGE_CONFIG } from '@/components/media/mediaPageConfig'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const me = await getCurrentUser()
  if (!me) return {}
  const { slug } = await params
  const book = await getBookBySlug(db, me.id, decodeURIComponent(slug))
  if (!book) return { title: BOOKS_PAGE_CONFIG.notFoundTitle }
  return buildMediaMetadata(BOOKS_PAGE_CONFIG.metaOf(book))
}

export default async function BookDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const me = await getCurrentUser()
  if (!me) {
    const { slug } = await params
    redirect(`/login?next=/books/${slug}`)
  }
  const { slug } = await params
  const book = await getBookBySlug(db, me.id, decodeURIComponent(slug))
  if (!book) notFound()

  return (
    <MediaDetailArticle
      item={book}
      basePath={BOOKS_PAGE_CONFIG.basePath}
      person={BOOKS_PAGE_CONFIG.detail.personOf(book)}
      date={BOOKS_PAGE_CONFIG.detail.dateOf(book)}
      coverAltSuffix={BOOKS_PAGE_CONFIG.detail.coverAltSuffix}
      publicBadgeTitle={BOOKS_PAGE_CONFIG.detail.publicBadgeTitle}
    />
  )
}
