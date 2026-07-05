export const AREAS = ['sen', 'silownia', 'dieta', 'finanse', 'rozwoj'] as const
export type Area = (typeof AREAS)[number]

export const AREA_LABELS: Record<Area, string> = {
  sen: 'Sen',
  silownia: 'Siłownia',
  dieta: 'Dieta',
  finanse: 'Finanse',
  rozwoj: 'Rozwój',
}

export type HabitType = 'binary' | 'numeric'
export type TargetDirection = 'at_least' | 'at_most'

export interface Habit {
  id: string
  name: string
  area: Area
  type: HabitType
  unit: string | null
  target_direction: TargetDirection | null
  daily_target: number | null
  weekly_target: number | null
  weight: number
  active: boolean
  sort_order: number
}

export interface Log {
  id: string
  habit_id: string
  log_date: string // YYYY-MM-DD
  value: number
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

export const START_RATING = 8.0
export const EMA_ALPHA = 0.05
