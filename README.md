# Life Hub

Osobisty tracker nawyków w stylu profilu piłkarza z *Football Managera*.
Każdy obszar życia (Sen, Siłownia, Dieta, Finanse, Rozwój) ma rating **1–20**,
liczony jako EMA dziennego wykonania — rośnie powoli, spada przy zaniedbaniu.

Single-user MVP. Mobile-first. PWA (dodaj do ekranu głównego). Deploy: Vercel.

## Stack
Vite · React · TypeScript · Tailwind · Supabase (Postgres + Auth) · Recharts · vite-plugin-pwa · React Query

## Ekrany
- **Dziś** — szybkie logowanie (< 30 s): checkboxy dla nawyków binarnych, pola liczbowe dla numerycznych, pasek wykonania dnia + overall, date picker do wpisów wstecz.
- **Profil** — radar 5 obszarów, lista atrybutów z trendem (↑/↓ vs 7 dni temu), wykres overall z 90 dni.
- **Rekordy** — tabela rekordów all-time + aktualne streaki per obszar.
- **Ustawienia** — CRUD nawyków (nazwa, obszar, typ, targety, waga, aktywność).

---

## Setup — krok po kroku

### 1. Supabase
1. Załóż projekt na [supabase.com](https://supabase.com).
2. Wejdź w **SQL Editor** → wklej całą zawartość [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   To utworzy tabele, RLS oraz seed 5 startowych nawyków.
3. Wejdź w **Authentication → Users → Add user**, ustaw swój e-mail + hasło
   (to jedyne konto — apka jest single-user).
   - Opcjonalnie w **Authentication → Providers → Email** wyłącz „Confirm email”, żeby logować się od razu.
4. Z **Project Settings → API** skopiuj **Project URL** i **anon public key**.

### 2. Środowisko lokalne
```bash
cp .env.example .env
# uzupełnij .env:
#   VITE_SUPABASE_URL=https://xxxx.supabase.co
#   VITE_SUPABASE_ANON_KEY=eyJ...
npm install
npm run dev
```
Otwórz adres z konsoli (domyślnie http://localhost:5173) i zaloguj się kontem z kroku 1.3.

### 3. Deploy na Vercel
1. Wypchnij repo na GitHub.
2. Na [vercel.com](https://vercel.com) → **New Project** → zaimportuj repo.
   Framework preset **Vite** wykryje się sam (`npm run build`, output `dist`).
3. W **Settings → Environment Variables** dodaj `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY`.
4. **Deploy**. Na telefonie: otwórz URL → menu przeglądarki → *Dodaj do ekranu głównego*.

---

## Logika ratingów (skrót)
- Dzienne wykonanie obszaru `f ∈ [0,1]` = średnia ważona (wg `weight`) wykonania nawyków tego dnia.
  - binary z `weekly_target`: okno 7 dni — `zrobione ≥ target ⇒ 1`, inaczej `zrobione/target`.
  - numeric `at_most` (np. kcal): `value ≤ target ⇒ 1`, inaczej `max(0, 1-(value-target)/target)`.
  - numeric `at_least` (np. sen): `value ≥ target ⇒ 1`, inaczej `value/target`.
  - brak wpisu (numeric) = `0` — celowa kara za nielogowanie.
- Rating: `rating_t = 0.95·rating_{t-1} + 0.05·(20·f)`. Start: wszystkie `= 8.0`.
- Overall = średnia ratingów obszarów.
- Snapshoty ratingów zapisują się przy pierwszym otwarciu apki danego dnia
  (dolicza brakujące dni wstecz).

Kolory FM: `<8` czerwony · `8–13` pomarańczowy · `>13` zielony.

## Skrypty
| polecenie | opis |
|---|---|
| `npm run dev` | serwer developerski |
| `npm run build` | typecheck + build produkcyjny do `dist/` |
| `npm run preview` | podgląd builda |
