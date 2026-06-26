-- Rollback for FoodSafety reviewed pilot recipe seed.
-- Scope:
--   - 20260626104000_seed_foodsafety_pilot_recipes.sql
--
-- Important:
-- - This removes only the 30 reviewed FoodSafety pilot system recipes.
-- - It intentionally does not undo shared ingredient taxonomy follow-up migrations:
--   20260626102000_unify_olive_oil_ingredient.sql
--   20260626103000_foodsafety_pilot_ingredient_followup.sql
-- - The script stops if any pilot recipe has user-facing references such as
--   saved recipes, likes, planner meals, shopping lists, or cooking sessions.

begin;

create temporary table _foodsafety_pilot_recipe_ids (
  id uuid primary key
) on commit drop;

insert into _foodsafety_pilot_recipe_ids (id)
select r.id
  from public.recipes r
  join public.recipe_sources rs
    on rs.recipe_id = r.id
 where r.source_type = 'system'
   and r.created_by is null
   and rs.extraction_meta_json ->> 'source_provider' = 'foodsafety-cookrcp'
   and rs.extraction_meta_json ->> 'reviewed_scope' = 'pilot_30_user_reviewed';

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from _foodsafety_pilot_recipe_ids;

  if v_count = 0 then
    raise notice 'No FoodSafety pilot recipe seed rows found. Nothing to rollback.';
  elsif v_count <> 30 then
    raise exception
      'Expected 0 or 30 FoodSafety pilot recipe rows, found %. Refusing partial rollback.',
      v_count;
  end if;
end $$;

create temporary table _foodsafety_pilot_blocking_refs (
  table_name text primary key,
  row_count bigint not null
) on commit drop;

insert into _foodsafety_pilot_blocking_refs (table_name, row_count)
select 'recipe_book_items', count(*)
  from public.recipe_book_items
 where recipe_id in (select id from _foodsafety_pilot_recipe_ids)
union all
select 'recipe_likes', count(*)
  from public.recipe_likes
 where recipe_id in (select id from _foodsafety_pilot_recipe_ids)
union all
select 'meals', count(*)
  from public.meals
 where recipe_id in (select id from _foodsafety_pilot_recipe_ids)
union all
select 'shopping_list_recipes', count(*)
  from public.shopping_list_recipes
 where recipe_id in (select id from _foodsafety_pilot_recipe_ids)
union all
select 'cooking_session_meals', count(*)
  from public.cooking_session_meals
 where recipe_id in (select id from _foodsafety_pilot_recipe_ids)
union all
select 'youtube_extraction_sessions', count(*)
  from public.youtube_extraction_sessions
 where recipe_id in (select id from _foodsafety_pilot_recipe_ids)
union all
select 'youtube_extraction_candidates', count(*)
  from public.youtube_extraction_candidates
 where recipe_id in (select id from _foodsafety_pilot_recipe_ids);

do $$
declare
  v_blockers jsonb;
begin
  select jsonb_object_agg(table_name, row_count order by table_name)
    into v_blockers
    from _foodsafety_pilot_blocking_refs
   where row_count > 0;

  if v_blockers is not null then
    raise exception
      'FoodSafety pilot recipes have user-facing references. Refusing rollback: %',
      v_blockers;
  end if;
end $$;

delete from public.recipe_sources
 where recipe_id in (select id from _foodsafety_pilot_recipe_ids);

delete from public.recipe_ingredients
 where recipe_id in (select id from _foodsafety_pilot_recipe_ids);

delete from public.recipe_steps
 where recipe_id in (select id from _foodsafety_pilot_recipe_ids);

delete from public.recipe_tags
 where recipe_id in (select id from _foodsafety_pilot_recipe_ids);

delete from public.recipes
 where id in (select id from _foodsafety_pilot_recipe_ids)
   and source_type = 'system'
   and created_by is null;

select *
  from public.reconcile_recipe_tag_usage_counts(false);

commit;
