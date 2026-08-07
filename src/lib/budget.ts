// Budżet — wyliczenia i formatowanie wspólne dla wszystkich widoków.

import { BudgetBucket, BudgetGoal, BudgetGoalAlloc, BudgetItem, BudgetMonth } from './types'
import { todayISO } from './date'

export const MONTHS_SHORT = [
  'sty', 'lut', 'mar', 'kwi', 'maj', 'cze',
  'lip', 'sie', 'wrz', 'paź', 'lis', 'gru',
]
export const MONTHS_LONG = [
  'Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
  'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień',
]

/** '2026-08' → 'sie 26' */
export function shortPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`
}

/** '2026-08' → 'Sierpień 2026' */
export function longPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number)
  return `${MONTHS_LONG[m - 1]} ${y}`
}

/** Przesuń okres o n miesięcy (n może być ujemne). */
export function addPeriods(period: string, n: number): string {
  const [y, m] = period.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

export function nextPeriod(period: string): string {
  return addPeriods(period, 1)
}

export function currentPeriod(): string {
  return todayISO().slice(0, 7)
}

/** '1 200,50' → number | null (puste = null) */
export function parseNum(s: string): number | null {
  const t = s.trim()
  if (t === '') return null
  const n = parseFloat(t.replace(/\s/g, '').replace(',', '.'))
  return Number.isNaN(n) ? null : n
}

const numFmt = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 })
export function fmtNum(n: number): string {
  return numFmt.format(n)
}
/** Krótko, bez groszy — do etykiet na wykresach. */
export function fmtShort(n: number): string {
  return numFmt.format(Math.round(n))
}

// ---------- Kolory serii ------------------------------------------------
// Kolejność stała (kolor idzie za workiem, nie za jego pozycją w rankingu).
// Sprawdzone validatorem: pasmo jasności, chroma, separacja CVD i kontrast
// względem powierzchni #121821.
export const SERIES_COLORS = [
  '#3b82f6', // niebieski
  '#ea580c', // pomarańcz
  '#0d9488', // morski
  '#8b5cf6', // fiolet
  '#65a30d', // limonka
  '#db2777', // róż
  '#0891b2', // cyjan
]
/** „Inne" ma własny, stały kolor — nigdy nie wchodzi w rotację worków. */
export const OTHER_COLOR = '#d97706'
/** Ósmy i dalsze worki lądują na neutralnym (bez dorabiania nowych barw). */
export const EXTRA_COLOR = '#7c8ba1'

export function bucketColor(index: number): string {
  return index < SERIES_COLORS.length ? SERIES_COLORS[index] : EXTRA_COLOR
}

// ---------- Wyliczenia wiersza -----------------------------------------

export type AllocMap = Map<string, number>
/** period|bucket → czy opłacone */
export type PaidMap = Map<string, boolean>

export function allocKey(period: string, bucketId: string): string {
  return `${period}|${bucketId}`
}

export interface RowCalc {
  /** suma wszystkich worków */
  bucketsSum: number
  /** „inne" — ręczne albo reszta pensji */
  other: number
  /** worki + inne */
  total: number
}

export function rowCalc(m: BudgetMonth, cols: BudgetBucket[], allocMap: AllocMap): RowCalc {
  const bucketsSum = cols.reduce((s, b) => s + (allocMap.get(allocKey(m.period, b.id)) ?? 0), 0)
  const other = m.other_override ?? Math.max(0, m.income - bucketsSum)
  return { bucketsSum, other, total: bucketsSum + other }
}

// ---------- Statystyki --------------------------------------------------

export interface SeriesStat {
  key: string
  label: string
  icon: string
  color: string
  total: number
  /** średnia na miesiąc */
  avg: number
  /** udział w sumie wszystkich wydatków */
  share: number
}

export interface BudgetStats {
  months: number
  incomeTotal: number
  incomeAvg: number
  spendTotal: number
  spendAvg: number
  series: SeriesStat[]
}

export function budgetStats(
  rows: BudgetMonth[],
  cols: BudgetBucket[],
  allocMap: AllocMap
): BudgetStats {
  const months = rows.length
  const byBucket = new Map<string, number>()
  let incomeTotal = 0
  let otherTotal = 0

  for (const m of rows) {
    incomeTotal += m.income
    otherTotal += rowCalc(m, cols, allocMap).other
    for (const b of cols) {
      byBucket.set(b.id, (byBucket.get(b.id) ?? 0) + (allocMap.get(allocKey(m.period, b.id)) ?? 0))
    }
  }

  const spendTotal = otherTotal + [...byBucket.values()].reduce((s, v) => s + v, 0)
  const div = months || 1

  const series: SeriesStat[] = [
    ...cols.map((b, i) => ({
      key: b.id,
      label: b.label,
      icon: b.icon,
      color: bucketColor(i),
      total: byBucket.get(b.id) ?? 0,
      avg: (byBucket.get(b.id) ?? 0) / div,
      share: spendTotal > 0 ? (byBucket.get(b.id) ?? 0) / spendTotal : 0,
    })),
    {
      key: 'inne',
      label: 'Inne',
      icon: '📦',
      color: OTHER_COLOR,
      total: otherTotal,
      avg: otherTotal / div,
      share: spendTotal > 0 ? otherTotal / spendTotal : 0,
    },
  ]

  return {
    months,
    incomeTotal,
    incomeAvg: incomeTotal / div,
    spendTotal,
    spendAvg: spendTotal / div,
    series,
  }
}

export interface ItemStat {
  /** znormalizowana nazwa (klucz grupowania) */
  key: string
  /** najczęstsza pisownia nazwy */
  label: string
  total: number
  /** ile razy się pojawiło */
  count: number
  /** średnio na wystąpienie */
  avg: number
  /** ile już odhaczone */
  done: number
}

/**
 * To samo dla celów zakupowych: ile łącznie odłożone na cel w danym zakresie
 * miesięcy i ile średnio wychodzi na miesiąc odkładania.
 */
export function goalStats(
  goals: BudgetGoal[],
  allocs: BudgetGoalAlloc[],
  periods: Set<string>
): ItemStat[] {
  const byGoal = new Map<string, { total: number; count: number }>()
  for (const a of allocs) {
    if (!periods.has(a.period) || a.amount === 0) continue
    const g = byGoal.get(a.goal_id) ?? { total: 0, count: 0 }
    g.total += a.amount
    g.count += 1
    byGoal.set(a.goal_id, g)
  }
  return goals
    .filter((g) => byGoal.has(g.id))
    .map((g) => {
      const s = byGoal.get(g.id)!
      return {
        key: g.id,
        label: g.title,
        total: s.total,
        count: s.count,
        avg: s.total / s.count,
        done: g.done ? s.count : 0,
      }
    })
    .sort((a, b) => b.total - a.total)
}

/** Grupuje pozycje rozpiski po nazwie — „ile średnio idzie na buty". */
export function itemStats(items: BudgetItem[]): ItemStat[] {
  const map = new Map<string, { labels: Map<string, number>; total: number; count: number; done: number }>()
  for (const i of items) {
    const key = i.title.trim().toLowerCase()
    if (!key) continue
    const g = map.get(key) ?? { labels: new Map(), total: 0, count: 0, done: 0 }
    g.labels.set(i.title.trim(), (g.labels.get(i.title.trim()) ?? 0) + 1)
    g.total += i.amount ?? 0
    g.count += 1
    if (i.done) g.done += 1
    map.set(key, g)
  }
  return [...map.entries()]
    .map(([key, g]) => ({
      key,
      label: [...g.labels.entries()].sort((a, b) => b[1] - a[1])[0][0],
      total: g.total,
      count: g.count,
      avg: g.total / g.count,
      done: g.done,
    }))
    .sort((a, b) => b.total - a.total || b.count - a.count)
}
