import { describe, it, expect, beforeEach, vi } from 'vitest'

// Blob del을 spy — 실제 네트워크 호출 없이 호출 여부만 검증.
vi.mock('@/lib/blob', () => ({
  deleteBlobIfManaged: vi.fn(async () => {}),
}))

import { createWriting, updateWriting, deleteWriting, getWritingById } from '@/lib/db/queries'
import { deleteBlobIfManaged } from '@/lib/blob'
import { makeTestDb, type TestDb } from '../setup-db'
import { createUser } from '../factories'

const BLOB = 'https://abc.public.blob.vercel-storage.com/writings'

describe('writing cover lifecycle', () => {
  let db: TestDb
  beforeEach(async () => {
    ;({ db } = await makeTestDb())
    vi.clearAllMocks()
  })

  it('createWriting persists coverUrl', async () => {
    const a = await createUser(db, { username: 'alice' })
    const w = await createWriting(db, a.id, {
      title: '봄',
      body: '',
      coverUrl: `${BLOB}/1/a.png`,
      tags: [],
    })
    const got = await getWritingById(db, a.id, w.id)
    expect(got?.coverUrl).toBe(`${BLOB}/1/a.png`)
  })

  it('updateWriting replacing cover deletes the old blob', async () => {
    const a = await createUser(db, { username: 'alice' })
    const w = await createWriting(db, a.id, {
      title: '봄',
      body: '',
      coverUrl: `${BLOB}/1/old.png`,
      tags: [],
    })
    await updateWriting(db, a.id, w.id, { coverUrl: `${BLOB}/1/new.png` })
    expect(deleteBlobIfManaged).toHaveBeenCalledWith(`${BLOB}/1/old.png`)
    const got = await getWritingById(db, a.id, w.id)
    expect(got?.coverUrl).toBe(`${BLOB}/1/new.png`)
  })

  it('updateWriting removing cover (null) deletes old blob and stores null', async () => {
    const a = await createUser(db, { username: 'alice' })
    const w = await createWriting(db, a.id, {
      title: '봄',
      body: '',
      coverUrl: `${BLOB}/1/old.png`,
      tags: [],
    })
    await updateWriting(db, a.id, w.id, { coverUrl: null })
    expect(deleteBlobIfManaged).toHaveBeenCalledWith(`${BLOB}/1/old.png`)
    const got = await getWritingById(db, a.id, w.id)
    expect(got?.coverUrl).toBeNull()
  })

  it('updateWriting without coverUrl key leaves cover untouched, no del', async () => {
    const a = await createUser(db, { username: 'alice' })
    const w = await createWriting(db, a.id, {
      title: '봄',
      body: '',
      coverUrl: `${BLOB}/1/keep.png`,
      tags: [],
    })
    await updateWriting(db, a.id, w.id, { title: '여름' })
    expect(deleteBlobIfManaged).not.toHaveBeenCalled()
    const got = await getWritingById(db, a.id, w.id)
    expect(got?.coverUrl).toBe(`${BLOB}/1/keep.png`)
  })

  it('deleteWriting removes the cover blob', async () => {
    const a = await createUser(db, { username: 'alice' })
    const w = await createWriting(db, a.id, {
      title: '봄',
      body: '',
      coverUrl: `${BLOB}/1/x.png`,
      tags: [],
    })
    await deleteWriting(db, a.id, w.id)
    expect(deleteBlobIfManaged).toHaveBeenCalledWith(`${BLOB}/1/x.png`)
  })

  it('cross-user updateWriting cannot touch another user cover', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const w = await createWriting(db, a.id, {
      title: '봄',
      body: '',
      coverUrl: `${BLOB}/1/x.png`,
      tags: [],
    })
    const res = await updateWriting(db, b.id, w.id, { coverUrl: `${BLOB}/2/hijack.png` })
    expect(res).toBeNull()
    expect(deleteBlobIfManaged).not.toHaveBeenCalled()
  })

  it('cross-user deleteWriting cannot delete another user writing or its blob', async () => {
    const a = await createUser(db, { username: 'alice' })
    const b = await createUser(db, { username: 'bob' })
    const w = await createWriting(db, a.id, {
      title: '봄',
      body: '',
      coverUrl: `${BLOB}/1/x.png`,
      tags: [],
    })
    expect(await deleteWriting(db, b.id, w.id)).toBe(false)
    expect(deleteBlobIfManaged).not.toHaveBeenCalled()
    // owner can still delete
    expect(await deleteWriting(db, a.id, w.id)).toBe(true)
    expect(deleteBlobIfManaged).toHaveBeenCalledWith(`${BLOB}/1/x.png`)
  })
})
