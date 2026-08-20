import { useEffect, useRef, useState } from 'react'

import { MIN_AUDIENCE_RATING_COUNT, SORT_OPTIONS } from '@/data/movieCatalog'
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
        selected
          ? 'bg-brand text-white'
          : 'bg-ink-raised text-neutral-300 hover:bg-neutral-700'
      }`}
    >
      {children}
    </button>
  )
}

function RangeInputs({ label, hint, min, max, onMinChange, onMaxChange, bound }) {
  const parse = (raw) => (raw === '' ? null : Number(raw))
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-neutral-400">
        {label}
        {hint ? ` (${hint})` : ''}
      </span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={bound?.min ?? undefined}
          max={bound?.max ?? undefined}
          placeholder={bound?.min != null ? String(bound.min) : 'Min'}
          value={min ?? ''}
          onChange={(e) => onMinChange(parse(e.target.value))}
          className="w-full rounded border border-neutral-700 bg-ink-raised px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
        />
        <span className="text-neutral-600">–</span>
        <input
          type="number"
          inputMode="numeric"
          min={bound?.min ?? undefined}
          max={bound?.max ?? undefined}
          placeholder={bound?.max != null ? String(bound.max) : 'Max'}
          value={max ?? ''}
          onChange={(e) => onMaxChange(parse(e.target.value))}
          className="w-full rounded border border-neutral-700 bg-ink-raised px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
        />
      </div>
    </div>
  )
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
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border-t border-neutral-800 bg-ink-soft p-0 text-white sm:static sm:m-auto sm:h-fit sm:max-h-[80dvh] sm:w-[min(32rem,calc(100vw-2rem))] sm:rounded-lg sm:border"
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
            {Object.entries(filterSchema.list_labels)
              .filter(([key]) => key !== '_comment')
              .map(([key, badge]) => (
                <Chip
                  key={key}
                  selected={filters.lists.includes(key)}
                  onClick={() => patch({ lists: toggleInArray(filters.lists, key) })}
                >
                  {badge.icon} {badge.label}
                </Chip>
              ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-xs text-neutral-400">Genre</legend>
          <div className="flex flex-wrap gap-2">
            {presentGenres.map((genre) => (
              <Chip
                key={genre}
                selected={filters.genres.includes(genre)}
                onClick={() => patch({ genres: toggleInArray(filters.genres, genre) })}
              >
                {genre}
              </Chip>
            ))}
          </div>
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

        <div className="grid grid-cols-2 gap-4">
          <RangeInputs
            label="Year"
            min={filters.yearMin}
            max={filters.yearMax}
            bound={{ min: bounds.yearMin, max: bounds.yearMax }}
            onMinChange={(v) => patch({ yearMin: v ?? bounds.yearMin })}
            onMaxChange={(v) => patch({ yearMax: v ?? bounds.yearMax })}
          />
          <RangeInputs
            label="Runtime (min)"
            min={filters.runtimeMin}
            max={filters.runtimeMax}
            bound={bounds.runtimeBounds}
            onMinChange={(v) => patch({ runtimeMin: v })}
            onMaxChange={(v) => patch({ runtimeMax: v })}
          />
          <RangeInputs
            label="Tomatometer"
            min={filters.tomatometerMin}
            max={filters.tomatometerMax}
            bound={{ min: 0, max: 100 }}
            onMinChange={(v) => patch({ tomatometerMin: v })}
            onMaxChange={(v) => patch({ tomatometerMax: v })}
          />
          <RangeInputs
            label="Popcornmeter"
            min={filters.audienceScoreMin}
            max={filters.audienceScoreMax}
            bound={{ min: 0, max: 100 }}
            onMinChange={(v) => patch({ audienceScoreMin: v })}
            onMaxChange={(v) => patch({ audienceScoreMax: v })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-neutral-400">Min critic reviews</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={filters.minCriticReviews || ''}
              onChange={(e) => patch({ minCriticReviews: Number(e.target.value) || 0 })}
              placeholder="0"
              className="rounded border border-neutral-700 bg-ink-raised px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-neutral-400">
              Min audience ratings (always ≥{MIN_AUDIENCE_RATING_COUNT})
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={MIN_AUDIENCE_RATING_COUNT}
              value={filters.minAudienceRatings || ''}
              onChange={(e) => patch({ minAudienceRatings: Number(e.target.value) || 0 })}
              placeholder={String(MIN_AUDIENCE_RATING_COUNT)}
              className="rounded border border-neutral-700 bg-ink-raised px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
            />
          </label>
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
