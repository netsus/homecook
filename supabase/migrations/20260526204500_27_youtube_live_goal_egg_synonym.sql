-- Slice 27 goal-mode follow-up: resolve prepared egg topping names observed in
-- live YouTube descriptions to the existing egg ingredient.
-- DML-only, idempotent.

insert into public.ingredient_synonyms (ingredient_id, synonym)
select i.id, lower(trim(v.synonym))
from (values
  ('달걀', '계란프라이'),
  ('달걀', '계란 프라이'),
  ('달걀', '달걀프라이'),
  ('달걀', '달걀 프라이')
) as v(standard_name, synonym)
join public.ingredients i on i.standard_name = v.standard_name
where trim(v.synonym) <> ''
on conflict (ingredient_id, synonym) do nothing;
