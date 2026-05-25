export function toSlug(input: string): string {
  let s = input.toLowerCase()
  // 한글·영숫자만 허용, 나머지는 하이픈으로
  s = s.replace(/[^a-z0-9가-힣]+/g, '-')
  s = s.replace(/-+/g, '-')
  s = s.replace(/^-+|-+$/g, '')
  if (s.length === 0) return 'untitled'
  if (s.length > 50) s = s.slice(0, 50).replace(/-+$/, '')
  return s
}

export function uniqueSlug(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base
  let i = 2
  while (existing.includes(`${base}-${i}`)) i++
  return `${base}-${i}`
}
