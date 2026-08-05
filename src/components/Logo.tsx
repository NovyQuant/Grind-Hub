import { useId } from 'react'

/** Kanciaste „G": obrys zewnętrzny ze ściętymi rogami, otwarta paszcza i belka. */
const G_PATH =
  'M35 15 L72 15 L59 28 L41 28 L28 41 L28 59 L41 72 L59 72 L72 59 L50 59 L56 46 L85 46 L85 65 L65 85 L35 85 L15 65 L15 35 Z'

/**
 * Logo Grind Hub — kanciaste „G" w czarno-czerwonym kaflu.
 * Ta sama geometria co public/favicon.svg (viewBox 100×100).
 */
export default function Logo({ size = 28, className = '' }: { size?: number; className?: string }) {
  const uid = useId().replace(/:/g, '')
  const tile = `tile-${uid}`
  const mark = `mark-${uid}`
  const glow = `glow-${uid}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Grind Hub"
    >
      <defs>
        <linearGradient id={tile} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1b1e24" />
          <stop offset="1" stopColor="#07080b" />
        </linearGradient>
        <linearGradient id={mark} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#ff6b6b" />
          <stop offset="0.5" stopColor="#e5171f" />
          <stop offset="1" stopColor="#8e0a12" />
        </linearGradient>
        <filter id={glow} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>

      <rect width="100" height="100" rx="24" fill={`url(#${tile})`} />
      <rect
        x="1.25"
        y="1.25"
        width="97.5"
        height="97.5"
        rx="23"
        fill="none"
        stroke="#e5171f"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />

      <g filter={`url(#${glow})`} opacity="0.5">
        <path fill="#ff2d38" d={G_PATH} />
      </g>
      <path fill={`url(#${mark})`} d={G_PATH} />
    </svg>
  )
}
