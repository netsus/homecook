begin;

-- Recent food names and positions can change. Resolve the exact identity under
-- the same actor, visibility and lifecycle rules as ranked catalog search.
create function public.read_food_catalog_source(
  p_actor_id uuid,
  p_source_type text,
  p_source_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_item jsonb;
  v_recipe_ingredient_id uuid;
begin
  perform public.assert_food_product_actor(p_actor_id);
  if p_source_type is null or p_source_type not in ('ingredient', 'food_product')
    or p_source_id is null then
    raise exception 'INVALID_SEARCH_FILTER' using errcode = '22023';
  end if;

  if p_source_type = 'ingredient' then
    select jsonb_build_object(
      'type', 'ingredient', 'id', ingredient.id,
      'standard_name', ingredient.standard_name, 'category', ingredient.category,
      'default_unit', ingredient.default_unit
    ) into v_item
    from public.ingredients as ingredient
    where ingredient.id = p_source_id
      and public.is_selectable_catalog_ingredient(ingredient.id);
    return v_item;
  end if;

  if not exists (
    select 1 from public.food_products as product
    where product.id = p_source_id
      and product.deleted_at is null
      and product.moderation_status = 'visible'
      and recipe_visibility_guard.is_owner_publicly_visible(product.owner_user_id)
      and (product.visibility = 'public'
        or (product.visibility = 'private' and product.owner_user_id = p_actor_id))
  ) then
    return null;
  end if;

  v_item := public.food_product_payload(p_source_id, p_actor_id);
  if v_item is null then return null; end if;
  select link.ingredient_id into v_recipe_ingredient_id
  from public.food_product_ingredient_links as link
  join public.ingredients as ingredient on ingredient.id = link.ingredient_id
  where link.product_id = p_source_id
    and link.relation = 'represents' and link.review_status = 'approved'
    and link.is_primary and link.is_active
    and public.is_selectable_catalog_ingredient(ingredient.id);
  return v_item || jsonb_build_object(
    'type', 'food_product', 'recipe_ingredient_id', v_recipe_ingredient_id
  );
end;
$function$;

alter function public.read_food_catalog_source(uuid,text,uuid) owner to postgres;
revoke all on function public.read_food_catalog_source(uuid,text,uuid)
  from public, anon, authenticated, service_role;
-- The request-scoped app Data client uses the authenticated role. The actor
-- assertion above rejects a caller-supplied identity different from auth.uid().
grant execute on function public.read_food_catalog_source(uuid,text,uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
