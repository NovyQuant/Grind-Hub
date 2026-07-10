import { useState } from 'react'
import {
  useAddAbstinence,
  useRelapseAbstinence,
  useSetAbstinenceStart,
  useDeleteAbstinence,
} from '../lib/queries'
import { Abstinence } from '../lib/types'
import { diffDays, todayISO } from '../lib/date'
import { abstinenceDayXP } from '../lib/rank'
import { buzz, BUZZ_TAP } from '../lib/haptics'

/** Nałogi w głównym panelu: liczniki, wpadka, edycja startu, dodawanie. */
export default function AbstinencePanel({
  list,
  xpToday,
}: {
  list: Abstinence[]
  xpToday: number
}) {
  const add = useAddAbstinence()
  const [name, setName] = useState('')
  const [adding, setAdding] = useState(false)

  return (
    <div className="mb-4 rounded-2xl border border-border bg-surface p-3.5">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-muted">🚭 Nałogi — dni na czysto</span>
        {xpToday > 0 && (
          <span className="text-[11px] font-bold text-rating-good">+{xpToday} XP dziś</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {list.length === 0 && !adding && (
          <p className="text-sm text-muted">Brak liczników — dodaj pierwszy.</p>
        )}
        {list.map((a) => (
          <AbstinenceRow key={a.id} a={a} />
        ))}
      </div>

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim())
              add.mutate(name, {
                onSuccess: () => {
                  setName('')
                  setAdding(false)
                },
              })
          }}
          className="mt-2 flex gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="np. Snus, Cukier…"
            autoFocus
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface2 px-3 py-2 text-sm outline-none focus:border-rating-good"
          />
          <button
            type="submit"
            className="rounded-lg bg-rating-good px-3 py-2 text-sm font-semibold text-bg"
          >
            Dodaj
          </button>
          <button type="button" onClick={() => setAdding(false)} className="text-xs text-muted">
            anuluj
          </button>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 text-xs font-semibold text-muted hover:text-text"
        >
          + dodaj licznik
        </button>
      )}
    </div>
  )
}

function AbstinenceRow({ a }: { a: Abstinence }) {
  const relapse = useRelapseAbstinence()
  const setStart = useSetAbstinenceStart()
  const del = useDeleteAbstinence()
  const [open, setOpen] = useState(false)

  const days = Math.max(0, diffDays(todayISO(), a.started_on))
  const best = Math.max(a.best_days, days)

  return (
    <div className="rounded-xl bg-surface2 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{a.name}</span>
        <span className="text-base font-black tabular-nums">🔥 {days}</span>
        {days > 0 && (
          <span className="text-[10px] font-bold text-rating-good">+{abstinenceDayXP(days)}/d</span>
        )}
        <button
          onClick={() => {
            if (confirm(`Zaliczyłeś wpadkę z „${a.name}"? Licznik wróci do 0.`)) {
              buzz(BUZZ_TAP)
              relapse.mutate({ ...a, currentDays: days })
            }
          }}
          className="rounded-lg border border-rating-bad/60 px-2 py-1 text-[11px] font-semibold text-rating-bad"
        >
          wpadka
        </button>
        <button
          onClick={() => setOpen(!open)}
          className={`px-1 text-sm ${open ? 'text-text' : 'text-muted'}`}
          title="Edytuj"
        >
          ⋯
        </button>
      </div>
      {open && (
        <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
          <span className="text-[11px] text-muted">od</span>
          <input
            type="date"
            defaultValue={a.started_on}
            max={todayISO()}
            onChange={(e) => setStart.mutate({ id: a.id, started_on: e.target.value })}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-xs outline-none [color-scheme:dark]"
          />
          <span className="text-[11px] text-muted">rekord {best} dni</span>
          <button
            onClick={() => {
              if (confirm(`Usunąć licznik „${a.name}"?`)) del.mutate(a.id)
            }}
            className="ml-auto text-[11px] text-muted hover:text-rating-bad"
          >
            usuń
          </button>
        </div>
      )}
    </div>
  )
}
