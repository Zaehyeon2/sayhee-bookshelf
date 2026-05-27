import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth-edge'

const PASSWORD_PATH = '/settings/password'
const PASSWORD_API = '/api/users/me/password'
const LOGIN_API = '/api/login'
const LOGOUT_API = '/api/logout'

// state-changing methods는 CSRF 방어 대상. GET/HEAD/OPTIONS는 안전.
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Origin 헤더가 같은 출처인지 확인. 외부 사이트의 form POST는 Origin이 다르므로 차단된다.
 * Browser fetch/XHR은 항상 Origin을 보내고, 일부 navigation POST는 안 보낼 수 있으므로
 * Origin이 없으면 Referer로 fallback. 둘 다 없으면 거절.
 */
function isSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get('origin')
  const host = req.headers.get('host')
  if (!host) return false
  const expected = `${req.nextUrl.protocol}//${host}`
  if (origin) return origin === expected
  // Origin 없는 경우 Referer로 폴백
  const referer = req.headers.get('referer')
  if (!referer) return false
  try {
    const refUrl = new URL(referer)
    return refUrl.host === host
  } catch {
    return false
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isApi = pathname.startsWith('/api/')

  // 1. CSRF: 외부 출처에서 온 unsafe method 요청은 즉시 거절.
  //    /api/login은 미인증 상태에서 호출되지만, 여전히 같은 출처에서만 허용.
  if (UNSAFE_METHODS.has(req.method)) {
    if (!isSameOrigin(req)) {
      if (isApi) {
        return NextResponse.json({ error: 'invalid origin' }, { status: 403 })
      }
      // 페이지 POST의 경우(거의 없음)도 차단
      return new NextResponse('Forbidden', { status: 403 })
    }
  }

  // 2. /api/login과 /api/logout은 인증 검사 스킵 — 자체 로직이 처리.
  if (pathname === LOGIN_API || pathname === LOGOUT_API) {
    return NextResponse.next()
  }

  // 3. 세션 확인
  const token = req.cookies.get('session')?.value
  const session = await getSessionUser(token)

  if (!session) {
    if (isApi) {
      return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // 4. mustChangePassword 게이트 — 비밀번호 변경 페이지/API만 허용.
  //    /api/users/me/password로 실제 변경 가능, 그 외는 모두 차단.
  if (session.mcp === 1) {
    const isPasswordPage = pathname === PASSWORD_PATH
    const isPasswordApi = pathname === PASSWORD_API
    if (!isPasswordPage && !isPasswordApi) {
      if (isApi) {
        return NextResponse.json({ error: '먼저 비밀번호를 변경해주세요' }, { status: 403 })
      }
      const url = req.nextUrl.clone()
      url.pathname = PASSWORD_PATH
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  return NextResponse.next()
}

// /_next, 정적 자산, favicon, login 페이지 등을 제외한 모든 라우트를 보호.
// /api/** 도 포함하므로 모든 mutation 엔드포인트가 edge에서 한 번 더 게이트된다.
export const config = {
  matcher: [
    '/feed/:path*',
    '/books/:path*',
    '/movies/:path*',
    '/writings/:path*',
    '/admin/:path*',
    '/settings/:path*',
    '/api/:path*',
  ],
}
