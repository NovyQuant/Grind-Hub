import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useHabits, useLogs, useRecords, useSnapshots, saveRecords } from './queries'
import { backfillSnapshots } from './snapshots'
import { computeProgress } from './progress'
import {
  AREAS,
  AREA_ICONS,
  AREA_LABELS,
  Area,
  DAY_MILESTONES,
  WEEK_MILESTONES,
  RecordRow,
} from './types'
import { useToast } from '../components/Toast'
import { todayISO } from './date'
import { buzz, BUZZ_LEVEL, BUZZ_MILESTONE } from './haptics'

/** Najwyższy kamień milowy <= wartości (0 gdy żaden). */
function reachedMilestone(milestones: number[], value: number): number {
  let out = 0
  for (const m of milestones) if (m <= value) out = m
  return out
}

/**
 * Po zmianie danych: dolicz snapshoty (FM stats) i sprawdź czy padł nowy poziom
 * lub kamień milowy streaka (per obszar) → toast + wibracja + zapis do `records`.
 */
export function useSync() {
  const habits = useHabits()
  const logs = useLogs()
  const snapshots = useSnapshots()
  const records = useRecords()
  const qc = useQueryClient()
  const toast = useToast()

  const snapDoneRef = useRef(false)
  const lastHashRef = useRef('')

  // Backfill snapshotów FM — raz na otwarcie
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

  // Poziomy + kamienie milowe
  useEffect(() => {
    if (!habits.data || !logs.data || !records.data) return
    const hash = `${todayISO()}:${logs.data.map((l) => `${l.habit_id}${l.log_date}${l.value}`).join(',')}`
    if (hash === lastHashRef.current) return
    lastHashRef.current = hash

    const p = computeProgress(habits.data, logs.data)
    const today = todayISO()

    const fresh: RecordRow[] = [
      ...AREAS.map((a) => ({
        key: `streak_${a}`,
        label: `Streak — ${AREA_LABELS[a]}`,
        value: p.streaks[a].best,
        achieved_at: today,
      })),
      ...AREAS.map((a) => ({
        key: `level_${a}`,
        label: `Poziom — ${AREA_LABELS[a]}`,
        value: p.levels[a].level,
        achieved_at: today,
      })),
    ]

    const byKey = new Map(records.data.map((r) => [r.key, r.value]))
    const firstRun = records.data.length === 0
    let changed = false

    for (const r of fresh) {
      const old = byKey.get(r.key)
      if (old === undefined || r.value !== old) changed = true
      if (firstRun || old === undefined) continue // brak toasta przy pierwszym wypełnieniu
      if (r.value > old) {
        if (r.key.startsWith('level_')) {
          const area = r.key.replace('level_', '') as keyof typeof AREA_LABELS
          toast(`${AREA_ICONS[area]} ${AREA_LABELS[area]} — awans na poziom ${r.value}!`)
          buzz(BUZZ_LEVEL)
        } else if (r.key.startsWith('streak_')) {
          const area = r.key.replace('streak_', '') as Area
          const week = p.streaks[area].unit === 'week'
          const ms = week ? WEEK_MILESTONES : DAY_MILESTONES
          const m = reachedMilestone(ms, r.value)
          if (m > 0 && m > reachedMilestone(ms, old)) {
            toast(
              `🏆 ${AREA_ICONS[area]} ${AREA_LABELS[area]} — ${m} ${week ? 'tygodni' : 'dni'} streaka!`
            )
            buzz(BUZZ_MILESTONE)
          }
        }
      }
    }

    if (changed) {
      saveRecords(fresh)
        .then(() => qc.invalidateQueries({ queryKey: ['records'] }))
        .catch((e) => console.error('saveRecords:', e))
    }
  }, [habits.data, logs.data, records.data, qc, toast])
}
