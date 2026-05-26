import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users } from '@/lib/db/schema'
import { UpdateProfileSchema } from '@/lib/validations'
import { requireUser, HttpError } from '@/lib/auth-helpers'

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
    return NextResponse.json({ ok: true, displayName: parsed.data.displayName })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}
