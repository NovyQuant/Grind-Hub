-- =====================================================================
-- Grind Hub — schema v2 (streak + poziomy)
-- Wklej całość w Supabase → SQL Editor → Run.
-- UWAGA: to CZYŚCI stare tabele (nowy model danych). Single-user MVP.
-- =====================================================================

-- ---------- Reset (nowy model) ---------------------------------------
drop table if exists logs cascade;
drop table if exists attribute_snapshots cascade;
drop table if exists records cascade;
drop table if exists abstinences cascade;
drop table if exists habits cascade;

-- ---------- Tabele ----------------------------------------------------

-- obszary: 'sen','silownia','dieta','finanse','kosmetyki','rozwoj'

create table habits (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area text not null,
  input_kind text not null,          -- 'check' | 'scale3' | 'number'
  cadence text not null default 'daily', -- 'daily' | 'weekly'
  score_mode text,                   -- (number) 'at_least' | 'at_most' | 'range'
  daily_target numeric,              -- próg / dolna granica pasma / strefa wolna
  target_high numeric,               -- (range) górna granica pasma
  falloff numeric,                   -- spadek f na jednostkę poza celem
  weekly_target numeric,             -- (weekly) sesje/tydz albo pkt jakości/tydz
  subtypes text,                     -- np. 'siłownia,basen' (dla check)
  weight numeric default 1,
  active boolean default true,
  sort_order int default 0
);

create table logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid references habits(id) on delete cascade,
  log_date date not null,
  value numeric not null,            -- check:1; scale3:0/0.5/1; number: wartość
  tag text,                          -- podtyp, np. 'siłownia' / 'basen'
  note text,
  unique (habit_id, log_date)
);

create table attribute_snapshots (
  snap_date date not null,
  area text not null,
  rating numeric not null,           -- 1.0–20.0 (FM stats, EMA)
  primary key (snap_date, area)
);

create table records (
  key text primary key,
  label text not null,
  value numeric not null,
  achieved_at date not null
);

-- Nałogi: liczniki czystych dni
create table abstinences (
  id uuid primary key default gen_random_uuid(),
  name text not null,                -- np. 'Snus'
  started_on date not null,          -- data ostatniego resetu (czyste od…)
  best_days int default 0,           -- najdłuższa czysta seria all-time
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Taski / plany: due_date = dzień w kalendarzu, null = bez terminu
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  due_date date,
  done boolean not null default false,
  created_at timestamptz default now()
);

-- Zakupy: term 'short' (na teraz) | 'long' (long term)
create table if not exists shopping_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  term text not null default 'short',
  done boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists logs_date_idx on logs (log_date);
create index if not exists snapshots_area_idx on attribute_snapshots (area, snap_date);
create index if not exists tasks_due_idx on tasks (due_date);

-- ---------- Row Level Security ---------------------------------------
alter table habits enable row level security;
alter table logs enable row level security;
alter table attribute_snapshots enable row level security;
alter table records enable row level security;
alter table abstinences enable row level security;
alter table tasks enable row level security;
alter table shopping_items enable row level security;

create policy "auth full habits" on habits for all to authenticated using (true) with check (true);
create policy "auth full logs" on logs for all to authenticated using (true) with check (true);
create policy "auth full snapshots" on attribute_snapshots for all to authenticated using (true) with check (true);
create policy "auth full records" on records for all to authenticated using (true) with check (true);
create policy "auth full abstinences" on abstinences for all to authenticated using (true) with check (true);
create policy "auth full tasks" on tasks for all to authenticated using (true) with check (true);
create policy "auth full shopping" on shopping_items for all to authenticated using (true) with check (true);

-- ---------- Seed nawyków ---------------------------------------------
insert into habits
  (name, area, input_kind, cadence, score_mode, daily_target, target_high, falloff, weekly_target, subtypes, weight, sort_order)
values
  ('Sen',        'sen',       'number', 'daily',  'range',   7,    8,    0.5,  null, null,             2,   1),
  ('Trening',    'silownia',  'check',  'weekly', null,      null, null, null, 3,    'siłownia,basen', 2,   2),
  ('Projekt',    'rozwoj',    'scale3', 'weekly', null,      null, null, null, 2,    null,             2,   3),
  ('Dieta',      'dieta',     'scale3', 'daily',  null,      null, null, null, null, null,             1,   4),
  ('Głupoty (zł)','finanse',  'number', 'daily',  'at_most', 50,   null, 250,  null, null,             0.5, 5),
  ('Kosmetyki',  'kosmetyki', 'check',  'daily',  null,      null, null, null, null, null,             0.5, 6);
