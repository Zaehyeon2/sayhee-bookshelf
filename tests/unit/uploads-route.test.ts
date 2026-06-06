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

// uploadImage는 mock(네트워크 차단), 검증 함수는 실제 사용.
vi.mock('@/lib/blob', async () => {
  const actual = await vi.importActual<typeof import('@/lib/blob')>('@/lib/blob')
  return {
    ...actual,
    uploadImage: vi.fn(async () => 'https://abc.public.blob.vercel-storage.com/writings/1/x.png'),
  }
})

vi.mock('@/lib/auth-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth-helpers')>('@/lib/auth-helpers')
  return { ...actual, requireUser: vi.fn() }
})

import { POST } from '@/app/api/uploads/route'
import { requireUser, HttpError } from '@/lib/auth-helpers'
import { uploadImage } from '@/lib/blob'

function fileReq(file: File | null): Request {
  const fd = new FormData()
  if (file) fd.append('file', file)
  return new Request('http://localhost/api/uploads', { method: 'POST', body: fd })
}

describe('POST /api/uploads', () => {
  beforeEach(() => vi.clearAllMocks())

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
})
