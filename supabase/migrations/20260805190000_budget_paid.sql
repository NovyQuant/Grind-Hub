-- =====================================================================
-- Budżet: status „opłacone" (czerwony/zielony) + rozbicie Stałych.
-- =====================================================================

-- Czy dana kwota już wyszła / wpłynęła
alter table budget_alloc add column if not exists paid boolean not null default false;
alter table budget_months add column if not exists income_paid boolean not null default false;
alter table budget_months add column if not exists other_paid boolean not null default false;

-- „Stałe" → „Czynsz", plus nowa kolumna „Na życie" tuż za nim
update budget_buckets
   set label = 'Czynsz', icon = '🔑'
 where id = '11111111-0000-4000-8000-000000000001';

update budget_buckets set sort_order = sort_order + 1 where sort_order >= 2;

insert into budget_buckets (id, label, icon, sort_order)
values ('11111111-0000-4000-8000-000000000007', 'Na życie', '🍜', 2)
on conflict (id) do nothing;

-- Miesiące już zamknięte (wcześniejsze niż bieżący) lecą jako opłacone
update budget_alloc set paid = true where period < to_char(current_date, 'YYYY-MM');
update budget_months
   set income_paid = true, other_paid = true
 where period < to_char(current_date, 'YYYY-MM');
