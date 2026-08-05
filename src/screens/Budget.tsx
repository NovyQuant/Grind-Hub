import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useBudgetAlloc,
  useBudgetBuckets,
  useBudgetItems,
  useBudgetMonths,
  useSaveBudgetMonth,
  useSaveBudgetAlloc,
  useAddBudgetMonth,
  useDeleteBudgetMonth,
  useAddBudgetBucket,
  useUpdateBudgetBucket,
  useDeleteBudgetBucket,
  useAddBudgetItem,
  useUpdateBudgetItem,
  useDeleteBudgetItem,
} from '../lib/queries'
import { BudgetAlloc, BudgetBucket, BudgetItem, BudgetMonth } from '../lib/types'
import { todayISO } from '../lib/date'
import { buzz, BUZZ_TAP, BUZZ_DONE } from '../lib/haptics'

const MONTHS_SHORT = [
  'sty', 'lut', 'mar', 'kwi', 'maj', 'cze',
  'lip', 'sie', 'wrz', 'paź', 'lis', 'gru',
]
const MONTHS_LONG = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
]

/** '2026-08' → 'sie 26' */
function shortPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`
}
/** '2026-08' → 'Sierpień 2026' */
function longPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return `${MONTHS_LONG[m - 1]} ${y}`
}
function nextPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
function currentPeriod(): string {
  return todayISO().slice(0, 7)
}

/** '1 200,50' → number | null */
function parseNum(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = parseFloat(t.replace(/\s/g, '').replace(',', '.'))
  return Number.isNaN(n) ? null : n
}

const fmt = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 })
function fmtNum(n: number): string {
  return fmt.format(n)
}

// ====================================================================

export default function Budget() {
  const buckets = useBudgetBuckets()
  const months = useBudgetMonths()
  const alloc = useBudgetAlloc()
  const items = useBudgetItems()
  const saveMonth = useSaveBudgetMonth()
  const setAlloc = useSaveBudgetAlloc()

  const [selected, setSelected] = useState<string | null>(null)
  const [showCols, setShowCols] = useState(false)

  const loading = buckets.isLoading || months.isLoading || alloc.isLoading

  const cols = buckets.data ?? []
  const rows = months.data ?? []
  const allocs = alloc.data ?? []
  const allItems = items.data ?? []

  /** period|bucket_id → kwota */
  const allocMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of allocs) m.set(`${a.period}|${a.bucket_id}`, a.amount)
    return m
  }, [allocs])

  /** ile pozycji rozpiski wisi na komórce (period|bucket_id, 'null' dla Inne) */
  const itemCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of allItems) {
      const k = `${i.period}|${i.bucket_id ?? 'null'}`
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [allItems])

  /** Wyliczenia wiersza: suma worków, „inne" (reszta pensji lub ręczne), suma wszystkiego. */
  function rowCalc(m: BudgetMonth) {
    const bucketsSum = cols.reduce((s, b) => s + (allocMap.get(`${m.period}|${b.id}`) ?? 0), 0)
    const other = m.other_override ?? Math.max(0, m.income - bucketsSum)
    return { bucketsSum, other, total: bucketsSum + other }
  }

  const totals = useMemo(() => {
    const t = {
      income: 0,
      byBucket: new Map<string, number>(),
      other: 0,
      total: 0,
      leftover: 0,
      cash: 0,
    }
    for (const m of rows) {
      const c = rowCalc(m)
      t.income += m.income
      t.other += c.other
      t.total += c.total
      t.leftover += m.leftover ?? 0
      t.cash += m.cash ?? 0
      for (const b of cols) {
        t.byBucket.set(b.id, (t.byBucket.get(b.id) ?? 0) + (allocMap.get(`${m.period}|${b.id}`) ?? 0))
      }
    }
    return t
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cols, allocMap])

  const now = currentPeriod()
  const nowRef = useRef<HTMLTableRowElement | null>(null)
  const scrolled = useRef(false)
  useEffect(() => {
    if (scrolled.current || !nowRef.current) return
    scrolled.current = true
    nowRef.current.scrollIntoView({ block: 'center' })
  }, [rows.length])

  return (
    <div className="p-4 md:p-6">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">Budżet 💰</h1>
        <button
          onClick={() => setShowCols((s) => !s)}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            showCols ? 'border-rating-good/60 text-rating-good' : 'border-border text-muted'
          }`}
        >
          ⚙️ Kolumny
        </button>
      </div>
      <p className="mb-3 text-sm text-muted">
        Wiersz = miesiąc pensyjny. Wpisujesz pensję i ile na co idzie — „Inne" liczy się samo z
        reszty. Kliknij miesiąc, żeby rozpisać cele.
      </p>

      {showCols && <ColumnManager buckets={cols} />}

      {loading ? (
        <div className="p-6 text-muted">Ładowanie…</div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          Brak miesięcy. Dodaj pierwszy poniżej.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full border-collapse text-xs tabular-nums">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted">
                <th className="sticky left-0 z-10 bg-surface px-2 py-2 text-left font-semibold">
                  Msc
                </th>
                <th className="px-2 py-2 text-right font-semibold">Pensja</th>
                {cols.map((b) => (
                  <th key={b.id} className="whitespace-nowrap px-2 py-2 text-right font-semibold">
                    {b.icon} {b.label}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-semibold">📦 Inne</th>
                <th className="px-2 py-2 text-right font-semibold">Suma</th>
                <th className="px-2 py-2 text-right font-semibold">Zostało</th>
                <th className="px-2 py-2 text-right font-semibold">Cash</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const c = rowCalc(m)
                const isNow = m.period === now
                const isSel = m.period === selected
                const bg = isSel ? 'bg-rating-good/10' : isNow ? 'bg-surface2/60' : ''
                const over = c.total > m.income
                return (
                  <tr
                    key={m.period}
                    ref={isNow ? nowRef : undefined}
                    className={`border-b border-border/60 ${bg}`}
                  >
                    <th
                      scope="row"
                      className={`sticky left-0 z-10 px-2 py-1 text-left font-semibold ${
                        isSel ? 'bg-[#16202b]' : isNow ? 'bg-[#151d27]' : 'bg-surface'
                      }`}
                    >
                      <button
                        onClick={() => {
                          buzz(BUZZ_TAP)
                          setSelected(isSel ? null : m.period)
                        }}
                        className={`whitespace-nowrap ${
                          isSel ? 'text-rating-good' : isNow ? 'text-text' : 'text-muted'
                        }`}
                      >
                        {isNow && '▸ '}
                        {shortPeriod(m.period)}
                      </button>
                    </th>
                    <NumCell
                      value={m.income}
                      strong
                      onSave={(v) => saveIncome(m.period, v)}
                    />
                    {cols.map((b) => (
                      <NumCell
                        key={b.id}
                        value={allocMap.get(`${m.period}|${b.id}`) ?? null}
                        badge={itemCount.get(`${m.period}|${b.id}`)}
                        onSave={(v) => saveAlloc(m.period, b.id, v ?? 0)}
                      />
                    ))}
                    <NumCell
                      value={c.other}
                      auto={m.other_override === null}
                      badge={itemCount.get(`${m.period}|null`)}
                      onSave={(v) => saveOther(m.period, v)}
                    />
                    <td
                      className={`px-2 py-1 text-right font-semibold ${
                        over ? 'text-rating-bad' : 'text-muted'
                      }`}
                    >
                      {fmtNum(c.total)}
                    </td>
                    <NumCell value={m.leftover} onSave={(v) => saveLeftover(m.period, v)} />
                    <NumCell value={m.cash} onSave={(v) => saveCash(m.period, v)} />
                  </tr>
                )
              })}
              <tr className="text-[11px] font-bold">
                <th className="sticky left-0 z-10 bg-surface px-2 py-2 text-left uppercase tracking-wider text-muted">
                  Suma
                </th>
                <td className="px-2 py-2 text-right">{fmtNum(totals.income)}</td>
                {cols.map((b) => (
                  <td key={b.id} className="px-2 py-2 text-right">
                    {fmtNum(totals.byBucket.get(b.id) ?? 0)}
                  </td>
                ))}
                <td className="px-2 py-2 text-right">{fmtNum(totals.other)}</td>
                <td className="px-2 py-2 text-right">{fmtNum(totals.total)}</td>
                <td className="px-2 py-2 text-right">{fmtNum(totals.leftover)}</td>
                <td className="px-2 py-2 text-right">{fmtNum(totals.cash)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <AddMonthRow months={rows} allocs={allocs} />

      {selected && (
        <MonthDetail
          period={selected}
          month={rows.find((m) => m.period === selected)}
          buckets={cols}
          allocMap={allocMap}
          items={allItems.filter((i) => i.period === selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )

  // --- zapisy komórek -------------------------------------------------

  function saveIncome(period: string, v: number | null) {
    saveMonth.mutate({ period, income: v ?? 0 })
  }
  function saveOther(period: string, v: number | null) {
    // puste = wróć do automatu (reszta pensji)
    saveMonth.mutate({ period, other_override: v })
  }
  function saveLeftover(period: string, v: number | null) {
    saveMonth.mutate({ period, leftover: v })
  }
  function saveCash(period: string, v: number | null) {
    saveMonth.mutate({ period, cash: v })
  }
  function saveAlloc(period: string, bucket_id: string, amount: number) {
    setAlloc.mutate({ period, bucket_id, amount })
  }
}

// ====================================================================
// Komórka z kwotą — tap → input
// ====================================================================

function NumCell({
  value,
  onSave,
  strong,
  auto,
  badge,
}: {
  value: number | null
  onSave: (v: number | null) => void
  /** pensja — wyróżniona */
  strong?: boolean
  /** „inne" liczone automatycznie (bez ręcznego override) */
  auto?: boolean
  /** liczba pozycji rozpiski wpiętych w komórkę */
  badge?: number
}) {
  const [editing, setEditing] = useState(false)

  function save(raw: string) {
    const v = parseNum(raw)
    if (v !== value) onSave(v)
    setEditing(false)
  }

  return (
    <td className="px-1 py-1 text-right">
      {editing ? (
        <input
          autoFocus
          inputMode="decimal"
          defaultValue={value ?? ''}
          onFocus={(e) => e.target.select()}
          onBlur={(e) => save(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save((e.target as HTMLInputElement).value)
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-16 rounded-md border border-rating-good bg-surface2 px-1 py-0.5 text-right text-xs tabular-nums outline-none"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className={`w-full rounded-md px-1 py-0.5 text-right hover:bg-surface2 ${
            strong ? 'font-semibold text-rating-good' : value ? 'text-text' : 'text-muted/50'
          } ${auto ? 'italic text-muted' : ''}`}
        >
          {value === null ? '–' : fmtNum(value)}
          {badge ? <span className="ml-0.5 text-[9px] text-rating-mid">•{badge}</span> : null}
        </button>
      )}
    </td>
  )
}

// ====================================================================
// Dodawanie miesiąca
// ====================================================================

function AddMonthRow({ months, allocs }: { months: BudgetMonth[]; allocs: BudgetAlloc[] }) {
  const add = useAddBudgetMonth()
  const del = useDeleteBudgetMonth()
  const last = months[months.length - 1]
  const next = last ? nextPeriod(last.period) : currentPeriod()

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        onClick={() => {
          buzz(BUZZ_TAP)
          add.mutate({
            period: next,
            income: last?.income ?? 0,
            copyFrom: last ? allocs.filter((a) => a.period === last.period) : [],
          })
        }}
        className="rounded-xl bg-rating-good px-4 py-2 text-sm font-semibold text-bg"
      >
        + {last ? longPeriod(next) : 'Dodaj miesiąc'}
      </button>
      {last && (
        <>
          <span className="text-xs text-muted">kopiuje kwoty z {shortPeriod(last.period)}</span>
          <button
            onClick={() => {
              if (confirm(`Usunąć ${longPeriod(last.period)} razem z rozpiską?`)) {
                del.mutate(last.period)
              }
            }}
            className="ml-auto text-xs text-muted hover:text-rating-bad"
          >
            Usuń ostatni ({shortPeriod(last.period)})
          </button>
        </>
      )}
    </div>
  )
}

// ====================================================================
// Zarządzanie kolumnami
// ====================================================================

function ColumnManager({ buckets }: { buckets: BudgetBucket[] }) {
  const add = useAddBudgetBucket()
  const update = useUpdateBudgetBucket()
  const del = useDeleteBudgetBucket()
  const [label, setLabel] = useState('')
  const [icon, setIcon] = useState('📦')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    buzz(BUZZ_TAP)
    add.mutate(
      {
        label: label.trim(),
        icon: icon.trim() || '📦',
        sort_order: (buckets[buckets.length - 1]?.sort_order ?? 0) + 1,
      },
      {
        onSuccess: () => {
          setLabel('')
          setIcon('📦')
        },
      }
    )
  }

  return (
    <div className="mb-3 rounded-2xl border border-border bg-surface p-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        Kolumny tabeli
      </div>
      {buckets.map((b) => (
        <div key={b.id} className="mb-1.5 flex items-center gap-2">
          <input
            defaultValue={b.icon}
            onBlur={(e) => e.target.value !== b.icon && update.mutate({ id: b.id, icon: e.target.value })}
            className="w-10 rounded-lg border border-border bg-surface2 px-2 py-1.5 text-center text-sm outline-none focus:border-rating-good"
          />
          <input
            defaultValue={b.label}
            onBlur={(e) =>
              e.target.value.trim() &&
              e.target.value !== b.label &&
              update.mutate({ id: b.id, label: e.target.value.trim() })
            }
            className="min-w-0 flex-1 rounded-lg border border-border bg-surface2 px-2 py-1.5 text-sm outline-none focus:border-rating-good"
          />
          <button
            onClick={() => {
              if (confirm(`Usunąć kolumnę „${b.label}" ze wszystkich miesięcy?`)) del.mutate(b.id)
            }}
            className="px-1 text-xs text-muted hover:text-rating-bad"
            title="Usuń kolumnę"
          >
            ✕
          </button>
        </div>
      ))}
      <form onSubmit={submit} className="mt-2 flex gap-2 border-t border-border pt-2">
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          className="w-10 rounded-lg border border-border bg-surface2 px-2 py-1.5 text-center text-sm outline-none focus:border-rating-good"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Nowa kolumna, np. Dom"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface2 px-2 py-1.5 text-sm outline-none focus:border-rating-good"
        />
        <button type="submit" className="rounded-lg bg-rating-good px-3 py-1.5 text-sm font-semibold text-bg">
          +
        </button>
      </form>
      <p className="mt-2 text-[11px] text-muted">
        „Inne" to zawsze reszta pensji — nie da się jej usunąć, ale można nadpisać kwotę w tabeli
        (puste pole = z powrotem automat).
      </p>
    </div>
  )
}

// ====================================================================
// Rozpiska miesiąca — cele / co kupić
// ====================================================================

const OTHER = 'inne' // pseudo-worek: bucket_id = null

function MonthDetail({
  period,
  month,
  buckets,
  allocMap,
  items,
  onClose,
}: {
  period: string
  month: BudgetMonth | undefined
  buckets: BudgetBucket[]
  allocMap: Map<string, number>
  items: BudgetItem[]
  onClose: () => void
}) {
  const addItem = useAddBudgetItem()
  const [active, setActive] = useState<string>(OTHER)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')

  const bucketsSum = buckets.reduce((s, b) => s + (allocMap.get(`${period}|${b.id}`) ?? 0), 0)
  const other = month ? month.other_override ?? Math.max(0, month.income - bucketsSum) : 0

  const activeBucket = buckets.find((b) => b.id === active)
  const activeLabel = activeBucket ? `${activeBucket.icon} ${activeBucket.label}` : '📦 Inne'
  const budget = activeBucket ? allocMap.get(`${period}|${activeBucket.id}`) ?? 0 : other

  const mine = items.filter((i) => (i.bucket_id ?? OTHER) === active)
  const planned = mine.reduce((s, i) => s + (i.amount ?? 0), 0)
  const rest = budget - planned

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    buzz(BUZZ_TAP)
    addItem.mutate(
      {
        period,
        bucket_id: activeBucket ? activeBucket.id : null,
        title,
        amount: parseNum(amount),
      },
      {
        onSuccess: () => {
          setTitle('')
          setAmount('')
        },
      }
    )
  }

  return (
    <div className="mt-4 rounded-2xl border border-rating-good/40 bg-surface p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-semibold">{longPeriod(period)} — rozpiska</span>
        <button onClick={onClose} className="text-xs text-muted hover:text-text">
          ✕ zamknij
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {[...buckets.map((b) => ({ key: b.id, label: `${b.icon} ${b.label}` })), { key: OTHER, label: '📦 Inne' }].map(
          (c) => {
            const n = items.filter((i) => (i.bucket_id ?? OTHER) === c.key).length
            return (
              <button
                key={c.key}
                onClick={() => setActive(c.key)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                  active === c.key
                    ? 'border-rating-good/60 bg-rating-good/10 text-text'
                    : 'border-border text-muted'
                }`}
              >
                {c.label}
                {n > 0 && <span className="ml-1 text-[10px] text-rating-mid">{n}</span>}
              </button>
            )
          }
        )}
      </div>

      <div className="mb-2 flex items-baseline gap-3 rounded-xl bg-surface2 px-3 py-2 text-xs">
        <span className="font-semibold">{activeLabel}</span>
        <span className="text-muted">
          budżet <span className="font-semibold text-text">{fmtNum(budget)} zł</span>
        </span>
        <span className="text-muted">
          rozpisane <span className="font-semibold text-text">{fmtNum(planned)} zł</span>
        </span>
        <span className={`ml-auto font-semibold ${rest < 0 ? 'text-rating-bad' : 'text-rating-good'}`}>
          {rest < 0 ? 'brakuje ' : 'wolne '}
          {fmtNum(Math.abs(rest))} zł
        </span>
      </div>

      <form onSubmit={submit} className="mb-2 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Cel / co kupić…"
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface2 px-3 py-2 text-sm outline-none focus:border-rating-good"
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="zł"
          className="w-16 rounded-xl border border-border bg-surface2 px-2 py-2 text-right text-sm outline-none focus:border-rating-good"
        />
        <button type="submit" className="rounded-xl bg-rating-good px-3.5 py-2 text-sm font-semibold text-bg">
          +
        </button>
      </form>

      {mine.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted">
          Nic nierozpisane. Wpisz na co konkretnie ma pójść ta kwota.
        </p>
      ) : (
        mine.map((i) => <ItemRow key={i.id} item={i} />)
      )}
    </div>
  )
}

function ItemRow({ item }: { item: BudgetItem }) {
  const update = useUpdateBudgetItem()
  const del = useDeleteBudgetItem()
  const [editing, setEditing] = useState(false)

  function save(raw: string) {
    const v = parseNum(raw)
    if (v !== item.amount) update.mutate({ id: item.id, amount: v })
    setEditing(false)
  }

  return (
    <div className="mb-1.5 flex items-center gap-3 rounded-xl border border-border bg-surface2 px-3 py-2">
      <button
        onClick={() => {
          buzz(item.done ? BUZZ_TAP : BUZZ_DONE)
          update.mutate({ id: item.id, done: !item.done })
        }}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${
          item.done ? 'border-rating-good bg-rating-good text-bg' : 'border-border'
        }`}
        aria-label={item.done ? 'Odznacz' : 'Załatwione'}
      >
        {item.done && '✓'}
      </button>
      <span className={`min-w-0 flex-1 truncate text-sm ${item.done ? 'text-muted line-through' : ''}`}>
        {item.title}
      </span>
      {editing ? (
        <input
          autoFocus
          inputMode="decimal"
          defaultValue={item.amount ?? ''}
          onBlur={(e) => save(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save((e.target as HTMLInputElement).value)
            if (e.key === 'Escape') setEditing(false)
          }}
          className="w-16 rounded-lg border border-border bg-surface px-2 py-1 text-right text-xs tabular-nums outline-none focus:border-rating-good"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className={`shrink-0 text-xs tabular-nums ${
            item.amount != null ? 'text-rating-mid' : 'text-muted/60'
          }`}
          title="Ustaw kwotę"
        >
          {item.amount != null ? `${fmtNum(item.amount)} zł` : '+ zł'}
        </button>
      )}
      <button
        onClick={() => del.mutate(item.id)}
        className="shrink-0 text-xs text-muted hover:text-rating-bad"
        title="Usuń"
      >
        ✕
      </button>
    </div>
  )
}
