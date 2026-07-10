import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAbstinences, useHabits, useLogs, useUpsertLog, useDeleteLog } from '../lib/queries'
import { Habit, Log, SCALE3, SCALE4, AREAS, AREA_ICONS, AREA_LABELS, Area } from '../lib/types'
import { todayISO } from '../lib/date'
import { computeProgress } from '../lib/progress'
import { computeRank, habitBaseXP, XP_PER_WEIGHT } from '../lib/rank'
import { makeLookup, ValueLookup } from '../lib/ratings'
import { buzz, BUZZ_TAP, BUZZ_DONE } from '../lib/haptics'
import StreakTile from '../components/StreakTile'
import AbstinencePanel from '../components/AbstinencePanel'

/** Wartość domyślna do „Zamknij dzień" (null = wymaga ręcznego wpisania). */
function defaultValue(h: Habit): number | null {
  if (h.input_kind === 'check' && !h.subtypes) return 1
  if (h.input_kind === 'scale4') return 1 // wydatki: domyślnie „dobrze"
  if (h.input_kind === 'number') {
    if (h.score_mode === 'at_most') return 0
    if (h.score_mode === 'range') return h.daily_target ?? 7
    if (h.score_mode === 'at_least') return h.daily_target ?? 1
  }
  return null
}

export default function Today() {
  const [date, setDate] = useState(todayISO())
  const habits = useHabits()
  const logs = useLogs()
  const abstinences = useAbstinences()
  const upsert = useUpsertLog()
  const isToday = date === todayISO()

  const active = (habits.data ?? []).filter((h) => h.active)
  const logsList = logs.data ?? []
  const abstList = abstinences.data ?? []

  const progress = useMemo(
    () => computeProgress(habits.data ?? [], logsList),
    [habits.data, logsList]
  )
  const rank = useMemo(
    () => computeRank(habits.data ?? [], logsList, abstList),
    [habits.data, logsList, abstList]
  )
  const lookup = useMemo(() => makeLookup(logsList), [logsList])

  if (habits.isLoading || logs.isLoading)
    return <div className="p-6 text-muted">Ładowanie…</div>

  function closeDay() {
    for (const h of active) {
      const has = logsList.some((l) => l.habit_id === h.id && l.log_date === date)
      if (has) continue
      const dv = defaultValue(h)
      if (dv != null) upsert.mutate({ habit_id: h.id, log_date: date, value: dv })
    }
    buzz(BUZZ_DONE)
  }

  return (
    <div className="p-4 md:p-6">
      {/* Pasek rangi */}
      <NavLink
        to="/ranga"
        className="mb-3 flex items-center gap-3 rounded-2xl border bg-gradient-to-r from-surface2 to-surface p-3"
        style={{ borderColor: `${rank.tier.color}66` }}
      >
        <span className="text-3xl leading-none">{rank.tier.emblem}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between">
            <span
              className="text-sm font-black uppercase tracking-wide"
              style={{ color: rank.tier.color }}
            >
              {rank.rankLabel}
            </span>
            <span
              className={`text-xs font-bold ${rank.todayXP < 0 ? 'text-rating-bad' : 'text-rating-good'}`}
            >
              {rank.todayXP >= 0 ? '+' : ''}{rank.todayXP} XP dziś
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full rounded-full"
              style={{
                width: `${rank.divCost === Infinity ? 100 : Math.min(100, (rank.lpInDiv / rank.divCost) * 100)}%`,
                background: rank.tier.color,
              }}
            />
          </div>
          {rank.nextLabel && (
            <div className="mt-0.5 text-[10px] text-muted">
              brakuje {rank.toNext} XP → {rank.nextLabel}
            </div>
          )}
        </div>
      </NavLink>

      {/* Streaki per obszar — jeden format dla dziennych i tygodniowych */}
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3">
        {AREAS.map((area) => (
          <StreakTile key={area} area={area} s={progress.streaks[area]} />
        ))}
      </div>

      {/* Nałogi — pełna obsługa w głównym panelu */}
      <AbstinencePanel list={abstList} xpToday={rank.abstinenceToday} />

      {/* Date picker (kompaktowy) */}
      <div className="mb-3 flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">
        <span className="text-muted">{isToday ? 'Dzisiaj' : 'Wpis wsteczny'}</span>
        <input
          type="date"
          value={date}
          max={todayISO()}
          onChange={(e) => setDate(e.target.value)}
          className="bg-transparent font-medium outline-none [color-scheme:dark]"
        />
      </div>

      {/* Szybki flow */}
      <div className="flex flex-col gap-3">
        {active.map((h) => (
          <HabitRow key={h.id} habit={h} date={date} logs={logsList} lookup={lookup} isToday={isToday} />
        ))}
      </div>

      {/* Podsumowanie dnia */}
      <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wide text-muted">Bilans dnia</span>
          <span
            className={`text-xl font-black tabular-nums ${
              rank.todayXP < 0 ? 'text-rating-bad' : 'text-rating-good'
            }`}
          >
            {rank.todayXP >= 0 ? '+' : ''}{rank.todayXP} XP
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          {AREAS.map((area) => {
            const t = rank.perAreaToday[area]
            if (!t || t.max === 0) return null
            return (
              <div key={area} className="flex items-center gap-2 text-sm">
                <span className="w-6 text-center">{AREA_ICONS[area]}</span>
                <span className="flex-1 text-xs font-medium">{AREA_LABELS[area]}</span>
                {t.mult > 1 && (
                  <span className="rounded-full bg-[#a855f7]/15 px-2 py-0.5 text-[10px] font-black text-[#c084fc]">
                    ×{t.mult.toFixed(2).replace(/0$/, '')}
                  </span>
                )}
                <span
                  className={`w-14 text-right text-sm font-bold tabular-nums ${
                    t.xp < 0 ? 'text-rating-bad' : t.xp > 0 ? 'text-rating-good' : 'text-muted'
                  }`}
                >
                  {t.xp >= 0 ? '+' : ''}{t.xp}
                </span>
              </div>
            )
          })}
          {rank.abstinenceToday > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="w-6 text-center">🚭</span>
              <span className="flex-1 text-xs font-medium">Nałogi</span>
              <span className="w-14 text-right text-sm font-bold tabular-nums text-rating-good">
                +{rank.abstinenceToday}
              </span>
            </div>
          )}
        </div>
        {rank.nextLabel && (
          <div className="mt-3 border-t border-border pt-2.5 text-center text-sm font-semibold">
            Brakuje <span style={{ color: rank.tier.color }}>{rank.toNext} XP</span> do{' '}
            {rank.nextLabel}
          </div>
        )}
      </div>

      {isToday && (
        <button
          onClick={closeDay}
          className="mt-4 w-full rounded-2xl bg-rating-good py-3.5 text-base font-bold text-bg active:scale-[0.99]"
        >
          Zamknij dzień
        </button>
      )}
      <p className="mt-2 text-center text-[11px] text-muted">
        „Zamknij dzień" uzupełnia domyślne (sen 7h, wydatki dobrze, kosmetyki ✓) dla niewpisanych.
      </p>
    </div>
  )
}

function currentLog(logs: Log[], habitId: string, date: string): Log | undefined {
  return logs.find((l) => l.habit_id === habitId && l.log_date === date)
}

/** Badge XP nawyku: od razu widać, czy wpis daje, czy zabiera punkty. */
function XPBadge({ xp, full }: { xp: number | null; full: number }) {
  if (xp === null)
    return (
      <span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-bold text-muted">
        ±{full} XP
      </span>
    )
  const cls =
    xp < 0
      ? 'bg-rating-bad/15 text-rating-bad'
      : xp >= full
        ? 'bg-rating-good/15 text-rating-good'
        : xp > 0
          ? 'bg-rating-mid/15 text-rating-mid'
          : 'bg-surface2 text-muted'
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums ${cls}`}>
      {xp >= 0 ? '+' : ''}{xp} XP
    </span>
  )
}

function HabitRow({
  habit,
  date,
  logs,
  lookup,
  isToday,
}: {
  habit: Habit
  date: string
  logs: Log[]
  lookup: ValueLookup
  isToday: boolean
}) {
  const log = currentLog(logs, habit.id, date)
  const xp = habitBaseXP(habit, date, lookup, isToday)
  const full = Math.round((habit.weight ?? 1) * XP_PER_WEIGHT)
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg">{AREA_ICONS[habit.area as Area]}</span>
        <span className="font-semibold">{habit.name}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {habit.cadence === 'weekly' && (
            <span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-muted">
              cel {habit.weekly_target}/tydz
            </span>
          )}
          <XPBadge xp={xp} full={full} />
        </span>
      </div>
      {habit.input_kind === 'scale3' && <Scale3Input habit={habit} date={date} log={log} />}
      {habit.input_kind === 'scale4' && <Scale4Input habit={habit} date={date} log={log} />}
      {habit.input_kind === 'check' && <CheckInput habit={habit} date={date} log={log} />}
      {habit.input_kind === 'number' &&
        (habit.score_mode === 'range' ? (
          <DurationInput habit={habit} date={date} log={log} />
        ) : (
          <NumberInput habit={habit} date={date} log={log} />
        ))}
    </div>
  )
}

function Scale3Input({ habit, date, log }: { habit: Habit; date: string; log?: Log }) {
  const upsert = useUpsertLog()
  const del = useDeleteLog()
  return (
    <div className="grid grid-cols-3 gap-2">
      {SCALE3.map((s) => {
        const sel = log && log.value === s.value
        return (
          <button
            key={s.value}
            onClick={() => {
              buzz(BUZZ_TAP)
              if (sel) del.mutate({ habit_id: habit.id, log_date: date })
              else upsert.mutate({ habit_id: habit.id, log_date: date, value: s.value })
            }}
            className={`rounded-xl border py-3 text-sm font-semibold transition-colors ${
              sel
                ? 'border-rating-good bg-rating-good/15 text-rating-good'
                : 'border-border bg-surface2 text-muted active:bg-border'
            }`}
          >
            <div className="text-xl">{s.short}</div>
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

/** Wydatki: samoocena „ile poszło na głupoty" — bardzo źle / źle / okej / dobrze. */
function Scale4Input({ habit, date, log }: { habit: Habit; date: string; log?: Log }) {
  const upsert = useUpsertLog()
  const del = useDeleteLog()
  const selCls = (v: number) =>
    v >= 1
      ? 'border-rating-good bg-rating-good/15 text-rating-good'
      : v >= 0.8
        ? 'border-rating-mid bg-rating-mid/15 text-rating-mid'
        : 'border-rating-bad bg-rating-bad/15 text-rating-bad'
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {SCALE4.map((s) => {
        const sel = log && log.value === s.value
        return (
          <button
            key={s.value}
            onClick={() => {
              buzz(BUZZ_TAP)
              if (sel) del.mutate({ habit_id: habit.id, log_date: date })
              else upsert.mutate({ habit_id: habit.id, log_date: date, value: s.value })
            }}
            className={`rounded-xl border py-2.5 text-xs font-semibold transition-colors ${
              sel ? selCls(s.value) : 'border-border bg-surface2 text-muted active:bg-border'
            }`}
          >
            <div className="text-lg">{s.short}</div>
            {s.label}
          </button>
        )
      })}
    </div>
  )
}

function CheckInput({ habit, date, log }: { habit: Habit; date: string; log?: Log }) {
  const upsert = useUpsertLog()
  const del = useDeleteLog()
  const subs = habit.subtypes ? habit.subtypes.split(',').map((s) => s.trim()) : null
  const done = !!log && log.value >= 1

  if (subs) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {subs.map((sub) => {
          const sel = done && log?.tag === sub
          return (
            <button
              key={sub}
              onClick={() => {
                buzz(BUZZ_TAP)
                if (sel) del.mutate({ habit_id: habit.id, log_date: date })
                else upsert.mutate({ habit_id: habit.id, log_date: date, value: 1, tag: sub })
              }}
              className={`rounded-xl border py-3 text-sm font-semibold capitalize transition-colors ${
                sel
                  ? 'border-rating-good bg-rating-good/15 text-rating-good'
                  : 'border-border bg-surface2 text-muted active:bg-border'
              }`}
            >
              {sub}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <button
      onClick={() => {
        buzz(BUZZ_TAP)
        if (done) del.mutate({ habit_id: habit.id, log_date: date })
        else upsert.mutate({ habit_id: habit.id, log_date: date, value: 1 })
      }}
      className={`flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition-colors ${
        done
          ? 'border-rating-good bg-rating-good/15 text-rating-good'
          : 'border-border bg-surface2 text-muted active:bg-border'
      }`}
    >
      {done ? '✓ Zrobione' : 'Odhacz'}
    </button>
  )
}

/** Godziny dziesiętne → "h:mm" (6.92 → "6:55"). */
function fmtDur(v: number): string {
  const h = Math.floor(v)
  const m = Math.round((v - h) * 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

/** Sen: dokładny czas h:mm — chipy + picker czasu, zapis jako godziny dziesiętne. */
function DurationInput({ habit, date, log }: { habit: Habit; date: string; log?: Log }) {
  const upsert = useUpsertLog()
  const chips = [6.5, 7, 7.5, 8]

  function commit(v: number) {
    upsert.mutate({ habit_id: habit.id, log_date: date, value: Math.round(v * 100) / 100 })
  }

  const timeVal = log
    ? `${String(Math.floor(log.value)).padStart(2, '0')}:${String(
        Math.round((log.value - Math.floor(log.value)) * 60)
      ).padStart(2, '0')}`
    : ''

  return (
    <div>
      <div className="mb-2 flex gap-2">
        {chips.map((c) => (
          <button
            key={c}
            onClick={() => {
              buzz(BUZZ_TAP)
              commit(c)
            }}
            className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${
              log?.value === c
                ? 'border-rating-good bg-rating-good/15 text-rating-good'
                : 'border-border bg-surface2 text-muted'
            }`}
          >
            {fmtDur(c)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="time"
          value={timeVal}
          onChange={(e) => {
            const [h, m] = e.target.value.split(':').map(Number)
            if (!Number.isNaN(h) && !Number.isNaN(m)) commit(h + m / 60)
          }}
          className="rounded-xl border border-border bg-surface2 px-3 py-2.5 text-lg font-semibold outline-none focus:border-rating-good [color-scheme:dark]"
        />
        <span className="text-xs text-muted">
          {log ? `zapisane: ${fmtDur(log.value)}h snu` : 'dokładny czas snu (g:mm)'}
        </span>
      </div>
    </div>
  )
}

function NumberInput({ habit, date, log }: { habit: Habit; date: string; log?: Log }) {
  const upsert = useUpsertLog()
  const del = useDeleteLog()
  const [val, setVal] = useState<string>(log ? String(log.value) : '')

  const logKey = `${date}:${log?.value ?? ''}`
  const [seenKey, setSeenKey] = useState(logKey)
  if (logKey !== seenKey) {
    setSeenKey(logKey)
    setVal(log ? String(log.value) : '')
  }

  function commit(v: number) {
    upsert.mutate({ habit_id: habit.id, log_date: date, value: v })
  }
  function save() {
    const n = parseFloat(val.replace(',', '.'))
    if (Number.isNaN(n)) {
      del.mutate({ habit_id: habit.id, log_date: date })
      return
    }
    commit(n)
  }

  // szybkie chipy
  const chips = habit.score_mode === 'at_most' ? [0, 20, 50, 100] : []

  const saved = log != null && String(log.value) === val.replace(',', '.')

  return (
    <div>
      {chips.length > 0 && (
        <div className="mb-2 flex gap-2">
          {chips.map((c) => (
            <button
              key={c}
              onClick={() => {
                buzz(BUZZ_TAP)
                setVal(String(c))
                commit(c)
              }}
              className={`flex-1 rounded-lg border py-2 text-sm font-semibold ${
                log?.value === c
                  ? 'border-rating-good bg-rating-good/15 text-rating-good'
                  : 'border-border bg-surface2 text-muted'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="zł"
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface2 px-3 py-2.5 text-lg font-semibold outline-none focus:border-rating-good"
        />
        <button
          onClick={() => {
            buzz(BUZZ_TAP)
            save()
          }}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
            saved ? 'bg-surface2 text-rating-good' : 'bg-rating-good text-bg'
          }`}
        >
          {saved ? '✓' : 'Zapisz'}
        </button>
      </div>
    </div>
  )
}
