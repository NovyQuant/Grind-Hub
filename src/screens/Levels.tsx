import { useMemo } from 'react'
import { useHabits, useLogs } from '../lib/queries'
import { computeProgress } from '../lib/progress'
import { AREAS, AREA_ICONS, AREA_LABELS } from '../lib/types'

export default function Levels() {
  const habits = useHabits()
  const logs = useLogs()

  const p = useMemo(
    () => computeProgress(habits.data ?? [], logs.data ?? []),
    [habits.data, logs.data]
  )

  if (habits.isLoading || logs.isLoading)
    return <div className="p-6 text-muted">Ładowanie…</div>

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Poziomy 🎮</h1>

      {/* Streaki per obszar */}
      <div className="mb-5 rounded-2xl border border-border bg-surface p-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-muted">Streaki</div>
        <div className="flex flex-col gap-2">
          {AREAS.map((area) => {
            const s = p.streaks[area]
            return (
              <div key={area} className="flex items-center gap-2 text-sm">
                <span className="w-6 text-center">{AREA_ICONS[area]}</span>
                <span className="flex-1 font-medium">{AREA_LABELS[area]}</span>
                <span className="font-black tabular-nums">🔥 {s.current}</span>
                <span className="w-7 text-[11px] text-muted">{s.unit === 'week' ? 'tyg' : 'dni'}</span>
                <span className="w-16 text-right text-[11px] text-muted">rekord {s.best}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Poziomy obszarów */}
      <h2 className="mb-2 px-1 text-xs uppercase tracking-wide text-muted">Atrybuty</h2>
      <div className="mb-5 grid gap-3 md:grid-cols-2">
        {AREAS.map((area) => {
          const lv = p.levels[area]
          const pct = lv.threshold > 0 ? (lv.progress / lv.threshold) * 100 : 0
          const goodToday = lv.todayF >= 0.8
          return (
            <div key={area} className="rounded-2xl border border-border bg-surface p-4">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xl">{AREA_ICONS[area]}</span>
                <span className="font-semibold">{AREA_LABELS[area]}</span>
                <span
                  className={`ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black ${
                    goodToday ? 'bg-rating-good/15 text-rating-good' : 'bg-surface2 text-muted'
                  }`}
                  title="Poziom"
                >
                  {lv.level}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface2">
                <div
                  className="h-full bg-gradient-to-r from-rating-mid to-rating-good transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted">
                <span>
                  {lv.progress}/{lv.threshold} dobrych dni → poziom {lv.level + 1}
                </span>
                {lv.badDays > 0 && (
                  <span className="text-rating-bad">⚠ {lv.badDays}/7 słabych</span>
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
