-- Slice 21 follow-up: seed ingredients observed in the pork-galbi YouTube
-- failure case. This migration is DML-only and does not overwrite curated rows.

insert into public.ingredients (standard_name, category, default_unit)
values
  ('목살', '육류', 'g'),
  ('맛술', '양념', null),
  ('물엿', '양념', null),
  ('올리고당', '양념', null),
  ('연겨자', '양념', null),
  ('물', '기타', 'ml')
on conflict (standard_name) do nothing;

insert into public.ingredient_synonyms (ingredient_id, synonym)
select i.id, lower(trim(v.synonym))
from (values
  ('목살', '돼지목살'),
  ('목살', '돼지 목살'),
  ('맛술', '미림'),
  ('맛술', 'cooking wine'),
  ('물엿', 'corn syrup'),
  ('올리고당', '올리고당시럽'),
  ('연겨자', '겨자'),
  ('연겨자', 'mustard'),
  ('물', 'water')
) as v(standard_name, synonym)
join public.ingredients i on i.standard_name = v.standard_name
where trim(v.synonym) <> ''
on conflict (ingredient_id, synonym) do nothing;
