-- Kosmetyki: dwustopniowa samoocena źle/dobrze zamiast odhaczania.
-- Stare logi (✓ = 1) pasują do nowej skali (dobrze = 1) — bez konwersji.

update habits
set input_kind = 'scale2'
where area = 'kosmetyki'
  and input_kind = 'check';
