import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useHabits, useLogs, useRecords, useSnapshots, saveRecords } from './queries'
import { backfillSnapshots } from './snapshots'
import { computeAllRecords, detectNewRecords } from './records'
import { AREA_LABELS, Area } from './types'
import { useToast } from '../components/Toast'
import { todayISO } from './date'

/**
 * Po załadowaniu danych: dolicz snapshoty za brakujące dni, przelicz rekordy,
 * pokaż toast przy nowym rekordzie. Reaguje też na zmianę logów (nowy log = recheck).
 */
export function useSync() {
  const habits = useHabits()
  const logs = useLogs()
  const snapshots = useSnapshots()
  const records = useRecords()
  const qc = useQueryClient()
  const toast = useToast()

  const snapDoneRef = useRef(false)
  const lastLogsHashRef = useRef('')

  // 1) Backfill snapshotów — raz na otwarcie apki danego dnia
  useEffect(() => {
    if (snapDoneRef.current) return
    if (!habits.data || !logs.data || !snapshots.data) return
    snapDoneRef.current = true
    backfillSnapshots(habits.data, logs.data, snapshots.data)
      .then((n) => {
        if (n > 0) qc.invalidateQueries({ queryKey: ['snapshots'] })
      })
      .catch((e) => console.error('backfillSnapshots:', e))
  }, [habits.data, logs.data, snapshots.data, qc])

  // 2) Rekordy — przy każdej zmianie logów
  useEffect(() => {
    if (!habits.data || !logs.data || !records.data) return
    const hash = `${logs.data.length}:${todayISO()}:${logs.data
      .map((l) => `${l.habit_id}${l.log_date}${l.value}`)
      .join(',')}`
    if (hash === lastLogsHashRef.current) return
    lastLogsHashRef.current = hash

    const { records: fresh } = computeAllRecords(habits.data, logs.data)
    const beaten = detectNewRecords(records.data, fresh)
    if (beaten.length > 0) {
      saveRecords(fresh)
        .then(() => qc.invalidateQueries({ queryKey: ['records'] }))
        .catch((e) => console.error('saveRecords:', e))
      for (const r of beaten) {
        toast(`🔥 NOWY REKORD — ${recordShort(r.key, r.value)}`)
      }
    } else if (records.data.length === 0 && fresh.length > 0) {
      // pierwsze wypełnienie tabeli rekordów bez toasta
      saveRecords(fresh)
        .then(() => qc.invalidateQueries({ queryKey: ['records'] }))
        .catch((e) => console.error('saveRecords:', e))
    }
  }, [habits.data, logs.data, records.data, qc, toast])
}

function recordShort(key: string, value: number): string {
  if (key.startsWith('streak_')) {
    const area = key.replace('streak_', '') as Area
    return `${AREA_LABELS[area] ?? area}: ${value} dni z rzędu`
  }
  if (key.startsWith('best_rating_')) {
    const area = key.replace('best_rating_', '') as Area
    return `${AREA_LABELS[area] ?? area}: ${value}`
  }
  if (key === 'best_week_overall') return `Najlepszy tydzień: ${value}`
  return `${key}: ${value}`
}
