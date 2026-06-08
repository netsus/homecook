-- Kelp chili paste live extraction follow-up: resolve true ingredients that
-- Gemini recovered from noisy captions but the DB dictionary could not match.
-- DML-only and idempotent.

insert into public.ingredients (standard_name, category, default_unit)
values
  ('다시마', '해산물', null),
  ('멸치', '해산물', null),
  ('고추', '채소', null)
on conflict (standard_name) do nothing;

insert into public.ingredient_synonyms (ingredient_id, synonym)
select i.id, lower(trim(v.synonym))
from (values
  ('다시마', 'kelp'),
  ('멸치', 'anchovy'),
  ('고추', '풋고추'),
  ('고추', 'green chili pepper')
) as v(standard_name, synonym)
join public.ingredients i on i.standard_name = v.standard_name
where trim(v.synonym) <> ''
on conflict (ingredient_id, synonym) do nothing;
