create or replace function public.normalize_recipe_nutrition_unit(p_unit text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case btrim(coalesce(p_unit, ''))
    when 'T' then 'tbsp'
    when 't' then 'tsp'
    else case lower(btrim(coalesce(p_unit, '')))
      when '스푼' then 'tbsp'
      when '큰술' then 'tbsp'
      when '밥숟갈' then 'tbsp'
      when '숟갈' then 'tbsp'
      when '숟가락' then 'tbsp'
      when '왕큰술' then 'tbsp'
      when '작은술' then 'tsp'
      when '티스푼' then 'tsp'
      when '컵' then 'cup'
      else lower(btrim(coalesce(p_unit, '')))
    end
  end;
$$;

revoke all on function public.normalize_recipe_nutrition_unit(text)
from public, anon, authenticated;
grant execute on function public.normalize_recipe_nutrition_unit(text)
to service_role;
