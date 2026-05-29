-- Slice 29 author-comment app-route smoke follow-up: resolve true
-- ingredient aliases observed in real author comments. DML-only and idempotent.

insert into public.ingredient_synonyms (ingredient_id, synonym)
select i.id, lower(trim(v.synonym))
from (values
  ('삼겹살', '통삼겹'),
  ('삼겹살', '통삼겹살'),
  ('전분가루', '타피오카전분'),
  ('전분가루', '타피오카 전분')
) as v(standard_name, synonym)
join public.ingredients i on i.standard_name = v.standard_name
where trim(v.synonym) <> ''
on conflict (ingredient_id, synonym) do nothing;
