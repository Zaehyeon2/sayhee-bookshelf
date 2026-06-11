import { NextResponse } from 'next/server'
import type { z, ZodType } from 'zod'
import { HttpError } from '@/lib/auth-helpers'
import { isValidId } from '@/lib/validations'

/**
 * API route 핸들러 공통 예외 처리 wrapper.
 * - HttpError(requireUser/requireOwn* 등이 throw) → 해당 status의 JSON 응답
 * - 그 외 예외 → console.error 로깅 후 500 JSON. label은 로그 식별용.
 *
 * 라우트별 try/catch 없이 핸들러 본문에서 HttpError를 자유롭게 throw하면 된다.
 */
export function withApiHandler<Args extends unknown[]>(
  label: string,
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args)
    } catch (e) {
      if (e instanceof HttpError) return e.toResponse()
      console.error(`${label} failed`, e)
      return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 })
    }
  }
}

/**
 * 동적 세그먼트 [id]를 양의 정수로 파싱. 유효하지 않으면 HttpError(400) throw —
 * withApiHandler가 400 JSON으로 변환한다.
 */
export async function requireIdParam(params: Promise<{ id: string }>): Promise<number> {
  const { id } = await params
  const n = Number(id)
  if (!isValidId(n)) throw new HttpError(400, { error: 'invalid id' })
  return n
}

/**
 * JSON body를 zod 스키마로 검증. JSON 파싱 실패·검증 실패 시 HttpError(400) throw.
 * 검증 실패 응답엔 `issues`(flatten)가 포함된다 — withApiHandler 안에서만 사용.
 */
export async function requireJsonBody<S extends ZodType>(
  req: Request,
  schema: S,
): Promise<z.output<S>> {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, { error: '입력값이 올바르지 않습니다', issues: parsed.error.flatten() })
  }
  return parsed.data
}

/**
 * URL search params를 zod 스키마로 검증. 실패 시 HttpError(400) throw —
 * withApiHandler 안에서만 사용.
 */
export function requireQuery<S extends ZodType>(req: Request, schema: S): z.output<S> {
  const url = new URL(req.url)
  const parsed = schema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) throw new HttpError(400, { error: '잘못된 쿼리 파라미터' })
  return parsed.data
}
