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
  useFillDownBudget,
  useAddBudgetBucket,
  useUpdateBudgetBucket,
  useDeleteBudgetBucket,
  useAddBudgetItem,
  useUpdateBudgetItem,
  useDeleteBudgetItem,
} from '../lib/queries'
import { BudgetAlloc, BudgetBucket, BudgetItem, BudgetMonth } from '../lib/types'
import {
  AllocMap,
  OTHER_COLOR,
  PaidMap,
  addPeriods,
  allocKey,
  bucketColor,
  budgetStats,
  currentPeriod,
  fmtNum,
  fmtShort,
  itemStats,
  longPeriod,
  nextPeriod,
  parseNum,
  rowCalc,
  shortPeriod,
} from '../lib/budget'
import { buzz, BUZZ_TAP, BUZZ_DONE } from '../lib/haptics'
import { useToast } from '../components/Toast'

type View = 'skrot' | 'tabela' | 'staty'

const VIEWS: { key: View; label: string }[] = [
  { key: 'skrot', label: '🎯 Skrót' },
  { key: 'tabela', label: '🧮 Tabela' },
  { key: 'staty', label: '📊 Staty' },
]

/** Pseudo-worek „Inne" (bucket_id = null w bazie). */
const OTHER = 'inne'

export default function Budget() {
  const buckets = useBudgetBuckets()
  const months = useBudgetMonths()
  const alloc = useBudgetAlloc()
  const items = useBudgetItems()

  const [view, setView] = useState<View>('skrot')
  const [selected, setSelected] = useState<string | null>(null)
  const [fillFrom, setFillFrom] = useState<string | null>(null)
  const [showCols, setShowCols] = useState(false)

  const loading = buckets.isLoading || months.isLoading || alloc.isLoading
  const cols = buckets.data ?? []
  const rows = months.data ?? []
  const allocs = alloc.data ?? []
  const allItems = items.data ?? []

  const allocMap: AllocMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of allocs) m.set(allocKey(a.period, a.bucket_id), a.amount)
    return m
  }, [allocs])

  const paidMap: PaidMap = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const a of allocs) m.set(allocKey(a.period, a.bucket_id), a.paid)
    return m
  }, [allocs])

  /** period|bucket ('inne' dla worka Inne) → liczba pozycji rozpiski */
  const itemCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of allItems) {
      const k = allocKey(i.period, i.bucket_id ?? OTHER)
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [allItems])

  return (
    <div className="p-4 md:p-6">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">Budżet 💰</h1>
        {view === 'tabela' && (
          <button
            onClick={() => setShowCols((s) => !s)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              showCols ? 'border-rating-good/60 text-rating-good' : 'border-border text-muted'
            }`}
          >
            ⚙️ Kolumny
          </button>
        )}
      </div>
      <p className="mb-3 text-sm text-muted">
        Wypłata rozbita na worki. „Inne" to reszta — rozpisz ją na konkretne cele, a staty pokażą
        ile średnio na co idzie.
      </p>

      <div className="mb-3 flex rounded-xl border border-border bg-surface p-1">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
              view === v.key ? 'bg-rating-good/15 text-rating-good' : 'text-muted'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {fillFrom && view !== 'staty' && (
        <FillDownBar
          from={fillFrom}
          rows={rows}
          cols={cols}
          allocMap={allocMap}
          onClose={() => setFillFrom(null)}
        />
      )}

      {loading ? (
        <div className="p-6 text-muted">Ładowanie…</div>
      ) : (
        <>
          {view === 'skrot' && (
            <ShortView
              rows={rows}
              cols={cols}
              allocMap={allocMap}
              paidMap={paidMap}
              itemCount={itemCount}
              selected={selected}
              onSelect={setSelected}
              onFill={setFillFrom}
            />
          )}

          {view === 'tabela' && (
            <>
              {showCols && <ColumnManager buckets={cols} />}
              <TableView
                rows={rows}
                cols={cols}
                allocMap={allocMap}
                paidMap={paidMap}
                itemCount={itemCount}
                selected={selected}
                onSelect={setSelected}
                onFill={setFillFrom}
              />
              <AddMonthRow months={rows} allocs={allocs} />
            </>
          )}

          {view === 'staty' && (
            <StatsView rows={rows} cols={cols} allocMap={allocMap} items={allItems} />
          )}

          {selected && view !== 'staty' && (
            <MonthDetail
              period={selected}
              month={rows.find((m) => m.period === selected)}
              buckets={cols}
              allocMap={allocMap}
              paidMap={paidMap}
              items={allItems}
              onClose={() => setSelected(null)}
            />
          )}
        </>
      )}
    </div>
  )
}

// ====================================================================
// „Ciągnij w dół" — przepisanie kwot na kolejne miesiące
// ====================================================================

function FillDownBar({
  from,
  rows,
  cols,
  allocMap,
  onClose,
}: {
  from: string
  rows: BudgetMonth[]
  cols: BudgetBucket[]
  allocMap: AllocMap
  onClose: () => void
}) {
  const fill = useFillDownBudget()
  const toast = useToast()
  const source = rows.find((m) => m.period === from)
  const later = rows.filter((m) => m.period > from).map((m) => m.period)

  if (!source) return null

  // wszystkie worki, także zerowe — kopiowanie ma nadpisać, nie dopisać
  const allocs = cols.map((b) => ({
    bucket_id: b.id,
    amount: allocMap.get(allocKey(from, b.id)) ?? 0,
  }))

  function run(count: number | 'all') {
    const targets =
      count === 'all'
        ? later
        : Array.from({ length: count }, (_, i) => addPeriods(from, i + 1))
    if (targets.length === 0) return
    buzz(BUZZ_DONE)
    fill.mutate(
      {
        targets,
        income: source!.income,
        other_override: source!.other_override,
        allocs,
      },
      {
        onSuccess: () => {
          toast(`↓ Kwoty z ${shortPeriod(from)} → ${targets.length} msc`)
          onClose()
        },
      }
    )
  }

  const options: { key: string; label: string; count: number | 'all'; hint?: string }[] = [
    { key: 'n1', label: 'następny', count: 1 },
    { key: 'n3', label: '3 msc', count: 3 },
    { key: 'n6', label: '6 msc', count: 6 },
    { key: 'n12', label: '12 msc', count: 12 },
    { key: 'all', label: `do końca (${later.length})`, count: 'all' },
  ]

  return (
    <div className="mb-3 rounded-2xl border border-rating-good/40 bg-surface p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-semibold">
          Kopiuj kwoty z <span className="text-rating-good">{longPeriod(from)}</span> w dół
        </span>
        <button onClick={onClose} className="text-xs text-muted hover:text-text">
          ✕ anuluj
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.key}
            disabled={fill.isPending || (o.count === 'all' && later.length === 0)}
            onClick={() => run(o.count)}
            className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted hover:border-rating-good/60 hover:text-rating-good disabled:opacity-40"
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Przepisuje pensję i wszystkie worki. Brakujące miesiące dopisze. Statusy opłacenia,
        „zostało", „cash" i rozpiska celów zostają nietknięte.
      </p>
    </div>
  )
}

// ====================================================================
// Skrót — bieżący miesiąc ±2
// ====================================================================

function ShortView({
  rows,
  cols,
  allocMap,
  paidMap,
  itemCount,
  selected,
  onSelect,
  onFill,
}: {
  rows: BudgetMonth[]
  cols: BudgetBucket[]
  allocMap: AllocMap
  paidMap: PaidMap
  itemCount: Map<string, number>
  selected: string | null
  onSelect: (p: string | null) => void
  onFill: (p: string) => void
}) {
  const add = useAddBudgetMonth()
  const now = currentPeriod()
  const window = useMemo(() => [-2, -1, 0, 1, 2].map((n) => addPeriods(now, n)), [now])
  const byPeriod = useMemo(() => new Map(rows.map((m) => [m.period, m])), [rows])
  const hasNow = byPeriod.has(now)

  return (
    <div>
      {!hasNow && (
        <div className="mb-3 flex items-center justify-between rounded-2xl border border-border bg-surface p-3">
          <span className="text-sm text-muted">Brak wiersza na {longPeriod(now)}.</span>
          <button
            onClick={() => add.mutate({ period: now, income: rows[rows.length - 1]?.income ?? 0 })}
            className="rounded-xl bg-rating-good px-3 py-1.5 text-sm font-semibold text-bg"
          >
            + Dodaj
          </button>
        </div>
      )}

      {window.map((period) => {
        const m = byPeriod.get(period)
        if (!m) return null
        return (
          <MonthCard
            key={period}
            month={m}
            cols={cols}
            allocMap={allocMap}
            paidMap={paidMap}
            itemCount={itemCount}
            isNow={period === now}
            isSelected={period === selected}
            onSelect={() => onSelect(period === selected ? null : period)}
            onFill={() => onFill(period)}
          />
        )
      })}
    </div>
  )
}

function MonthCard({
  month,
  cols,
  allocMap,
  paidMap,
  itemCount,
  isNow,
  isSelected,
  onSelect,
  onFill,
}: {
  month: BudgetMonth
  cols: BudgetBucket[]
  allocMap: AllocMap
  paidMap: PaidMap
  itemCount: Map<string, number>
  isNow: boolean
  isSelected: boolean
  onSelect: () => void
  onFill: () => void
}) {
  const saveMonth = useSaveBudgetMonth()
  const setAlloc = useSaveBudgetAlloc()
  const c = rowCalc(month, cols, allocMap)

  const parts = [
    ...cols.map((b, i) => ({
      key: b.id,
      label: b.label,
      icon: b.icon,
      color: bucketColor(i),
      value: allocMap.get(allocKey(month.period, b.id)) ?? 0,
      paid: paidMap.get(allocKey(month.period, b.id)) ?? false,
      items: itemCount.get(allocKey(month.period, b.id)) ?? 0,
      toggle: () =>
        setAlloc.mutate({
          period: month.period,
          bucket_id: b.id,
          paid: !(paidMap.get(allocKey(month.period, b.id)) ?? false),
        }),
    })),
    {
      key: OTHER,
      label: 'Inne',
      icon: '📦',
      color: OTHER_COLOR,
      value: c.other,
      paid: month.other_paid,
      items: itemCount.get(allocKey(month.period, OTHER)) ?? 0,
      toggle: () => saveMonth.mutate({ period: month.period, other_paid: !month.other_paid }),
    },
  ].filter((p) => p.value > 0)

  const paidSum = parts.filter((p) => p.paid).reduce((sum, p) => sum + p.value, 0)
  const toPay = c.total - paidSum
  const allPaid = toPay <= 0 && month.income_paid && parts.length > 0
  const over = c.total > month.income

  function payAll() {
    buzz(BUZZ_DONE)
    if (!month.income_paid || !month.other_paid) {
      saveMonth.mutate({ period: month.period, income_paid: true, other_paid: true })
    }
    for (const b of cols) {
      const k = allocKey(month.period, b.id)
      if ((allocMap.get(k) ?? 0) > 0 && !paidMap.get(k)) {
        setAlloc.mutate({ period: month.period, bucket_id: b.id, paid: true })
      }
    }
  }

  return (
    <div
      className={`mb-2.5 rounded-2xl border p-3 ${
        isSelected
          ? 'border-rating-good/50 bg-surface'
          : isNow
            ? 'border-rating-good/25 bg-surface'
            : 'border-border bg-surface'
      }`}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <button onClick={onSelect} className="flex min-w-0 items-baseline gap-2">
          <span className={`truncate font-bold ${isNow ? 'text-rating-good' : ''}`}>
            {longPeriod(month.period)}
          </span>
          {isNow && (
            <span className="shrink-0 rounded-full bg-rating-good/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rating-good">
              teraz
            </span>
          )}
          {allPaid && <span className="shrink-0 text-xs text-rating-good">✓</span>}
        </button>
        <button
          onClick={() => {
            buzz(month.income_paid ? BUZZ_TAP : BUZZ_DONE)
            saveMonth.mutate({ period: month.period, income_paid: !month.income_paid })
          }}
          className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-sm font-bold tabular-nums ${
            month.income_paid
              ? 'border-rating-good/50 bg-rating-good/10 text-rating-good'
              : 'border-rating-bad/50 bg-rating-bad/10 text-rating-bad'
          }`}
          title={month.income_paid ? 'Wypłata wpłynęła' : 'Wypłaty jeszcze nie ma'}
        >
          {month.income_paid ? '✓' : '○'} {fmtNum(month.income)} zł
        </button>
      </div>

      {/* pasek podziału wypłaty — opłacone pełnym kolorem, reszta w paski */}
      <div className="mb-2 flex h-2.5 gap-[2px]">
        {parts.map((p) => (
          <div
            key={p.key}
            className="h-full rounded-[3px]"
            style={{
              flexGrow: p.value,
              flexBasis: 0,
              background: p.paid
                ? p.color
                : `repeating-linear-gradient(45deg, ${p.color} 0 2px, ${p.color}30 2px 5px)`,
            }}
            title={`${p.label}: ${fmtNum(p.value)} zł — ${p.paid ? 'opłacone' : 'do zapłaty'}`}
          />
        ))}
        {month.income > c.total && (
          <div
            className="h-full rounded-[3px] bg-surface2"
            style={{ flexGrow: month.income - c.total, flexBasis: 0 }}
            title={`Nierozdysponowane: ${fmtNum(month.income - c.total)} zł`}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {parts.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              buzz(p.paid ? BUZZ_TAP : BUZZ_DONE)
              p.toggle()
            }}
            className="flex items-center gap-1.5 rounded-lg py-0.5 text-left text-xs hover:bg-surface2"
            title={p.paid ? 'Opłacone — kliknij, by cofnąć' : 'Kliknij, gdy zapłacone'}
          >
            <span
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border text-[8px] ${
                p.paid
                  ? 'border-rating-good bg-rating-good text-bg'
                  : 'border-rating-bad text-transparent'
              }`}
            >
              ✓
            </span>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className={`min-w-0 flex-1 truncate ${p.paid ? 'text-muted' : 'text-text'}`}>
              {p.icon} {p.label}
              {p.items > 0 && <span className="ml-1 text-[10px] text-rating-mid">•{p.items}</span>}
            </span>
            <span className="shrink-0 tabular-nums">{fmtShort(p.value)}</span>
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-2 text-[11px] text-muted">
        {toPay > 0 ? (
          <span>
            do zapłaty <span className="font-semibold text-rating-bad">{fmtNum(toPay)} zł</span> z{' '}
            <span className={over ? 'text-rating-bad' : ''}>{fmtNum(c.total)} zł</span>
          </span>
        ) : (
          <span className="font-semibold text-rating-good">wszystko opłacone</span>
        )}
        {month.leftover != null && (
          <span>
            zostało <span className="font-semibold text-text">{fmtNum(month.leftover)} zł</span>
          </span>
        )}
        {!allPaid && (
          <button onClick={payAll} className="font-semibold text-rating-good">
            ✓ opłać wszystko
          </button>
        )}
        <button onClick={onFill} className="font-semibold text-muted hover:text-text" title="Przepisz te kwoty na kolejne miesiące">
          ↓ kopiuj dalej
        </button>
        <button onClick={onSelect} className="ml-auto font-semibold text-rating-good">
          {isSelected ? 'zwiń' : 'rozpisz →'}
        </button>
      </div>
    </div>
  )
}

// ====================================================================
// Staty — ile średnio na co
// ====================================================================

type Range = 'do_teraz' | 'wszystko'

function StatsView({
  rows,
  cols,
  allocMap,
  items,
}: {
  rows: BudgetMonth[]
  cols: BudgetBucket[]
  allocMap: AllocMap
  items: BudgetItem[]
}) {
  const [range, setRange] = useState<Range>('do_teraz')
  const [bucket, setBucket] = useState<string>(OTHER)
  const now = currentPeriod()

  const scoped = useMemo(
    () => (range === 'wszystko' ? rows : rows.filter((m) => m.period <= now)),
    [rows, range, now]
  )
  const stats = useMemo(() => budgetStats(scoped, cols, allocMap), [scoped, cols, allocMap])

  const scopedItems = useMemo(() => {
    const inRange = new Set(scoped.map((m) => m.period))
    return items.filter(
      (i) => inRange.has(i.period) && (bucket === 'all' || (i.bucket_id ?? OTHER) === bucket)
    )
  }, [items, scoped, bucket])
  const byName = useMemo(() => itemStats(scopedItems), [scopedItems])
  const namedTotal = byName.reduce((s, i) => s + i.total, 0)

  const series = stats.series.filter((s) => s.total > 0).sort((a, b) => b.total - a.total)
  const maxTotal = series[0]?.total ?? 0

  if (stats.months === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
        Brak miesięcy w tym zakresie.
      </p>
    )
  }

  return (
    <div>
      <div className="mb-3 flex gap-1.5">
        {(
          [
            { key: 'do_teraz', label: `Do teraz (${rows.filter((m) => m.period <= now).length} msc)` },
            { key: 'wszystko', label: `Wszystko (${rows.length} msc)` },
          ] as { key: Range; label: string }[]
        ).map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              range === r.key
                ? 'border-rating-good/60 bg-rating-good/10 text-text'
                : 'border-border text-muted'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <StatTile label="Pensja / msc" value={fmtShort(stats.incomeAvg)} tone="good" />
        <StatTile label="Wydatki / msc" value={fmtShort(stats.spendAvg)} />
        <StatTile
          label="Zostaje / msc"
          value={fmtShort(stats.incomeAvg - stats.spendAvg)}
          tone={stats.incomeAvg - stats.spendAvg < 0 ? 'bad' : undefined}
        />
      </div>

      <div className="mb-3 rounded-2xl border border-border bg-surface p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Średnio na miesiąc · {stats.months} msc
        </div>
        {series.map((s) => (
          <div key={s.key} className="mb-2.5">
            <div className="mb-1 flex items-baseline gap-2 text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="min-w-0 flex-1 truncate">
                {s.icon} {s.label}
              </span>
              <span className="shrink-0 text-muted">{Math.round(s.share * 100)}%</span>
              <span className="w-20 shrink-0 text-right font-semibold tabular-nums">
                {fmtShort(s.avg)} zł
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-[3px] bg-surface2">
              <div
                className="h-full rounded-[3px]"
                style={{
                  width: `${maxTotal > 0 ? (s.total / maxTotal) * 100 : 0}%`,
                  background: s.color,
                }}
                title={`${s.label}: ${fmtNum(s.total)} zł łącznie`}
              />
            </div>
          </div>
        ))}
        <p className="mt-1 text-[11px] text-muted">
          Słupek = łącznie w zakresie. Liczba po prawej = średnia na miesiąc.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-3">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Na co konkretnie
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {[
            { key: OTHER, label: '📦 Inne' },
            ...cols.map((b) => ({ key: b.id, label: `${b.icon} ${b.label}` })),
            { key: 'all', label: 'Wszystko' },
          ].map((c) => (
            <button
              key={c.key}
              onClick={() => setBucket(c.key)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                bucket === c.key
                  ? 'border-rating-good/60 bg-rating-good/10 text-text'
                  : 'border-border text-muted'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {byName.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted">
            Nic tu nie rozpisane. Wejdź w miesiąc i wpisz na co poszło.
          </p>
        ) : (
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted">
                <th className="pb-1 text-left font-semibold">Co</th>
                <th className="pb-1 text-right font-semibold">Razy</th>
                <th className="pb-1 text-right font-semibold">Średnio</th>
                <th className="pb-1 text-right font-semibold">Razem</th>
              </tr>
            </thead>
            <tbody>
              {byName.map((i) => (
                <tr key={i.key} className="border-t border-border/60">
                  <td className="py-1.5 pr-2">
                    <span className="line-clamp-1">{i.label}</span>
                    <span
                      className="mt-0.5 block h-1 rounded-[2px]"
                      style={{
                        width: `${namedTotal > 0 ? Math.max(2, (i.total / namedTotal) * 100) : 0}%`,
                        background: OTHER_COLOR,
                      }}
                    />
                  </td>
                  <td className="py-1.5 text-right text-muted">{i.count}×</td>
                  <td className="py-1.5 text-right">{fmtShort(i.avg)}</td>
                  <td className="py-1.5 text-right font-semibold">{fmtShort(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'good' | 'bad'
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div
        className={`text-lg font-extrabold tabular-nums ${
          tone === 'good' ? 'text-rating-good' : tone === 'bad' ? 'text-rating-bad' : 'text-text'
        }`}
      >
        {value}
        <span className="ml-0.5 text-[11px] font-semibold text-muted">zł</span>
      </div>
    </div>
  )
}

// ====================================================================
// Tabela — pełny arkusz
// ====================================================================

function TableView({
  rows,
  cols,
  allocMap,
  paidMap,
  itemCount,
  selected,
  onSelect,
  onFill,
}: {
  rows: BudgetMonth[]
  cols: BudgetBucket[]
  allocMap: AllocMap
  paidMap: PaidMap
  itemCount: Map<string, number>
  selected: string | null
  onSelect: (p: string | null) => void
  onFill: (p: string) => void
}) {
  const saveMonth = useSaveBudgetMonth()
  const setAlloc = useSaveBudgetAlloc()
  const now = currentPeriod()
  const nowRef = useRef<HTMLTableRowElement | null>(null)
  const scrolled = useRef(false)

  useEffect(() => {
    if (scrolled.current || !nowRef.current) return
    scrolled.current = true
    nowRef.current.scrollIntoView({ block: 'center' })
  }, [rows.length])

  const totals = useMemo(() => {
    const t = { income: 0, byBucket: new Map<string, number>(), other: 0, total: 0, leftover: 0, cash: 0 }
    for (const m of rows) {
      const c = rowCalc(m, cols, allocMap)
      t.income += m.income
      t.other += c.other
      t.total += c.total
      t.leftover += m.leftover ?? 0
      t.cash += m.cash ?? 0
      for (const b of cols) {
        t.byBucket.set(
          b.id,
          (t.byBucket.get(b.id) ?? 0) + (allocMap.get(allocKey(m.period, b.id)) ?? 0)
        )
      }
    }
    return t
  }, [rows, cols, allocMap])

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
        Brak miesięcy. Dodaj pierwszy poniżej.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted">
            <th className="sticky left-0 z-10 bg-surface px-2 py-2 text-left font-semibold">Msc</th>
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
            const c = rowCalc(m, cols, allocMap)
            const isNow = m.period === now
            const isSel = m.period === selected
            const over = c.total > m.income
            return (
              <tr
                key={m.period}
                ref={isNow ? nowRef : undefined}
                className={`border-b border-border/60 ${
                  isSel ? 'bg-rating-good/10' : isNow ? 'bg-surface2/60' : ''
                }`}
              >
                <th
                  scope="row"
                  className={`sticky left-0 z-10 px-2 py-1 text-left font-semibold ${
                    isSel ? 'bg-[#16202b]' : isNow ? 'bg-[#151d27]' : 'bg-surface'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        buzz(BUZZ_TAP)
                        onSelect(isSel ? null : m.period)
                      }}
                      className={`whitespace-nowrap ${
                        isSel ? 'text-rating-good' : isNow ? 'text-text' : 'text-muted'
                      }`}
                    >
                      {isNow && '▸ '}
                      {shortPeriod(m.period)}
                    </button>
                    <button
                      onClick={() => onFill(m.period)}
                      className="px-0.5 text-[10px] text-muted hover:text-rating-good"
                      title="Kopiuj te kwoty w dół"
                    >
                      ↓
                    </button>
                  </span>
                </th>
                <NumCell
                  value={m.income}
                  strong
                  paid={m.income_paid}
                  onTogglePaid={() =>
                    saveMonth.mutate({ period: m.period, income_paid: !m.income_paid })
                  }
                  onSave={(v) => saveMonth.mutate({ period: m.period, income: v ?? 0 })}
                />
                {cols.map((b) => (
                  <NumCell
                    key={b.id}
                    value={allocMap.get(allocKey(m.period, b.id)) ?? null}
                    badge={itemCount.get(allocKey(m.period, b.id))}
                    paid={paidMap.get(allocKey(m.period, b.id)) ?? false}
                    onTogglePaid={() =>
                      setAlloc.mutate({
                        period: m.period,
                        bucket_id: b.id,
                        paid: !(paidMap.get(allocKey(m.period, b.id)) ?? false),
                      })
                    }
                    onSave={(v) =>
                      setAlloc.mutate({ period: m.period, bucket_id: b.id, amount: v ?? 0 })
                    }
                  />
                ))}
                <NumCell
                  value={c.other}
                  auto={m.other_override === null}
                  badge={itemCount.get(allocKey(m.period, OTHER))}
                  paid={m.other_paid}
                  onTogglePaid={() =>
                    saveMonth.mutate({ period: m.period, other_paid: !m.other_paid })
                  }
                  onSave={(v) => saveMonth.mutate({ period: m.period, other_override: v })}
                />
                <td
                  className={`px-2 py-1 text-right font-semibold ${
                    over ? 'text-rating-bad' : 'text-muted'
                  }`}
                >
                  {fmtNum(c.total)}
                </td>
                <NumCell
                  value={m.leftover}
                  onSave={(v) => saveMonth.mutate({ period: m.period, leftover: v })}
                />
                <NumCell
                  value={m.cash}
                  onSave={(v) => saveMonth.mutate({ period: m.period, cash: v })}
                />
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
  )
}

function NumCell({
  value,
  onSave,
  strong,
  auto,
  badge,
  paid,
  onTogglePaid,
}: {
  value: number | null
  onSave: (v: number | null) => void
  /** pensja — wyróżniona */
  strong?: boolean
  /** „inne" liczone automatycznie (bez ręcznego override) */
  auto?: boolean
  /** liczba pozycji rozpiski wpiętych w komórkę */
  badge?: number
  /** status opłacenia (undefined = komórka bez statusu, np. Zostało/Cash) */
  paid?: boolean
  onTogglePaid?: () => void
}) {
  const [editing, setEditing] = useState(false)

  function save(raw: string) {
    const v = parseNum(raw)
    if (v !== value) onSave(v)
    setEditing(false)
  }

  const showDot = onTogglePaid && (value ?? 0) > 0

  return (
    <td className="px-1 py-1 text-right">
      <div className="flex items-center justify-end gap-1">
        {showDot && (
          <button
            onClick={() => {
              buzz(paid ? BUZZ_TAP : BUZZ_DONE)
              onTogglePaid?.()
            }}
            className="shrink-0 p-0.5"
            title={paid ? 'Opłacone — kliknij, by cofnąć' : 'Do zapłaty — kliknij, gdy zapłacone'}
            aria-label={paid ? 'Opłacone' : 'Do zapłaty'}
          >
            <span
              className={`block h-1.5 w-1.5 rounded-full ${
                paid ? 'bg-rating-good' : 'bg-rating-bad'
              }`}
            />
          </button>
        )}
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
          className={`flex-1 whitespace-nowrap rounded-md px-1 py-0.5 text-right hover:bg-surface2 ${
            strong ? 'font-semibold text-rating-good' : value ? 'text-text' : 'text-muted/50'
          } ${auto ? 'italic text-muted' : ''}`}
        >
          {value === null ? '–' : fmtNum(value)}
          {badge ? <span className="ml-0.5 text-[9px] text-rating-mid">•{badge}</span> : null}
        </button>
      )}
      </div>
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
      {buckets.map((b, i) => (
        <div key={b.id} className="mb-1.5 flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: bucketColor(i) }} />
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

function MonthDetail({
  period,
  month,
  buckets,
  allocMap,
  paidMap,
  items,
  onClose,
}: {
  period: string
  month: BudgetMonth | undefined
  buckets: BudgetBucket[]
  allocMap: AllocMap
  paidMap: PaidMap
  /** wszystkie pozycje (do podpowiedzi z poprzednich miesięcy) */
  items: BudgetItem[]
  onClose: () => void
}) {
  const addItem = useAddBudgetItem()
  const saveMonth = useSaveBudgetMonth()
  const setAlloc = useSaveBudgetAlloc()
  const [active, setActive] = useState<string>(OTHER)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')

  const monthItems = items.filter((i) => i.period === period)
  const activeBucket = buckets.find((b) => b.id === active)
  const activeLabel = activeBucket ? `${activeBucket.icon} ${activeBucket.label}` : '📦 Inne'

  const c = month ? rowCalc(month, buckets, allocMap) : { other: 0, bucketsSum: 0, total: 0 }
  const budget = activeBucket ? allocMap.get(allocKey(period, activeBucket.id)) ?? 0 : c.other
  const isPaid = activeBucket
    ? paidMap.get(allocKey(period, activeBucket.id)) ?? false
    : month?.other_paid ?? false

  function togglePaid() {
    buzz(isPaid ? BUZZ_TAP : BUZZ_DONE)
    if (activeBucket) {
      setAlloc.mutate({ period, bucket_id: activeBucket.id, paid: !isPaid })
    } else {
      saveMonth.mutate({ period, other_paid: !isPaid })
    }
  }

  const mine = monthItems.filter((i) => (i.bucket_id ?? OTHER) === active)
  const planned = mine.reduce((s, i) => s + (i.amount ?? 0), 0)
  const rest = budget - planned

  // podpowiedzi: nazwy z poprzednich miesięcy w tym worku, jeszcze nie użyte tutaj
  const suggestions = useMemo(() => {
    const used = new Set(mine.map((i) => i.title.trim().toLowerCase()))
    return itemStats(items.filter((i) => i.period !== period && (i.bucket_id ?? OTHER) === active))
      .filter((s) => !used.has(s.key))
      .slice(0, 6)
  }, [items, period, active, mine])

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
        {[
          { key: OTHER, label: '📦 Inne', color: OTHER_COLOR },
          ...buckets.map((b, i) => ({
            key: b.id,
            label: `${b.icon} ${b.label}`,
            color: bucketColor(i),
          })),
        ].map((c2) => {
          const n = monthItems.filter((i) => (i.bucket_id ?? OTHER) === c2.key).length
          return (
            <button
              key={c2.key}
              onClick={() => setActive(c2.key)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                active === c2.key
                  ? 'border-rating-good/60 bg-rating-good/10 text-text'
                  : 'border-border text-muted'
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: c2.color }} />
              {c2.label}
              {n > 0 && <span className="text-[10px] text-rating-mid">{n}</span>}
            </button>
          )
        })}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface2 px-3 py-2 text-xs">
        <span className="font-semibold">{activeLabel}</span>
        <button
          onClick={togglePaid}
          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
            isPaid
              ? 'border-rating-good/50 bg-rating-good/10 text-rating-good'
              : 'border-rating-bad/50 bg-rating-bad/10 text-rating-bad'
          }`}
        >
          {isPaid ? '✓ opłacone' : '○ do zapłaty'}
        </button>
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

      {suggestions.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted">częste:</span>
          {suggestions.map((s) => (
            <button
              key={s.key}
              onClick={() => {
                setTitle(s.label)
                if (s.avg > 0) setAmount(String(Math.round(s.avg)))
              }}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted hover:border-rating-good/60 hover:text-rating-good"
              title={`${s.count}× · średnio ${fmtShort(s.avg)} zł`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

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
