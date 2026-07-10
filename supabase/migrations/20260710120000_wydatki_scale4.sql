-- Wydatki: samoocena 4-stopniowa (dobrze/okej/źle/bardzo źle) zamiast kwoty zł.
-- Stare logi zł konwertowane na nową skalę wg dotychczasowego scoringu at_most
-- (strefa wolna 50 zł, falloff 250): ≤50 → dobrze, ≤150 → okej, ≤300 → źle, dalej → bardzo źle.
-- ODWRACALNE: oryginalna kwota zł zachowana w note ('zł=...'), więc nic nie ginie.

update logs l
set note = trim(coalesce(l.note || ' ', '') || 'zł=' || l.value::text),
    value = case
      when l.value <= 50 then 1
      when l.value <= 150 then 0.8
      when l.value <= 300 then 0.4
      else 0
    end
from habits h
where h.id = l.habit_id
  and h.area = 'finanse'
  and h.input_kind = 'number';

update habits
set name = 'Wydatki',
    input_kind = 'scale4',
    score_mode = null,
    daily_target = null,
    target_high = null,
    falloff = null
where area = 'finanse'
  and input_kind = 'number';
