import { useEffect, useRef, useState } from 'react'

import { fetchRtMovieInfo } from '@/lib/rtImport'
import { useMovieCatalogStore } from '@/store/useMovieCatalogStore'

const EMPTY_FORM = {
  title: '',
  year: '',
  genres: '',
  director: '',
  cast: '',
  runtime_minutes: '',
  poster: '',
  synopsis: '',
  tomatometer: '',
  audience_score: '',
  critic_review_count: '',
  audience_rating_count: '',
  rt_url: '',
}

const splitList = (text) =>
  text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const toIntOrNull = (text) => (text.trim() === '' ? null : Number.parseInt(text, 10) || null)

/** movie (fetch-rt-movie.ts's scraped shape) -> the string-valued form this dialog edits. Every
 * field renders as a plain text input, arrays included -- a full chip/tag editor is more UI than
 * a "fix the one field RT got wrong before saving" admin utility needs. */
function movieToForm(movie) {
  return {
    title: movie.title ?? '',
    year: movie.year != null ? String(movie.year) : '',
    genres: (movie.genres ?? []).join(', '),
    director: (movie.director ?? []).join(', '),
    cast: (movie.cast ?? []).join(', '),
    runtime_minutes: movie.runtime_minutes != null ? String(movie.runtime_minutes) : '',
    poster: movie.poster ?? '',
    synopsis: movie.synopsis ?? '',
    tomatometer: movie.tomatometer != null ? String(movie.tomatometer) : '',
    audience_score: movie.audience_score != null ? String(movie.audience_score) : '',
    critic_review_count: movie.critic_review_count != null ? String(movie.critic_review_count) : '',
    audience_rating_count: movie.audience_rating_count != null ? String(movie.audience_rating_count) : '',
    rt_url: movie.rt_url ?? '',
  }
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-neutral-400">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'rounded border border-neutral-700 bg-ink-raised px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-neutral-400'

/**
 * Admin-only "add a movie by hand" -- the /movies toolbar's +Add button (isAdmin-gated, see
 * Movies.jsx). Paste a Rotten Tomatoes link and fetch-rt-movie.ts (an Edge Function, not this
 * client) scrapes it; every field lands in an ordinary editable text input rather than a
 * read-only preview, since a scrape can mis-split a title or miss a field entirely and the whole
 * point is catching that before it's saved, not after.
 *
 * Also works with the URL field left blank -- fill in fields by hand for a title RT doesn't have
 * a usable page for at all.
 */
export default function AddMovieDialog({ open, onClose }) {
  const dialogRef = useRef(null)
  const addManualMovie = useMovieCatalogStore((state) => state.addManualMovie)

  const [rtUrl, setRtUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saved, setSaved] = useState(null) // the added movie's title, once saved

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  // Fresh form on every open -- reopening the dialog after adding one movie shouldn't hand back
  // the last one's now-stale data.
  useEffect(() => {
    if (open) {
      setRtUrl('')
      setFetching(false)
      setFetchError(null)
      setForm(EMPTY_FORM)
      setSaving(false)
      setSaveError(null)
      setSaved(null)
    }
  }, [open])

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const handleFetch = async () => {
    if (!rtUrl.trim() || fetching) return
    setFetching(true)
    setFetchError(null)
    try {
      const movie = await fetchRtMovieInfo(rtUrl)
      setForm(movieToForm(movie))
    } catch (error) {
      setFetchError(error.message)
    } finally {
      setFetching(false)
    }
  }

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    setSaveError(null)
    const result = await addManualMovie({
      title: form.title.trim(),
      year: toIntOrNull(form.year),
      genres: splitList(form.genres),
      director: splitList(form.director),
      cast: splitList(form.cast),
      runtime_minutes: toIntOrNull(form.runtime_minutes),
      poster: form.poster.trim() || null,
      synopsis: form.synopsis.trim() || null,
      tomatometer: toIntOrNull(form.tomatometer),
      audience_score: toIntOrNull(form.audience_score),
      critic_review_count: toIntOrNull(form.critic_review_count),
      audience_rating_count: toIntOrNull(form.audience_rating_count),
      rt_url: form.rt_url.trim() || null,
    })
    setSaving(false)
    if (result?.error) setSaveError(result.error)
    else setSaved(result.movie.title)
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      className="dialog-sheet [--dialog-width:34rem] overscroll-contain overflow-y-auto rounded-t-2xl border-t border-neutral-800 bg-ink-soft p-0 text-white sm:rounded-lg sm:border"
    >
      <div className="flex flex-col gap-4 p-5 pb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add a movie</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {saved ? (
          <div className="flex flex-col gap-3">
            <p className="rounded-lg bg-green-600/20 p-3 text-sm text-white">
              ✅ Added <span className="font-semibold">{saved}</span> to the catalog.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setRtUrl('')
                  setForm(EMPTY_FORM)
                  setSaved(null)
                }}
                className="flex-1 cursor-pointer rounded-lg border border-neutral-700 py-2.5 text-sm text-neutral-200 hover:border-neutral-400"
              >
                Add another
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 cursor-pointer rounded-lg bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand-hover"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 rounded-lg bg-ink-raised p-3">
              <span className="text-xs text-neutral-400">
                🍅 Paste a Rotten Tomatoes link to fill in the fields below
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={rtUrl}
                  onChange={(e) => setRtUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleFetch())}
                  placeholder="rottentomatoes.com/m/..."
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  onClick={handleFetch}
                  disabled={fetching || !rtUrl.trim()}
                  className="shrink-0 cursor-pointer rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-default disabled:opacity-50"
                >
                  {fetching ? 'Fetching…' : '⬇️ Fetch'}
                </button>
              </div>
              {fetchError && <p className="text-xs text-red-400">{fetchError}</p>}
            </div>

            <p className="text-xs text-neutral-500">
              Or fill in by hand below -- every field is editable, whether it came from the fetch
              or not.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Title *">
                <input type="text" value={form.title} onChange={setField('title')} className={inputClass} />
              </Field>
              <Field label="Year *">
                <input
                  type="number"
                  value={form.year}
                  onChange={setField('year')}
                  className={inputClass}
                />
              </Field>
              <Field label="Genres (comma-separated)">
                <input type="text" value={form.genres} onChange={setField('genres')} className={inputClass} />
              </Field>
              <Field label="Runtime (minutes)">
                <input
                  type="number"
                  value={form.runtime_minutes}
                  onChange={setField('runtime_minutes')}
                  className={inputClass}
                />
              </Field>
              <Field label="Director(s), comma-separated">
                <input type="text" value={form.director} onChange={setField('director')} className={inputClass} />
              </Field>
              <Field label="Cast, comma-separated">
                <input type="text" value={form.cast} onChange={setField('cast')} className={inputClass} />
              </Field>
              <Field label="Tomatometer %">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.tomatometer}
                  onChange={setField('tomatometer')}
                  className={inputClass}
                />
              </Field>
              <Field label="Critic review count">
                <input
                  type="number"
                  min="0"
                  value={form.critic_review_count}
                  onChange={setField('critic_review_count')}
                  className={inputClass}
                />
              </Field>
              <Field label="Audience score %">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.audience_score}
                  onChange={setField('audience_score')}
                  className={inputClass}
                />
              </Field>
              <Field label="Audience rating count">
                <input
                  type="number"
                  min="0"
                  value={form.audience_rating_count}
                  onChange={setField('audience_rating_count')}
                  className={inputClass}
                />
              </Field>
            </div>

            <Field label="Poster image URL">
              <input type="text" value={form.poster} onChange={setField('poster')} className={inputClass} />
            </Field>
            <Field label="Rotten Tomatoes URL">
              <input type="text" value={form.rt_url} onChange={setField('rt_url')} className={inputClass} />
            </Field>
            <Field label="Synopsis">
              <textarea
                value={form.synopsis}
                onChange={setField('synopsis')}
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </Field>

            {form.poster && (
              <img
                src={form.poster}
                alt=""
                className="aspect-2/3 w-20 self-start rounded object-cover"
                // A bad/mistyped poster URL shouldn't wreck the form's layout with a broken-image
                // icon -- just hide it, the URL text field itself still shows what was typed.
                onError={(e) => { e.currentTarget.style.display = 'none' }}
              />
            )}

            {saveError && (
              <p className="rounded-lg bg-red-950/40 p-2 text-sm text-red-400">{saveError}</p>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !form.title.trim() || !form.year.trim()}
              className="cursor-pointer rounded-lg bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover disabled:cursor-default disabled:opacity-50"
            >
              {saving ? 'Adding…' : '➕ Add to catalog'}
            </button>
          </>
        )}
      </div>
    </dialog>
  )
}
