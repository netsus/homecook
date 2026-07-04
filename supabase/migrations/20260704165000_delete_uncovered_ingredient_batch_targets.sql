-- Remove user-requested ingredient image backlog targets from the standard dictionary.
-- DML-only and idempotent. Reference rows are removed first because
-- recipe_ingredients and shopping_list_items use restrict-style ingredient FKs.

create or replace function pg_temp.delete_ingredient_name(p_name text)
returns void
language plpgsql
as $$
declare
  v_ingredient_id uuid;
begin
  select id
    into v_ingredient_id
    from public.ingredients
   where standard_name = p_name;

  if v_ingredient_id is null then
    return;
  end if;

  delete from public.recipe_ingredients
   where ingredient_id = v_ingredient_id;

  delete from public.shopping_list_items
   where ingredient_id = v_ingredient_id;

  update public.recipe_steps
     set ingredients_used = coalesce(
       (
         select jsonb_agg(ingredient_used)
           from jsonb_array_elements(recipe_steps.ingredients_used) as ingredient_used
          where ingredient_used::text not like '%' || v_ingredient_id::text || '%'
       ),
       '[]'::jsonb
     )
   where ingredients_used::text like '%' || v_ingredient_id::text || '%';

  delete from public.ingredient_synonyms
   where ingredient_id = v_ingredient_id;

  delete from public.pantry_items
   where ingredient_id = v_ingredient_id;

  delete from public.ingredient_bundle_items
   where ingredient_id = v_ingredient_id;

  delete from public.ingredients
   where id = v_ingredient_id;
end;
$$;

select pg_temp.delete_ingredient_name(v.standard_name)
from (values
  ('조미료'),
  ('허니머스타드 소스'),
  ('육수'),
  ('젤리'),
  ('초코바'),
  ('푸딩'),
  ('즉석밥 작은 거'),
  ('초밥용 밥'),
  ('따뜻한 우유'),
  ('스크램블드에그'),
  ('멸치 육수'),
  ('어묵 국물'),
  ('다시마 육수')
) as v(standard_name);
