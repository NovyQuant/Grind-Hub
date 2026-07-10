import { useEffect, useMemo, useState } from 'react'
import { Abstinence, AREAS, AREA_ICONS, AREA_LABELS, Habit, Log } from '../lib/types'
import { computeProgress } from '../lib/progress'
import { computeRank } from '../lib/rank'
import { todayISO } from '../lib/date'

/** Licznik XP nabijający się od 0 do celu (ease-out). */
function useCountUp(target: number, run: boolean, duration = 1000): number {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!run) return
    let raf: number
    const t0 = performance.now()
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setVal(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [run, target, duration])
  return val
}

/**
 * Pop-up „Podsumuj dzień": animowany bilans XP, pasek rangi, poziomy skilli
 * i streaki — porównanie stanu sprzed dzisiejszych wpisów ze stanem obecnym.
 */
export default function DaySummary({
  habits,
  logs,
  abstinences,
  onClose,
}: {
  habits: Habit[]
  logs: Log[]
  abstinences: Abstinence[]
  onClose: () => void
}) {
  const today = todayISO()

  const { before, after } = useMemo(() => {
    const logsBefore = logs.filter((l) => l.log_date !== today)
    return {
      before: {
        p: computeProgress(habits, logsBefore),
        r: computeRank(habits, logsBefore, abstinences),
      },
      after: { p: computeProgress(habits, logs), r: computeRank(habits, logs, abstinences) },
    }
  }, [habits, logs, abstinences, today])

  // start animacji tuż po montażu (żeby transition zadziałał od stanu "przed")
  const [go, setGo] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setGo(true), 200)
    return () => clearTimeout(t)
  }, [])

  const r = after.r
  const deltaXP = r.totalXP - before.r.totalXP
  const shownXP = useCountUp(deltaXP, go)
  const promoted = r.ordinal > before.r.ordinal

  const fromLp = r.divCost === Infinity ? 0 : Math.max(0, Math.min(r.divCost, r.lpInDiv - deltaXP))
  const fromPct = r.divCost === Infinity ? 100 : (fromLp / r.divCost) * 100
  const toPct = r.divCost === Infinity ? 100 : Math.min(100, (r.lpInDiv / r.divCost) * 100)

  const areas = [...AREAS].sort(
    (a, b) =>
      (after.p.streaks[a].unit === 'week' ? 0 : 1) - (after.p.streaks[b].unit === 'week' ? 0 : 1)
  )

  const missing = habits.filter(
    (h) =>
      h.active &&
      h.cadence === 'daily' &&
      !logs.some((l) => l.habit_id === h.id && l.log_date === today)
  )

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-300 md:items-center md:p-6 ${
        go ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
    >
      <div
        className={`nav-safe max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-5 transition-transform duration-300 md:rounded-3xl md:border ${
          go ? 'translate-y-0' : 'translate-y-8'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border md:hidden" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold tracking-tight">Podsumowanie dnia 🎮</h2>
          <button onClick={onClose} className="px-1 text-muted hover:text-text">
            ✕
          </button>
        </div>

        {/* Ranga: licznik XP + nabijający się pasek */}
        <div
          className="mb-4 rounded-2xl border bg-gradient-to-b from-surface2 to-surface p-4 text-center"
          style={{ borderColor: `${r.tier.color}66` }}
        >
          {promoted && (
            <div
              className={`mb-1 text-sm font-black uppercase tracking-wider transition-all delay-700 duration-500 ${
                go ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
              }`}
              style={{ color: r.tier.color }}
            >
              🎉 Awans!
            </div>
          )}
          <div className="flex items-center justify-center gap-2">
            <span className="text-3xl">{r.tier.emblem}</span>
            <span
              className="text-xl font-black uppercase tracking-wide"
              style={{ color: r.tier.color }}
            >
              {r.rankLabel}
            </span>
          </div>
          <div
            className={`mt-1 text-3xl font-black tabular-nums ${
              deltaXP < 0 ? 'text-rating-bad' : 'text-rating-good'
            }`}
          >
            {shownXP >= 0 ? '+' : ''}
            {shownXP} XP
          </div>
          <div className="mx-auto mt-3 max-w-xs">
            <div className="h-3 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{
                  width: `${go ? toPct : fromPct}%`,
                  background: r.tier.color,
                  transitionDelay: '250ms',
                }}
              />
            </div>
            <div className="mt-1.5 text-[11px] text-muted">
              {r.divCost === Infinity
                ? 'szczyt drabinki ⚡'
                : `${r.lpInDiv}/${r.divCost} XP · brakuje ${r.toNext} do ${r.nextLabel}`}
            </div>
          </div>
        </div>

        {/* Skille: lvl + pasek + XP + streak */}
        <div className="flex flex-col gap-2">
          {areas.map((area, i) => {
            const lv0 = before.p.levels[area]
            const lv1 = after.p.levels[area]
            const s0 = before.p.streaks[area]
            const s1 = after.p.streaks[area]
            const week = s1.unit === 'week'
            const lvlUp = lv1.level > lv0.level
            const pct0 = lvlUp ? 0 : lv0.threshold > 0 ? (lv0.progress / lv0.threshold) * 100 : 0
            const pct1 = lv1.threshold > 0 ? (lv1.progress / lv1.threshold) * 100 : 0
            const xp = after.r.perAreaToday[area]?.xp ?? 0
            const streakUp = s1.current > s0.current
            const delay = 350 + i * 130

            return (
              <div key={area} className="rounded-2xl border border-border bg-surface2/50 p-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{AREA_ICONS[area]}</span>
                  <span className="text-sm font-semibold">{AREA_LABELS[area]}</span>
                  <span className="rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-muted">
                    lvl {lv1.level}
                  </span>
                  {lvlUp && (
                    <span
                      className={`rounded-full bg-rating-good/20 px-2 py-0.5 text-[10px] font-black uppercase text-rating-good transition-all duration-500 ${
                        go ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                      }`}
                      style={{ transitionDelay: `${delay + 600}ms` }}
                    >
                      ⬆ lvl up!
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1.5">
                    <span
                      className={`text-xs font-bold tabular-nums ${
                        xp < 0 ? 'text-rating-bad' : xp > 0 ? 'text-rating-good' : 'text-muted'
                      }`}
                    >
                      {xp >= 0 ? '+' : ''}
                      {xp} XP
                    </span>
                    <span className="text-sm font-black tabular-nums">
                      🔥 {go && streakUp ? s1.current : s0.current}
                      <span className="ml-0.5 text-[10px] font-medium text-muted">
                        {week ? 'tyg' : 'dni'}
                      </span>
                    </span>
                    {streakUp && (
                      <span
                        className={`text-[10px] font-black text-rating-good transition-all duration-500 ${
                          go ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                        }`}
                        style={{ transitionDelay: `${delay + 400}ms` }}
                      >
                        +{s1.current - s0.current}
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-rating-mid to-rating-good transition-all duration-1000 ease-out"
                      style={{ width: `${go ? pct1 : pct0}%`, transitionDelay: `${delay}ms` }}
                    />
                  </div>
                  <span className="w-12 text-right text-[10px] tabular-nums text-muted">
                    {lv1.progress}/{lv1.threshold}
                  </span>
                </div>
                {week && (
                  <div
                    className={`mt-1 text-[11px] font-semibold ${
                      s1.periodDone ? 'text-rating-good' : 'text-[#c084fc]'
                    }`}
                  >
                    {s1.periodDone
                      ? '✓ cel tygodnia nabity'
                      : `cel tygodnia: ${s1.weekAcc}/${s1.weekTarget}`}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {missing.length > 0 && (
          <p className="mt-3 rounded-xl bg-rating-mid/10 px-3 py-2 text-center text-[11px] font-semibold text-rating-mid">
            ⚠ Brak wpisu: {missing.map((h) => h.name).join(', ')} — po zamknięciu dnia liczy się
            jako minus.
          </p>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-2xl bg-rating-good py-3 text-base font-bold text-bg active:scale-[0.99]"
        >
          Zamknij
        </button>
      </div>
    </div>
  )
}
