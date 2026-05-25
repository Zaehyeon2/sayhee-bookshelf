import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { createBook } from '@/lib/db/queries'
import { CreateBookSchema } from '@/lib/validations'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = CreateBookSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력이 유효하지 않습니다', issues: parsed.error.flatten() }, { status: 400 })
  }
  try {
    const book = await createBook(db, parsed.data)
    return NextResponse.json({ id: book.id, slug: book.slug }, { status: 201 })
  } catch (e) {
    console.error('createBook failed', e)
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
