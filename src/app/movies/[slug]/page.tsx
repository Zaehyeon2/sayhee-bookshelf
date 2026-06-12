import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/lib/db/client'
import { getMovieBySlug } from '@/lib/db/queries'
import { getCurrentUser } from '@/lib/auth'
import { MediaDetailArticle } from '@/components/media/MediaDetailArticle'
import { buildMediaMetadata, MOVIES_PAGE_CONFIG } from '@/components/media/mediaPageConfig'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const me = await getCurrentUser()
  if (!me) return {}
  const { slug } = await params
  const movie = await getMovieBySlug(db, me.id, decodeURIComponent(slug))
  if (!movie) return { title: MOVIES_PAGE_CONFIG.notFoundTitle }
  return buildMediaMetadata(MOVIES_PAGE_CONFIG.metaOf(movie))
}

export default async function MovieDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const me = await getCurrentUser()
  if (!me) {
    const { slug } = await params
    redirect(`/login?next=/movies/${slug}`)
  }
  const { slug } = await params
  const movie = await getMovieBySlug(db, me.id, decodeURIComponent(slug))
  if (!movie) notFound()

  return (
    <MediaDetailArticle
      item={movie}
      basePath={MOVIES_PAGE_CONFIG.basePath}
      person={MOVIES_PAGE_CONFIG.detail.personOf(movie)}
      date={MOVIES_PAGE_CONFIG.detail.dateOf(movie)}
      coverAltSuffix={MOVIES_PAGE_CONFIG.detail.coverAltSuffix}
      publicBadgeTitle={MOVIES_PAGE_CONFIG.detail.publicBadgeTitle}
    />
  )
}
