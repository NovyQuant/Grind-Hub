import { useMemo, useState } from 'react'
import { useHabits, useLogs, useUpsertLog, useDeleteLog } from '../lib/queries'
import { Habit, Log, SCALE3, AREA_ICONS, Area, MILESTONES } from '../lib/types'
import { todayISO } from '../lib/date'
import { computeProgress, nextMilestone } from '../lib/progress'
import { buzz, BUZZ_TAP, BUZZ_DONE } from '../lib/haptics'

/** Wartość domyślna do „Zamknij dzień" (null = wymaga ręcznego wpisania). */
function defaultValue(h: Habit): number | null {
  if (h.input_kind === 'check' && !h.subtypes) return 1
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
  const upsert = useUpsertLog()
  const isToday = date === todayISO()

  const active = (habits.data ?? []).filter((h) => h.active)
  const logsList = logs.data ?? []

  const progress = useMemo(
    () => computeProgress(habits.data ?? [], logsList),
    [habits.data, logsList]
  )

  if (habits.isLoading || logs.isLoading)
    return <div className="p-6 text-muted">Ładowanie…</div>

  const mNext = nextMilestone(progress.streakCurrent, MILESTONES)
  const mPrev = [...MILESTONES].reverse().find((m) => m <= progress.streakCurrent) ?? 0
  const mPct = mNext ? ((progress.streakCurrent - mPrev) / (mNext - mPrev)) * 100 : 100

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
      {/* Streak hero */}
      <div className="mb-4 overflow-hidden rounded-3xl border border-border bg-gradient-to-b from-surface2 to-surface p-5 text-center">
        <div className="text-xs uppercase tracking-widest text-muted">Streak</div>
        <div className="mt-1 flex items-center justify-center gap-2">
          <span className="text-5xl leading-none">🔥</span>
          <span className="text-6xl font-black tabular-nums">{progress.streakCurrent}</span>
        </div>
        <div className="mt-1 text-sm text-muted">
          {progress.streakCurrent === 0
            ? 'Zacznij dziś. Zamknij dzień na ≥80%.'
            : progress.todayDone
              ? 'Dzień zaliczony ✅ Nie przerywaj.'
              : 'Dziś jeszcze niezaliczone — dokończ!'}
        </div>

        {mNext && (
          <div className="mx-auto mt-4 max-w-xs">
            <div className="mb-1 flex justify-between text-[11px] text-muted">
              <span>{mPrev} dni</span>
              <span>🏆 {mNext} dni</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface">
              <div
                className="h-full bg-gradient-to-r from-rating-mid to-rating-good transition-all"
                style={{ width: `${mPct}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-center gap-6 text-sm">
          <div>
            <div className="font-bold">{progress.dayScoreToday}%</div>
            <div className="text-[11px] text-muted">wynik dnia</div>
          </div>
          <div>
            <div className="font-bold">{progress.streakBest}</div>
            <div className="text-[11px] text-muted">rekord</div>
          </div>
        </div>
      </div>

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
          <HabitRow key={h.id} habit={h} date={date} logs={logsList} />
        ))}
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
        „Zamknij dzień" uzupełnia domyślne (sen 7h, wydatki 0, kosmetyki ✓) dla niewpisanych.
      </p>
    </div>
  )
}

function currentLog(logs: Log[], habitId: string, date: string): Log | undefined {
  return logs.find((l) => l.habit_id === habitId && l.log_date === date)
}

function HabitRow({ habit, date, logs }: { habit: Habit; date: string; logs: Log[] }) {
  const log = currentLog(logs, habit.id, date)
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg">{AREA_ICONS[habit.area as Area]}</span>
        <span className="font-semibold">{habit.name}</span>
        {habit.cadence === 'weekly' && (
          <span className="ml-auto rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-muted">
            cel {habit.weekly_target}/tydz
          </span>
        )}
      </div>
      {habit.input_kind === 'scale3' && <Scale3Input habit={habit} date={date} log={log} />}
      {habit.input_kind === 'check' && <CheckInput habit={habit} date={date} log={log} />}
      {habit.input_kind === 'number' && <NumberInput habit={habit} date={date} log={log} />}
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
  const chips =
    habit.score_mode === 'range'
      ? [6, 7, 8, 9]
      : habit.score_mode === 'at_most'
        ? [0, 20, 50, 100]
        : []

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
          placeholder={habit.score_mode === 'range' ? 'godziny' : 'zł'}
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
