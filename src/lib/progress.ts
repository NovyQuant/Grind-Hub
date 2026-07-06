import {
  AREAS,
  Area,
  AREA_BAD_THRESHOLD,
  AREA_GOOD_THRESHOLD,
  Habit,
  LEVEL_DECAY_BAD_DAYS,
  Log,
} from './types'
import { addDays, dateRange, todayISO, weekStartISO } from './date'
import { areaDailyF, makeLookup, ValueLookup } from './ratings'

export interface AreaLevel {
  level: number
  progress: number // dobre dni w kierunku następnego poziomu
  threshold: number // ile dobrych dni potrzeba (7 × level)
  badDays: number // zliczone słabe dni (do spadku)
  todayF: number
}

export type StreakUnit = 'day' | 'week'

export interface AreaStreak {
  unit: StreakUnit
  current: number
  best: number
  periodDone: boolean // dziś (day) / bieżący tydzień (week) już zaliczony
  weekAcc: number // postęp bieżącego tygodnia (tylko unit=week)
  weekTarget: number
}

export interface ProgressState {
  streaks: Record<Area, AreaStreak>
  levels: Record<Area, AreaLevel>
  week: {
    perArea: Record<Area, number> // 0..100 średnia f w ostatnich 7 dniach
  }
}

function firstDay(logs: Log[]): string {
  if (logs.length === 0) return todayISO()
  return logs.reduce((min, l) => (l.log_date < min ? l.log_date : min), logs[0].log_date)
}

/** Suma wykonania nawyku w tygodniu kalendarzowym od `weekStart` (pon). */
function weeklyAcc(habit: Habit, weekStart: string, getValue: ValueLookup): number {
  let acc = 0
  for (let i = 0; i < 7; i++) {
    const v = getValue(habit.id, addDays(weekStart, i))
    if (v === undefined) continue
    acc += habit.input_kind === 'check' ? (v >= 1 ? 1 : 0) : v // scale3 sumuje jakość
  }
  return acc
}

/** Streak dzienny obszaru: dzień zaliczony gdy f obszaru >= próg. */
function dayStreak(
  area: Area,
  habits: Habit[],
  days: string[],
  from: string,
  today: string,
  getValue: ValueLookup
): AreaStreak {
  const good = (d: string) => (areaDailyF(area, habits, d, getValue) ?? 0) >= AREA_GOOD_THRESHOLD
  const periodDone = good(today)

  // licz wstecz; jeśli dziś jeszcze niezaliczone, nie zeruj — licz od wczoraj
  let current = 0
  let d = periodDone ? today : addDays(today, -1)
  while (d >= from && good(d)) {
    current++
    d = addDays(d, -1)
  }

  let best = 0
  let run = 0
  for (const dd of days) {
    if (good(dd)) {
      run++
      if (run > best) best = run
    } else run = 0
  }
  best = Math.max(best, current)

  return { unit: 'day', current, best, periodDone, weekAcc: 0, weekTarget: 0 }
}

/** Streak tygodniowy obszaru: tydzień pon–ndz zaliczony gdy każdy nawyk trafi weekly_target. */
function weekStreak(
  weeklyHabits: Habit[],
  from: string,
  today: string,
  getValue: ValueLookup
): AreaStreak {
  const targetOf = (h: Habit) => (h.weekly_target && h.weekly_target > 0 ? h.weekly_target : 1)
  const done = (w: string) => weeklyHabits.every((h) => weeklyAcc(h, w, getValue) >= targetOf(h))

  const curWeek = weekStartISO(today)
  const firstWeek = weekStartISO(from)
  const periodDone = done(curWeek)

  // licz wstecz; bieżący tydzień w toku nie zeruje — licz od poprzedniego
  let current = 0
  let w = periodDone ? curWeek : addDays(curWeek, -7)
  while (w >= firstWeek && done(w)) {
    current++
    w = addDays(w, -7)
  }

  let best = 0
  let run = 0
  for (let ww = firstWeek; ww <= curWeek; ww = addDays(ww, 7)) {
    if (done(ww)) {
      run++
      if (run > best) best = run
    } else run = 0
  }
  best = Math.max(best, current)

  const weekAcc = weeklyHabits.reduce((s, h) => s + weeklyAcc(h, curWeek, getValue), 0)
  const weekTarget = weeklyHabits.reduce((s, h) => s + targetOf(h), 0)

  return { unit: 'week', current, best, periodDone, weekAcc, weekTarget }
}

export function computeProgress(habits: Habit[], logs: Log[]): ProgressState {
  const today = todayISO()
  const from = firstDay(logs)
  const getValue = makeLookup(logs)
  const days = dateRange(from, today)

  // ----- Streaki per obszar (każdy element rozliczany osobno) -----
  const streaks = {} as Record<Area, AreaStreak>
  for (const area of AREAS) {
    const weeklyHabits = habits.filter((h) => h.area === area && h.active && h.cadence === 'weekly')
    streaks[area] =
      weeklyHabits.length > 0
        ? weekStreak(weeklyHabits, from, today, getValue)
        : dayStreak(area, habits, days, from, today, getValue)
  }

  // ----- Poziomy per obszar -----
  const levels = {} as Record<Area, AreaLevel>
  for (const area of AREAS) {
    let level = 1
    let progress = 0
    let bad = 0
    for (const d of days) {
      const f = areaDailyF(area, habits, d, getValue)
      if (f === null) continue
      if (f >= AREA_GOOD_THRESHOLD) {
        progress++
        if (progress >= 7 * level) {
          level++
          progress = 0
          bad = 0
        }
      } else if (f < AREA_BAD_THRESHOLD) {
        bad++
        if (bad >= LEVEL_DECAY_BAD_DAYS) {
          level = Math.max(1, level - 1)
          bad = 0
          progress = 0
        }
      }
    }
    const tf = areaDailyF(area, habits, today, getValue)
    levels[area] = { level, progress, threshold: 7 * level, badDays: bad, todayF: tf ?? 0 }
  }

  // ----- Ostatnie 7 dni per obszar -----
  const weekDays = dateRange(addDays(today, -6), today)
  const perArea = {} as Record<Area, number>
  for (const area of AREAS) perArea[area] = 0
  for (const d of weekDays) {
    for (const area of AREAS) {
      const f = areaDailyF(area, habits, d, getValue)
      perArea[area] += (f ?? 0) / weekDays.length
    }
  }

  return {
    streaks,
    levels,
    week: {
      perArea: Object.fromEntries(
        AREAS.map((a) => [a, Math.round(perArea[a] * 100)])
      ) as Record<Area, number>,
    },
  }
}
