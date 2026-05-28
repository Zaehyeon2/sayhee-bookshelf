import Link from 'next/link'
import Image from 'next/image'

interface BookCardProps {
  type: 'book'
  externalId: string
  title: string
  byline: string
  year: number | undefined
  coverUrl: string | undefined
  /** Naver Books does not expose ratings; book cards stay undefined. */
  externalRating: number | undefined
  siteAgg: { avg: number; cnt: number }
}

interface MovieCardProps {
  type: 'movie'
  externalId: number
  title: string
  byline: string
  year: number | undefined
  coverUrl: string | undefined
  /** TMDB vote_average (0-10). undefined when no upstream ratings yet. */
  externalRating: number | undefined
  siteAgg: { avg: number; cnt: number }
}

type Props = BookCardProps | MovieCardProps

export function WorksSearchCard(props: Props) {
  const href =
    props.type === 'book' ? `/works/book/${props.externalId}` : `/works/movie/${props.externalId}`
  return (
    <Link
      href={href}
      className="h-full flex flex-col rounded-[var(--radius-toss)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-toss)] hover:shadow-[var(--shadow-toss-hover)] transition"
    >
      <div className="flex gap-3 flex-1">
        {props.coverUrl ? (
          // alt="" — cover is decorative; <h3>{title}</h3> below carries the semantic label
          <Image
            src={props.coverUrl}
            alt=""
            width={56}
            height={84}
            className="flex-shrink-0 rounded-sm object-cover"
          />
        ) : (
          <div className="w-14 h-21 flex-shrink-0 rounded-sm bg-[var(--color-surface-2)]" />
        )}
        <div className="min-w-0 flex-1 flex flex-col">
          <h3 className="text-[15px] font-bold text-[var(--color-text-strong)] line-clamp-2">
            {props.title}
          </h3>
          <p className="mt-1 text-[12px] text-[var(--color-text-muted)] line-clamp-1">
            {props.byline}
            {props.year ? ` · ${props.year}` : ''}
          </p>
          <div className="mt-auto pt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
            {typeof props.externalRating === 'number' && (
              <span className="text-[var(--color-text-weak)] font-tabular tabular-nums">
                외부 ★ {props.externalRating.toFixed(1)}
              </span>
            )}
            {props.siteAgg.cnt > 0 ? (
              <>
                <span className="font-semibold text-[var(--color-text-strong)] font-tabular tabular-nums">
                  사이트 ★ {props.siteAgg.avg.toFixed(1)}
                </span>
                <span className="text-[var(--color-text-weak)] font-tabular tabular-nums">
                  📝 {props.siteAgg.cnt}
                </span>
              </>
            ) : typeof props.externalRating !== 'number' ? (
              <span className="text-[var(--color-text-weak)]">아직 평가 없음</span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  )
}
