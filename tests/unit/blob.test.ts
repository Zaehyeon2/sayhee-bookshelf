import { describe, it, expect } from 'vitest'
import { validateImageUpload, isManagedBlobUrl, MAX_IMAGE_BYTES } from '@/lib/image-constraints'

describe('validateImageUpload', () => {
  it('accepts jpeg under size limit and returns ext', () => {
    const r = validateImageUpload({ type: 'image/jpeg', size: 1024 })
    expect(r).toEqual({ ok: true, ext: 'jpg' })
  })

  it('maps png/webp/gif to extensions', () => {
    expect(validateImageUpload({ type: 'image/png', size: 1 })).toEqual({ ok: true, ext: 'png' })
    expect(validateImageUpload({ type: 'image/webp', size: 1 })).toEqual({ ok: true, ext: 'webp' })
    expect(validateImageUpload({ type: 'image/gif', size: 1 })).toEqual({ ok: true, ext: 'gif' })
  })

  it('rejects non-image mime', () => {
    const r = validateImageUpload({ type: 'application/pdf', size: 1 })
    expect(r.ok).toBe(false)
  })

  it('rejects files over 5MB', () => {
    const r = validateImageUpload({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })
    expect(r.ok).toBe(false)
  })

  it('rejects a zero-byte file', () => {
    const r = validateImageUpload({ type: 'image/png', size: 0 })
    expect(r.ok).toBe(false)
  })
})

describe('isManagedBlobUrl', () => {
  it('returns true for vercel blob host', () => {
    expect(isManagedBlobUrl('https://abc123.public.blob.vercel-storage.com/writings/1/x.png')).toBe(
      true,
    )
  })

  it('returns false for external/null/garbage urls', () => {
    expect(isManagedBlobUrl('https://image.tmdb.org/t/p/w500/x.jpg')).toBe(false)
    expect(isManagedBlobUrl(null)).toBe(false)
    expect(isManagedBlobUrl('not a url')).toBe(false)
  })
})
