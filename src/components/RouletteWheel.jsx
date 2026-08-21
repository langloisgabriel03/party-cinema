import { useEffect, useState } from 'react'

// Cycled by wedge index -- distinct from the app's ink/brand palette on purpose, a wheel reads as
// a wheel because of the color contrast between neighboring wedges.
const WEDGE_COLORS = [
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0891b2',
  '#2563eb',
  '#7c3aed',
  '#db2777',
]

const SPIN_DURATION_MS = 4500
const EXTRA_SPINS = 5

/** angleDeg is clockwise from the top (12 o'clock = 0). */
function pointOnCircle(cx, cy, r, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) }
}

function wedgePath(cx, cy, r, startAngle, endAngle) {
  const p1 = pointOnCircle(cx, cy, r, startAngle)
  const p2 = pointOnCircle(cx, cy, r, endAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${cx},${cy} L ${p1.x},${p1.y} A ${r},${r} 0 ${largeArc} 1 ${p2.x},${p2.y} Z`
}

function truncate(text, max) {
  if (text.length <= max) return text
  return text.slice(0, max - 1).trimEnd() + '…'
}

/**
 * A classic pie-slice roulette wheel -- one wedge per pool entry, re-sliced on every render so it
 * grows/shrinks live as movies are added or removed. `spinning`/`winnerIndex` are controlled by
 * the parent (Roulette.jsx), which also freezes the entry list for the duration of a spin so a
 * pool change mid-animation can never desync the wedge the wheel lands on from the winner it
 * actually picked -- see the wheelPool snapshot there.
 */
export default function RouletteWheel({ entries, spinning, winnerIndex, onSpinEnd }) {
  const [rotation, setRotation] = useState(0)
  const n = entries.length
  const wedgeAngle = n > 0 ? 360 / n : 360

  useEffect(() => {
    if (!spinning || winnerIndex == null || n === 0) return
    const winnerCenter = winnerIndex * wedgeAngle + wedgeAngle / 2
    // Land somewhere inside the wedge, not always dead-center -- reads as less mechanical.
    const jitter = (Math.random() - 0.5) * wedgeAngle * 0.6
    const target = (((360 - (winnerCenter + jitter)) % 360) + 360) % 360
    const currentMod = ((rotation % 360) + 360) % 360
    let delta = target - currentMod
    if (delta < 0) delta += 360
    setRotation((r) => r + EXTRA_SPINS * 360 + delta)
    const timer = setTimeout(() => onSpinEnd?.(), SPIN_DURATION_MS)
    return () => clearTimeout(timer)
    // Only re-run when a spin is kicked off -- `rotation` changing (which this effect itself
    // causes) must not retrigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, winnerIndex])

  const maxChars = Math.max(6, Math.min(18, Math.round(wedgeAngle / 2.2)))
  const fontSize = n <= 4 ? 9 : n <= 8 ? 7.5 : 6

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[280px]">
      <div className="absolute inset-x-0 -top-1 z-10 flex justify-center">
        <div className="h-0 w-0 border-x-[10px] border-t-[16px] border-x-transparent border-t-white drop-shadow-md" />
      </div>
      <svg
        viewBox="0 0 200 200"
        className="size-full"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning
            ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.17, 0.67, 0.14, 0.99)`
            : 'none',
        }}
      >
        <circle cx="100" cy="100" r="98" fill="#141414" />
        {n === 0 ? (
          <text x="100" y="104" fill="#737373" fontSize="10" textAnchor="middle">
            Empty
          </text>
        ) : (
          entries.map((entry, i) => {
            const start = i * wedgeAngle
            const end = start + wedgeAngle
            const mid = start + wedgeAngle / 2
            const labelPos = pointOnCircle(100, 100, 66, mid)
            return (
              <g key={entry.movieId}>
                <path
                  d={wedgePath(100, 100, 95, start, end)}
                  fill={WEDGE_COLORS[i % WEDGE_COLORS.length]}
                  stroke="#141414"
                  strokeWidth="1.5"
                />
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  fill="white"
                  fontSize={fontSize}
                  fontWeight="600"
                  textAnchor="middle"
                  transform={`rotate(${mid}, ${labelPos.x}, ${labelPos.y})`}
                >
                  {truncate(entry.movie?.title ?? '…', maxChars)}
                </text>
              </g>
            )
          })
        )}
        <circle cx="100" cy="100" r="15" fill="#1a1a1a" stroke="#404040" strokeWidth="2" />
        <text x="100" y="104" fontSize="14" textAnchor="middle">
          🎬
        </text>
      </svg>
    </div>
  )
}
