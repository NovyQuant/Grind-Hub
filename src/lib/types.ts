export const AREAS = ['sen', 'silownia', 'dieta', 'finanse', 'kosmetyki', 'rozwoj'] as const
export type Area = (typeof AREAS)[number]

export const AREA_LABELS: Record<Area, string> = {
  sen: 'Sen',
  silownia: 'Trening',
  dieta: 'Dieta',
  finanse: 'Finanse',
  kosmetyki: 'Kosmetyki',
  rozwoj: 'Projekt',
}

export const AREA_ICONS: Record<Area, string> = {
  sen: '😴',
  silownia: '💪',
  dieta: '🥗',
  finanse: '💸',
  kosmetyki: '🧴',
  rozwoj: '🚀',
}

export type InputKind = 'check' | 'scale3' | 'number'
export type Cadence = 'daily' | 'weekly'
export type ScoreMode = 'at_least' | 'at_most' | 'range'

export interface Habit {
  id: string
  name: string
  area: Area
  input_kind: InputKind
  cadence: Cadence
  score_mode: ScoreMode | null
  daily_target: number | null
  target_high: number | null
  falloff: number | null
  weekly_target: number | null
  subtypes: string | null
  weight: number
  active: boolean
  sort_order: number
}

export interface Log {
  id: string
  habit_id: string
  log_date: string // YYYY-MM-DD
  value: number
  tag: string | null
  note: string | null
}

export interface AttributeSnapshot {
  snap_date: string
  area: Area
  rating: number
}

export interface RecordRow {
  key: string
  label: string
  value: number
  achieved_at: string
}

export interface Abstinence {
  id: string
  name: string
  started_on: string
  best_days: number
  sort_order: number
}

// scale3 wartości
export const SCALE3 = [
  { value: 0, label: 'słabo', short: '😕' },
  { value: 0.5, label: 'okej', short: '😐' },
  { value: 1, label: 'super', short: '🔥' },
] as const

// Streak / poziomy
export const DAY_COMPLETE_THRESHOLD = 0.8 // dzień zaliczony gdy ważona średnia f >= 0.8
export const AREA_GOOD_THRESHOLD = 0.8 // dobry dzień w obszarze
export const AREA_BAD_THRESHOLD = 0.5 // dzień "poza targetem" gdy f < 0.5
export const LEVEL_DECAY_BAD_DAYS = 7 // tyle słabych dni obniża poziom o 1
export const MILESTONES = [7, 30, 100, 250, 365]

// FM stats (EMA)
export const START_RATING = 8.0
export const EMA_ALPHA = 0.05
