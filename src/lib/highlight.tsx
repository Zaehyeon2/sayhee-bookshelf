import { Fragment } from 'react'

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Highlight occurrences of `query` inside `text` with a `<mark>` styled in
 * the Toss-blue tag color. Case-insensitive match. Returns the original
 * text untouched when query is empty.
 */
export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark
        key={i}
        className="bg-[var(--color-toss-blue-light)] text-[var(--color-toss-blue)] rounded-[3px] px-0.5"
      >
        {part}
      </mark>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}
