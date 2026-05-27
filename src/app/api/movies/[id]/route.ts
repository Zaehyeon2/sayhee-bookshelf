import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { deleteMovie, getMovieById, updateMovie } from '@/lib/db/queries'
import { UpdateMovieSchema } from '@/lib/validations'
import { requireOwnMovie, HttpError } from '@/lib/auth-helpers'

type Params = { params: Promise<{ id: string }> }

function isValidId(n: number): boolean {
  return Number.isSafeInteger(n) && n > 0
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const movieId = Number(id)
    if (!isValidId(movieId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    const { user } = await requireOwnMovie(movieId)
    const movie = await getMovieById(db, user.id, movieId)
    if (!movie) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(movie)
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    throw e
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params
    const movieId = Number(id)
    if (!isValidId(movieId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    const { user } = await requireOwnMovie(movieId)
    const body = await req.json().catch(() => null)
    const parsed = UpdateMovieSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: '입력이 유효하지 않습니다', issues: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const updated = await updateMovie(db, user.id, movieId, parsed.data)
    if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ id: updated.id, slug: updated.slug })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    console.error('updateMovie failed', e)
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    const movieId = Number(id)
    if (!isValidId(movieId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    const { user } = await requireOwnMovie(movieId)
    const ok = await deleteMovie(db, user.id, movieId)
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    if (e instanceof HttpError) return e.toResponse()
    console.error('deleteMovie failed', e)
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
  }
}
