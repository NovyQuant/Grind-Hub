import { AREAS, Area, AREA_LABELS, Habit, Log, RecordRow } from './types'
import { addDays, dateRange, todayISO } from './date'
import {
  areaDailyF,
  computeRatings,
  initialRatings,
  makeLookup,
  overallOf,
} from './ratings'

const STREAK_THRESHOLD = 0.8

export interface ComputedRecords {
  records: RecordRow[]
  currentStreaks: Record<Area, number>
}

/** Najwcześniejsza data logu, albo dziś gdy brak logów. */
function firstDay(logs: Log[]): string {
  if (logs.length === 0) return todayISO()
  return logs.reduce((min, l) => (l.log_date < min ? l.log_date : min), logs[0].log_date)
}

/**
 * Liczy komplet rekordów all-time z pełnej historii logów.
 * Rekordy: najwyższy rating per obszar, najlepszy tydzień (overall), najdłuższy streak per obszar.
 * Zwraca też bieżące streaki (do ekranu Rekordy).
 */
export function computeAllRecords(habits: Habit[], logs: Log[]): ComputedRecords {
  const today = todayISO()
  const from = firstDay(logs)
  const getValue = makeLookup(logs)
  const days = dateRange(from, today)
  const ratings = computeRatings(habits, from, today, initialRatings(), getValue)

  const records: RecordRow[] = []

  // 1) Najwyższy rating all-time per obszar
  for (const area of AREAS) {
    let best = -Infinity
    let when = today
    for (const d of days) {
      const r = ratings[d][area]
      if (r > best) {
        best = r
        when = d
      }
    }
    if (best > -Infinity) {
      records.push({
        key: `best_rating_${area}`,
        label: `Najwyższy rating — ${AREA_LABELS[area]}`,
        value: Math.round(best * 10) / 10,
        achieved_at: when,
      })
    }
  }

  // 2) Najlepszy tydzień (średni overall z 7 kolejnych dni)
  {
    let best = -Infinity
    let when = today
    for (let i = 0; i + 6 < days.length; i++) {
      let sum = 0
      for (let j = 0; j < 7; j++) sum += overallOf(ratings[days[i + j]])
      const avg = sum / 7
      if (avg > best) {
        best = avg
        when = days[i + 6]
      }
    }
    if (best > -Infinity) {
      records.push({
        key: 'best_week_overall',
        label: 'Najlepszy tydzień (overall)',
        value: Math.round(best * 10) / 10,
        achieved_at: when,
      })
    }
  }

  // 3) Najdłuższy streak per obszar (dni z f >= 0.8) + bieżący streak
  const currentStreaks = {} as Record<Area, number>
  for (const area of AREAS) {
    let longest = 0
    let run = 0
    let longestEnd = today
    for (const d of days) {
      const f = areaDailyF(area, habits, d, getValue)
      if (f !== null && f >= STREAK_THRESHOLD) {
        run++
        if (run > longest) {
          longest = run
          longestEnd = d
        }
      } else {
        run = 0
      }
    }
    // bieżący streak: licz wstecz od dziś
    let cur = 0
    let d = today
    while (true) {
      const f = areaDailyF(area, habits, d, getValue)
      if (f !== null && f >= STREAK_THRESHOLD) {
        cur++
        d = addDays(d, -1)
        if (d < from) break
      } else break
    }
    currentStreaks[area] = cur
    records.push({
      key: `streak_${area}`,
      label: `Najdłuższy streak — ${AREA_LABELS[area]}`,
      value: longest,
      achieved_at: longestEnd,
    })
  }

  return { records, currentStreaks }
}

/** Zwraca rekordy, które pobiły dotychczasowe (do toasta + zapisu). */
export function detectNewRecords(existing: RecordRow[], fresh: RecordRow[]): RecordRow[] {
  const byKey = new Map(existing.map((r) => [r.key, r]))
  const out: RecordRow[] = []
  for (const r of fresh) {
    const old = byKey.get(r.key)
    // rekord "pobity" gdy nowa wartość ściśle większa (wszystkie te metryki: im więcej tym lepiej)
    if (!old || r.value > old.value + 1e-9) {
      // pomiń trywialne rekordy startowe = 0
      if (r.value > 0) out.push(r)
    }
  }
  return out
}
