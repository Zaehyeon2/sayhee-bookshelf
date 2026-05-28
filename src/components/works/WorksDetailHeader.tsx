import Image from 'next/image'

interface Props {
  title: string
  subtitle?: string
  coverUrl?: string
  byline?: string
  director?: string
  description?: string
  externalRating?: number
  siteAvg: number
  siteCnt: number
}

export function WorksDetailHeader(props: Props) {
  return (
    <header className="flex flex-col gap-6 md:flex-row">
      {props.coverUrl ? (
        // alt="" — cover is decorative; <h1>{title}</h1> below carries the semantic label
        <Image
          src={props.coverUrl}
          alt=""
          width={160}
          height={240}
          className="flex-shrink-0 rounded-[var(--radius-toss)] object-cover shadow-[var(--shadow-toss)]"
        />
      ) : (
        <div className="w-40 h-60 flex-shrink-0 rounded-[var(--radius-toss)] bg-[var(--color-surface-2)]" />
      )}
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <h1 className="text-[24px] font-bold text-[var(--color-text-strong)]">{props.title}</h1>
          {props.subtitle && (
            <p className="mt-1 text-[14px] text-[var(--color-text-muted)]">{props.subtitle}</p>
          )}
          {props.byline && (
            <p className="mt-2 text-[13px] text-[var(--color-text-muted)]">{props.byline}</p>
          )}
          {props.director && (
            <p className="mt-2 text-[13px] text-[var(--color-text-muted)]">감독 {props.director}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-5 text-[14px]">
          {typeof props.externalRating === 'number' && (
            <div>
              <span className="text-[var(--color-text-weak)]">외부 평점</span>
              <span className="ml-2 font-bold text-[var(--color-text-strong)] font-tabular tabular-nums">
                ★ {props.externalRating.toFixed(1)}
              </span>
            </div>
          )}
          <div>
            <span className="text-[var(--color-text-weak)]">사이트 평균</span>
            {props.siteCnt > 0 ? (
              <span className="ml-2 font-bold text-[var(--color-text-strong)] font-tabular tabular-nums">
                ★ {props.siteAvg.toFixed(1)} · {props.siteCnt}명
              </span>
            ) : (
              <span className="ml-2 text-[var(--color-text-weak)]">아직 평가 없음</span>
            )}
          </div>
        </div>
        {props.description && (
          <p className="text-[13px] leading-relaxed text-[var(--color-text-muted)] line-clamp-5">
            {props.description}
          </p>
        )}
      </div>
    </header>
  )
}
