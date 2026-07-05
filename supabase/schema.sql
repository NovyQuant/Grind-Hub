-- =====================================================================
-- Life Hub — schema for Supabase (Postgres)
-- Wklej całość w Supabase → SQL Editor → Run.
-- Single-user MVP: RLS przepuszcza tylko zalogowanego użytkownika.
-- =====================================================================

-- ---------- Tabele ----------------------------------------------------

-- obszary życia: 'sen', 'silownia', 'dieta', 'finanse', 'rozwoj'

create table if not exists habits (
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

create table if not exists logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid references habits(id) on delete cascade,
  log_date date not null,
  value numeric not null,            -- binary: 1; numeric: wpisana wartość
  note text,
  unique (habit_id, log_date)
);

create table if not exists attribute_snapshots (
  snap_date date not null,
  area text not null,
  rating numeric not null,           -- 1.0–20.0
  primary key (snap_date, area)
);

create table if not exists records (
  key text primary key,              -- np. 'streak_silownia', 'best_week_overall'
  label text not null,
  value numeric not null,
  achieved_at date not null
);

create index if not exists logs_date_idx on logs (log_date);
create index if not exists snapshots_area_idx on attribute_snapshots (area, snap_date);

-- ---------- Row Level Security ---------------------------------------
-- Single-user: każdy zalogowany (authenticated) ma pełen dostęp.
-- anon nie ma dostępu do niczego.

alter table habits enable row level security;
alter table logs enable row level security;
alter table attribute_snapshots enable row level security;
alter table records enable row level security;

drop policy if exists "auth full habits" on habits;
drop policy if exists "auth full logs" on logs;
drop policy if exists "auth full snapshots" on attribute_snapshots;
drop policy if exists "auth full records" on records;

create policy "auth full habits" on habits
  for all to authenticated using (true) with check (true);
create policy "auth full logs" on logs
  for all to authenticated using (true) with check (true);
create policy "auth full snapshots" on attribute_snapshots
  for all to authenticated using (true) with check (true);
create policy "auth full records" on records
  for all to authenticated using (true) with check (true);

-- ---------- Seed (tylko jeśli tabela habits pusta) -------------------

insert into habits (name, area, type, unit, target_direction, daily_target, weekly_target, weight, sort_order)
select * from (values
  ('Sen (h)',                 'sen',      'numeric', 'h',    'at_least', 7,    null, 1, 1),
  ('Trening siłowy',          'silownia', 'binary',  null,   null,       null, 3,    1, 2),
  ('Kcal',                    'dieta',    'numeric', 'kcal', 'at_most',  2400, null, 1, 3),
  ('Wydatki dnia (zł)',       'finanse',  'numeric', 'zł',   'at_most',  70,   null, 1, 4),
  ('Praca nad projektem (h)', 'rozwoj',   'numeric', 'h',    'at_least', 1,    null, 1, 5)
) as v(name, area, type, unit, target_direction, daily_target, weekly_target, weight, sort_order)
where not exists (select 1 from habits);
