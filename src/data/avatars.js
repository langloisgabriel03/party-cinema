/**
 * Built-in avatars. Netflix's own avatar art is copyrighted, so these are simple flat SVGs
 * shipped from /public — no network calls, and easy to swap for real pictures later.
 *
 * Profiles store the avatar `id`, never the resolved URL: the URL depends on BASE_URL, and
 * persisting it would break every saved profile if the deploy path ever changes.
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

export function avatarSrc(id) {
  const match = AVATARS.find((avatar) => avatar.id === id)
  return (match ?? AVATARS[0]).src
}

export function randomAvatarId() {
  return AVATARS[Math.floor(Math.random() * AVATARS.length)].id
}
