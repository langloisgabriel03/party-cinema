import { avatarSrc } from '@/data/avatars'

// Shared tile geometry so the "add" tile lines up perfectly with real profiles.
const TILE = 'group flex w-34 shrink-0 cursor-pointer flex-col items-center gap-3 outline-none sm:w-40'

export default function ProfileCard({ profile, onSelect, managing, onEdit }) {
  return (
    <button
      type="button"
      onClick={() => (managing ? onEdit(profile) : onSelect(profile))}
      className={TILE}
      aria-label={managing ? `Edit ${profile.name}` : `Continue as ${profile.name}`}
    >
      <span className="relative block aspect-square w-full">
        <img
          src={avatarSrc(profile.avatar)}
          alt=""
          draggable="false"
          className={`aspect-square w-full rounded-lg ring-0 ring-white transition-all duration-200 group-hover:ring-4 group-focus-visible:ring-4 ${
            managing ? 'brightness-50' : ''
          }`}
        />
        {managing && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-3xl">
            ✏️
          </span>
        )}
      </span>
      <span className="max-w-full truncate text-base text-neutral-400 transition-colors group-hover:text-white group-focus-visible:text-white sm:text-lg">
        {profile.name}
      </span>
    </button>
  )
}

/** Empty-state / shortcut tile, so a fresh browser never shows a blank row. */
export function AddProfileTile({ onClick }) {
  return (
    <button type="button" onClick={onClick} className={TILE} aria-label="Add a profile">
      <span className="flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed border-neutral-700 text-6xl font-extralight leading-none text-neutral-600 transition-colors group-hover:border-white group-hover:text-white group-focus-visible:border-white group-focus-visible:text-white">
        +
      </span>
      <span className="text-base text-neutral-400 transition-colors group-hover:text-white group-focus-visible:text-white sm:text-lg">
        Add profile
      </span>
    </button>
  )
}
