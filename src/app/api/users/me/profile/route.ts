import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { UpdateProfileSchema } from '@/lib/validations'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { SESSION_CACHE_TAG } from '@/lib/auth'
import { PUBLIC_FEED_TAGS } from '@/lib/public-feed-cache'
import { WORKS_BOOK_TAG, WORKS_MOVIE_TAG } from '@/lib/works-detail-cache'

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const body = await req.json().catch(() => null)
    const parsed = UpdateProfileSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값이 올바르지 않습니다' }, { status: 400 })
    }
    await db
      .update(users)
      .set({ displayName: parsed.data.displayName })
      .where(eq(users.id, user.id))
    // displayName은 세션 캐시 + 공개 피드 + works 리뷰(authorDisplayName)에 denormalize돼 있어
    // 변경 시 모두 무효화하지 않으면 다른 사용자에게 옛 이름이 계속 노출된다.
    revalidateTag(SESSION_CACHE_TAG, 'max')
    revalidateTag(PUBLIC_FEED_TAGS.books, 'max')
    revalidateTag(PUBLIC_FEED_TAGS.movies, 'max')
    revalidateTag(WORKS_BOOK_TAG, 'max')
    revalidateTag(WORKS_MOVIE_TAG, 'max')
    return NextResponse.json({ ok: true, displayName: parsed.data.displayName })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
