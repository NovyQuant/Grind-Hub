import { useMemo } from 'react'
import { useHabits, useLogs } from './queries'
import { computeRatings, initialRatings, makeLookup, overallOf } from './ratings'
import { AREAS, Area } from './types'
import { addDays, dateRange, todayISO } from './date'

export interface LiveRatings {
  loading: boolean
  today: string
  /** per-area rating na dziś */
  current: Record<Area, number>
  /** per-area rating 7 dni temu (do trendu) */
  weekAgo: Record<Area, number>
  overall: number
  /** seria overall [{date, overall}] za ostatnie N dni */
  overallSeries: { date: string; overall: number }[]
  /** seria per-area za ostatnie N dni */
  series: Record<string, Record<Area, number>>
}

/** Liczy ratingi EMA na żywo z pełnej historii logów; zwraca widok pod Profil. */
export function useLiveRatings(windowDays = 90): LiveRatings {
  const habits = useHabits()
  const logs = useLogs()

  return useMemo(() => {
    const today = todayISO()
    const emptyRec = () => {
      const r = {} as Record<Area, number>
      for (const a of AREAS) r[a] = 8
      return r
    }
    if (!habits.data || !logs.data) {
      return {
        loading: true,
        today,
        current: emptyRec(),
        weekAgo: emptyRec(),
        overall: 8,
        overallSeries: [],
        series: {},
      }
    }

    const logsList = logs.data
    const from = logsList.length
      ? logsList.reduce((m, l) => (l.log_date < m ? l.log_date : m), logsList[0].log_date)
      : today
    const getValue = makeLookup(logsList)
    const ratings = computeRatings(habits.data, from, today, initialRatings(), getValue)

    const current = ratings[today] ?? emptyRec()
    const weekAgoDate = addDays(today, -7)
    const weekAgo = ratings[weekAgoDate] ?? emptyRec()

    const windowStart = addDays(today, -(windowDays - 1))
    const days = dateRange(windowStart, today).filter((d) => ratings[d])
    const overallSeries = days.map((d) => ({ date: d, overall: overallOf(ratings[d]) }))
    const series: Record<string, Record<Area, number>> = {}
    for (const d of days) series[d] = ratings[d]

    return {
      loading: false,
      today,
      current,
      weekAgo,
      overall: overallOf(current),
      overallSeries,
      series,
    }
  }, [habits.data, logs.data, windowDays])
}
