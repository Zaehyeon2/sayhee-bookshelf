import { put, del, BlobRequestAbortedError } from '@vercel/blob'
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
  // 3초 timeout — blob 서비스가 멈춰도 호출부 API 요청을 무한정 막지 않는다.
  // AbortSignal.timeout()은 TimeoutError로 abort돼 SDK의 AbortError bail 분기를 못 타고
  // 내부 retry(기본 10회, 지수 backoff)를 전부 돌게 됨 — 반드시 plain abort() 사용.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    await del(url as string, { abortSignal: controller.signal })
  } catch (e) {
    if (e instanceof BlobRequestAbortedError) {
      console.warn('blob del timed out (3s), skipping', url)
      return
    }
    console.error('blob del failed', url, e)
  } finally {
    clearTimeout(timer)
  }
}
