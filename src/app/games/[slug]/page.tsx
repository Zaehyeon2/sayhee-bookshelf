import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/lib/db/client'
import { getGameBySlug } from '@/lib/db/queries'
import { getCurrentUser } from '@/lib/auth'
import { MediaDetailArticle } from '@/components/media/MediaDetailArticle'
import { buildMediaMetadata, GAMES_PAGE_CONFIG } from '@/components/media/mediaPageConfig'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const me = await getCurrentUser()
  if (!me) return {}
  const { slug } = await params
  const game = await getGameBySlug(db, me.id, decodeURIComponent(slug))
  if (!game) return { title: GAMES_PAGE_CONFIG.notFoundTitle }
  return buildMediaMetadata(GAMES_PAGE_CONFIG.metaOf(game))
}

export default async function GameDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const me = await getCurrentUser()
  if (!me) {
    const { slug } = await params
    redirect(`/login?next=/games/${slug}`)
  }
  const { slug } = await params
  const game = await getGameBySlug(db, me.id, decodeURIComponent(slug))
  if (!game) notFound()

  return (
    <MediaDetailArticle
      item={game}
      basePath={GAMES_PAGE_CONFIG.basePath}
      person={GAMES_PAGE_CONFIG.detail.personOf(game)}
      date={GAMES_PAGE_CONFIG.detail.dateOf(game)}
      coverAltSuffix={GAMES_PAGE_CONFIG.detail.coverAltSuffix}
      publicBadgeTitle={GAMES_PAGE_CONFIG.detail.publicBadgeTitle}
    />
  )
}
