import { AREAS, Area, EMA_ALPHA, Habit, START_RATING } from './types'
import { addDays, dateRange, diffDays } from './date'

/** Wartość logu nawyku w danym dniu, albo undefined gdy brak wpisu. */
export type ValueLookup = (habitId: string, date: string) => number | undefined

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

/**
 * Dzienne wykonanie pojedynczego nawyku f ∈ [0,1] dla danej daty.
 * - binary z weekly_target: okno 7 dni (data i 6 dni wstecz).
 * - binary bez weekly_target: 1 gdy zalogowany danego dnia, inaczej 0.
 * - numeric at_most: 1 gdy value <= target, inaczej max(0, 1-(value-target)/target).
 * - numeric at_least: 1 gdy value >= target, inaczej value/target.
 * - brak wpisu (numeric) = 0 (celowa kara za nielogowanie).
 */
export function habitDailyF(habit: Habit, date: string, getValue: ValueLookup): number {
  if (habit.type === 'binary') {
    if (habit.weekly_target && habit.weekly_target > 0) {
      let done = 0
      for (let i = 0; i < 7; i++) {
        const v = getValue(habit.id, addDays(date, -i))
        if (v !== undefined && v >= 1) done++
      }
      return clamp01(done >= habit.weekly_target ? 1 : done / habit.weekly_target)
    }
    const v = getValue(habit.id, date)
    return v !== undefined && v >= 1 ? 1 : 0
  }

  // numeric
  const v = getValue(habit.id, date)
  if (v === undefined) return 0
  const target = habit.daily_target ?? 0
  if (target <= 0) return v > 0 ? 1 : 0

  if (habit.target_direction === 'at_most') {
    return v <= target ? 1 : clamp01(1 - (v - target) / target)
  }
  // at_least (domyślnie)
  return v >= target ? 1 : clamp01(v / target)
}

/** Dzienne wykonanie obszaru: średnia ważona f nawyków (wg weight). null gdy brak nawyków. */
export function areaDailyF(
  area: Area,
  habits: Habit[],
  date: string,
  getValue: ValueLookup
): number | null {
  const inArea = habits.filter((h) => h.area === area && h.active)
  if (inArea.length === 0) return null
  let num = 0
  let den = 0
  for (const h of inArea) {
    const w = h.weight ?? 1
    num += habitDailyF(h, date, getValue) * w
    den += w
  }
  return den > 0 ? num / den : null
}

export type RatingsByDate = Record<string, Record<Area, number>>

/**
 * Liczy ratingi EMA per obszar dla każdego dnia w [from..to].
 * rating_t = 0.95*rating_{t-1} + 0.05*(20*f).
 * initial: rating na dzień PRZED `from` (rating_{from-1}). Obszar bez nawyków carry-uje rating.
 */
export function computeRatings(
  habits: Habit[],
  from: string,
  to: string,
  initial: Record<Area, number>,
  getValue: ValueLookup
): RatingsByDate {
  const out: RatingsByDate = {}
  let prev = { ...initial }
  for (const date of dateRange(from, to)) {
    const day = {} as Record<Area, number>
    for (const area of AREAS) {
      const f = areaDailyF(area, habits, date, getValue)
      if (f === null) {
        day[area] = prev[area] // brak nawyków -> bez zmian
      } else {
        day[area] = (1 - EMA_ALPHA) * prev[area] + EMA_ALPHA * (20 * f)
      }
    }
    out[date] = day
    prev = day
  }
  return out
}

/** Overall = średnia ratingów obszarów (równe wagi). */
export function overallOf(day: Record<Area, number>): number {
  let sum = 0
  for (const area of AREAS) sum += day[area]
  return sum / AREAS.length
}

export function initialRatings(): Record<Area, number> {
  const r = {} as Record<Area, number>
  for (const area of AREAS) r[area] = START_RATING
  return r
}

/** Buduje ValueLookup ze zbioru logów. */
export function makeLookup(logs: { habit_id: string; log_date: string; value: number }[]): ValueLookup {
  const map = new Map<string, number>()
  for (const l of logs) map.set(`${l.habit_id}|${l.log_date}`, l.value)
  return (habitId, date) => map.get(`${habitId}|${date}`)
}

/** Kolor ratingu wg progu FM: <8 czerwony, 8–13 pomarańczowy, >13 zielony. */
export function ratingColor(r: number): string {
  if (r < 8) return '#e5484d'
  if (r <= 13) return '#f5a524'
  return '#30c85e'
}

export function ratingClass(r: number): string {
  if (r < 8) return 'text-rating-bad'
  if (r <= 13) return 'text-rating-mid'
  return 'text-rating-good'
}

export { diffDays }
