import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { hasSupabaseConfig } from './lib/supabase'
import { useSync } from './lib/useSync'
import Login from './screens/Login'
import Today from './screens/Today'
import Profile from './screens/Profile'
import Records from './screens/Records'
import Settings from './screens/Settings'

function ConfigError() {
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-3 p-6 text-center">
      <div className="text-2xl">⚙️</div>
      <h1 className="text-lg font-bold">Brak konfiguracji Supabase</h1>
      <p className="text-sm text-muted">
        Skopiuj <code className="text-text">.env.example</code> do{' '}
        <code className="text-text">.env</code> i uzupełnij{' '}
        <code className="text-text">VITE_SUPABASE_URL</code> oraz{' '}
        <code className="text-text">VITE_SUPABASE_ANON_KEY</code>, potem zrestartuj{' '}
        <code className="text-text">npm run dev</code>.
      </p>
    </div>
  )
}

const TABS = [
  { to: '/', label: 'Dziś', icon: '📋', end: true },
  { to: '/profil', label: 'Profil', icon: '⚽', end: false },
  { to: '/rekordy', label: 'Rekordy', icon: '🏆', end: false },
  { to: '/ustawienia', label: 'Ustawienia', icon: '⚙️', end: false },
]

/** Dolny pasek — tylko mobile (< md). */
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
              `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
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

/** Boczny pasek — tylko desktop (md+). */
function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface px-4 py-6 md:flex">
      <div className="mb-8 flex items-center gap-2 px-2">
        <span className="text-2xl">⚽</span>
        <span className="text-lg font-extrabold tracking-tight">Life Hub</span>
      </div>
      <nav className="flex flex-col gap-1">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-rating-good/10 text-rating-good'
                  : 'text-muted hover:bg-surface2 hover:text-text'
              }`
            }
          >
            <span className="text-lg leading-none">{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto px-3 text-xs text-muted">Twój profil zawodnika</div>
    </aside>
  )
}

function AuthedApp() {
  useSync()
  return (
    <div className="min-h-full md:pl-60">
      <Sidebar />
      <main className="mx-auto w-full max-w-5xl">
        <div className="app-scroll md:pb-8">
          <Routes>
            <Route path="/" element={<Today />} />
            <Route path="/profil" element={<Profile />} />
            <Route path="/rekordy" element={<Records />} />
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
