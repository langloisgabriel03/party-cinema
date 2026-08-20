import { useEffect, useRef, useState } from 'react'

import { MIN_AUDIENCE_RATING_COUNT, SECONDARY_GENRES, SECONDARY_LISTS, SORT_OPTIONS } from '@/data/movieCatalog'
import filterSchema from '@/data/filterSchema.json'

const toggleInArray = (array, value) =>
  array.includes(value) ? array.filter((v) => v !== value) : [...array, value]

function Chip({ selected, onClick, children, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={title}
      className={`cursor-pointer rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
        selected ? 'bg-brand text-white' : 'bg-ink-raised text-neutral-300 hover:bg-neutral-700'
      }`}
    >
      {children}
    </button>
  )
}

/** Thumbs styled via Tailwind arbitrary variants -- the track itself is pointer-events-none so
 * only the two thumb circles are draggable/tappable; otherwise the top input's full-width track
 * would swallow every click meant for the one underneath. */
const THUMB_CLASSES =
  'pointer-events-none absolute inset-x-0 top-1/2 h-0 w-full -translate-y-1/2 appearance-none bg-transparent ' +
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow ' +
  '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white'

/** Dual-thumb range slider (two overlapping native <input type="range"> -- no dependency). */
function RangeSlider({ label, hint, min, max, bound, onMinChange, onMaxChange, step = 1 }) {
  const lo = bound?.min ?? 0
  const hi = bound?.max ?? 100
  const curMin = min ?? lo
  const curMax = max ?? hi
  const span = Math.max(hi - lo, 1)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-xs text-neutral-400">
        <span>
          {label}
          {hint ? ` (${hint})` : ''}
        </span>
        <span className="text-sm font-semibold text-white">
          {curMin} – {curMax}
        </span>
      </div>
      <div className="relative h-4">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-neutral-700" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand"
          style={{
            left: `${((curMin - lo) / span) * 100}%`,
            right: `${100 - ((curMax - lo) / span) * 100}%`,
          }}
        />
        <input
          type="range"
          min={lo}
          max={hi}
          step={step}
          value={curMin}
          onChange={(e) => {
            const value = Math.min(Number(e.target.value), curMax)
            onMinChange(value === lo ? null : value)
          }}
          className={THUMB_CLASSES}
        />
        <input
          type="range"
          min={lo}
          max={hi}
          step={step}
          value={curMax}
          onChange={(e) => {
            const value = Math.max(Number(e.target.value), curMin)
            onMaxChange(value === hi ? null : value)
          }}
          className={THUMB_CLASSES}
        />
      </div>
    </div>
  )
}

/** Single-thumb slider for a plain "at least this many" threshold (no upper bound to set). */
function MinSlider({ label, hint, value, bound, onChange }) {
  const lo = bound?.min ?? 0
  const hi = Math.max(bound?.max ?? 0, 1)
  const current = value || lo

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-xs text-neutral-400">
        <span>
          {label}
          {hint ? ` (${hint})` : ''}
        </span>
        <span className="text-sm font-semibold text-white">{value > 0 ? `≥${value}` : 'Any'}</span>
      </div>
      <div className="relative h-4">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-neutral-700" />
        <div
          className="absolute inset-y-0 left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand"
          style={{ right: `${100 - ((current - lo) / (hi - lo)) * 100}%` }}
        />
        <input
          type="range"
          min={lo}
          max={hi}
          value={current}
          onChange={(e) => onChange(Number(e.target.value) === lo ? 0 : Number(e.target.value))}
          className={THUMB_CLASSES}
        />
      </div>
    </div>
  )
}

/** Splits entries into an always-visible primary set and a "Show more"-gated secondary set. */
function useExpandable(items, isSecondary) {
  const [expanded, setExpanded] = useState(false)
  const primary = items.filter((item) => !isSecondary(item))
  const secondary = items.filter((item) => isSecondary(item))
  return { visible: expanded ? items : primary, secondary, expanded, setExpanded }
}

export default function MovieFilterDialog({
  open,
  onClose,
  filters,
  setFilters,
  bounds,
  presentGenres,
  distinctFranchises,
  onClearAll,
}) {
  const dialogRef = useRef(null)
  const [franchiseQuery, setFranchiseQuery] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const listEntries = Object.entries(filterSchema.list_labels).filter(([key]) => key !== '_comment')
  const lists = useExpandable(listEntries, ([key]) => SECONDARY_LISTS.has(key))
  const genres = useExpandable(presentGenres, (genre) => SECONDARY_GENRES.has(genre))

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  const patch = (partial) => setFilters((f) => ({ ...f, ...partial }))

  const visibleFranchises = franchiseQuery.trim()
    ? distinctFranchises.filter((f) => f.toLowerCase().includes(franchiseQuery.trim().toLowerCase()))
    : distinctFranchises

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full overscroll-contain overflow-y-auto rounded-t-2xl border-t border-neutral-800 bg-ink-soft p-0 text-white sm:static sm:m-auto sm:h-fit sm:max-h-[80dvh] sm:w-[min(32rem,calc(100vw-2rem))] sm:rounded-lg sm:border"
    >
      <div className="flex flex-col gap-6 p-5 pb-24">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Filters</h2>
          <button
            type="button"
            onClick={onClearAll}
            className="cursor-pointer text-sm text-neutral-400 transition-colors hover:text-white"
          >
            Clear all
          </button>
        </div>

        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-xs text-neutral-400">List</legend>
          <div className="flex flex-wrap gap-2">
            {lists.visible.map(([key, badge]) => (
              <Chip
                key={key}
                selected={filters.lists.includes(key)}
                onClick={() => patch({ lists: toggleInArray(filters.lists, key) })}
              >
                {badge.icon} {badge.label}
              </Chip>
            ))}
          </div>
          {lists.secondary.length > 0 && (
            <button
              type="button"
              onClick={() => lists.setExpanded((v) => !v)}
              className="cursor-pointer self-start text-sm text-brand hover:text-brand-hover"
            >
              {lists.expanded ? 'Show less' : `Show ${lists.secondary.length} more`}
            </button>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-xs text-neutral-400">Genre</legend>
          <div className="flex flex-wrap gap-2">
            {genres.visible.map((genre) => (
              <Chip
                key={genre}
                selected={filters.genres.includes(genre)}
                onClick={() => patch({ genres: toggleInArray(filters.genres, genre) })}
              >
                {genre}
              </Chip>
            ))}
          </div>
          {genres.secondary.length > 0 && (
            <button
              type="button"
              onClick={() => genres.setExpanded((v) => !v)}
              className="cursor-pointer self-start text-sm text-brand hover:text-brand-hover"
            >
              {genres.expanded ? 'Show less' : `Show ${genres.secondary.length} more`}
            </button>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-xs text-neutral-400">Franchise</legend>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={filters.onlyFranchise}
              onChange={(e) => patch({ onlyFranchise: e.target.checked })}
              className="size-4 accent-[var(--color-brand)]"
            />
            Only franchise movies
          </label>
          <input
            type="text"
            value={franchiseQuery}
            onChange={(e) => setFranchiseQuery(e.target.value)}
            placeholder="Search franchises…"
            className="rounded border border-neutral-700 bg-ink-raised px-2 py-1.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-neutral-400"
          />
          <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
            {visibleFranchises.slice(0, 60).map((franchise) => (
              <Chip
                key={franchise}
                selected={filters.franchises.includes(franchise)}
                onClick={() => patch({ franchises: toggleInArray(filters.franchises, franchise) })}
              >
                {franchise}
              </Chip>
            ))}
          </div>
        </fieldset>

        <RangeSlider
          label="Year"
          min={filters.yearMin}
          max={filters.yearMax}
          bound={{ min: bounds.yearMin, max: bounds.yearMax }}
          onMinChange={(v) => patch({ yearMin: v ?? bounds.yearMin })}
          onMaxChange={(v) => patch({ yearMax: v ?? bounds.yearMax })}
        />
        <RangeSlider
          label="Tomatometer"
          min={filters.tomatometerMin}
          max={filters.tomatometerMax}
          bound={{ min: 0, max: 100 }}
          onMinChange={(v) => patch({ tomatometerMin: v })}
          onMaxChange={(v) => patch({ tomatometerMax: v })}
        />
        <RangeSlider
          label="Popcornmeter"
          min={filters.audienceScoreMin}
          max={filters.audienceScoreMax}
          bound={{ min: 0, max: 100 }}
          onMinChange={(v) => patch({ audienceScoreMin: v })}
          onMaxChange={(v) => patch({ audienceScoreMax: v })}
        />

        <div className="flex flex-col gap-4 border-t border-neutral-800 pt-4">
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex cursor-pointer items-center gap-1.5 self-start text-sm text-neutral-400 hover:text-white"
          >
            <span className={`inline-block transition-transform ${advancedOpen ? 'rotate-90' : ''}`}>
              ›
            </span>
            Advanced filters
          </button>

          {advancedOpen && (
            <div className="flex flex-col gap-4">
              <RangeSlider
                label="Runtime"
                hint="min"
                min={filters.runtimeMin}
                max={filters.runtimeMax}
                bound={bounds.runtimeBounds}
                onMinChange={(v) => patch({ runtimeMin: v })}
                onMaxChange={(v) => patch({ runtimeMax: v })}
              />
              <MinSlider
                label="Min critic reviews"
                value={filters.minCriticReviews}
                bound={bounds.criticReviewCountBounds}
                onChange={(v) => patch({ minCriticReviews: v })}
              />
              <MinSlider
                label="Min audience ratings"
                hint={`always ≥${MIN_AUDIENCE_RATING_COUNT}`}
                value={filters.minAudienceRatings}
                bound={bounds.audienceRatingCountBounds}
                onChange={(v) => patch({ minAudienceRatings: v })}
              />
            </div>
          )}
        </div>

        <div className="flex items-end gap-4">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-xs text-neutral-400">Sort by</span>
            <select
              value={filters.sortBy}
              onChange={(e) => patch({ sortBy: e.target.value })}
              className="rounded border border-neutral-700 bg-ink-raised px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => patch({ sortDesc: !filters.sortDesc })}
            aria-pressed={filters.sortDesc}
            className="cursor-pointer rounded border border-neutral-700 bg-ink-raised px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-400"
            title={filters.sortDesc ? 'Descending' : 'Ascending'}
          >
            {filters.sortDesc ? '↓ Desc' : '↑ Asc'}
          </button>
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-neutral-800 bg-ink-soft p-4">
        <button
          type="button"
          onClick={onClose}
          className="w-full cursor-pointer rounded bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
        >
          Done
        </button>
      </div>
    </dialog>
  )
}
