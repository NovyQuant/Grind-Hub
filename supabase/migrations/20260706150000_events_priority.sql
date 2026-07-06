-- Priorytet tasków + wydarzenia w kalendarzu (spotkania z godziną).
-- Bezpieczne do wielokrotnego uruchomienia; nie kasuje danych.

alter table tasks add column if not exists priority text not null default 'normal'; -- 'high'|'normal'|'low'

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_date date not null,
  event_time time,                   -- null = całodniowe
  created_at timestamptz default now()
);

create index if not exists events_date_idx on events (event_date);

alter table events enable row level security;
drop policy if exists "auth full events" on events;
create policy "auth full events" on events for all to authenticated using (true) with check (true);
