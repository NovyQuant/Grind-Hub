-- Cena pozycji zakupowej (zł, null = nie podano).
alter table shopping_items add column if not exists price numeric;
