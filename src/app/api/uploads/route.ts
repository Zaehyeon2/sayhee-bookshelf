import { NextResponse } from 'next/server'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { validateImageUpload, uploadImage } from '@/lib/blob'

export async function POST(req: Request) {
  try {
    const user = await requireUser()
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '이미지 파일이 필요합니다' }, { status: 400 })
    }
    const v = validateImageUpload(file)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const url = await uploadImage(user.id, file, v.ext)
    return NextResponse.json({ url }, { status: 201 })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    console.error('image upload failed', e)
    return NextResponse.json({ error: '업로드에 실패했습니다' }, { status: 500 })
  }
}
