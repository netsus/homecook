begin;

do $test$
declare
  v_name text;
begin
  foreach v_name in array array['큰 사이즈 두부', '맛술(미림)', '스파게티'] loop
    if exists (
      select 1 from public.ingredients ingredient
      where ingredient.search_name = public.normalize_ingredient_search_name(v_name)
        and public.is_selectable_catalog_ingredient(ingredient.id)
    ) or exists (
      select 1 from public.ingredient_synonyms synonym
      where synonym.search_name = public.normalize_ingredient_search_name(v_name)
        and public.is_selectable_catalog_ingredient(synonym.ingredient_id)
    ) then
      raise exception 'baseline exact catalog unexpectedly links %', v_name;
    end if;
  end loop;
end;
$test$;

rollback;
