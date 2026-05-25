import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { updateBook, deleteBook } from '@/lib/db/queries'
import { UpdateBookSchema } from '@/lib/validations'

function isValidId(n: number): boolean {
  return Number.isSafeInteger(n) && n > 0
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = Number(id)
  if (!isValidId(numId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  const body = await req.json().catch(() => null)
  const parsed = UpdateBookSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력이 유효하지 않습니다', issues: parsed.error.flatten() }, { status: 400 })
  }
  try {
    const book = await updateBook(db, numId, parsed.data)
    if (!book) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ id: book.id, slug: book.slug })
  } catch (e) {
    console.error('updateBook failed', e)
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = Number(id)
  if (!isValidId(numId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  try {
    const ok = await deleteBook(db, numId)
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('deleteBook failed', e)
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
