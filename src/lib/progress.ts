import {
  AREAS,
  Area,
  AREA_BAD_THRESHOLD,
  AREA_GOOD_THRESHOLD,
  DAY_COMPLETE_THRESHOLD,
  Habit,
  LEVEL_DECAY_BAD_DAYS,
  Log,
} from './types'
import { addDays, dateRange, todayISO } from './date'
import { areaDailyF, dayF, makeLookup } from './ratings'

export interface AreaLevel {
  level: number
  progress: number // dobre dni w kierunku następnego poziomu
  threshold: number // ile dobrych dni potrzeba (7 × level)
  badDays: number // zliczone słabe dni (do spadku)
  todayF: number
}

export interface ProgressState {
  streakCurrent: number
  streakBest: number
  todayDone: boolean
  levels: Record<Area, AreaLevel>
  dayScoreToday: number // 0..100 %
  week: {
    daysCompleted: number
    avgScore: number // 0..100
    perArea: Record<Area, number> // 0..100 średnia f w 7 dni
  }
}

function firstDay(logs: Log[]): string {
  if (logs.length === 0) return todayISO()
  return logs.reduce((min, l) => (l.log_date < min ? l.log_date : min), logs[0].log_date)
}

export function computeProgress(habits: Habit[], logs: Log[]): ProgressState {
  const today = todayISO()
  const from = firstDay(logs)
  const getValue = makeLookup(logs)
  const days = dateRange(from, today)

  // ----- Streak (dni z dayF >= próg) -----
  const isComplete = (d: string) => dayF(habits, d, getValue) >= DAY_COMPLETE_THRESHOLD
  const todayDone = isComplete(today)

  let streakCurrent = 0
  {
    // licz wstecz; jeśli dziś jeszcze niezaliczone, nie zeruj — licz od wczoraj
    let d = todayDone ? today : addDays(today, -1)
    while (d >= from && isComplete(d)) {
      streakCurrent++
      d = addDays(d, -1)
    }
  }
  let streakBest = 0
  {
    let run = 0
    for (const d of days) {
      if (isComplete(d)) {
        run++
        if (run > streakBest) streakBest = run
      } else run = 0
    }
    streakBest = Math.max(streakBest, streakCurrent)
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

  // ----- Tydzień -----
  const weekDays = dateRange(addDays(today, -6), today)
  let completed = 0
  let scoreSum = 0
  const perArea = {} as Record<Area, number>
  for (const area of AREAS) perArea[area] = 0
  for (const d of weekDays) {
    if (isComplete(d)) completed++
    scoreSum += dayF(habits, d, getValue)
    for (const area of AREAS) {
      const f = areaDailyF(area, habits, d, getValue)
      perArea[area] += (f ?? 0) / weekDays.length
    }
  }

  return {
    streakCurrent,
    streakBest,
    todayDone,
    levels,
    dayScoreToday: Math.round(dayF(habits, today, getValue) * 100),
    week: {
      daysCompleted: completed,
      avgScore: Math.round((scoreSum / weekDays.length) * 100),
      perArea: Object.fromEntries(
        AREAS.map((a) => [a, Math.round(perArea[a] * 100)])
      ) as Record<Area, number>,
    },
  }
}

/** Najbliższy kamień milowy powyżej wartości (albo null). */
export function nextMilestone(current: number, milestones: number[]): number | null {
  for (const m of milestones) if (m > current) return m
  return null
}
