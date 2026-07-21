create or replace function public.normalize_recipe_nutrition_unit(p_unit text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select case lower(btrim(coalesce(p_unit, '')))
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
  end;
$$;

revoke all on function public.normalize_recipe_nutrition_unit(text)
from public, anon, authenticated;
grant execute on function public.normalize_recipe_nutrition_unit(text)
to service_role;

do $rewrite_recipe_nutrition_unit_guards$
declare
  v_definition text;
  v_rewritten text;
begin
  v_definition := pg_get_functiondef(
    'public.build_recipe_nutrition_input_guard(uuid)'::regprocedure
  );
  v_rewritten := replace(
    v_definition,
    $input_guard_needle$lower(btrim(coalesce(ingredient.unit, '')))$input_guard_needle$,
    $input_guard_replacement$public.normalize_recipe_nutrition_unit(ingredient.unit)$input_guard_replacement$
  );
  if v_rewritten = v_definition
    or position(
      $input_guard_needle$lower(btrim(coalesce(ingredient.unit, '')))$input_guard_needle$
      in v_rewritten
    ) > 0
  then
    raise exception 'RECIPE_NUTRITION_INPUT_GUARD_REWRITE_FAILED';
  end if;
  execute v_rewritten;

  v_definition := pg_get_functiondef(
    'public.build_recipe_nutrition_contributing_sources(jsonb)'::regprocedure
  );
  v_rewritten := replace(
    v_definition,
    $source_guard_needle$lower(btrim(coalesce(guard_ingredient.ingredient ->> 'unit', '')))$source_guard_needle$,
    $source_guard_replacement$public.normalize_recipe_nutrition_unit(guard_ingredient.ingredient ->> 'unit')$source_guard_replacement$
  );
  if v_rewritten = v_definition
    or position(
      $source_guard_needle$lower(btrim(coalesce(guard_ingredient.ingredient ->> 'unit', '')))$source_guard_needle$
      in v_rewritten
    ) > 0
  then
    raise exception 'RECIPE_NUTRITION_SOURCE_GUARD_REWRITE_FAILED';
  end if;
  execute v_rewritten;
end
$rewrite_recipe_nutrition_unit_guards$;
