-- Slice 27 goal-mode follow-up: true ingredient gaps surfaced after parsing
-- inline heading payloads in multi-recipe YouTube descriptions.
-- DML-only, idempotent.

insert into public.ingredients (standard_name, category, default_unit)
values
  ('달래', '채소', null),
  ('느타리버섯', '채소', null),
  ('소고기', '육류', null),
  ('훈제오리', '육류', null)
on conflict (standard_name) do nothing;

insert into public.ingredient_synonyms (ingredient_id, synonym)
select i.id, lower(trim(v.synonym))
from (values
  ('느타리버섯', '느타리 버섯'),
  ('소고기', '소고기 다짐육'),
  ('소고기', '다진 소고기'),
  ('훈제오리', '훈제 오리')
) as v(standard_name, synonym)
join public.ingredients i on i.standard_name = v.standard_name
where trim(v.synonym) <> ''
on conflict (ingredient_id, synonym) do nothing;
