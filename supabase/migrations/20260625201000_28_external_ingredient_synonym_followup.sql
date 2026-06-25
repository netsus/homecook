-- Launch 28 follow-up: preserve reviewed source terms as synonyms for canonical ingredients.
-- These rows let recipe import/search resolve the original extracted names to the reviewed canonical rows.

insert into public.ingredient_synonyms (id, ingredient_id, synonym)
select v.id, i.id, lower(trim(v.synonym))
from (values
  ('aef8a96a-e237-52bf-a221-6ea2fd9795a1'::uuid, '레몬즙', '레몬착즙'),
  ('8a8fdf79-e7a3-5de5-8cf2-e2c54791f2de'::uuid, '쌀밥', '멥쌀밥')
) as v(id, standard_name, synonym)
join public.ingredients i
  on i.standard_name = v.standard_name
where lower(trim(v.synonym)) <> lower(trim(v.standard_name))
on conflict do nothing;
