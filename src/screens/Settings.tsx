import { useState } from 'react'
import { useHabits, useSaveHabit, useDeleteHabit } from '../lib/queries'
import {
  AREAS,
  AREA_LABELS,
  Area,
  Cadence,
  Habit,
  InputKind,
  ScoreMode,
} from '../lib/types'
import { useAuth } from '../lib/auth'
import { disableReminder, enableReminder, getReminder } from '../lib/reminder'

type Draft = Partial<Habit>

const EMPTY: Draft = {
  name: '',
  area: 'sen',
  input_kind: 'check',
  cadence: 'daily',
  score_mode: 'at_least',
  daily_target: undefined,
  target_high: undefined,
  falloff: undefined,
  weekly_target: undefined,
  subtypes: '',
  weight: 1,
  active: true,
  sort_order: 0,
}

export default function Settings() {
  const habits = useHabits()
  const save = useSaveHabit()
  const del = useDeleteHabit()
  const { signOut } = useAuth()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [rem, setRem] = useState(getReminder())

  async function toggleReminder() {
    if (rem.enabled) {
      disableReminder()
    } else {
      const ok = await enableReminder(rem.hour)
      if (!ok) {
        alert('Nie udało się włączyć powiadomień (brak zgody). Na iPhonie dodaj apkę do ekranu głównego.')
      }
    }
    setRem(getReminder())
  }
  async function changeHour(h: number) {
    if (rem.enabled) await enableReminder(h)
    else localStorage.setItem('gh_reminder_hour', String(h))
    setRem({ ...getReminder(), hour: h })
  }

  if (habits.isLoading) return <div className="p-6 text-muted">Ładowanie…</div>

  function open(h?: Habit) {
    setDraft(h ? { ...h, subtypes: h.subtypes ?? '' } : { ...EMPTY, sort_order: (habits.data?.length ?? 0) + 1 })
  }

  function onSaved() {
    if (!draft) return
    const isNumber = draft.input_kind === 'number'
    const isWeekly = draft.cadence === 'weekly'
    const payload: Draft = {
      ...draft,
      name: (draft.name ?? '').trim(),
      score_mode: isNumber ? draft.score_mode ?? 'at_least' : null,
      daily_target: isNumber ? numOrNull(draft.daily_target) : null,
      target_high: isNumber && draft.score_mode === 'range' ? numOrNull(draft.target_high) : null,
      falloff:
        isNumber && (draft.score_mode === 'range' || draft.score_mode === 'at_most')
          ? numOrNull(draft.falloff)
          : null,
      weekly_target: isWeekly ? numOrNull(draft.weekly_target) : null,
      subtypes: draft.input_kind === 'check' && draft.subtypes ? draft.subtypes : null,
      weight: numOrNull(draft.weight) ?? 1,
    }
    if (!payload.name) return
    save.mutate(payload, { onSuccess: () => setDraft(null) })
  }

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">Ustawienia</h1>
        <button
          onClick={() => open()}
          className="rounded-lg bg-rating-good px-3 py-1.5 text-sm font-semibold text-bg"
        >
          + Nawyk
        </button>
      </div>

      <div className="mb-6 grid gap-2 md:grid-cols-2">
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
              <div className="text-xs text-muted">{describe(h)}</div>
            </div>
            <span className="text-muted">›</span>
          </button>
        ))}
      </div>

      {/* Przypomnienie */}
      <div className="mb-6 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Wieczorne przypomnienie</div>
            <div className="text-xs text-muted">„Zamknij dzień" — powiadomienie o wybranej godzinie.</div>
          </div>
          <button
            onClick={toggleReminder}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
              rem.enabled ? 'bg-rating-good text-bg' : 'border border-border text-muted'
            }`}
          >
            {rem.enabled ? 'Wł' : 'Wył'}
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span className="text-muted">Godzina:</span>
          <select
            value={rem.hour}
            onChange={(e) => changeHour(Number(e.target.value))}
            className="rounded-lg border border-border bg-surface2 px-3 py-1.5 outline-none"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Działa gdy apka jest otwarta/w tle. iPhone: dodaj do ekranu głównego, by działało pewniej.
        </p>
      </div>

      <button
        onClick={() => signOut()}
        className="w-full rounded-xl border border-border py-2.5 text-sm font-medium text-muted"
      >
        Wyloguj
      </button>

      <p className="mt-4 text-center text-[11px] text-muted">
        Build: {__BUILD_TIME__} ·{' '}
        <button onClick={() => window.location.reload()} className="underline">
          odśwież apkę
        </button>
      </p>

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

function describe(h: Habit): string {
  const kind =
    h.input_kind === 'check'
      ? 'odhacz'
      : h.input_kind === 'scale3'
        ? 'skala 3'
        : h.input_kind === 'scale4'
          ? 'skala 4'
          : 'liczba'
  const cad = h.cadence === 'weekly' ? `tyg ×${h.weekly_target}` : 'dziennie'
  return `${AREA_LABELS[h.area]} · ${kind} · ${cad} · waga ${h.weight}`
}

function numOrNull(v: unknown): number | null {
  if (v === '' || v === undefined || v === null) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isNaN(n) ? null : n
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
  const isNumber = draft.input_kind === 'number'
  const isCheck = draft.input_kind === 'check'
  const isWeekly = draft.cadence === 'weekly'
  const mode = draft.score_mode ?? 'at_least'

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
            <Input value={draft.name ?? ''} onChange={(v) => set({ name: v })} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Obszar">
              <Select value={draft.area ?? 'sen'} onChange={(v) => set({ area: v as Area })}>
                {AREAS.map((a) => (
                  <option key={a} value={a}>
                    {AREA_LABELS[a]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Kadencja">
              <Select value={draft.cadence ?? 'daily'} onChange={(v) => set({ cadence: v as Cadence })}>
                <option value="daily">dziennie</option>
                <option value="weekly">tygodniowo</option>
              </Select>
            </Field>
          </div>

          <Field label="Sposób wpisu">
            <Select value={draft.input_kind ?? 'check'} onChange={(v) => set({ input_kind: v as InputKind })}>
              <option value="check">odhacz (tak/nie)</option>
              <option value="scale3">skala 3 (słabo/okej/super)</option>
              <option value="scale4">skala 4 (bardzo źle→dobrze)</option>
              <option value="number">liczba</option>
            </Select>
          </Field>

          {isCheck && (
            <Field label="Podtypy (opcjonalnie, po przecinku)">
              <Input
                value={draft.subtypes ?? ''}
                onChange={(v) => set({ subtypes: v })}
                placeholder="siłownia,basen"
              />
            </Field>
          )}

          {isNumber && (
            <>
              <Field label="Punktacja liczby">
                <Select value={mode} onChange={(v) => set({ score_mode: v as ScoreMode })}>
                  <option value="at_least">im więcej tym lepiej (≥ cel)</option>
                  <option value="at_most">im mniej tym lepiej (≤ cel)</option>
                  <option value="range">pasmo (ideał między low–high)</option>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={mode === 'range' ? 'Dolna granica' : mode === 'at_most' ? 'Strefa wolna (≤)' : 'Cel (≥)'}>
                  <NumInput value={draft.daily_target} onChange={(v) => set({ daily_target: v })} />
                </Field>
                {mode === 'range' && (
                  <Field label="Górna granica">
                    <NumInput value={draft.target_high} onChange={(v) => set({ target_high: v })} />
                  </Field>
                )}
                {(mode === 'range' || mode === 'at_most') && (
                  <Field label={mode === 'range' ? 'Spadek / jednostkę' : 'Zakres spadku do 0'}>
                    <NumInput value={draft.falloff} onChange={(v) => set({ falloff: v })} />
                  </Field>
                )}
              </div>
            </>
          )}

          {isWeekly && (
            <Field label="Cel tygodniowy (sesje lub pkt jakości / 7 dni)">
              <NumInput value={draft.weekly_target} onChange={(v) => set({ weekly_target: v })} />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Waga">
              <NumInput value={draft.weight ?? 1} onChange={(v) => set({ weight: v })} />
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

// --- małe pola ---
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  )
}
function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 outline-none focus:border-rating-good"
    />
  )
}
function NumInput({
  value,
  onChange,
}: {
  value: number | null | undefined
  onChange: (v: number) => void
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value as unknown as number)}
      className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 outline-none focus:border-rating-good"
    />
  )
}
function Select({
  value,
  onChange,
  children,
}: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 outline-none"
    >
      {children}
    </select>
  )
}
