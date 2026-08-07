-- =====================================================================
-- Grind Hub — Cele zakupowe („co chcę kupić") + odkładanie miesiąc po miesiącu.
-- Cel żyje raz (komputer, telefon, ciuchy), a w każdym miesiącu wpisujesz
-- ile z worka „Inne" na niego idzie. Zebrane = suma z wszystkich miesięcy.
-- =====================================================================

create table if not exists budget_goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  icon text not null default '🎯',
  target numeric,                       -- cena docelowa (null = bez ceny)
  done boolean not null default false,  -- kupione
  sort_order int not null default 0,
  created_at timestamptz default now()
);

-- Komórka: ile w danym miesiącu odkładam na dany cel
create table if not exists budget_goal_alloc (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references budget_goals (id) on delete cascade,
  period text not null,                 -- 'YYYY-MM'
  amount numeric not null default 0,
  unique (goal_id, period)
);

create index if not exists budget_goal_alloc_period_idx on budget_goal_alloc (period);

alter table budget_goals enable row level security;
alter table budget_goal_alloc enable row level security;

drop policy if exists "auth full budget_goals" on budget_goals;
drop policy if exists "auth full budget_goal_alloc" on budget_goal_alloc;
create policy "auth full budget_goals" on budget_goals for all to authenticated using (true) with check (true);
create policy "auth full budget_goal_alloc" on budget_goal_alloc for all to authenticated using (true) with check (true);

-- ---------- Przeniesienie starej rozpiski „Innych" -------------------
-- Dotąd Inne siedziało w budget_items (bucket_id null), osobny wiersz na
-- każdy miesiąc. Ta sama nazwa w kilku miesiącach = jeden cel + alokacje.

insert into budget_goals (title, sort_order)
select distinct on (lower(btrim(i.title))) btrim(i.title), 0
from budget_items i
where i.bucket_id is null
  and btrim(i.title) <> ''
  and not exists (
    select 1 from budget_goals g where lower(g.title) = lower(btrim(i.title))
  )
order by lower(btrim(i.title)), i.created_at;

insert into budget_goal_alloc (goal_id, period, amount)
select g.id, i.period, sum(coalesce(i.amount, 0))
from budget_items i
join budget_goals g on lower(g.title) = lower(btrim(i.title))
where i.bucket_id is null
group by g.id, i.period
on conflict (goal_id, period) do update set amount = excluded.amount;

-- cel uznany za kupiony, gdy wszystkie stare pozycje były odhaczone
update budget_goals g set done = true
where exists (
    select 1 from budget_items i
    where i.bucket_id is null and lower(btrim(i.title)) = lower(g.title)
  )
  and not exists (
    select 1 from budget_items i
    where i.bucket_id is null and lower(btrim(i.title)) = lower(g.title) and not i.done
  );

-- stare wiersze Innych już niepotrzebne (worki zostają nietknięte)
delete from budget_items where bucket_id is null;
