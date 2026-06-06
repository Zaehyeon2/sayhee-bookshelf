import { put, del } from '@vercel/blob'
import { isManagedBlobUrl } from './image-constraints'

export {
  MAX_IMAGE_BYTES,
  ALLOWED_IMAGE_MIME,
  validateImageUpload,
  isManagedBlobUrl,
  MANAGED_BLOB_HOST_RE,
} from './image-constraints'
export type { UploadValidation } from './image-constraints'

/** 사용자별 prefix 경로에 업로드 후 public URL 반환. */
export async function uploadImage(userId: number, file: File, ext: string): Promise<string> {
  const path = `writings/${userId}/${crypto.randomUUID()}.${ext}`
  const blob = await put(path, file, { access: 'public' })
  return blob.url
}

/** managed Blob URL이면 삭제. 실패는 로그만 — 호출부(글 mutation)를 막지 않는다. */
export async function deleteBlobIfManaged(url: string | null | undefined): Promise<void> {
  if (!isManagedBlobUrl(url)) return
  try {
    await del(url as string)
  } catch (e) {
    console.error('blob del failed', url, e)
  }
}
