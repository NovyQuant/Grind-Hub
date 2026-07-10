import { Area, Habit } from './types'
import { addDays } from './date'

/** Wartość logu nawyku w danym dniu, albo undefined gdy brak wpisu. */
export type ValueLookup = (habitId: string, date: string) => number | undefined

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

/**
 * Dzienne wykonanie pojedynczego nawyku f ∈ [0,1] dla danej daty.
 *
 * Kadencja 'weekly' (trening, projekt) — liczona z okna 7 dni, więc pojedynczy
 * dzień przerwy nie karze, dopóki trzymasz tempo tygodnia:
 *   - check:  sesje(7d) / weekly_target
 *   - scale3: suma jakości(7d) / weekly_target
 * Kadencja 'daily':
 *   - check:  1 gdy zrobione, inaczej 0
 *   - scale3: wartość 0/0.5/1 (brak wpisu = 0)
 *   - scale4 (wydatki): samoocena 0/0.4/0.8/1 (brak wpisu = 0)
 *   - number range (sen): pasmo [low,high] = 1, poza pasmem spada o falloff/jednostkę
 *   - number at_most (głupoty): ≤ strefa wolna = 1, dalej spada o 1/falloff
 *   - number at_least: ≥ target = 1, inaczej value/target
 *   - brak wpisu (daily) = 0 (kara za nielogowanie)
 */
export function habitDailyF(habit: Habit, date: string, getValue: ValueLookup): number {
  if (habit.cadence === 'weekly') {
    const target = habit.weekly_target && habit.weekly_target > 0 ? habit.weekly_target : 1
    let acc = 0
    for (let i = 0; i < 7; i++) {
      const v = getValue(habit.id, addDays(date, -i))
      if (v === undefined) continue
      acc += habit.input_kind === 'check' ? (v >= 1 ? 1 : 0) : v // scale3 sumuje jakość
    }
    return clamp01(acc / target)
  }

  // daily
  const v = getValue(habit.id, date)

  if (habit.input_kind === 'check') return v !== undefined && v >= 1 ? 1 : 0
  if (habit.input_kind === 'scale2' || habit.input_kind === 'scale3' || habit.input_kind === 'scale4')
    return v === undefined ? 0 : clamp01(v)

  // number
  if (v === undefined) return 0
  const low = habit.daily_target ?? 0
  const falloff = habit.falloff ?? 1

  if (habit.score_mode === 'range') {
    const high = habit.target_high ?? low
    if (v >= low && v <= high) return 1
    if (v < low) return clamp01(1 - (low - v) * falloff)
    return clamp01(1 - (v - high) * falloff)
  }
  if (habit.score_mode === 'at_most') {
    // low = strefa wolna, falloff = zakres na którym spada do 0
    if (v <= low) return 1
    return clamp01(1 - (v - low) / (falloff || 1))
  }
  // at_least
  if (low <= 0) return v > 0 ? 1 : 0
  return v >= low ? 1 : clamp01(v / low)
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

export function makeLookup(logs: { habit_id: string; log_date: string; value: number }[]): ValueLookup {
  const map = new Map<string, number>()
  for (const l of logs) map.set(`${l.habit_id}|${l.log_date}`, l.value)
  return (habitId, date) => map.get(`${habitId}|${date}`)
}
