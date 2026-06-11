import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth-helpers'
import { validateImageUpload, uploadImage, deleteBlobIfManaged } from '@/lib/blob'
import { isManagedBlobUrl } from '@/lib/image-constraints'
import { checkUploadRateLimit } from '@/lib/external/rate-limit'
import { withApiHandler } from '@/lib/api-handler'

export const POST = withApiHandler('image upload', async (req: Request) => {
  const user = await requireUser()
  const rl = checkUploadRateLimit(user.id)
  if (!rl.ok) {
    return NextResponse.json(
      { error: '업로드가 너무 잦습니다. 잠시 후 다시 시도해주세요.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
    )
  }
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '이미지 파일이 필요합니다' }, { status: 400 })
  }
  const v = validateImageUpload(file)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const url = await uploadImage(user.id, file, v.ext)
  return NextResponse.json({ url }, { status: 201 })
})

export const DELETE = withApiHandler('image delete', async (req: Request) => {
  const user = await requireUser()
  const body = await req.json().catch(() => null)
  const url = typeof body?.url === 'string' ? body.url : null
  if (!url || !isManagedBlobUrl(url)) {
    return NextResponse.json({ error: '유효하지 않은 URL입니다' }, { status: 400 })
  }
  // 본인 경로(writings/{userId}/...)의 blob만 삭제 허용 — 타인 blob 삭제 차단.
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return NextResponse.json({ error: '유효하지 않은 URL입니다' }, { status: 400 })
  }
  if (!pathname.startsWith(`/writings/${user.id}/`)) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }
  await deleteBlobIfManaged(url)
  return NextResponse.json({ ok: true })
})
