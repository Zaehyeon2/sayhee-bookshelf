import { describe, it, expect } from 'vitest'
import { CreateWritingSchema, UpdateWritingSchema } from '@/lib/validations'

describe('writing schema coverUrl', () => {
  it('accepts a valid https coverUrl on create', () => {
    const r = CreateWritingSchema.safeParse({
      title: 't',
      coverUrl: 'https://abc.public.blob.vercel-storage.com/writings/1/x.png',
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.coverUrl).toContain('x.png')
  })

  it('accepts null coverUrl on update (제거 의도)', () => {
    const r = UpdateWritingSchema.safeParse({ coverUrl: null })
    expect(r.success).toBe(true)
  })

  it('omitting coverUrl is allowed', () => {
    expect(CreateWritingSchema.safeParse({ title: 't' }).success).toBe(true)
    expect(UpdateWritingSchema.safeParse({}).success).toBe(true)
  })

  it('rejects a non-url coverUrl', () => {
    expect(CreateWritingSchema.safeParse({ title: 't', coverUrl: 'nope' }).success).toBe(false)
  })

  it('rejects an external (non-blob) https coverUrl', () => {
    const r = CreateWritingSchema.safeParse({
      title: 't',
      coverUrl: 'https://image.tmdb.org/x.png',
    })
    expect(r.success).toBe(false)
  })
})
