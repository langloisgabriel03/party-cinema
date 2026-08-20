import { useState } from 'react'

import { fromISODate, toISODate, todayISO } from '@/data/dates'

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** `nightsByDate`: Map<isoDate, count> -- a count, not a boolean, so the dot's aria-label can say how many. */
export default function MonthCalendar({ nightsByDate, onSelectDate }) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = todayISO()
  const monthLabel = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const cells = Array(firstWeekday).fill(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(toISODate(new Date(year, month, day)))

  return (
    <div className="rounded-xl bg-ink-soft p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          aria-label="Previous month"
          className="flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded text-neutral-400 hover:bg-ink-raised hover:text-white"
        >
          ←
        </button>
        <span className="text-sm font-semibold text-white">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          aria-label="Next month"
          className="flex min-h-9 min-w-9 cursor-pointer items-center justify-center rounded text-neutral-400 hover:bg-ink-raised hover:text-white"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-neutral-500">
        {WEEKDAY_LABELS.map((label, i) => (
          <div key={i} className="py-1">
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((iso, i) => {
          if (!iso) return <div key={`pad-${i}`} />
          const count = nightsByDate.get(iso) ?? 0
          const dayLabel = fromISODate(iso).toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelectDate(iso)}
              aria-label={count > 0 ? `${dayLabel}, ${count} movie night${count > 1 ? 's' : ''}` : dayLabel}
              className={`relative flex min-h-11 cursor-pointer items-center justify-center rounded text-sm hover:bg-ink-raised ${
                iso === today ? 'font-bold text-white ring-1 ring-neutral-600' : 'text-neutral-300'
              }`}
            >
              {Number(iso.slice(8))}
              {count > 0 && <span className="absolute bottom-1 size-1.5 rounded-full bg-brand" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
