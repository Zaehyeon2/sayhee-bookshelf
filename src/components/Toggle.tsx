'use client'

import { useId } from 'react'

interface Props {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}

export function Toggle({ checked, onChange, label, description, disabled }: Props) {
  const id = useId()
  const descId = description ? `${id}-desc` : undefined
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <label
          htmlFor={id}
          className="block text-[14px] font-semibold text-[var(--color-text-strong)] cursor-pointer"
        >
          {label}
        </label>
        {description && (
          <p
            id={descId}
            className="mt-1 text-[12px] text-[var(--color-text-muted)] leading-relaxed"
          >
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={descId}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={[
          'relative shrink-0 inline-flex w-11 h-[26px] rounded-full transition outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-toss-blue)]/50',
          checked ? 'bg-[var(--color-toss-blue)]' : 'bg-[var(--color-border)]',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <span
          aria-hidden
          className={[
            'absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  )
}
