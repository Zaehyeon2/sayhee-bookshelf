import { put, del } from '@vercel/blob'

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export const ALLOWED_IMAGE_MIME = Object.keys(EXT_BY_MIME)

export type UploadValidation = { ok: true; ext: string } | { ok: false; error: string }

/** 서버가 최종 권위. MIME 화이트리스트 + byte size 검증. */
export function validateImageUpload(file: { type: string; size: number }): UploadValidation {
  const ext = EXT_BY_MIME[file.type]
  if (!ext) return { ok: false, error: '이미지 파일(jpg/png/webp/gif)만 업로드할 수 있어요' }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: '이미지는 최대 5MB까지 업로드할 수 있어요' }
  }
  return { ok: true, ext }
}

const BLOB_HOST_RE = /\.public\.blob\.vercel-storage\.com$/i

/** 우리 Blob store 호스트의 URL만 true — 외부/조작 URL은 del 대상에서 제외. */
export function isManagedBlobUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    return BLOB_HOST_RE.test(new URL(url).hostname)
  } catch {
    return false
  }
}

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
