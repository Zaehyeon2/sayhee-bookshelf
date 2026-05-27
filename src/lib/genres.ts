export const BOOK_GENRES = [
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

export type BookGenre = (typeof BOOK_GENRES)[number]

export function isBookGenre(value: unknown): value is BookGenre {
  return typeof value === 'string' && (BOOK_GENRES as readonly string[]).includes(value)
}

export const MOVIE_GENRES = [
  '액션',
  '드라마',
  '코미디',
  'SF',
  '로맨스',
  '스릴러',
  '다큐멘터리',
  '애니메이션',
  '공포',
  '기타',
] as const

export type MovieGenre = (typeof MOVIE_GENRES)[number]

export function isMovieGenre(value: unknown): value is MovieGenre {
  return typeof value === 'string' && (MOVIE_GENRES as readonly string[]).includes(value)
}
