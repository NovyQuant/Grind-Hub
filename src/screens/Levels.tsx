import { useMemo } from 'react'
import { useAbstinences, useHabits, useLogs } from '../lib/queries'
import { computeProgress } from '../lib/progress'
import { computeRank } from '../lib/rank'
import { AREAS, AREA_ICONS, AREA_LABELS } from '../lib/types'
import { parseISO } from '../lib/date'

const WEEKDAY = ['N', 'P', 'W', 'Ś', 'C', 'P', 'S'] // getDay(): 0 = niedziela

/** Słupkowy wykres XP dzień po dniu: zielone nad zerem, czerwone pod. */
function XPChart({ history }: { history: { date: string; xp: number }[] }) {
  const days = history.slice(-14)
  if (days.length === 0) return null

  const W = 336 // 14 × 24
  const H = 144
  const AXIS = 16 // miejsce na litery dni
  const PAD = 12 // miejsce na etykietę nad słupkiem
  const plotH = H - AXIS - PAD
  const slot = W / days.length
  const barW = slot - 4
  // jedna skala px/XP dla obu stron zera
  const maxPos = Math.max(0, ...days.map((d) => d.xp))
  const maxNeg = Math.max(0, ...days.map((d) => -d.xp))
  const unit = plotH / Math.max(1, maxPos + maxNeg)
  const zeroY = PAD + maxPos * unit

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="XP dzień po dniu">
      {/* linia zera */}
      <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="#243040" strokeWidth={1} />
      {days.map((d, i) => {
        const isLast = i === days.length - 1
        const h = Math.abs(d.xp) * unit
        const x = i * slot + 2
        const y = d.xp >= 0 ? zeroY - h : zeroY
        const dow = parseISO(d.date).getDay()
        return (
          <g key={d.date}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, d.xp === 0 ? 1.5 : 2)}
              rx={3}
              fill={d.xp < 0 ? '#e5484d' : d.xp === 0 ? '#243040' : '#30c85e'}
              opacity={isLast ? 1 : 0.85}
            >
              <title>{`${d.date}: ${d.xp >= 0 ? '+' : ''}${d.xp} XP`}</title>
            </rect>
            {isLast && (
              <text
                x={x + barW / 2}
                y={d.xp >= 0 ? y - 4 : zeroY - 4}
                textAnchor="middle"
                fontSize={9}
                fontWeight={800}
                fill={d.xp < 0 ? '#e5484d' : '#30c85e'}
              >
                {d.xp >= 0 ? '+' : ''}{d.xp}
              </text>
            )}
            <text
              x={x + barW / 2}
              y={H - 4}
              textAnchor="middle"
              fontSize={8}
              fill={isLast ? '#e6edf5' : '#7c8ba1'}
              fontWeight={isLast ? 800 : 500}
            >
              {WEEKDAY[dow]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** Pierścień postępu poziomu (SVG). */
function LevelRing({ level, pct, good }: { level: number; pct: number; good: boolean }) {
  const R = 24
  const C = 2 * Math.PI * R
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 60 60" className="h-full w-full -rotate-90">
        <circle cx={30} cy={30} r={R} fill="none" stroke="#1a2330" strokeWidth={5} />
        <circle
          cx={30}
          cy={30}
          r={R}
          fill="none"
          stroke={good ? '#30c85e' : '#f5a524'}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${(Math.min(100, Math.max(0, pct)) / 100) * C} ${C}`}
          className="transition-all"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-black leading-none">{level}</span>
        <span className="text-[8px] uppercase tracking-wider text-muted">lvl</span>
      </div>
    </div>
  )
}

export default function Levels() {
  const habits = useHabits()
  const logs = useLogs()
  const abstinences = useAbstinences()

  const p = useMemo(
    () => computeProgress(habits.data ?? [], logs.data ?? []),
    [habits.data, logs.data]
  )
  const rank = useMemo(
    () => computeRank(habits.data ?? [], logs.data ?? [], abstinences.data ?? []),
    [habits.data, logs.data, abstinences.data]
  )

  if (habits.isLoading || logs.isLoading)
    return <div className="p-6 text-muted">Ładowanie…</div>

  const last14 = rank.history.slice(-14)
  const sum14 = last14.reduce((s, d) => s + d.xp, 0)

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Poziomy 🎮</h1>

      {/* Wykres XP — ostatnie 14 dni */}
      <div className="mb-5 rounded-2xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wide text-muted">XP — ostatnie 14 dni</span>
          <span
            className={`text-sm font-black tabular-nums ${
              sum14 < 0 ? 'text-rating-bad' : 'text-rating-good'
            }`}
          >
            {sum14 >= 0 ? '+' : ''}{sum14} XP
          </span>
        </div>
        <XPChart history={rank.history} />
      </div>

      {/* Streaki per obszar — rozpisane */}
      <h2 className="mb-2 px-1 text-xs uppercase tracking-wide text-muted">Streaki</h2>
      <div className="mb-5 flex flex-col gap-2">
        {AREAS.map((area) => {
          const s = p.streaks[area]
          const t = rank.perAreaToday[area]
          const week = s.unit === 'week'
          const pct = week && s.weekTarget > 0 ? Math.min(100, (s.weekAcc / s.weekTarget) * 100) : 0
          return (
            <div
              key={area}
              className={`rounded-2xl border p-3.5 ${
                s.periodDone ? 'border-rating-good/50 bg-rating-good/5' : 'border-border bg-surface'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{AREA_ICONS[area]}</span>
                <span className="font-semibold">{AREA_LABELS[area]}</span>
                {t && t.mult > 1 && (
                  <span
                    className="rounded-full bg-[#a855f7]/15 px-2 py-0.5 text-[10px] font-black text-[#c084fc]"
                    title="Mnożnik XP za serię"
                  >
                    ×{t.mult.toFixed(2).replace(/0$/, '')} XP
                  </span>
                )}
                <span className="ml-auto text-xl font-black tabular-nums">
                  🔥 {s.current}
                  <span className="ml-1 text-xs font-medium text-muted">{week ? 'tyg' : 'dni'}</span>
                </span>
              </div>
              {week ? (
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface2">
                    <div
                      className={`h-full rounded-full transition-all ${
                        s.periodDone ? 'bg-rating-good' : 'bg-[#a855f7]'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span
                    className={`text-xs font-bold tabular-nums ${
                      s.periodDone ? 'text-rating-good' : 'text-[#c084fc]'
                    }`}
                  >
                    {s.periodDone ? '✓ tydzień zaliczony' : `${s.weekAcc}/${s.weekTarget} w tym tyg`}
                  </span>
                </div>
              ) : (
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className={s.periodDone ? 'text-rating-good' : 'text-muted'}>
                    {s.periodDone ? '✓ dziś zaliczone' : 'dziś jeszcze nie'}
                  </span>
                  <span className="text-muted">rekord {s.best}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Poziomy obszarów */}
      <h2 className="mb-2 px-1 text-xs uppercase tracking-wide text-muted">Atrybuty</h2>
      <div className="mb-5 grid gap-3 md:grid-cols-2">
        {AREAS.map((area) => {
          const lv = p.levels[area]
          const pct = lv.threshold > 0 ? (lv.progress / lv.threshold) * 100 : 0
          const goodToday = lv.todayF >= 0.8
          const missing = lv.threshold - lv.progress
          return (
            <div key={area} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
              <LevelRing level={lv.level} pct={pct} good={goodToday} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{AREA_ICONS[area]}</span>
                  <span className="font-semibold">{AREA_LABELS[area]}</span>
                  <span className="ml-auto text-[11px] tabular-nums text-muted">
                    {lv.progress}/{lv.threshold}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface2">
                  <div
                    className="h-full bg-gradient-to-r from-rating-mid to-rating-good transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 text-xs font-semibold">
                  brakuje <span className="text-rating-good">{missing}</span>{' '}
                  {missing === 1 ? 'dobrego dnia' : 'dobrych dni'} do lvl {lv.level + 1}
                </div>
                {lv.badDays > 0 && (
                  <div className="mt-0.5 text-[11px] text-rating-bad">
                    ⚠ {lv.badDays}/7 słabych dni — {7 - lv.badDays} do spadku
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Tydzień */}
      <h2 className="mb-2 px-1 text-xs uppercase tracking-wide text-muted">Ostatnie 7 dni</h2>
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex flex-col gap-1.5">
          {AREAS.map((area) => (
            <div key={area} className="flex items-center gap-2">
              <span className="w-6 text-center">{AREA_ICONS[area]}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface2">
                <div
                  className="h-full bg-rating-good"
                  style={{ width: `${p.week.perArea[area]}%` }}
                />
              </div>
              <span className="w-9 text-right text-[11px] text-muted">
                {p.week.perArea[area]}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
