'use client'

import { useEffect, useRef } from 'react'
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

const DRAG_THRESHOLD = 4

/**
 * Click-and-drag horizontal scrolling for desktop mice. Touch swipes still
 * use the native overflow-x behaviour from .scroll-x-touch. The click event
 * is intercepted at the capture phase: if the mouse moved past the
 * threshold during the down→up window, we treat the gesture as a drag and
 * cancel the click so chip buttons don't navigate.
 */
function useDragScroll<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return

    let down = false
    let dragged = false
    let startX = 0
    let startScroll = 0

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      down = true
      dragged = false
      startX = e.pageX
      startScroll = el.scrollLeft
      el.style.cursor = 'grabbing'
      el.style.userSelect = 'none'
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!down) return
      const delta = e.pageX - startX
      if (Math.abs(delta) > DRAG_THRESHOLD) dragged = true
      el.scrollLeft = startScroll - delta
    }
    const stop = () => {
      down = false
      el.style.cursor = ''
      el.style.userSelect = ''
    }
    const onClick = (e: MouseEvent) => {
      if (dragged) {
        e.preventDefault()
        e.stopPropagation()
        dragged = false
      }
    }

    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', stop)
    el.addEventListener('mouseleave', stop)
    el.addEventListener('click', onClick, true)
    return () => {
      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', stop)
      el.removeEventListener('mouseleave', stop)
      el.removeEventListener('click', onClick, true)
    }
  }, [ref])
}

export function Filters() {
  const router = useRouter()
  const sp = useSearchParams()
  const currentGenre = sp.get('genre') ?? ''
  const currentSort = sp.get('sort') ?? 'date'
  const scrollRef = useRef<HTMLDivElement>(null)
  useDragScroll(scrollRef)

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(sp.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    const qs = params.toString()
    router.push(qs ? `/books?${qs}` : '/books')
  }

  return (
    <div className="flex items-center gap-3">
      <div ref={scrollRef} className="flex-1 -mx-1 scroll-x-touch cursor-grab">
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
        className="shrink-0 h-9 pl-3 pr-8 rounded-[var(--radius-toss-sm)] bg-[var(--color-surface)] border border-[var(--color-border)] text-[16px] text-[var(--color-text-strong)] focus:border-[var(--color-toss-blue)] outline-none"
      >
        <option value="date">최근 순</option>
        <option value="rating">별점 순</option>
      </select>
    </div>
  )
}
