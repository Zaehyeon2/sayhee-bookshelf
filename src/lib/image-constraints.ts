export const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export const ALLOWED_IMAGE_MIME = Object.keys(EXT_BY_MIME)

export type UploadValidation = { ok: true; ext: string } | { ok: false; error: string }

export function validateImageUpload(file: { type: string; size: number }): UploadValidation {
  const ext = EXT_BY_MIME[file.type]
  if (!ext) return { ok: false, error: '이미지 파일(jpg/png/webp/gif)만 업로드할 수 있어요' }
  if (file.size === 0) return { ok: false, error: '빈 파일은 첨부할 수 없어요' }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: '이미지는 최대 5MB까지 업로드할 수 있어요' }
  }
  return { ok: true, ext }
}

export const MANAGED_BLOB_HOST_RE = /\.public\.blob\.vercel-storage\.com$/i

/** 우리 Blob store 호스트의 URL만 true — 외부/조작 URL은 del 대상에서 제외. */
export function isManagedBlobUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    return MANAGED_BLOB_HOST_RE.test(new URL(url).hostname)
  } catch {
    return false
  }
}
