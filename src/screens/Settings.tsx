import { useState } from 'react'
import { useHabits, useSaveHabit, useDeleteHabit } from '../lib/queries'
import { AREAS, AREA_LABELS, Area, Habit, HabitType, TargetDirection } from '../lib/types'

type Draft = Partial<Habit>

const EMPTY: Draft = {
  name: '',
  area: 'sen',
  type: 'numeric',
  unit: '',
  target_direction: 'at_least',
  daily_target: undefined,
  weekly_target: undefined,
  weight: 1,
  active: true,
  sort_order: 0,
}

export default function Settings() {
  const habits = useHabits()
  const save = useSaveHabit()
  const del = useDeleteHabit()
  const [draft, setDraft] = useState<Draft | null>(null)

  if (habits.isLoading) return <div className="p-6 text-muted">Ładowanie…</div>

  function open(h?: Habit) {
    setDraft(h ? { ...h } : { ...EMPTY, sort_order: (habits.data?.length ?? 0) + 1 })
  }

  function onSaved() {
    if (!draft) return
    const payload: Draft = {
      ...draft,
      name: (draft.name ?? '').trim(),
      unit: draft.type === 'numeric' ? draft.unit || null : null,
      target_direction: draft.type === 'numeric' ? draft.target_direction ?? 'at_least' : null,
      daily_target: draft.type === 'numeric' ? numOrNull(draft.daily_target) : null,
      weekly_target: draft.type === 'binary' ? intOrNull(draft.weekly_target) : null,
      weight: numOrNull(draft.weight) ?? 1,
    }
    if (!payload.name) return
    save.mutate(payload, { onSuccess: () => setDraft(null) })
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-extrabold tracking-tight md:text-2xl">Ustawienia</h1>
        <button
          onClick={() => open()}
          className="rounded-lg bg-rating-good px-3 py-1.5 text-sm font-semibold text-bg"
        >
          + Nawyk
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {(habits.data ?? []).map((h) => (
          <button
            key={h.id}
            onClick={() => open(h)}
            className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-left"
          >
            <div>
              <div className="font-medium">
                {h.name} {!h.active && <span className="text-xs text-muted">(nieaktywny)</span>}
              </div>
              <div className="text-xs text-muted">
                {AREA_LABELS[h.area]} · {h.type === 'binary' ? 'binarny' : 'liczbowy'}
                {h.type === 'numeric' && h.daily_target != null
                  ? ` · ${h.target_direction === 'at_most' ? '≤' : '≥'} ${h.daily_target}${h.unit ? ' ' + h.unit : ''}`
                  : ''}
                {h.type === 'binary' && h.weekly_target ? ` · ${h.weekly_target}×/tydz` : ''}
                {` · waga ${h.weight}`}
              </div>
            </div>
            <span className="text-muted">›</span>
          </button>
        ))}
      </div>

      {draft && (
        <Editor
          draft={draft}
          setDraft={setDraft}
          onSave={onSaved}
          onDelete={
            draft.id
              ? () => {
                  if (confirm('Usunąć nawyk i wszystkie jego wpisy?')) {
                    del.mutate(draft.id!, { onSuccess: () => setDraft(null) })
                  }
                }
              : undefined
          }
          onClose={() => setDraft(null)}
          busy={save.isPending || del.isPending}
        />
      )}
    </div>
  )
}

function numOrNull(v: unknown): number | null {
  if (v === '' || v === undefined || v === null) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isNaN(n) ? null : n
}
function intOrNull(v: unknown): number | null {
  const n = numOrNull(v)
  return n == null ? null : Math.round(n)
}

function Editor({
  draft,
  setDraft,
  onSave,
  onDelete,
  onClose,
  busy,
}: {
  draft: Draft
  setDraft: (d: Draft) => void
  onSave: () => void
  onDelete?: () => void
  onClose: () => void
  busy: boolean
}) {
  const set = (patch: Draft) => setDraft({ ...draft, ...patch })
  const isNumeric = draft.type === 'numeric'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center md:p-6"
      onClick={onClose}
    >
      <div
        className="nav-safe max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-border bg-surface p-5 md:rounded-3xl md:border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border md:hidden" />
        <h2 className="mb-4 text-lg font-bold">{draft.id ? 'Edytuj nawyk' : 'Nowy nawyk'}</h2>

        <div className="flex flex-col gap-3">
          <Field label="Nazwa">
            <input
              value={draft.name ?? ''}
              onChange={(e) => set({ name: e.target.value })}
              className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 outline-none focus:border-rating-good"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Obszar">
              <select
                value={draft.area}
                onChange={(e) => set({ area: e.target.value as Area })}
                className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 outline-none"
              >
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {AREA_LABELS[a]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Typ">
              <select
                value={draft.type}
                onChange={(e) => set({ type: e.target.value as HabitType })}
                className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 outline-none"
              >
                <option value="numeric">liczbowy</option>
                <option value="binary">binarny</option>
              </select>
            </Field>
          </div>

          {isNumeric ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Kierunek">
                  <select
                    value={draft.target_direction ?? 'at_least'}
                    onChange={(e) => set({ target_direction: e.target.value as TargetDirection })}
                    className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 outline-none"
                  >
                    <option value="at_least">co najmniej (≥)</option>
                    <option value="at_most">najwyżej (≤)</option>
                  </select>
                </Field>
                <Field label="Jednostka">
                  <input
                    value={draft.unit ?? ''}
                    onChange={(e) => set({ unit: e.target.value })}
                    placeholder="h, kcal, zł"
                    className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 outline-none focus:border-rating-good"
                  />
                </Field>
              </div>
              <Field label="Cel dzienny">
                <input
                  type="number"
                  inputMode="decimal"
                  value={draft.daily_target ?? ''}
                  onChange={(e) => set({ daily_target: e.target.value as unknown as number })}
                  className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 outline-none focus:border-rating-good"
                />
              </Field>
            </>
          ) : (
            <Field label="Cel tygodniowy (ile razy / tydzień)">
              <input
                type="number"
                inputMode="numeric"
                value={draft.weekly_target ?? ''}
                onChange={(e) => set({ weekly_target: e.target.value as unknown as number })}
                className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 outline-none focus:border-rating-good"
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Waga w ratingu">
              <input
                type="number"
                inputMode="decimal"
                value={draft.weight ?? 1}
                onChange={(e) => set({ weight: e.target.value as unknown as number })}
                className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 outline-none focus:border-rating-good"
              />
            </Field>
            <Field label="Aktywny">
              <button
                onClick={() => set({ active: !draft.active })}
                className={`w-full rounded-lg border px-3 py-2 font-medium ${
                  draft.active
                    ? 'border-rating-good/60 bg-rating-good/10 text-rating-good'
                    : 'border-border bg-surface2 text-muted'
                }`}
              >
                {draft.active ? 'Tak' : 'Nie'}
              </button>
            </Field>
          </div>

          <div className="mt-2 flex gap-2">
            {onDelete && (
              <button
                onClick={onDelete}
                disabled={busy}
                className="rounded-lg border border-rating-bad/60 px-4 py-2.5 text-sm font-semibold text-rating-bad"
              >
                Usuń
              </button>
            )}
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold text-muted"
            >
              Anuluj
            </button>
            <button
              onClick={onSave}
              disabled={busy}
              className="flex-1 rounded-lg bg-rating-good px-4 py-2.5 text-sm font-semibold text-bg disabled:opacity-50"
            >
              Zapisz
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  )
}
