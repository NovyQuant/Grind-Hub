import { Fragment, useMemo } from 'react'
import { useAbstinences, useHabits, useLogs } from '../lib/queries'
import { computeProgress, areaDayState, DotState } from '../lib/progress'
import { computeRank, rankLabelOf, weeklyAreaBonus, RANK_TIERS, RankTier } from '../lib/rank'
import { AREAS, AREA_ICONS, AREA_LABELS, Habit, Log } from '../lib/types'
import { addDays, dateRange, parseISO, todayISO } from '../lib/date'
import { makeLookup } from '../lib/ratings'
import StreakTile from '../components/StreakTile'

const WEEKDAY = ['N', 'P', 'W', 'Ś', 'C', 'P', 'S'] // getDay(): 0 = niedziela

/** Granice dywizji (skumulowane XP) → ranga PO przekroczeniu granicy. */
function divisionBoundaries(): { xp: number; label: string; color: string }[] {
  const out: { xp: number; label: string; color: string }[] = []
  let acc = 0
  for (let t = 0; t < RANK_TIERS.length; t++) {
    const tier = RANK_TIERS[t]
    if (tier.divCost === Infinity) break
    for (let d = tier.divisions; d >= 1; d--) {
      acc += tier.divCost
      if (d > 1) out.push({ xp: acc, label: rankLabelOf(tier, d - 1), color: tier.color })
      else {
        const nt = RANK_TIERS[t + 1]
        out.push({ xp: acc, label: rankLabelOf(nt, nt.divisions === 4 ? 4 : null), color: nt.color })
      }
    }
  }
  return out
}

const BOUNDARIES = divisionBoundaries()

function fmtDay(date: string): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}`
}

/**
 * Wykres LP à la op.gg: skumulowane XP dzień po dniu (ostatnie 30 dni),
 * progi dywizji jako poziome linie z nazwą rangi.
 */
function LPChart({ history, tier }: { history: { date: string; xp: number }[]; tier: RankTier }) {
  let acc = 0
  const cum = history.map((d) => {
    acc += d.xp
    return { date: d.date, xp: d.xp, total: Math.max(0, Math.round(acc)) }
  })
  const pts = cum.slice(-30)
  if (pts.length < 2) return <p className="text-sm text-muted">Za mało danych — loguj dalej.</p>

  const W = 340
  const H = 190
  const M = { t: 14, r: 48, b: 18, l: 8 }
  const plotW = W - M.l - M.r
  const plotH = H - M.t - M.b

  const totals = pts.map((p) => p.total)
  const rawMin = Math.min(...totals)
  const rawMax = Math.max(...totals)
  const pad = Math.max((rawMax - rawMin) * 0.15, 40)
  const lo = Math.max(0, rawMin - pad)
  const hi = rawMax + pad
  const xs = (i: number) => M.l + (plotW * i) / (pts.length - 1)
  const ys = (v: number) => M.t + plotH * (1 - (v - lo) / (hi - lo))

  const linePts = pts.map((p, i) => `${xs(i).toFixed(1)},${ys(p.total).toFixed(1)}`).join(' ')
  const areaPath = `M ${xs(0).toFixed(1)},${ys(pts[0].total).toFixed(1)} L ${linePts
    .split(' ')
    .join(' L ')} L ${xs(pts.length - 1).toFixed(1)},${(M.t + plotH).toFixed(1)} L ${xs(0).toFixed(
    1
  )},${(M.t + plotH).toFixed(1)} Z`

  const bounds = BOUNDARIES.filter((b) => b.xp >= lo && b.xp <= hi)
  const mondays = pts
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => parseISO(p.date).getDay() === 1)
  const last = pts[pts.length - 1]
  const slot = plotW / (pts.length - 1)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Skumulowane XP — ostatnie 30 dni">
      {/* progi dywizji */}
      {bounds.map((b) => (
        <g key={b.xp}>
          <line x1={M.l} y1={ys(b.xp)} x2={W - M.r} y2={ys(b.xp)} stroke="#243040" strokeWidth={1} />
          <circle cx={M.l + 4} cy={ys(b.xp) - 5} r={2} fill={b.color} />
          <text x={M.l + 9} y={ys(b.xp) - 2.5} fontSize={8} fill="#7c8ba1" fontWeight={600}>
            {b.label}
          </text>
        </g>
      ))}

      {/* obszar + linia */}
      <path d={areaPath} fill={tier.color} opacity={0.1} />
      <polyline
        points={linePts}
        fill="none"
        stroke={tier.color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* końcówka: kropka z ringiem + wartość */}
      <circle cx={xs(pts.length - 1)} cy={ys(last.total)} r={4.5} fill={tier.color} stroke="#121821" strokeWidth={2} />
      <text
        x={xs(pts.length - 1) + 8}
        y={ys(last.total) + 3.5}
        fontSize={10}
        fontWeight={800}
        fill="#e6edf5"
      >
        {last.total.toLocaleString('pl-PL')}
      </text>

      {/* daty (poniedziałki) */}
      {mondays.map(({ p, i }) => (
        <text key={p.date} x={xs(i)} y={H - 5} textAnchor="middle" fontSize={8} fill="#7c8ba1">
          {fmtDay(p.date)}
        </text>
      ))}

      {/* hover: dzień po dniu */}
      {pts.map((p, i) => (
        <rect
          key={p.date}
          x={xs(i) - slot / 2}
          y={0}
          width={slot}
          height={H}
          fill="transparent"
        >
          <title>{`${fmtDay(p.date)}: ${p.total.toLocaleString('pl-PL')} XP (${p.xp >= 0 ? '+' : ''}${p.xp} tego dnia)`}</title>
        </rect>
      ))}
    </svg>
  )
}

// Heatmapa: te same stany co kropki tygodnia (jeden język wizualny).
const CELL_CLASS: Record<DotState, string> = {
  good: 'bg-rating-good',
  mid: 'bg-rating-mid',
  bad: 'bg-rating-bad/70',
  none: 'bg-surface2',
  future: 'bg-surface2/40',
}

const STATE_LABEL: Record<DotState, string> = {
  good: 'zaliczone',
  mid: 'połowicznie',
  bad: 'słabo',
  none: 'brak / wolne',
  future: '—',
}

/** Heatmapa obszar × dzień — ostatnie 14 dni. */
function Heatmap({ habits, logs }: { habits: Habit[]; logs: Log[] }) {
  const today = todayISO()
  const days = dateRange(addDays(today, -13), today)
  const getValue = makeLookup(logs)

  return (
    <div>
      <div className="grid gap-0.5" style={{ gridTemplateColumns: `1.5rem repeat(${days.length}, 1fr)` }}>
        <span />
        {days.map((d) => {
          const isToday = d === today
          return (
            <span
              key={d}
              className={`pb-0.5 text-center text-[8px] ${isToday ? 'font-black text-text' : 'text-muted'}`}
            >
              {WEEKDAY[parseISO(d).getDay()]}
            </span>
          )
        })}
        {AREAS.map((area) => (
          <Fragment key={area}>
            <span className="flex items-center justify-center text-xs">
              {AREA_ICONS[area]}
            </span>
            {days.map((d) => {
              const state = areaDayState(area, habits, d, today, getValue)
              return (
                <span
                  key={`${area}-${d}`}
                  className={`aspect-square rounded ${CELL_CLASS[state]}`}
                  title={`${AREA_LABELS[area]} ${fmtDay(d)}: ${STATE_LABEL[state]}`}
                />
              )
            })}
          </Fragment>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-rating-good" /> zaliczone
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-rating-mid" /> połowicznie
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-rating-bad/70" /> słabo
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-surface2" /> brak / wolne
        </span>
      </div>
    </div>
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

  const last30 = rank.history.slice(-30)
  const sum30 = last30.reduce((s, d) => s + d.xp, 0)

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-2xl font-extrabold tracking-tight">Poziomy 🎮</h1>

      {/* Wykres LP — wspinaczka po randze */}
      <div className="mb-5 rounded-2xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wide text-muted">
            Wspinaczka — XP i progi dywizji
          </span>
          <span
            className={`text-sm font-black tabular-nums ${
              sum30 < 0 ? 'text-rating-bad' : 'text-rating-good'
            }`}
          >
            {sum30 >= 0 ? '+' : ''}{sum30} XP / 30 dni
          </span>
        </div>
        <LPChart history={rank.history} tier={rank.tier} />
      </div>

      {/* Heatmapa: obszar × dzień */}
      <div className="mb-5 rounded-2xl border border-border bg-surface p-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-muted">
          Mapa dni — ostatnie 14 dni
        </div>
        <Heatmap habits={habits.data ?? []} logs={logs.data ?? []} />
      </div>

      {/* Streaki per obszar — ten sam format co w Dziś, tygodniowe obok siebie */}
      <h2 className="mb-2 px-1 text-xs uppercase tracking-wide text-muted">Streaki</h2>
      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-3">
        {[...AREAS]
          .sort(
            (a, b) =>
              (p.streaks[a].unit === 'week' ? 0 : 1) - (p.streaks[b].unit === 'week' ? 0 : 1)
          )
          .map((area) => (
            <StreakTile
              key={area}
              area={area}
              s={p.streaks[area]}
              bonusXP={weeklyAreaBonus(habits.data ?? [], area)}
            />
          ))}
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
    </div>
  )
}
