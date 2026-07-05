import { useMemo } from 'react'
import { useHabits, useLogs, useRecords } from '../lib/queries'
import { computeAllRecords } from '../lib/records'
import { AREAS, AREA_LABELS } from '../lib/types'

export default function Records() {
  const habits = useHabits()
  const logs = useLogs()
  const records = useRecords()

  const currentStreaks = useMemo(() => {
    if (!habits.data || !logs.data) return null
    return computeAllRecords(habits.data, logs.data).currentStreaks
  }, [habits.data, logs.data])

  if (habits.isLoading || logs.isLoading || records.isLoading)
    return <div className="p-6 text-muted">Ładowanie…</div>

  const rows = [...(records.data ?? [])].sort((a, b) => a.key.localeCompare(b.key))

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-xl font-extrabold tracking-tight md:text-2xl">Rekordy 🏆</h1>

      {/* Bieżące streaki */}
      <div className="mb-5">
        <h2 className="mb-2 px-1 text-xs uppercase tracking-wide text-muted">Aktualne streaki</h2>
        <div className="grid grid-cols-5 gap-2 md:gap-3">
          {AREAS.map((a) => (
            <div key={a} className="rounded-xl border border-border bg-surface p-2 text-center">
              <div className="text-lg font-extrabold text-rating-good">
                {currentStreaks ? currentStreaks[a] : 0}
              </div>
              <div className="mt-0.5 text-[10px] leading-tight text-muted">{AREA_LABELS[a]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabela rekordów */}
      <h2 className="mb-2 px-1 text-xs uppercase tracking-wide text-muted">Rekordy all-time</h2>
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-4 text-center text-sm text-muted">
          Jeszcze brak rekordów — loguj nawyki, a pojawią się tutaj.
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {rows.map((r) => (
            <div
              key={r.key}
              className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium">{r.label}</div>
                <div className="text-[11px] text-muted">{r.achieved_at}</div>
              </div>
              <div className="text-lg font-extrabold">
                {Number.isInteger(r.value) ? r.value : r.value.toFixed(1)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
