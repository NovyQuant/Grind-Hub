import { useState } from 'react'
import {
  useAbstinences,
  useAddAbstinence,
  useRelapseAbstinence,
  useSetAbstinenceStart,
  useDeleteAbstinence,
} from '../lib/queries'
import { Abstinence } from '../lib/types'
import { diffDays, todayISO } from '../lib/date'
import { buzz, BUZZ_TAP } from '../lib/haptics'

export default function Addictions() {
  const list = useAbstinences()
  const add = useAddAbstinence()
  const [name, setName] = useState('')

  if (list.isLoading) return <div className="p-6 text-muted">Ładowanie…</div>

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Nałogi 🚭</h1>
      <p className="mb-4 text-sm text-muted">Licz dni na czysto. Każda wpadka zeruje licznik.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) add.mutate(name, { onSuccess: () => setName('') })
        }}
        className="mb-4 flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="np. Snus, Papierosy, Cukier…"
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 outline-none focus:border-rating-good"
        />
        <button
          type="submit"
          className="rounded-xl bg-rating-good px-4 py-2.5 text-sm font-semibold text-bg"
        >
          Dodaj
        </button>
      </form>

      <div className="grid gap-3 md:grid-cols-2">
        {(list.data ?? []).length === 0 && (
          <p className="rounded-2xl border border-border bg-surface p-4 text-center text-sm text-muted">
            Brak liczników. Dodaj pierwszy powyżej.
          </p>
        )}
        {(list.data ?? []).map((a) => (
          <Card key={a.id} a={a} />
        ))}
      </div>
    </div>
  )
}

function Card({ a }: { a: Abstinence }) {
  const relapse = useRelapseAbstinence()
  const setStart = useSetAbstinenceStart()
  const del = useDeleteAbstinence()
  const [edit, setEdit] = useState(false)

  const days = Math.max(0, diffDays(todayISO(), a.started_on))
  const best = Math.max(a.best_days, days)

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold">{a.name}</div>
          <div className="text-[11px] text-muted">od {a.started_on} · rekord {best} dni</div>
        </div>
        <button
          onClick={() => del.mutate(a.id)}
          className="text-xs text-muted hover:text-rating-bad"
          title="Usuń"
        >
          ✕
        </button>
      </div>

      <div className="my-3 text-center">
        <div className="text-5xl font-black tabular-nums text-rating-good">{days}</div>
        <div className="text-xs text-muted">dni na czysto</div>
      </div>

      {edit ? (
        <div className="flex items-center gap-2">
          <input
            type="date"
            defaultValue={a.started_on}
            max={todayISO()}
            onChange={(e) =>
              setStart.mutate({ id: a.id, started_on: e.target.value }, { onSuccess: () => setEdit(false) })
            }
            className="flex-1 rounded-lg border border-border bg-surface2 px-2 py-1.5 text-sm outline-none [color-scheme:dark]"
          />
          <button onClick={() => setEdit(false)} className="text-xs text-muted">
            gotowe
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (confirm(`Zaliczyłeś wpadkę z „${a.name}"? Licznik wróci do 0.`)) {
                buzz(BUZZ_TAP)
                relapse.mutate({ ...a, currentDays: days })
              }
            }}
            className="flex-1 rounded-lg border border-rating-bad/60 py-2 text-sm font-semibold text-rating-bad"
          >
            Wpadka — reset
          </button>
          <button
            onClick={() => setEdit(true)}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted"
          >
            Od kiedy?
          </button>
        </div>
      )}
    </div>
  )
}
