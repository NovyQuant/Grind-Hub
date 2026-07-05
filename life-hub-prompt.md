# Prompt dla Claude Code — Life Hub MVP

Zbuduj aplikację webową "Life Hub" — osobisty tracker nawyków stylizowany na profil piłkarza z Football Managera. Single-user MVP, ma działać szybko i być gotowy do deployu na Vercel.

## Stack
- Vite + React + TypeScript + Tailwind CSS
- Supabase (Postgres + Auth) — dane i logowanie (jeden użytkownik, email+hasło)
- Recharts do wykresów (radar chart + linie)
- PWA: manifest + service worker (vite-plugin-pwa), żeby dało się dodać do ekranu głównego telefonu
- Mobile-first: całość projektuj pod ekran telefonu, desktop to bonus

## Schemat bazy (Supabase / SQL)

```sql
-- obszary życia: 'sen', 'silownia', 'dieta', 'finanse', 'rozwoj'

create table habits (
  id uuid primary key default gen_random_uuid(),
  name text not null,                -- np. "Trening siłowy", "Kcal", "Sen (h)"
  area text not null,                -- jeden z obszarów wyżej
  type text not null,                -- 'binary' | 'numeric'
  unit text,                         -- np. 'kcal', 'h', 'zł' (dla numeric)
  target_direction text,             -- 'at_least' | 'at_most' (dla numeric)
  daily_target numeric,              -- np. kcal <= 2400, sen >= 7
  weekly_target int,                 -- dla binary: np. 3 treningi/tydz
  weight numeric default 1,          -- waga w ratingu obszaru
  active boolean default true,
  sort_order int default 0
);

create table logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid references habits(id) on delete cascade,
  log_date date not null,
  value numeric not null,            -- binary: 1; numeric: wpisana wartość
  note text,
  unique (habit_id, log_date)
);

create table attribute_snapshots (
  snap_date date not null,
  area text not null,
  rating numeric not null,           -- 1.0–20.0
  primary key (snap_date, area)
);

create table records (
  key text primary key,              -- np. 'streak_silownia', 'best_week_overall'
  label text not null,
  value numeric not null,
  achieved_at date not null
);
```

Dodaj RLS (row level security) tak, żeby tylko zalogowany użytkownik miał dostęp.

## Logika atrybutów (rdzeń aplikacji)

Każdy obszar ma rating 1–20 jak atrybut piłkarza w FM. Rating liczony jako EMA (wykładnicza średnia krocząca) dziennego wykonania:

- Dzienne wykonanie obszaru `f` (0–1): średnia ważona (wg `weight`) wykonania nawyków z tego obszaru danego dnia.
  - binary z weekly_target: wykonanie liczone w oknie tygodniowym — jeśli w ostatnich 7 dniach zrobione >= weekly_target, f_nawyku = 1, inaczej proporcjonalnie (zrobione/target).
  - numeric at_most (np. kcal): f = 1 jeśli value <= daily_target, inaczej max(0, 1 - (value-target)/target).
  - numeric at_least (np. sen): f = 1 jeśli value >= target, inaczej value/target.
  - brak wpisu w dniu = 0 (to jest kara za nielogowanie — celowo).
- Update ratingu raz dziennie: `rating_t = 0.95 * rating_{t-1} + 0.05 * (20 * f)`.
  Rating rośnie powoli i spada przy zaniedbaniu — jak forma piłkarza.
- Overall = średnia ważona ratingów obszarów (na start równe wagi).
- Snapshot ratingów zapisuj do `attribute_snapshots` przy pierwszym otwarciu aplikacji danego dnia (dolicz brakujące dni wstecz, jeśli apka nie była otwierana).
- Start: wszystkie ratingi = 8.0.

## Rekordy (aktualizowane automatycznie po każdym logu)
- Najdłuższy streak per obszar (dni z f >= 0.8)
- Najlepszy tydzień (średni overall z 7 dni)
- Najwyższy rating każdego obszaru all-time
- Rekordy liczbowe: np. najniższy tygodniowy wynik kcal vs target
Pokazuj "🔥 NOWY REKORD" toastem, gdy padnie.

## Ekrany (4, routing np. react-router)

1. **Dziś** (domyślny) — jedno-ekranowe logowanie, cel: < 30 sekund.
   - Lista aktywnych nawyków: binary = duży checkbox/przycisk, numeric = pole liczbowe z klawiaturą numeryczną i przyciskiem zapisu.
   - Na górze pasek: dzisiejsze wykonanie % i aktualny overall.
   - Edycja wpisów wstecz: prosty date picker.
2. **Profil** — profil "piłkarza" à la FM:
   - Radar chart 5 obszarów (rating 1–20).
   - Lista atrybutów z liczbą i strzałką trendu (porównanie do 7 dni temu, zielona ↑ / czerwona ↓ jak w FM).
   - Wykres liniowy overall z ostatnich 90 dni.
3. **Rekordy** — tabela rekordów + aktualne streaki per obszar.
4. **Ustawienia** — CRUD nawyków (nazwa, obszar, typ, targety, waga).

## Seed (wstaw przy pierwszym uruchomieniu)
- Sen: "Sen (h)", numeric, at_least, target 7
- Siłownia: "Trening siłowy", binary, weekly_target 3
- Dieta: "Kcal", numeric, at_most, target 2400
- Finanse: "Wydatki dnia (zł)", numeric, at_most, target 70
- Rozwój: "Praca nad projektem (h)", numeric, at_least, target 1, weekly liczone łagodnie

## Wymagania jakościowe
- Zero zbędnych zależności, żadnego reduxa — wystarczy React Query lub proste hooki.
- Optimistic updates przy logowaniu (kliknięcie ma być natychmiastowe).
- Ciemny motyw domyślnie, estetyka inspirowana FM (ciemne tło, zielone/pomarańczowe/czerwone kolory ratingów wg progu: <8 czerwony, 8–13 pomarańczowy, >13 zielony).
- Przygotuj plik `supabase/schema.sql` do wklejenia w SQL editor Supabase oraz `.env.example` z VITE_SUPABASE_URL i VITE_SUPABASE_ANON_KEY.
- README z krokami: setup Supabase → env → npm run dev → deploy na Vercel.

Zacznij od schema.sql i struktury projektu, potem ekran "Dziś", potem logika ratingów, na końcu Profil i Rekordy.
