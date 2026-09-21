import { avatarSrc, isAdmin } from '@/data/avatars'
import { useAppStore, useCurrentProfile } from '@/store/useAppStore'
import { usePlanStore } from '@/store/usePlanStore'

/**
 * "Are you coming?" for one night. Three states, and the third is the point: no row at all means
 * you haven't answered, which is what makes "still to reply" visible rather than silently
 * lumping undecided people in with either answer.
 *
 * On a past night the same rows record who was actually there (they feed the Watched shelf's
 * avatars), so the wording turns past tense, and the admin gets a picker to tick anyone in --
 * a night logged after the fact usually has nobody's answer on it.
 */
export default function NightRsvp({ nightId, isPast = false }) {
  const admin = isAdmin(useCurrentProfile())
  const profileId = useAppStore((state) => state.currentProfileId)
  const profiles = useAppStore((state) => state.profiles)
  const rsvps = usePlanStore((state) => state.rsvpsByNight.get(nightId) ?? EMPTY)
  const setRsvp = usePlanStore((state) => state.setRsvp)

  const mine = rsvps.find((r) => r.profile_id === profileId)
  const byId = new Map(profiles.map((p) => [p.id, p]))
  const going = rsvps.filter((r) => r.going).map((r) => byId.get(r.profile_id)).filter(Boolean)
  const out = rsvps.filter((r) => !r.going).map((r) => byId.get(r.profile_id)).filter(Boolean)
  const answered = new Set(rsvps.map((r) => r.profile_id))
  const pending = profiles.filter((p) => !answered.has(p.id))

  // Tapping the answer you already gave clears it -- the only way back to "undecided".
  const choose = (value) => setRsvp(nightId, profileId, mine?.going === value ? null : value)
  // Admin picker: tapping someone marks them as there, tapping again clears them.
  const toggleAttendee = (id) =>
    setRsvp(nightId, id, rsvps.find((r) => r.profile_id === id)?.going === true ? null : true)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Choice
          active={mine?.going === true}
          onClick={() => choose(true)}
          label={isPast ? '✓ I was in' : '✓ I’m in'}
          activeClass="bg-green-600 text-white"
        />
        <Choice
          active={mine?.going === false}
          onClick={() => choose(false)}
          label={isPast ? '✕ Couldn’t make it' : '✕ Can’t make it'}
          activeClass="bg-red-600 text-white"
        />
      </div>

      {isPast && admin ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-neutral-500">Who was there? Tap to toggle.</span>
          <div className="flex flex-wrap gap-2">
            {profiles.map((p) => {
              const there = going.includes(p)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggleAttendee(p.id)}
                  aria-pressed={there}
                  title={p.name}
                  className="flex w-12 cursor-pointer flex-col items-center gap-1"
                >
                  <img
                    src={avatarSrc(p.avatar)}
                    alt=""
                    className={`size-9 rounded-full object-cover ring-2 transition ${
                      there ? 'ring-green-500' : 'opacity-40 ring-neutral-700 grayscale'
                    }`}
                  />
                  <span
                    className={`w-full truncate text-center text-[10px] ${there ? 'text-white' : 'text-neutral-500'}`}
                  >
                    {p.name}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {going.length > 0 && (
            <Row tint="ring-green-500" label={`${going.length} ${isPast ? 'there' : 'coming'}`} people={going} />
          )}
          {out.length > 0 && (
            <Row tint="ring-red-500/60" label={`${out.length} ${isPast ? 'missed it' : 'out'}`} people={out} dim />
          )}
          {pending.length > 0 && (
            <Row tint="ring-neutral-700" label={`${pending.length} no reply`} people={pending} dim />
          )}
        </div>
      )}
    </div>
  )
}

// Stable reference for "this night has no replies yet": returning a fresh [] from the selector
// would make Object.is fail every time and re-render on every unrelated store write.
const EMPTY = []

// Module scope, not inline in the component: a component declared during render is a new type on
// every pass, so React remounts it and the button loses focus mid-interaction.
function Choice({ active, onClick, label, activeClass }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 cursor-pointer rounded-lg py-2 text-sm font-semibold transition-colors ${
        active ? activeClass : 'bg-ink-raised text-neutral-400 hover:bg-neutral-700'
      }`}
    >
      {label}
    </button>
  )
}

function Row({ label, people, tint, dim }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex -space-x-1.5">
        {people.map((p) => (
          <img
            key={p.id}
            src={avatarSrc(p.avatar)}
            alt=""
            title={p.name}
            className={`size-6 rounded-full object-cover ring-2 ${tint} ${dim ? 'opacity-50' : ''}`}
          />
        ))}
      </span>
      <span className="text-neutral-500">{label}</span>
    </span>
  )
}
