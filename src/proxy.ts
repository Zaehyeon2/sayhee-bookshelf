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
 *
 * host만 비교한다(scheme 제외). req.nextUrl.protocol은 TLS 종단 프록시 뒤에서 'http:'로
 * 보일 수 있어, 브라우저 Origin('https://host')과 scheme이 어긋나 정상 요청이 403되는 것을
 * 막기 위함. CSRF same-origin 판정에는 host 일치로 충분하다.
 */
function isSameOrigin(req: NextRequest): boolean {
  const host = req.headers.get('host')
  if (!host) return false
  const origin = req.headers.get('origin')
  if (origin) {
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  }
  // Origin 없는 경우 Referer로 폴백
  const referer = req.headers.get('referer')
  if (!referer) return false
  try {
    return new URL(referer).host === host
  } catch {
    return false
  }
}

export async function proxy(req: NextRequest) {
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

// Negative catch-all: 명시적으로 제외한 경로 외 모든 라우트를 보호한다.
// 세그먼트 allowlist 방식은 새 top-level 라우트 추가 시 누락되면 게이트를 조용히
// 우회하므로, 제외 목록만 관리하는 방식으로 전환.
//
// 제외 대상 (이외 전부 매칭):
// - `/` (root)        — 비로그인 랜딩 페이지, page.tsx가 자체 분기
// - `/login`          — 로그인 페이지 (단, /api/login은 매칭되어 CSRF 검사 통과 필요)
// - `/_next/*`        — Next 내부 자산
// - 점(.) 포함 경로    — favicon.ico, *.svg 등 정적 파일. slug에 점이 들어가는
//                       극단 케이스는 페이지 레벨 requireOwn*ForPage가 여전히 방어.
export const config = {
  matcher: ['/((?!_next/|login$|.*\\..*).+)'],
}
