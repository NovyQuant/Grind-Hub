import { AREAS, Area, AttributeSnapshot, Habit, Log } from './types'
import { addDays, dateRange, todayISO } from './date'
import { computeRatings, initialRatings, makeLookup } from './ratings'
import { supabase } from './supabase'

/**
 * Snapshot ratingów przy pierwszym otwarciu aplikacji danego dnia.
 * Dolicza brakujące dni wstecz od ostatniego snapshotu (albo od pierwszego logu / dziś).
 * Zwraca liczbę zapisanych dni.
 */
export async function backfillSnapshots(
  habits: Habit[],
  logs: Log[],
  existing: AttributeSnapshot[]
): Promise<number> {
  const today = todayISO()

  // Ostatni dzień z pełnym snapshotem
  const snapDates = [...new Set(existing.map((s) => s.snap_date))].sort()
  const lastSnap = snapDates.length ? snapDates[snapDates.length - 1] : null

  // Rating początkowy = stan na ostatni snapshot, inaczej 8.0
  const initial = initialRatings()
  let from: string
  if (lastSnap) {
    for (const s of existing) {
      if (s.snap_date === lastSnap) initial[s.area as Area] = Number(s.rating)
    }
    from = addDays(lastSnap, 1)
    if (from > today) return 0 // już mamy dzisiejszy snapshot
  } else {
    // brak snapshotów: startuj od pierwszego logu (albo dziś)
    const firstLog = logs.length
      ? logs.reduce((m, l) => (l.log_date < m ? l.log_date : m), logs[0].log_date)
      : today
    from = firstLog
  }

  const getValue = makeLookup(logs)
  const ratings = computeRatings(habits, from, today, initial, getValue)

  const rows: AttributeSnapshot[] = []
  for (const d of dateRange(from, today)) {
    for (const area of AREAS) {
      rows.push({ snap_date: d, area, rating: Math.round(ratings[d][area] * 100) / 100 })
    }
  }
  if (rows.length === 0) return 0

  const { error } = await supabase
    .from('attribute_snapshots')
    .upsert(rows, { onConflict: 'snap_date,area' })
  if (error) throw error

  return dateRange(from, today).length
}
