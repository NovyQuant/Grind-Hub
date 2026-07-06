import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { hasSupabaseConfig } from './lib/supabase'
import { useSync } from './lib/useSync'
import { useReminder } from './lib/reminder'
import Login from './screens/Login'
import Today from './screens/Today'
import Planner from './screens/Planner'
import Levels from './screens/Levels'
import Rank from './screens/Rank'
import Addictions from './screens/Addictions'
import Settings from './screens/Settings'

function ConfigError() {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-3 p-6 text-center">
      <div className="text-2xl">⚙️</div>
      <h1 className="text-lg font-bold">Brak konfiguracji Supabase</h1>
      <p className="text-sm text-muted">
        Uzupełnij <code className="text-text">VITE_SUPABASE_URL</code> i{' '}
        <code className="text-text">VITE_SUPABASE_ANON_KEY</code> w <code className="text-text">.env</code>.
      </p>
    </div>
  )
}

const TABS = [
  { to: '/', label: 'Dziś', icon: '🔥', end: true },
  { to: '/plan', label: 'Plan', icon: '📅', end: false },
  { to: '/poziomy', label: 'Poziomy', icon: '🎮', end: false },
  { to: '/ranga', label: 'Ranga', icon: '🏆', end: false },
  { to: '/nalogi', label: 'Nałogi', icon: '🚭', end: false },
  { to: '/ustawienia', label: 'Więcej', icon: '⚙️', end: false },
]

function MobileHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
      <div className="flex items-center justify-center gap-2 py-2.5">
        <span className="text-lg leading-none">🔥</span>
        <span className="text-base font-extrabold tracking-tight">Grind Hub</span>
      </div>
    </header>
  )
}

function BottomNav() {
  return (
    <nav className="nav-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-md">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium ${
                isActive ? 'text-rating-good' : 'text-muted'
              }`
            }
          >
            <span className="text-lg leading-none">{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface px-4 py-6 md:flex">
      <div className="mb-8 flex items-center gap-2 px-2">
        <span className="text-2xl">🔥</span>
        <span className="text-lg font-extrabold tracking-tight">Grind Hub</span>
      </div>
      <nav className="flex flex-col gap-1">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-rating-good/10 text-rating-good' : 'text-muted hover:bg-surface2 hover:text-text'
              }`
            }
          >
            <span className="text-lg leading-none">{t.icon}</span>
            {t.label === 'Więcej' ? 'Ustawienia' : t.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto px-3 text-xs text-muted">Grind never stops.</div>
    </aside>
  )
}

function AuthedApp() {
  useSync()
  useReminder()
  return (
    <div className="min-h-full md:pl-60">
      <Sidebar />
      <MobileHeader />
      <main className="mx-auto w-full max-w-5xl">
        <div className="app-scroll md:pb-8">
          <Routes>
            <Route path="/" element={<Today />} />
            <Route path="/plan" element={<Planner />} />
            <Route path="/poziomy" element={<Levels />} />
            <Route path="/ranga" element={<Rank />} />
            <Route path="/stats" element={<Navigate to="/ranga" replace />} />
            <Route path="/nalogi" element={<Addictions />} />
            <Route path="/ustawienia" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
      <BottomNav />
    </div>
  )
}

export default function App() {
  const { session, loading } = useAuth()

  if (!hasSupabaseConfig) return <ConfigError />
  if (loading)
    return <div className="flex min-h-full items-center justify-center text-muted">Ładowanie…</div>
  if (!session) return <Login />
  return <AuthedApp />
}
