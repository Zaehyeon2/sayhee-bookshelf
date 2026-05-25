import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { updateBook, deleteBook } from '@/lib/db/queries'
import { UpdateBookSchema } from '@/lib/validations'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = Number(id)
  if (!Number.isInteger(numId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  const body = await req.json().catch(() => null)
  const parsed = UpdateBookSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력이 유효하지 않습니다', issues: parsed.error.flatten() }, { status: 400 })
  }
  const book = await updateBook(db, numId, parsed.data)
  if (!book) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ id: book.id, slug: book.slug })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const numId = Number(id)
  if (!Number.isInteger(numId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  const ok = await deleteBook(db, numId)
  if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
