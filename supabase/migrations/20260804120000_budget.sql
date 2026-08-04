-- =====================================================================
-- Grind Hub — Budżet: wpływy (wypłaty) i wydatki, plan vs fakt.
-- shopping_items zostaje nietknięte (ekran zakupów zniknął z UI).
-- =====================================================================

create table if not exists budget_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  kind text not null default 'out',        -- 'in' (wpłynęło) | 'out' (wyszło)
  amount numeric not null,                 -- zawsze dodatnia, znak bierze się z kind
  title text not null default '',          -- na co (może być puste = ogólna kwota)
  category text,                           -- klucz kategorii, null = bez kategorii
  planned boolean not null default false,  -- true = dopiero pójdzie, false = już poszło
  note text,
  created_at timestamptz default now()
);

create index if not exists budget_entries_date_idx on budget_entries (entry_date);

alter table budget_entries enable row level security;

drop policy if exists "auth full budget" on budget_entries;
create policy "auth full budget" on budget_entries for all to authenticated using (true) with check (true);
