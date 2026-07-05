import { useMemo, useState } from 'react'
import { useHabits, useLogs, useUpsertLog, useDeleteLog } from '../lib/queries'
import { Habit, Log } from '../lib/types'
import { todayISO } from '../lib/date'
import {
  computeRatings,
  habitDailyF,
  initialRatings,
  makeLookup,
  overallOf,
  ratingClass,
} from '../lib/ratings'

export default function Today() {
  const [date, setDate] = useState(todayISO())
  const habits = useHabits()
  const logs = useLogs()

  const active = (habits.data ?? []).filter((h) => h.active)
  const logsList = logs.data ?? []
  const getValue = useMemo(() => makeLookup(logsList), [logsList])

  // dzienne wykonanie % (ważona średnia f nawyków dla wybranej daty)
  const completion = useMemo(() => {
    if (active.length === 0) return 0
    let num = 0
    let den = 0
    for (const h of active) {
      const w = h.weight ?? 1
      num += habitDailyF(h, date, getValue) * w
      den += w
    }
    return den > 0 ? Math.round((num / den) * 100) : 0
  }, [active, date, getValue])

  // aktualny overall (na dziś, liczony na żywo z historii)
  const overall = useMemo(() => {
    if (active.length === 0) return 8
    const from = logsList.length
      ? logsList.reduce((m, l) => (l.log_date < m ? l.log_date : m), logsList[0].log_date)
      : todayISO()
    const ratings = computeRatings(habits.data ?? [], from, todayISO(), initialRatings(), getValue)
    const last = ratings[todayISO()]
    return last ? overallOf(last) : 8
  }, [habits.data, logsList, getValue, active.length])

  if (habits.isLoading || logs.isLoading)
    return <div className="p-6 text-muted">Ładowanie…</div>

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 hidden text-2xl font-extrabold tracking-tight md:block">Dziś</h1>

      {/* Pasek góra */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:max-w-xl">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Wykonanie dnia</div>
          <div className="mt-1 text-3xl font-extrabold">{completion}%</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface2">
            <div className="h-full bg-rating-good" style={{ width: `${completion}%` }} />
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Overall</div>
          <div className={`mt-1 text-3xl font-extrabold ${ratingClass(overall)}`}>
            {overall.toFixed(1)}
          </div>
          <div className="mt-2 text-xs text-muted">z 20.0</div>
        </div>
      </div>

      {/* Date picker */}
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3 md:max-w-xs">
        <span className="text-sm text-muted">Dzień</span>
        <input
          type="date"
          value={date}
          max={todayISO()}
          onChange={(e) => setDate(e.target.value)}
          className="bg-transparent text-sm font-medium outline-none [color-scheme:dark]"
        />
      </div>

      {/* Lista nawyków */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {active.length === 0 && (
          <p className="rounded-2xl border border-border bg-surface p-4 text-center text-sm text-muted">
            Brak aktywnych nawyków. Dodaj je w Ustawieniach.
          </p>
        )}
        {active.map((h) =>
          h.type === 'binary' ? (
            <BinaryRow key={h.id} habit={h} date={date} logs={logsList} />
          ) : (
            <NumericRow key={h.id} habit={h} date={date} logs={logsList} />
          )
        )}
      </div>
    </div>
  )
}

function currentLog(logs: Log[], habitId: string, date: string): Log | undefined {
  return logs.find((l) => l.habit_id === habitId && l.log_date === date)
}

function BinaryRow({ habit, date, logs }: { habit: Habit; date: string; logs: Log[] }) {
  const upsert = useUpsertLog()
  const del = useDeleteLog()
  const log = currentLog(logs, habit.id, date)
  const done = !!log && log.value >= 1

  function toggle() {
    if (done) del.mutate({ habit_id: habit.id, log_date: date })
    else upsert.mutate({ habit_id: habit.id, log_date: date, value: 1 })
  }

  return (
    <button
      onClick={toggle}
      className={`flex items-center justify-between rounded-2xl border p-4 text-left transition-colors ${
        done
          ? 'border-rating-good/60 bg-rating-good/10'
          : 'border-border bg-surface active:bg-surface2'
      }`}
    >
      <div>
        <div className="font-semibold">{habit.name}</div>
        {habit.weekly_target ? (
          <div className="text-xs text-muted">cel: {habit.weekly_target}×/tydzień</div>
        ) : null}
      </div>
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-lg ${
          done ? 'border-rating-good bg-rating-good text-bg' : 'border-border text-muted'
        }`}
      >
        {done ? '✓' : ''}
      </div>
    </button>
  )
}

function NumericRow({ habit, date, logs }: { habit: Habit; date: string; logs: Log[] }) {
  const upsert = useUpsertLog()
  const del = useDeleteLog()
  const log = currentLog(logs, habit.id, date)
  const [val, setVal] = useState<string>(log ? String(log.value) : '')

  // synchronizuj gdy zmienia się data / log z serwera
  const logKey = `${date}:${log?.value ?? ''}`
  const [seenKey, setSeenKey] = useState(logKey)
  if (logKey !== seenKey) {
    setSeenKey(logKey)
    setVal(log ? String(log.value) : '')
  }

  function save() {
    const n = parseFloat(val.replace(',', '.'))
    if (Number.isNaN(n)) {
      del.mutate({ habit_id: habit.id, log_date: date })
      return
    }
    upsert.mutate({ habit_id: habit.id, log_date: date, value: n })
  }

  const targetTxt =
    habit.daily_target != null
      ? `${habit.target_direction === 'at_most' ? '≤' : '≥'} ${habit.daily_target}${
          habit.unit ? ' ' + habit.unit : ''
        }`
      : ''
  const saved = log != null && String(log.value) === val.replace(',', '.')

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="font-semibold">{habit.name}</div>
        {targetTxt && <div className="text-xs text-muted">{targetTxt}</div>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder={habit.unit ?? '0'}
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface2 px-3 py-2.5 text-lg font-semibold outline-none focus:border-rating-good"
        />
        {habit.unit && <span className="text-sm text-muted">{habit.unit}</span>}
        <button
          onClick={save}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${
            saved ? 'bg-surface2 text-rating-good' : 'bg-rating-good text-bg'
          }`}
        >
          {saved ? '✓ zapisane' : 'Zapisz'}
        </button>
      </div>
    </div>
  )
}
