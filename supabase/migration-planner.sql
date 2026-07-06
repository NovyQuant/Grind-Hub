-- =====================================================================
-- Grind Hub — migracja: Plan (taski + kalendarz) i zakupy
-- Wklej w Supabase → SQL Editor → Run. NIE kasuje istniejących danych.
-- =====================================================================

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

create index if not exists tasks_due_idx on tasks (due_date);

alter table tasks enable row level security;
alter table shopping_items enable row level security;

drop policy if exists "auth full tasks" on tasks;
drop policy if exists "auth full shopping" on shopping_items;
create policy "auth full tasks" on tasks for all to authenticated using (true) with check (true);
create policy "auth full shopping" on shopping_items for all to authenticated using (true) with check (true);
