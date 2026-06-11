import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { UpdateProfileSchema } from '@/lib/validations'
import { requireUser } from '@/lib/auth-helpers'
import { SESSION_CACHE_TAG } from '@/lib/auth'
import { PUBLIC_FEED_TAGS } from '@/lib/public-feed-cache'
import { WORKS_BOOK_TAG, WORKS_MOVIE_TAG } from '@/lib/works-detail-cache'
import { requireJsonBody, withApiHandler } from '@/lib/api-handler'

export const POST = withApiHandler('updateProfile', async (req: Request) => {
  const user = await requireUser()
  const { displayName } = await requireJsonBody(req, UpdateProfileSchema)
  await db
    .update(users)
    .set({ displayName })
    .where(eq(users.id, user.id))
  // displayName은 세션 캐시 + 공개 피드 + works 리뷰(authorDisplayName)에 denormalize돼 있어
  // 변경 시 모두 무효화하지 않으면 다른 사용자에게 옛 이름이 계속 노출된다.
  revalidateTag(SESSION_CACHE_TAG, 'max')
  revalidateTag(PUBLIC_FEED_TAGS.books, 'max')
  revalidateTag(PUBLIC_FEED_TAGS.movies, 'max')
  revalidateTag(WORKS_BOOK_TAG, 'max')
  revalidateTag(WORKS_MOVIE_TAG, 'max')
  return NextResponse.json({ ok: true, displayName })
})
