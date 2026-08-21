/**
 * Built-in avatars. Netflix's own avatar art is copyrighted, so these are simple flat SVGs
 * shipped from /public — no network calls, and easy to swap for real pictures later.
 *
 * Profiles store the avatar `id`, never the resolved URL: the URL depends on BASE_URL (and, for
 * the photos below, on a build-time content hash), and persisting it would break every saved
 * profile the next time either changes.
 */
const withBase = (file) => `${import.meta.env.BASE_URL}avatars/${file}`

export const AVATARS = [
  { id: 'a1', label: 'Red', src: withBase('a1.svg') },
  { id: 'a2', label: 'Blue', src: withBase('a2.svg') },
  { id: 'a3', label: 'Amber', src: withBase('a3.svg') },
  { id: 'a4', label: 'Green', src: withBase('a4.svg') },
  { id: 'a5', label: 'Purple', src: withBase('a5.svg') },
  { id: 'a6', label: 'Teal', src: withBase('a6.svg') },
]

export const DEFAULT_AVATAR_ID = AVATARS[0].id

/**
 * Everyone can change their own picture; this one profile can change anybody's. Matched on name
 * because that's the only stable handle -- profile ids are generated per environment, so
 * hardcoding one would break the moment the table is rebuilt.
 *
 * Not a security boundary (there's no auth here at all, see plan_schema.sql) -- it just keeps the
 * edit button pointed at your own profile rather than offering everyone's by default.
 */
const ADMIN_PROFILE_NAME = 'gaybes'

export function canEditAllProfiles(profile) {
  return String(profile?.name ?? '').trim().toLowerCase() === ADMIN_PROFILE_NAME
}

/**
 * Personal photos, discovered at BUILD time from src/assets/photos/ -- dropping a new file in
 * that folder is the whole job, no list to keep in sync here. They live in src/ rather than
 * public/ precisely so this glob can see them (Vite copies public/ verbatim without indexing it),
 * which also gets them content-hashed filenames, so replacing a photo can't leave a stale copy
 * in anyone's cache.
 *
 * Naming is the convention that does the work: `<person>.jpg` is that person's default and
 * `<person>_<whatever>.jpg` is an alternate -- marie.jpg, marie_1.jpg, marie_beach.jpg all group
 * under "marie". The id stored on the profile is just the filename without its extension.
 *
 * Deliberately NOT part of AVATARS (the picker in AddProfileDialog): these are specific people's
 * own faces, not generic options for anyone creating a profile.
 */
const photoModules = import.meta.glob('../assets/photos/*.{jpg,jpeg,png,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const PHOTO_AVATARS = {}
for (const [path, url] of Object.entries(photoModules)) {
  const id = path.split('/').pop().replace(/\.[^.]+$/, '')
  PHOTO_AVATARS[id] = url
}

/** Owner key for a photo id: the part before the first underscore. */
function photoOwner(id) {
  return id.split('_')[0]
}

/**
 * Every photo belonging to `name`, default first, then alternates alphabetically -- the choices
 * offered when editing that profile. Empty for a profile whose name has no photos in the repo
 * (they get the generic SVGs instead).
 */
export function photosFor(name) {
  const owner = String(name ?? '').trim().toLowerCase()
  if (!owner) return []
  return Object.keys(PHOTO_AVATARS)
    .filter((id) => photoOwner(id) === owner)
    .sort((a, b) => {
      // The bare name (no underscore) is the default and sorts first; the rest are A-Z.
      if (a === owner) return -1
      if (b === owner) return 1
      return a.localeCompare(b)
    })
    .map((id) => ({ id, src: PHOTO_AVATARS[id] }))
}

export function avatarSrc(id) {
  if (PHOTO_AVATARS[id]) return PHOTO_AVATARS[id]
  const match = AVATARS.find((avatar) => avatar.id === id)
  return (match ?? AVATARS[0]).src
}

export function randomAvatarId() {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)].id
}
