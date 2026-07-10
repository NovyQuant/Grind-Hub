import { Abstinence, AREAS, Area, Habit, Log, STATS_SINCE } from './types'
import { addDays, dateRange, diffDays, todayISO, weekStartISO } from './date'
import { habitDailyF, makeLookup, ValueLookup } from './ratings'

// ---------- System rang (à la League of Legends) ----------------------
// Nawyki dzienne: XP w strefach — super = +waga×25, okej = +połowa,
// słabo = −waga×25 (wydatki scale4: bardzo źle = −2×). Seria dni na plusie
// w obszarze daje mnożnik +5%/dzień (maks ×2) — tylko do dodatniego XP.
// Nawyki tygodniowe (trening, projekt): każda sesja = mały +XP (skalowany
// jakością wpisu), brak sesji = 0 (odpoczynek nie karze), nabicie celu
// tygodnia pon–ndz = duży bonus, a zawalony (zamknięty) tydzień = kara
// tej samej wielkości, naliczana w niedzielę. Bez mnożnika serii.
// Nałogi: +2 XP bazy za każdy czysty dzień, z mnożnikiem serii
// (wpadka = utrata całego XP bieżącej serii).
// Dziś w toku: brak wpisu = 0 (neutralne), kara −XP dopiero za zamknięte dni.
// Rangi liczone deterministycznie z logów (bez stanu w DB), od STATS_SINCE.

export const XP_PER_WEIGHT = 25
export const OK_XP_SIGN = 0.5 // okej = połowa pełnego +XP
export const STREAK_MULT_STEP = 0.05 // +5% za każdy kolejny dzień serii
export const STREAK_MULT_CAP = 2 // maks ×2 (od 21. dnia serii)
export const ABST_XP_PER_DAY = 2 // baza XP za czysty dzień nałogu
export const SESSION_XP_FRACTION = 0.3 // pojedyncza sesja weekly = 0.3 × waga × 25
export const WEEKLY_BONUS_MULT = 2 // bonus za nabicie celu tygodnia = 2 × waga × 25
// kara za niewykonanie celu w zamkniętym tygodniu = tyle co bonus (symetria)

/** XP za pojedynczą sesję nawyku tygodniowego (q = jakość wpisu 0..1). */
export function weeklySessionXP(habit: Habit, q: number): number {
  return q * SESSION_XP_FRACTION * (habit.weight ?? 1) * XP_PER_WEIGHT
}

/** Bonus XP za nabicie celu tygodnia (pon–ndz) nawyku tygodniowego. */
export function weeklyBonusXP(habit: Habit): number {
  return Math.round(WEEKLY_BONUS_MULT * (habit.weight ?? 1) * XP_PER_WEIGHT)
}

/** Łączny bonus XP za nabicie celów tygodnia w obszarze (0 dla obszarów dziennych). */
export function weeklyAreaBonus(habits: Habit[], area: Area): number {
  return habits
    .filter((h) => h.active && h.area === area && h.cadence === 'weekly')
    .reduce((s, h) => s + weeklyBonusXP(h), 0)
}

/** Jakość wpisu weekly danego dnia: check = 0/1, scale3 = 0/0.5/1. */
function weeklyQ(habit: Habit, date: string, getValue: ValueLookup): number {
  const v = getValue(habit.id, date)
  if (v === undefined) return 0
  return habit.input_kind === 'check' ? (v >= 1 ? 1 : 0) : Math.max(0, Math.min(1, v))
}

/** Suma jakości wpisów weekly w tygodniu kalendarzowym do `date` włącznie. */
function weeklyAccUpTo(habit: Habit, date: string, getValue: ValueLookup): number {
  let acc = 0
  for (let d = weekStartISO(date); d <= date; d = addDays(d, 1)) acc += weeklyQ(habit, d, getValue)
  return acc
}

/** Czy dzisiejszy wpis domknął cel tygodnia (bonus wpada w dniu nabicia). */
function crossedWeeklyTarget(habit: Habit, date: string, getValue: ValueLookup): boolean {
  const target = habit.weekly_target && habit.weekly_target > 0 ? habit.weekly_target : 1
  const q = weeklyQ(habit, date, getValue)
  if (q <= 0) return false
  const acc = weeklyAccUpTo(habit, date, getValue)
  return acc >= target && acc - q < target
}

/** Mnożnik serii: dzień 1 = ×1, każdy kolejny +5%, sufit ×2. */
export function streakMult(run: number): number {
  return Math.min(STREAK_MULT_CAP, 1 + STREAK_MULT_STEP * Math.max(0, run - 1))
}

/** XP za dzisiejszy (n-ty) czysty dzień nałogu. */
export function abstinenceDayXP(days: number): number {
  return days <= 0 ? 0 : Math.round(ABST_XP_PER_DAY * streakMult(days))
}

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

export interface AreaTodayXP {
  xp: number // XP obszaru dziś (po mnożniku)
  max: number // maks bazowego XP (bez mnożnika)
  mult: number // mnożnik serii obowiązujący dziś
  run: number // długość serii dni na plusie (z dzisiaj włącznie, gdy dziś na plusie)
}

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
  perAreaToday: Record<Area, AreaTodayXP>
  abstinenceXP: number // suma XP z nałogów (bieżące serie)
  abstinenceToday: number // XP z nałogów za dziś
  history: { date: string; xp: number }[] // XP dzień po dniu (nawyki + nałogi)
}

/**
 * Znak XP nawyku DZIENNEGO danego dnia: +1 super / +0.5 okej / −1 słabo.
 * `pending` = dzień w toku (dziś): brak wpisu daje 0 zamiast −1.
 * (Nawyki weekly rozliczane osobno: sesje + bonus za cel tygodnia.)
 *
 * - check: zrobione = +1, brak = −1
 * - scale3: super = +1, okej = +0.5, słabo/brak = −1
 * - scale4 (wydatki, samoocena): dobrze = +1, okej = +0.5, źle = −1,
 *   bardzo źle = −2 (podwójna kara)
 * - number range (sen, falloff 0.5/h): pasmo 7–8h (f=1) = +1,
 *   6:30–7 i 8–8:30 (f≥0.75) = +0.5, poza (f<0.75) = −1
 * - number at_most (głupoty): strefa wolna (f=1) = +1, lekko ponad (f≥0.67) = +0.5, dalej = −1
 * - number at_least: cel (f≥1) = +1, ≥połowa = +0.5, poniżej = −1
 */
export function habitXPSign(
  habit: Habit,
  date: string,
  getValue: ValueLookup,
  pending: boolean
): number {
  const v = getValue(habit.id, date)
  if (v === undefined) return pending ? 0 : -1

  if (habit.input_kind === 'check') return v >= 1 ? 1 : -1
  if (habit.input_kind === 'scale3') {
    if (v >= 1) return 1
    if (v >= 0.5) return OK_XP_SIGN
    return -1
  }
  if (habit.input_kind === 'scale4') {
    if (v >= 1) return 1
    if (v >= 0.8) return OK_XP_SIGN
    if (v >= 0.4) return -1
    return -2
  }

  // number
  const f = habitDailyF(habit, date, getValue)
  if (f >= 1) return 1
  const neutral = habit.score_mode === 'range' ? 0.75 : habit.score_mode === 'at_most' ? 0.67 : 0.5
  if (f >= neutral) return OK_XP_SIGN
  return -1
}

/**
 * Bazowe XP nawyku danego dnia (bez mnożnika serii) — do podglądu przy wpisie.
 * null = brak wpisu dziś (jeszcze nic nie wisi).
 * Weekly: XP sesji wg jakości wpisu + bonus, jeśli ten wpis domknął cel tygodnia.
 */
export function habitBaseXP(
  habit: Habit,
  date: string,
  getValue: ValueLookup,
  pending: boolean
): number | null {
  if (habit.cadence === 'weekly') {
    if (getValue(habit.id, date) === undefined) return null
    let xp = weeklySessionXP(habit, weeklyQ(habit, date, getValue))
    if (crossedWeeklyTarget(habit, date, getValue)) xp += weeklyBonusXP(habit)
    return Math.round(xp)
  }
  if (pending && getValue(habit.id, date) === undefined) return null
  return Math.round(habitXPSign(habit, date, getValue, pending) * (habit.weight ?? 1) * XP_PER_WEIGHT)
}

export function rankLabelOf(tier: RankTier, division: number | null): string {
  return division ? `${tier.label} ${ROMAN[division]}` : tier.label
}

export function computeRank(
  habits: Habit[],
  logs: Log[],
  abstinences: Abstinence[] = []
): RankState {
  const today = todayISO()
  const getValue = makeLookup(logs)
  const earliest = logs.length
    ? logs.reduce((m, l) => (l.log_date < m ? l.log_date : m), logs[0].log_date)
    : today
  // statystyki prowadzone od STATS_SINCE — wcześniejsze logi nie liczą się do XP
  const from = earliest < STATS_SINCE ? STATS_SINCE : earliest

  const curWeek = weekStartISO(today)
  const byArea = {} as Record<Area, Habit[]>
  for (const area of AREAS) byArea[area] = habits.filter((h) => h.active && h.area === area)

  // Dzień po dniu: XP per obszar z mnożnikiem serii (seria = kolejne dni na plusie).
  const run = {} as Record<Area, number>
  for (const area of AREAS) run[area] = 0
  const histMap = new Map<string, number>()
  const perAreaToday = {} as Record<Area, AreaTodayXP>
  let totalXP = 0
  let weekXP = 0
  let todayXP = 0

  for (const d of dateRange(from, today)) {
    const pending = d === today
    let dayTotal = 0
    for (const area of AREAS) {
      const weeklyArea = byArea[area].some((h) => h.cadence === 'weekly')
      let raw = 0
      let max = 0
      for (const h of byArea[area]) {
        if (h.cadence === 'weekly') {
          // sesja = mały +, brak sesji = 0; bonus w dniu nabicia celu tygodnia
          const q = weeklyQ(h, d, getValue)
          if (q > 0) {
            raw += weeklySessionXP(h, q)
            if (crossedWeeklyTarget(h, d, getValue)) raw += weeklyBonusXP(h)
          }
          // kara: zamknięty (niedziela, nie dziś), w pełni śledzony tydzień bez celu
          const ws = weekStartISO(d)
          if (addDays(ws, 6) === d && !pending && ws >= from) {
            const target = h.weekly_target && h.weekly_target > 0 ? h.weekly_target : 1
            if (weeklyAccUpTo(h, d, getValue) < target) raw -= weeklyBonusXP(h)
          }
          max += weeklySessionXP(h, 1) + weeklyBonusXP(h)
        } else {
          const w = (h.weight ?? 1) * XP_PER_WEIGHT
          raw += habitXPSign(h, d, getValue, pending) * w
          max += w
        }
      }
      let xp = raw
      if (!weeklyArea) {
        if (raw > 0) {
          run[area]++
          xp = raw * streakMult(run[area])
        } else if (!pending) {
          run[area] = 0 // zamknięty dzień bez plusa zrywa serię; dziś w toku nie zeruje
        }
      }
      dayTotal += xp
      if (pending) {
        perAreaToday[area] = {
          xp: Math.round(xp),
          max: Math.round(max),
          // dziś na plusie → mnożnik zastosowany; inaczej → jaki byłby przy plusie
          mult: weeklyArea ? 1 : streakMult(raw > 0 ? run[area] : run[area] + 1),
          run: weeklyArea ? 0 : run[area],
        }
      }
    }
    histMap.set(d, dayTotal)
    totalXP += dayTotal
    if (d >= curWeek) weekXP += dayTotal
    if (pending) todayXP = dayTotal
  }

  // Nałogi: każdy czysty dzień bieżącej serii = +2 XP × mnożnik serii.
  let abstinenceXP = 0
  let abstinenceToday = 0
  for (const a of abstinences) {
    const cleanDays = diffDays(today, a.started_on)
    for (let i = 1; i <= cleanDays; i++) {
      const xp = ABST_XP_PER_DAY * streakMult(i)
      abstinenceXP += xp
      const d = addDays(a.started_on, i)
      if (d >= curWeek) weekXP += xp
      if (d === today) abstinenceToday += xp
      const prev = histMap.get(d)
      if (prev !== undefined) histMap.set(d, prev + xp)
    }
  }
  totalXP += abstinenceXP
  todayXP += abstinenceToday

  totalXP = Math.max(0, Math.round(totalXP)) // podłoga: Żelazo IV / 0 XP
  weekXP = Math.round(weekXP)
  todayXP = Math.round(todayXP)
  abstinenceXP = Math.round(abstinenceXP)
  abstinenceToday = Math.round(abstinenceToday)

  const history = [...histMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, xp]) => ({ date, xp: Math.round(xp) }))

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
    abstinenceXP,
    abstinenceToday,
    history,
  }
}
