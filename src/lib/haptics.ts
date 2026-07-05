/** Krótka wibracja (jeśli urządzenie wspiera). */
export function buzz(pattern: number | number[] = 15) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* brak wsparcia — ignoruj */
  }
}

export const BUZZ_TAP = 10
export const BUZZ_DONE = [20, 40, 20]
export const BUZZ_LEVEL = [30, 50, 30, 50, 60]
export const BUZZ_MILESTONE = [40, 60, 40, 60, 40, 80]
