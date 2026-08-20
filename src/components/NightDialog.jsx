import { useEffect, useRef, useState } from 'react'

import { useAppStore } from '@/store/useAppStore'
import { usePlanStore } from '@/store/usePlanStore'

function FilmPicker({ watchlistEntries, onPick }) {
  if (watchlistEntries.length === 0) {
    return (
      <p className="text-xs text-neutral-500">
        Watchlist is empty — add movies from the search page first.
      </p>
    )
  }
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {watchlistEntries.map((entry) => (
        <button
          key={entry.movieId}
          type="button"
          title={entry.movie?.title}
          onClick={() => onPick(entry.movieId)}
          className="w-16 shrink-0 cursor-pointer overflow-hidden rounded"
        >
          {entry.movie?.poster ? (
            <img src={entry.movie.poster} alt="" className="aspect-2/3 w-full object-cover" />
          ) : (
            <div className="flex aspect-2/3 w-full items-center justify-center bg-ink-raised px-1 text-center text-[10px] text-neutral-500">
              {entry.movie?.title ?? '…'}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}

function NightRow({ night, watchlistEntries, moviesById }) {
  const updateNight = usePlanStore((state) => state.updateNight)
  const deleteNight = usePlanStore((state) => state.deleteNight)
  const [pickerOpen, setPickerOpen] = useState(false)
  const movie = night.movie_id ? moviesById.get(night.movie_id) : null

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-neutral-800 p-3">
      <div className="flex items-center justify-between gap-2">
        <input
          type="time"
          value={night.start_time ? night.start_time.slice(0, 5) : ''}
          onChange={(e) => updateNight(night.id, { start_time: e.target.value || null })}
          className="rounded border border-neutral-700 bg-ink-raised px-2 py-1 text-sm text-white outline-none focus:border-neutral-400"
        />
        <button
          type="button"
          onClick={() => deleteNight(night.id)}
          className="cursor-pointer text-xs text-red-400 hover:text-red-300"
        >
          Cancel night
        </button>
      </div>

      {night.movie_id ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-white">{movie ? movie.title : '…'}</span>
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            className="cursor-pointer text-xs text-neutral-400 hover:text-white"
          >
            Change film
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          className="cursor-pointer self-start text-sm text-brand hover:text-brand-hover"
        >
          + Pick a film from the watchlist
        </button>
      )}

      {pickerOpen && (
        <FilmPicker
          watchlistEntries={watchlistEntries}
          onPick={(movieId) => {
            updateNight(night.id, { movie_id: movieId })
            setPickerOpen(false)
          }}
        />
      )}

      <input
        type="text"
        value={night.note ?? ''}
        onChange={(e) => updateNight(night.id, { note: e.target.value || null })}
        placeholder="Note (optional)"
        className="rounded border border-neutral-700 bg-ink-raised px-2 py-1.5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-neutral-400"
      />
    </div>
  )
}

export default function NightDialog({ open, onClose, iso, dateLabel, nights, watchlistEntries, moviesById }) {
  const dialogRef = useRef(null)
  const profileId = useAppStore((state) => state.currentProfileId)
  const scheduleNight = usePlanStore((state) => state.scheduleNight)
  const [newTime, setNewTime] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setNewTime('')
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const handleAdd = async () => {
    await scheduleNight({ scheduledFor: iso, startTime: newTime, createdBy: profileId })
    setNewTime('')
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[85dvh] w-full overscroll-contain overflow-y-auto rounded-t-2xl border-t border-neutral-800 bg-ink-soft p-0 text-white sm:static sm:m-auto sm:h-fit sm:max-h-[80dvh] sm:w-[min(28rem,calc(100vw-2rem))] sm:rounded-lg sm:border"
    >
      <div className="flex flex-col gap-4 p-5 pb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{dateLabel}</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {nights.map((night) => (
          <NightRow
            key={night.id}
            night={night}
            watchlistEntries={watchlistEntries}
            moviesById={moviesById}
          />
        ))}

        <div className="flex flex-col gap-2 border-t border-neutral-800 pt-4">
          <span className="text-xs text-neutral-400">Add a movie night on this date</span>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="rounded border border-neutral-700 bg-ink-raised px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
            />
            <button
              type="button"
              onClick={handleAdd}
              className="flex-1 cursor-pointer rounded bg-brand py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
            >
              + Add night
            </button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
