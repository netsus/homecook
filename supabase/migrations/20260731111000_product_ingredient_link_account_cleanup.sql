begin;

create or replace function public.delete_user_private_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_authored_recipe_ids uuid[] := '{}'::uuid[];
  v_preserved_recipe_ids uuid[] := '{}'::uuid[];
  v_private_recipe_ids uuid[] := '{}'::uuid[];
  v_private_content_snapshot_ids uuid[] := '{}'::uuid[];
  v_private_nutrition_snapshot_ids uuid[] := '{}'::uuid[];
  v_saved_recipe_ids uuid[] := '{}'::uuid[];
  v_liked_recipe_ids uuid[] := '{}'::uuid[];
  v_legacy_private_product_ids uuid[] := '{}'::uuid[];
  v_legacy_private_profile_ids uuid[] := '{}'::uuid[];
  v_private_session_ids uuid[] := '{}'::uuid[];
  v_private_meal_ids uuid[] := '{}'::uuid[];
  v_remaining_private_reference_count integer := 0;
  v_deleted_user_count integer := 0;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'cannot delete another user private data' using errcode = '42501';
  end if;

  perform public.recipe_snapshot_account_cleanup_guard(p_user_id);
  perform set_config('homecook.account_delete_user_id', p_user_id::text, true);

  select coalesce(array_agg(recipe.id), '{}'::uuid[]) into v_authored_recipe_ids
  from public.recipes as recipe
  where recipe.created_by = p_user_id;

  select coalesce(array_agg(recipe.id), '{}'::uuid[]) into v_private_recipe_ids
  from public.recipes as recipe
  where recipe.created_by = p_user_id
    and recipe.visibility = 'private';

  select coalesce(array_agg(recipe.id), '{}'::uuid[]) into v_preserved_recipe_ids
  from public.recipes as recipe
  where recipe.created_by = p_user_id
    and recipe.id <> all(v_private_recipe_ids);

  select coalesce(array_agg(snapshot.id), '{}'::uuid[]) into v_private_content_snapshot_ids
  from public.recipe_content_snapshots as snapshot
  where snapshot.owner_user_id = p_user_id;

  select coalesce(array_agg(snapshot.id), '{}'::uuid[]) into v_private_nutrition_snapshot_ids
  from public.recipe_nutrition_snapshots as snapshot
  where snapshot.owner_user_id = p_user_id;

  select coalesce(array_agg(distinct recipe_id), '{}'::uuid[]) into v_liked_recipe_ids
  from public.recipe_likes
  where user_id = p_user_id;

  select coalesce(array_agg(distinct rbi.recipe_id), '{}'::uuid[]) into v_saved_recipe_ids
  from public.recipe_book_items as rbi
  join public.recipe_books as rb on rb.id = rbi.book_id
  where rb.user_id = p_user_id;

  select coalesce(array_agg(distinct meal.id), '{}'::uuid[]) into v_private_meal_ids
  from public.meals as meal
  where meal.user_id = p_user_id
     or meal.recipe_id = any(v_private_recipe_ids);

  select coalesce(array_agg(distinct session.id), '{}'::uuid[]) into v_private_session_ids
  from public.cooking_sessions as session
  where session.user_id = p_user_id
     or exists (
       select 1
       from public.cooking_session_meals as session_meal
       where session_meal.session_id = session.id
         and (
           session_meal.meal_id = any(v_private_meal_ids)
           or session_meal.recipe_id = any(v_private_recipe_ids)
         )
     );

  select coalesce(array_agg(product.id), '{}'::uuid[])
    into v_legacy_private_product_ids
  from public.food_products as product
  where product.owner_user_id = p_user_id
    and product.visibility = 'private'
    and product.source_type = 'manual';

  select coalesce(array_agg(version.nutrition_profile_id), '{}'::uuid[])
    into v_legacy_private_profile_ids
  from public.food_product_nutrition_versions as version
  where version.product_id = any(v_legacy_private_product_ids);

  perform set_config(
    'homecook.account_delete_profile_ids',
    array_to_string(v_legacy_private_profile_ids, ','),
    true
  );

  delete from public.cooking_session_meal_claims
  where meal_id = any(v_private_meal_ids);

  delete from public.cooking_session_meals
  where meal_id = any(v_private_meal_ids)
     or session_id = any(v_private_session_ids)
     or recipe_id = any(v_private_recipe_ids);

  delete from public.cooking_sessions
  where id = any(v_private_session_ids);

  delete from public.meals
  where id = any(v_private_meal_ids);

  delete from public.leftover_dishes
  where user_id = p_user_id
     or recipe_id = any(v_private_recipe_ids);

  if cardinality(v_private_recipe_ids) > 0 then
    delete from public.recipe_content_snapshots
    where id = any(v_private_content_snapshot_ids);

    delete from public.recipe_nutrition_snapshots
    where id = any(v_private_nutrition_snapshot_ids);

    delete from public.recipe_book_items
    where recipe_id = any(v_private_recipe_ids);

    delete from public.recipe_likes
    where recipe_id = any(v_private_recipe_ids);

    delete from public.recipe_steps
    where recipe_id = any(v_private_recipe_ids);

    delete from public.recipe_ingredients
    where recipe_id = any(v_private_recipe_ids);

    delete from public.recipe_sources
    where recipe_id = any(v_private_recipe_ids);

    delete from public.recipes
    where id = any(v_private_recipe_ids);
  end if;

  if cardinality(v_legacy_private_product_ids) > 0 then
    -- Exact owner fence precedes reference cleanup and aggregate deletion.
    delete from public.pantry_items
    where user_id = p_user_id
      and food_product_id = any(v_legacy_private_product_ids);

    delete from public.shopping_list_items as item
    using public.shopping_lists as list
    where list.id = item.shopping_list_id
      and list.user_id = p_user_id
      and item.food_product_id = any(v_legacy_private_product_ids);

    delete from public.product_planner_entries
    where user_id = p_user_id
      and product_id = any(v_legacy_private_product_ids);

    select
      (select count(*) from public.pantry_items
       where food_product_id = any(v_legacy_private_product_ids))
      +
      (select count(*) from public.shopping_list_items
       where food_product_id = any(v_legacy_private_product_ids))
      +
      (select count(*) from public.product_planner_entries
       where product_id = any(v_legacy_private_product_ids))
    into v_remaining_private_reference_count;

    if v_remaining_private_reference_count <> 0 then
      raise exception 'private product references remain'
        using errcode = '23503';
    end if;

    perform set_config(
      'homecook.private_product_cleanup_user_id',
      p_user_id::text,
      true
    );
    set constraints food_products_current_version_fk deferred;

    delete from public.nutrition_values
    where profile_id = any(v_legacy_private_profile_ids);

    delete from public.food_products
    where id = any(v_legacy_private_product_ids)
      and owner_user_id = p_user_id
      and visibility = 'private';

    delete from public.nutrition_profiles
    where id = any(v_legacy_private_profile_ids)
      and not exists (
        select 1
        from public.food_product_nutrition_versions as version
        where version.nutrition_profile_id = nutrition_profiles.id
      );
  end if;

  -- owner_user_id is null public/shared products, versions, links and provenance are preserved.
  update public.food_products
  set owner_user_id = null, visibility = 'public', source_type = 'manual', updated_at = now()
  where owner_user_id = p_user_id
    and visibility = 'public'
    and source_type = 'manual';

  update public.food_product_nutrition_versions as version
  set created_by = null
  from public.food_products as product
  where product.id = version.product_id
    and product.owner_user_id is null
    and product.visibility = 'public'
    and product.source_type = 'manual'
    and version.created_by = p_user_id;

  update public.nutrition_profiles as profile
  set created_by = null
  from public.food_product_nutrition_versions as version
  join public.food_products as product on product.id = version.product_id
  where profile.id = version.nutrition_profile_id
    and product.owner_user_id is null
    and product.visibility = 'public'
    and product.source_type = 'manual'
    and profile.created_by = p_user_id;

  delete from public.users
  where id = p_user_id;
  get diagnostics v_deleted_user_count = row_count;

  if cardinality(v_saved_recipe_ids) > 0 then
    update public.recipes as recipe
    set save_count = (
      select count(*)::integer
      from public.recipe_book_items as item
      where item.recipe_id = recipe.id
    )
    where recipe.id = any(v_saved_recipe_ids);
  end if;

  if cardinality(v_liked_recipe_ids) > 0 then
    update public.recipes as recipe
    set like_count = (
      select count(*)::integer
      from public.recipe_likes as like_row
      where like_row.recipe_id = recipe.id
    )
    where recipe.id = any(v_liked_recipe_ids);
  end if;

  return jsonb_build_object(
    'deleted', true,
    'user_deleted', v_deleted_user_count > 0,
    'preserved_recipe_count', cardinality(v_preserved_recipe_ids),
    'deleted_private_recipe_count', cardinality(v_private_recipe_ids)
  );
end;
$$;

revoke all on function public.delete_user_private_data(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_user_private_data(uuid)
  to service_role;

commit;
