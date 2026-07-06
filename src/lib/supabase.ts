import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Nie rzucamy błędu w runtime UI — pokazujemy czytelny komunikat w konsoli.
  console.error(
    'Brak VITE_SUPABASE_URL lub VITE_SUPABASE_ANON_KEY. Skopiuj .env.example -> .env i uzupełnij.'
  )
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storage: window.localStorage,
    storageKey: 'grind-hub-auth',
  },
})

export const hasSupabaseConfig = Boolean(url && anonKey)
