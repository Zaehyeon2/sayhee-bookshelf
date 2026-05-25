'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { GENRES } from '@/lib/genres'

function ChipButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'shrink-0 h-9 px-4 rounded-full text-[13px] font-semibold transition active:scale-[0.97] ' +
        (active
          ? 'bg-[var(--color-toss-blue)] text-white'
          : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]')
      }
    >
      {label}
    </button>
  )
}

export function Filters() {
  const router = useRouter()
  const sp = useSearchParams()
  const currentGenre = sp.get('genre') ?? ''
  const currentSort = sp.get('sort') ?? 'date'

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(sp.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    const qs = params.toString()
    router.push(qs ? `/books?${qs}` : '/books')
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 -mx-1 overflow-x-auto">
        <div className="flex gap-2 px-1 pb-1">
          <ChipButton
            label="전체"
            active={currentGenre === ''}
            onClick={() => setParam('genre', null)}
          />
          {GENRES.map((g) => (
            <ChipButton
              key={g}
              label={g}
              active={currentGenre === g}
              onClick={() => setParam('genre', g)}
            />
          ))}
        </div>
      </div>
      <select
        value={currentSort}
        onChange={(e) => setParam('sort', e.target.value === 'date' ? null : e.target.value)}
        className="shrink-0 h-9 pl-3 pr-8 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[13px] text-[var(--color-text-strong)] focus:border-[var(--color-toss-blue)] outline-none"
      >
        <option value="date">최근 순</option>
        <option value="rating">별점 순</option>
      </select>
    </div>
  )
}
