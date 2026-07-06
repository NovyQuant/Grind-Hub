import { AREAS, Area, Habit, Log } from './types'
import { dateRange, todayISO, weekStartISO } from './date'
import { habitDailyF, makeLookup, ValueLookup } from './ratings'

// ---------- System rang (à la League of Legends) ----------------------
// Każdy dzień daje XP: f nawyku × waga × XP_PER_WEIGHT (suma wag 8 → max 200/dzień).
// XP tylko rośnie — słaby dzień to mały przyrost, nie kara. Rangi liczone
// deterministycznie z logów (bez stanu w DB).

export const XP_PER_WEIGHT = 25

export interface RankTier {
  label: string
  emblem: string
  color: string
  divisions: number // 4 = dywizje IV..I, 1 = pojedynczy próg (Mistrz+)
  divCost: number // XP na jedną dywizję
}

export const RANK_TIERS: RankTier[] = [
  { label: 'Żelazo', emblem: '⛓️', color: '#8a8f98', divisions: 4, divCost: 400 },
  { label: 'Brąz', emblem: '🥉', color: '#b3793f', divisions: 4, divCost: 500 },
  { label: 'Srebro', emblem: '🥈', color: '#aeb6c2', divisions: 4, divCost: 650 },
  { label: 'Złoto', emblem: '🥇', color: '#e8b53a', divisions: 4, divCost: 800 },
  { label: 'Platyna', emblem: '🔷', color: '#4fd1c5', divisions: 4, divCost: 1000 },
  { label: 'Szmaragd', emblem: '💠', color: '#30c85e', divisions: 4, divCost: 1200 },
  { label: 'Diament', emblem: '💎', color: '#5aa9f6', divisions: 4, divCost: 1500 },
  { label: 'Mistrz', emblem: '👑', color: '#a855f7', divisions: 1, divCost: 6000 },
  { label: 'Arcymistrz', emblem: '🔱', color: '#e5484d', divisions: 1, divCost: 10000 },
  { label: 'Pretendent', emblem: '⚡', color: '#f5d442', divisions: 1, divCost: Infinity },
]

const ROMAN = ['', 'I', 'II', 'III', 'IV']

export interface RankState {
  totalXP: number
  tier: RankTier
  tierIndex: number
  division: number | null // 4..1 (IV..I), null dla Mistrz+
  rankLabel: string // np. "Złoto II"
  lpInDiv: number // XP zebrane w bieżącej dywizji
  divCost: number
  toNext: number // ile XP brakuje do awansu (0 = Pretendent)
  nextLabel: string | null
  ordinal: number // globalny numer dywizji (monotoniczny — do toastów awansu)
  todayXP: number
  weekXP: number // bieżący tydzień kalendarzowy pon–dziś
  perAreaToday: Record<Area, { xp: number; max: number }>
}

/** XP za jeden dzień: suma f × waga × XP_PER_WEIGHT po aktywnych nawykach. */
export function dayXP(habits: Habit[], date: string, getValue: ValueLookup): number {
  let xp = 0
  for (const h of habits) {
    if (!h.active) continue
    xp += habitDailyF(h, date, getValue) * (h.weight ?? 1) * XP_PER_WEIGHT
  }
  return xp
}

export function rankLabelOf(tier: RankTier, division: number | null): string {
  return division ? `${tier.label} ${ROMAN[division]}` : tier.label
}

export function computeRank(habits: Habit[], logs: Log[]): RankState {
  const today = todayISO()
  const getValue = makeLookup(logs)
  const from = logs.length
    ? logs.reduce((m, l) => (l.log_date < m ? l.log_date : m), logs[0].log_date)
    : today

  const curWeek = weekStartISO(today)
  let totalXP = 0
  let weekXP = 0
  for (const d of dateRange(from, today)) {
    const xp = dayXP(habits, d, getValue)
    totalXP += xp
    if (d >= curWeek) weekXP += xp
  }
  totalXP = Math.round(totalXP)
  weekXP = Math.round(weekXP)
  const todayXP = Math.round(dayXP(habits, today, getValue))

  const perAreaToday = {} as Record<Area, { xp: number; max: number }>
  for (const area of AREAS) {
    const inArea = habits.filter((h) => h.active && h.area === area)
    let xp = 0
    let max = 0
    for (const h of inArea) {
      const w = (h.weight ?? 1) * XP_PER_WEIGHT
      xp += habitDailyF(h, today, getValue) * w
      max += w
    }
    perAreaToday[area] = { xp: Math.round(xp), max: Math.round(max) }
  }

  // Schodzenie po dywizjach: odejmuj koszty aż zabraknie XP.
  let rest = totalXP
  let tierIndex = RANK_TIERS.length - 1
  let divFromBottom = 0
  let ordinal = 0
  outer: for (let t = 0; t < RANK_TIERS.length; t++) {
    const tier = RANK_TIERS[t]
    for (let d = 0; d < tier.divisions; d++) {
      if (rest < tier.divCost) {
        tierIndex = t
        divFromBottom = d
        break outer
      }
      rest -= tier.divCost
      ordinal++
    }
  }

  const tier = RANK_TIERS[tierIndex]
  const division = tier.divisions === 4 ? 4 - divFromBottom : null
  const divCost = tier.divCost
  const lpInDiv = Math.round(rest)
  const toNext = divCost === Infinity ? 0 : Math.max(0, Math.ceil(divCost - rest))

  let nextLabel: string | null = null
  if (divCost !== Infinity) {
    if (division && division > 1) nextLabel = rankLabelOf(tier, division - 1)
    else {
      const nt = RANK_TIERS[tierIndex + 1]
      nextLabel = rankLabelOf(nt, nt.divisions === 4 ? 4 : null)
    }
  }

  return {
    totalXP,
    tier,
    tierIndex,
    division,
    rankLabel: rankLabelOf(tier, division),
    lpInDiv,
    divCost,
    toNext,
    nextLabel,
    ordinal,
    todayXP,
    weekXP,
    perAreaToday,
  }
}
