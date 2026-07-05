import { useEffect } from 'react'
import { todayISO } from './date'

const KEY_ENABLED = 'gh_reminder_enabled'
const KEY_HOUR = 'gh_reminder_hour'
const KEY_LAST = 'gh_reminder_last'

export function getReminder() {
  return {
    enabled: localStorage.getItem(KEY_ENABLED) === '1',
    hour: Number(localStorage.getItem(KEY_HOUR) ?? '20'),
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  }
}

export async function enableReminder(hour: number): Promise<boolean> {
  if (typeof Notification === 'undefined') return false
  let perm = Notification.permission
  if (perm === 'default') perm = await Notification.requestPermission()
  if (perm !== 'granted') return false
  localStorage.setItem(KEY_ENABLED, '1')
  localStorage.setItem(KEY_HOUR, String(hour))
  return true
}

export function disableReminder() {
  localStorage.setItem(KEY_ENABLED, '0')
}

async function fire(text: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      reg.showNotification('Grind Hub 🔥', { body: text, icon: '/favicon.svg', tag: 'gh-daily' })
    } else if (Notification.permission === 'granted') {
      new Notification('Grind Hub 🔥', { body: text })
    }
  } catch {
    /* ignoruj */
  }
}

/**
 * Best-effort wieczorne przypomnienie. Działa gdy apka jest otwarta/w tle.
 * UWAGA: pełny push bez backendu nie jest gwarantowany (szczególnie iOS PWA
 * wymaga dodania do ekranu głównego). To lokalny fallback.
 */
export function useReminder() {
  useEffect(() => {
    const tick = () => {
      const { enabled, hour } = getReminder()
      if (!enabled) return
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      const now = new Date()
      const today = todayISO()
      if (now.getHours() === hour && localStorage.getItem(KEY_LAST) !== today) {
        localStorage.setItem(KEY_LAST, today)
        fire('Zamknij dzień i nie przerywaj streaka 🔥')
      }
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [])
}
