import { useMemo, useState } from 'react'
import {
  useBudget,
  useAddBudgetEntry,
  useUpdateBudgetEntry,
  useDeleteBudgetEntry,
} from '../lib/queries'
import { BUDGET_CATEGORIES, BudgetEntry, BudgetKind, budgetCategory } from '../lib/types'
import { parseISO, todayISO } from '../lib/date'
import { buzz, BUZZ_TAP, BUZZ_DONE } from '../lib/haptics'

const MONTHS = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
]

/** "1200" / "49,99" / "1 200,50" → number | null (tylko dodatnie) */
function parseAmount(s: string): number | null {
  const n = parseFloat(s.replace(/\s/g, '').replace(',', '.'))
  return Number.isNaN(n) || n <= 0 ? null : n
}

const moneyFmt = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 })
function fmtMoney(n: number): string {
  return `${moneyFmt.format(n)} zł`
}
/** Kwota ze znakiem: +1 200 zł / −340 zł */
function fmtSigned(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : ''
  return `${sign}${fmtMoney(Math.abs(n))}`
}

function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

function fmtDay(iso: string): string {
  const d = parseISO(iso)
  const wd = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So'][d.getDay()]
  return `${wd} ${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase().slice(0, 3)}`
}

type Tab = 'lista' | 'kategorie'

export default function Budget() {
  const budget = useBudget()
  const today = todayISO()
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [tab, setTab] = useState<Tab>('lista')

  const mKey = `${month.y}-${String(month.m + 1).padStart(2, '0')}`
  const isCurrentMonth = mKey === monthKey(today)

  const all = budget.data ?? []
  const items = useMemo(
    () => all.filter((e) => monthKey(e.entry_date) === mKey),
    [all, mKey]
  )

  const sums = useMemo(() => {
    const s = { inDone: 0, inPlanned: 0, outDone: 0, outPlanned: 0 }
    for (const e of items) {
      if (e.kind === 'in') e.planned ? (s.inPlanned += e.amount) : (s.inDone += e.amount)
      else e.planned ? (s.outPlanned += e.amount) : (s.outDone += e.amount)
    }
    return s
  }, [items])

  const balance = sums.inDone - sums.outDone
  const afterPlans = balance + sums.inPlanned - sums.outPlanned
  const hasPlans = sums.inPlanned > 0 || sums.outPlanned > 0

  function shiftMonth(delta: number) {
    setMonth(({ y, m }) => {
      const d = new Date(y, m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  /** Domyślna data nowego wpisu: dziś, a w innym miesiącu — jego 1. dzień. */
  const defaultDate = isCurrentMonth ? today : `${mKey}-01`

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Budżet 💰</h1>
      <p className="mb-4 text-sm text-muted">
        Wypłaty na plus, wydatki na minus — rozpisane albo jedną kwotą.
      </p>

      <div className="mb-3 flex items-center justify-between rounded-xl border border-border bg-surface px-2 py-1.5">
        <button onClick={() => shiftMonth(-1)} className="rounded-lg px-3 py-1 text-muted">
          ‹
        </button>
        <button
          onClick={() => {
            const d = new Date()
            setMonth({ y: d.getFullYear(), m: d.getMonth() })
          }}
          className="text-sm font-bold"
          title="Wróć do bieżącego miesiąca"
        >
          {MONTHS[month.m]} {month.y}
          {!isCurrentMonth && <span className="ml-1.5 text-[11px] font-medium text-muted">↺ dziś</span>}
        </button>
        <button onClick={() => shiftMonth(1)} className="rounded-lg px-3 py-1 text-muted">
          ›
        </button>
      </div>

      {budget.isLoading ? (
        <div className="p-6 text-muted">Ładowanie…</div>
      ) : (
        <>
          <div className="mb-3 rounded-2xl border border-border bg-surface p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Zostało w tym miesiącu
            </div>
            <div
              className={`text-3xl font-extrabold tabular-nums ${
                balance > 0 ? 'text-rating-good' : balance < 0 ? 'text-rating-bad' : 'text-text'
              }`}
            >
              {fmtSigned(balance)}
            </div>

            <div className="mt-3 flex gap-4">
              <div className="min-w-0">
                <div className="text-[11px] text-muted">Wpłynęło</div>
                <div className="text-sm font-bold tabular-nums text-rating-good">
                  {fmtMoney(sums.inDone)}
                </div>
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-muted">Wydane</div>
                <div className="text-sm font-bold tabular-nums text-rating-bad">
                  {fmtMoney(sums.outDone)}
                </div>
              </div>
              {sums.inDone > 0 && (
                <div className="min-w-0">
                  <div className="text-[11px] text-muted">Przejedzone</div>
                  <div className="text-sm font-bold tabular-nums text-rating-mid">
                    {Math.round((sums.outDone / sums.inDone) * 100)}%
                  </div>
                </div>
              )}
            </div>

            {sums.inDone > 0 && (
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface2">
                <div
                  className={`h-full rounded-full ${
                    sums.outDone > sums.inDone ? 'bg-rating-bad' : 'bg-rating-mid'
                  }`}
                  style={{ width: `${Math.min(100, (sums.outDone / sums.inDone) * 100)}%` }}
                />
              </div>
            )}

            {hasPlans && (
              <div className="mt-3 border-t border-border pt-2 text-xs text-muted">
                W planach:{' '}
                {sums.inPlanned > 0 && (
                  <span className="font-semibold text-rating-good">+{fmtMoney(sums.inPlanned)}</span>
                )}
                {sums.inPlanned > 0 && sums.outPlanned > 0 && ' / '}
                {sums.outPlanned > 0 && (
                  <span className="font-semibold text-rating-bad">−{fmtMoney(sums.outPlanned)}</span>
                )}
                {' → zostanie '}
                <span
                  className={`font-semibold tabular-nums ${
                    afterPlans >= 0 ? 'text-rating-good' : 'text-rating-bad'
                  }`}
                >
                  {fmtSigned(afterPlans)}
                </span>
              </div>
            )}
          </div>

          <AddEntryForm key={defaultDate} defaultDate={defaultDate} />

          <div className="mb-3 flex rounded-xl border border-border bg-surface p-1">
            {(['lista', 'kategorie'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition-colors ${
                  tab === t ? 'bg-rating-good/15 text-rating-good' : 'text-muted'
                }`}
              >
                {t === 'lista' ? '🧾 Lista' : '📊 Kategorie'}
              </button>
            ))}
          </div>

          {items.length === 0 ? (
            <p className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
              Pusto w tym miesiącu. Wpisz wypłatę albo pierwszy wydatek.
            </p>
          ) : tab === 'lista' ? (
            <EntryList items={items} />
          ) : (
            <CategoryBreakdown items={items} />
          )}
        </>
      )}
    </div>
  )
}

// ====================================================================
// Dodawanie wpisu
// ====================================================================

function AddEntryForm({ defaultDate }: { defaultDate: string }) {
  const add = useAddBudgetEntry()
  const [kind, setKind] = useState<BudgetKind>('out')
  const [amount, setAmount] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [planned, setPlanned] = useState(false)
  const [date, setDate] = useState(defaultDate)
  const [openDate, setOpenDate] = useState(false)

  const cats = BUDGET_CATEGORIES.filter((c) => c.kind === kind)

  function switchKind(k: BudgetKind) {
    setKind(k)
    setCategory(null)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = parseAmount(amount)
    if (value === null) return
    buzz(BUZZ_TAP)
    add.mutate(
      { entry_date: date, kind, amount: value, title, category, planned },
      {
        onSuccess: () => {
          setAmount('')
          setTitle('')
          setCategory(null)
        },
      }
    )
  }

  return (
    <form onSubmit={submit} className="mb-3 rounded-2xl border border-border bg-surface p-3">
      <div className="mb-2 flex gap-2">
        <button
          type="button"
          onClick={() => switchKind('out')}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
            kind === 'out' ? 'bg-rating-bad/15 text-rating-bad' : 'bg-surface2 text-muted'
          }`}
        >
          − Wydatek
        </button>
        <button
          type="button"
          onClick={() => switchKind('in')}
          className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors ${
            kind === 'in' ? 'bg-rating-good/15 text-rating-good' : 'bg-surface2 text-muted'
          }`}
        >
          + Wpływ
        </button>
      </div>

      <div className="flex gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          aria-label="Kwota"
          className={`w-28 rounded-xl border border-border bg-surface2 px-3 py-2.5 text-right text-lg font-bold tabular-nums outline-none ${
            kind === 'in' ? 'focus:border-rating-good' : 'focus:border-rating-bad'
          }`}
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === 'in' ? 'Skąd? (opcjonalnie)' : 'Na co? (opcjonalnie)'}
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface2 px-3 py-2.5 outline-none focus:border-rating-good"
        />
        <button
          type="submit"
          disabled={parseAmount(amount) === null}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-bg disabled:opacity-40 ${
            kind === 'in' ? 'bg-rating-good' : 'bg-rating-bad'
          }`}
        >
          Dodaj
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {cats.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory((prev) => (prev === c.key ? null : c.key))}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
              category === c.key
                ? 'border-rating-good/60 bg-rating-good/10 text-text'
                : 'border-border text-muted'
            }`}
          >
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPlanned((p) => !p)}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            planned
              ? 'border-rating-mid/60 bg-rating-mid/10 text-rating-mid'
              : 'border-border text-muted'
          }`}
          title="Wpis planowany — jeszcze nie poszło"
        >
          {planned ? '📌 Dopiero pójdzie' : '✅ Już poszło'}
        </button>
        <button
          type="button"
          onClick={() => setOpenDate((s) => !s)}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            openDate ? 'border-rating-good/60 text-rating-good' : 'border-border text-muted'
          }`}
        >
          📅 {fmtDay(date)}
        </button>
        {openDate && (
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-lg border border-border bg-surface2 px-2 py-1 text-xs outline-none [color-scheme:dark]"
          />
        )}
      </div>
    </form>
  )
}

// ====================================================================
// Lista wpisów — po dniach
// ====================================================================

function EntryList({ items }: { items: BudgetEntry[] }) {
  const days = useMemo(() => {
    const map = new Map<string, BudgetEntry[]>()
    for (const e of items) map.set(e.entry_date, [...(map.get(e.entry_date) ?? []), e])
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [items])

  return (
    <div>
      {days.map(([date, entries]) => {
        const net = entries.reduce((s, e) => s + (e.kind === 'in' ? e.amount : -e.amount), 0)
        return (
          <div key={date} className="mb-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                {fmtDay(date)}
              </span>
              <span
                className={`text-xs font-semibold tabular-nums ${
                  net >= 0 ? 'text-rating-good' : 'text-muted'
                }`}
              >
                {fmtSigned(net)}
              </span>
            </div>
            {entries.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function EntryRow({ entry }: { entry: BudgetEntry }) {
  const update = useUpdateBudgetEntry()
  const del = useDeleteBudgetEntry()
  const [editAmount, setEditAmount] = useState(false)

  const cat = budgetCategory(entry.category)
  const label = entry.title || cat?.label || (entry.kind === 'in' ? 'Wpływ' : 'Wydatek')

  function saveAmount(raw: string) {
    const v = parseAmount(raw)
    if (v !== null && v !== entry.amount) update.mutate({ id: entry.id, amount: v })
    setEditAmount(false)
  }

  return (
    <div
      className={`mb-1.5 flex items-center gap-2.5 rounded-xl border bg-surface px-3 py-2.5 ${
        entry.planned ? 'border-dashed border-rating-mid/40' : 'border-border'
      }`}
    >
      <span className="w-5 shrink-0 text-center text-base leading-none">{cat?.icon ?? '•'}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{label}</div>
        {(cat && entry.title) || entry.planned ? (
          <div className="truncate text-[11px] text-muted">
            {entry.planned && <span className="text-rating-mid">📌 plan</span>}
            {entry.planned && cat && entry.title && ' · '}
            {cat && entry.title && cat.label}
          </div>
        ) : null}
      </div>

      {editAmount ? (
        <input
          autoFocus
          inputMode="decimal"
          defaultValue={entry.amount}
          onBlur={(e) => saveAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveAmount((e.target as HTMLInputElement).value)
            if (e.key === 'Escape') setEditAmount(false)
          }}
          className="w-20 rounded-lg border border-border bg-surface2 px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-rating-good"
        />
      ) : (
        <button
          onClick={() => setEditAmount(true)}
          className={`shrink-0 text-sm font-semibold tabular-nums ${
            entry.planned
              ? 'text-muted'
              : entry.kind === 'in'
                ? 'text-rating-good'
                : 'text-rating-bad'
          }`}
          title="Zmień kwotę"
        >
          {entry.kind === 'in' ? '+' : '−'}
          {fmtMoney(entry.amount)}
        </button>
      )}

      {entry.planned && (
        <button
          onClick={() => {
            buzz(BUZZ_DONE)
            update.mutate({ id: entry.id, planned: false })
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-[11px] text-muted hover:border-rating-good hover:text-rating-good"
          title="Już poszło"
        >
          ✓
        </button>
      )}
      <button
        onClick={() => del.mutate(entry.id)}
        className="shrink-0 text-xs text-muted hover:text-rating-bad"
        title="Usuń"
      >
        ✕
      </button>
    </div>
  )
}

// ====================================================================
// Kategorie — na co poszło
// ====================================================================

function CategoryBreakdown({ items }: { items: BudgetEntry[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; done: number; planned: number; count: number }>()
    for (const e of items) {
      if (e.kind !== 'out') continue
      const key = e.category ?? '_brak'
      const g = map.get(key) ?? { key, done: 0, planned: 0, count: 0 }
      if (e.planned) g.planned += e.amount
      else g.done += e.amount
      g.count += 1
      map.set(key, g)
    }
    return [...map.values()].sort((a, b) => b.done + b.planned - (a.done + a.planned))
  }, [items])

  const income = useMemo(
    () => items.filter((e) => e.kind === 'in').reduce((s, e) => s + e.amount, 0),
    [items]
  )
  const total = groups.reduce((s, g) => s + g.done + g.planned, 0)

  if (groups.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
        Brak wydatków w tym miesiącu.
      </p>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Na co poszło</span>
        <span className="text-xs font-semibold tabular-nums text-rating-bad">−{fmtMoney(total)}</span>
      </div>
      {groups.map((g) => {
        const cat = budgetCategory(g.key === '_brak' ? null : g.key)
        const sum = g.done + g.planned
        const pct = total > 0 ? (sum / total) * 100 : 0
        return (
          <div key={g.key} className="mb-3">
            <div className="mb-1 flex items-baseline gap-2">
              <span className="text-sm">{cat?.icon ?? '•'}</span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {cat?.label ?? 'Bez kategorii'}
                <span className="ml-1.5 text-[11px] text-muted">
                  {Math.round(pct)}% · {g.count}×
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{fmtMoney(sum)}</span>
            </div>
            <div className="flex h-2 overflow-hidden rounded-full bg-surface2">
              <div
                className="h-full bg-rating-bad"
                style={{ width: `${total > 0 ? (g.done / total) * 100 : 0}%` }}
              />
              <div
                className="h-full bg-rating-mid/50"
                style={{ width: `${total > 0 ? (g.planned / total) * 100 : 0}%` }}
              />
            </div>
            {g.planned > 0 && (
              <div className="mt-0.5 text-[11px] text-muted">
                w tym plan: <span className="text-rating-mid">{fmtMoney(g.planned)}</span>
              </div>
            )}
          </div>
        )
      })}
      {income > 0 && (
        <div className="mt-1 border-t border-border pt-2 text-xs text-muted">
          Z wpływów {fmtMoney(income)} rozdysponowane:{' '}
          <span className="font-semibold text-text">{Math.round((total / income) * 100)}%</span>
        </div>
      )}
    </div>
  )
}
