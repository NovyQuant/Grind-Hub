import { FormEvent, useState } from 'react'
import { useAuth } from '../lib/auth'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await signIn(email.trim(), password)
    if (error) setError(error)
    setBusy(false)
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <div className="text-4xl">⚽</div>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">Life Hub</h1>
        <p className="text-sm text-muted">Twój profil zawodnika</p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="e-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-rating-good"
          required
        />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="hasło"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-rating-good"
          required
        />
        {error && <p className="text-sm text-rating-bad">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-rating-good py-3 font-semibold text-bg disabled:opacity-50"
        >
          {busy ? 'Logowanie…' : 'Zaloguj'}
        </button>
      </form>
      <p className="text-center text-xs text-muted">
        Konto zakładasz raz w panelu Supabase (Authentication → Users).
      </p>
    </div>
  )
}
