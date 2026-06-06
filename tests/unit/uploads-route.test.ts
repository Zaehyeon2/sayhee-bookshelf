// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// db는 이 route에서 안 씀 — 실수로 쓰면 fail-loud.
vi.mock('@/lib/db/client', () => ({
  db: new Proxy(
    {},
    {
      get(_, prop) {
        throw new Error(`uploads route should not touch db.${String(prop)}`)
      },
    },
  ),
}))

// uploadImage는 mock(네트워크 차단), deleteBlobIfManaged도 mock, 검증 함수는 실제 사용.
vi.mock('@/lib/blob', async () => {
  const actual = await vi.importActual<typeof import('@/lib/blob')>('@/lib/blob')
  return {
    ...actual,
    uploadImage: vi.fn(async () => 'https://abc.public.blob.vercel-storage.com/writings/1/x.png'),
    deleteBlobIfManaged: vi.fn(async () => {}),
  }
})

vi.mock('@/lib/auth-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth-helpers')>('@/lib/auth-helpers')
  return { ...actual, requireUser: vi.fn() }
})

import { POST, DELETE } from '@/app/api/uploads/route'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { uploadImage, deleteBlobIfManaged } from '@/lib/blob'
import { _resetRateLimitForTest, UPLOAD_RATE_LIMIT } from '@/lib/external/rate-limit'

function fileReq(file: File | null): Request {
  const fd = new FormData()
  if (file) fd.append('file', file)
  return new Request('http://localhost/api/uploads', { method: 'POST', body: fd })
}

function deleteReq(url: string | null): Request {
  return new Request('http://localhost/api/uploads', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
}

describe('POST /api/uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetRateLimitForTest()
  })

  it('401 when not authenticated', async () => {
    vi.mocked(requireUser).mockRejectedValue(new HttpError(401, { error: '로그인이 필요합니다' }))
    const res = await POST(fileReq(new File(['x'], 'a.png', { type: 'image/png' })))
    expect(res.status).toBe(401)
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('403 when mustChangePassword (requireUser throws)', async () => {
    vi.mocked(requireUser).mockRejectedValue(
      new HttpError(403, { error: '비밀번호 변경이 필요합니다' }),
    )
    const res = await POST(fileReq(new File(['x'], 'a.png', { type: 'image/png' })))
    expect(res.status).toBe(403)
  })

  it('400 when no file', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 1 } as never)
    const res = await POST(fileReq(null))
    expect(res.status).toBe(400)
  })

  it('400 when wrong mime', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 1 } as never)
    const res = await POST(fileReq(new File(['x'], 'a.pdf', { type: 'application/pdf' })))
    expect(res.status).toBe(400)
    expect(uploadImage).not.toHaveBeenCalled()
  })

  it('201 + url for valid image', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 1 } as never)
    const res = await POST(fileReq(new File(['x'], 'a.png', { type: 'image/png' })))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.url).toContain('x.png')
    expect(uploadImage).toHaveBeenCalled()
  })

  it('429 after UPLOAD_RATE_LIMIT calls in the window', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 42 } as never)
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    // exhaust the limit
    for (let i = 0; i < UPLOAD_RATE_LIMIT; i++) {
      const res = await POST(fileReq(file))
      expect(res.status).toBe(201)
    }
    // (limit+1)th call should be rate-limited
    const res = await POST(fileReq(file))
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toMatch(/업로드가 너무 잦습니다/)
    expect(res.headers.get('Retry-After')).toBeTruthy()
  })
})

describe('DELETE /api/uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _resetRateLimitForTest()
  })

  it('401 when unauthenticated', async () => {
    vi.mocked(requireUser).mockRejectedValue(new HttpError(401, { error: '로그인이 필요합니다' }))
    const res = await DELETE(
      deleteReq('https://abc.public.blob.vercel-storage.com/writings/1/x.png'),
    )
    expect(res.status).toBe(401)
    expect(deleteBlobIfManaged).not.toHaveBeenCalled()
  })

  it('403 when url path belongs to another user', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 1 } as never)
    // user.id=1 but path is /writings/999/...
    const res = await DELETE(
      deleteReq('https://abc.public.blob.vercel-storage.com/writings/999/x.png'),
    )
    expect(res.status).toBe(403)
    expect(deleteBlobIfManaged).not.toHaveBeenCalled()
  })

  it('400 for a non-managed url', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 1 } as never)
    const res = await DELETE(deleteReq('https://evil.com/x.png'))
    expect(res.status).toBe(400)
    expect(deleteBlobIfManaged).not.toHaveBeenCalled()
  })

  it('400 when url is null', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 1 } as never)
    const res = await DELETE(deleteReq(null))
    expect(res.status).toBe(400)
    expect(deleteBlobIfManaged).not.toHaveBeenCalled()
  })

  it('200 + calls deleteBlobIfManaged for own url', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 1 } as never)
    const ownUrl = 'https://abc.public.blob.vercel-storage.com/writings/1/x.png'
    const res = await DELETE(deleteReq(ownUrl))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(deleteBlobIfManaged).toHaveBeenCalledWith(ownUrl)
  })
})
