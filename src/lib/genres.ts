export const GENRES = [
  '소설',
  '추리/스릴러',
  '판타지/SF',
  '시',
  '에세이',
  '인문/철학',
  '역사',
  '사회/경제',
  '과학/IT',
  '자기계발',
  '예술',
  '종교',
  '만화',
  '기타',
] as const

export type Genre = (typeof GENRES)[number]

export function isGenre(value: unknown): value is Genre {
  return typeof value === 'string' && (GENRES as readonly string[]).includes(value)
}
