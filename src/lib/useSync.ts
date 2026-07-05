import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useHabits, useLogs, useRecords, useSnapshots, saveRecords } from './queries'
import { backfillSnapshots } from './snapshots'
import { computeProgress } from './progress'
import { AREAS, AREA_ICONS, AREA_LABELS, MILESTONES, RecordRow } from './types'
import { useToast } from '../components/Toast'
import { todayISO } from './date'
import { buzz, BUZZ_LEVEL, BUZZ_MILESTONE } from './haptics'

/**
 * Po zmianie danych: dolicz snapshoty (FM stats) i sprawdź czy padł nowy poziom
 * lub kamień milowy streaka → toast + wibracja + zapis do `records`.
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
      { key: 'streak_best', label: 'Najdłuższy streak', value: p.streakBest, achieved_at: today },
      {
        key: 'milestone',
        label: 'Najwyższy kamień milowy',
        value: [...MILESTONES].reverse().find((m) => m <= p.streakBest) ?? 0,
        achieved_at: today,
      },
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
        } else if (r.key === 'milestone' && r.value > 0) {
          toast(`🏆 KAMIEŃ MILOWY — ${r.value} dni streaka!`)
          buzz(BUZZ_MILESTONE)
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
