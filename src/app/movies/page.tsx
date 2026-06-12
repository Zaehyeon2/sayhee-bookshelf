import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { spKey } from '@/lib/sp-key'
import { MediaListPageBody, MediaResultsSkeleton } from '@/components/media/MediaListResults'
import { MOVIES_PAGE_CONFIG } from '@/components/media/mediaPageConfig'

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

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <MediaListPageBody.Controls config={MOVIES_PAGE_CONFIG} />
      </Suspense>
      <Suspense fallback={<MediaResultsSkeleton />} key={spKey(sp)}>
        <MediaListPageBody.Results config={MOVIES_PAGE_CONFIG} sp={sp} userId={me.id} />
      </Suspense>
    </div>
  )
}
