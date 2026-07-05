// Wszystkie daty jako YYYY-MM-DD w lokalnej strefie użytkownika.

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(s: string, delta: number): string {
  const d = parseISO(s)
  d.setDate(d.getDate() + delta)
  return toISODate(d)
}

export function diffDays(a: string, b: string): number {
  // liczba dni od b do a (a - b)
  const ms = parseISO(a).getTime() - parseISO(b).getTime()
  return Math.round(ms / 86400000)
}

/** Lista dat [from..to] włącznie. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = []
  let cur = from
  while (diffDays(to, cur) >= 0) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}
