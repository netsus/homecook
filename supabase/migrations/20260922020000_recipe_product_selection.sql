begin;

-- Keep the existing session, lifecycle, image and recovery transaction guards.
-- Patch only the ingredient insert; fail closed if its audited shape changes.
do $manual_product_selection$
declare
  v_signature regprocedure := 'public.create_manual_recipe_with_managed_image(uuid,timestamptz,text,integer,uuid,bigint,text,integer,text,text[],text,jsonb,jsonb,timestamptz)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_signature);
  v_original text := $original$  for v_item in
    select value
    from jsonb_array_elements(p_ingredients)
  loop
    insert into public.recipe_ingredients (
      recipe_id,
      ingredient_id,
      amount,
      unit,
      ingredient_type,
      display_text,
      scalable,
      sort_order
    ) values (
      v_recipe.id,
      (v_item ->> 'ingredient_id')::uuid,
      nullif(v_item ->> 'amount', '')::numeric,
      nullif(v_item ->> 'unit', ''),
      (v_item ->> 'ingredient_type')::public.recipe_ingredient_type,
      nullif(v_item ->> 'display_text', ''),
      coalesce((v_item ->> 'scalable')::boolean, true),
      coalesce((v_item ->> 'sort_order')::integer, 0)
    );
  end loop;
$original$;
  v_replacement text := $replacement$  for v_item in
    select value
    from jsonb_array_elements(p_ingredients)
  loop
    declare
      v_ingredient_id uuid := nullif(v_item ->> 'ingredient_id', '')::uuid;
      v_product_id uuid := nullif(v_item ->> 'food_product_id', '')::uuid;
      v_product_version_id uuid := nullif(v_item ->> 'food_product_nutrition_version_id', '')::uuid;
      v_linked_ingredient_id uuid;
    begin
      if (v_product_id is null) <> (v_product_version_id is null) then
        raise exception 'RECIPE_PRODUCT_UNAVAILABLE' using errcode = '22023';
      end if;

      if v_product_id is not null then
        -- Validate the exact version and current approved canonical link while
        -- holding row locks until the recipe and recovery receipt commit.
        select link.ingredient_id into v_linked_ingredient_id
        from public.food_products as product
        join public.food_product_nutrition_versions as version
          on version.product_id = product.id
         and version.id = v_product_version_id
        join public.food_product_ingredient_links as link
          on link.product_id = product.id
         and link.relation = 'represents'
         and link.review_status = 'approved'
         and link.is_primary
         and link.is_active
        join public.ingredients as ingredient on ingredient.id = link.ingredient_id
        where product.id = v_product_id
          and product.deleted_at is null
          and product.moderation_status = 'visible'
          and recipe_visibility_guard.is_owner_publicly_visible(product.owner_user_id)
          and (product.visibility = 'public'
            or (product.visibility = 'private' and product.owner_user_id = p_owner_uuid))
          and public.is_selectable_catalog_ingredient(ingredient.id)
        for share of product, version, link, ingredient;

        if v_linked_ingredient_id is null
          or v_linked_ingredient_id is distinct from v_ingredient_id then
          raise exception 'RECIPE_PRODUCT_UNAVAILABLE' using errcode = '22023';
        end if;
      end if;

      insert into public.recipe_ingredients (
        recipe_id,
        ingredient_id,
        amount,
        unit,
        ingredient_type,
        display_text,
        scalable,
        sort_order,
        food_product_id,
        food_product_nutrition_version_id
      ) values (
        v_recipe.id,
        v_ingredient_id,
        nullif(v_item ->> 'amount', '')::numeric,
        nullif(v_item ->> 'unit', ''),
        (v_item ->> 'ingredient_type')::public.recipe_ingredient_type,
        nullif(v_item ->> 'display_text', ''),
        coalesce((v_item ->> 'scalable')::boolean, true),
        coalesce((v_item ->> 'sort_order')::integer, 0),
        v_product_id,
        v_product_version_id
      );
    end;
  end loop;
$replacement$;
begin
  if (length(v_definition) - length(replace(v_definition, v_original, '')))
    / length(v_original) <> 1 then
    raise exception 'MANUAL_RECIPE_PRODUCT_SELECTION_SHAPE_CHANGED';
  end if;
  execute replace(v_definition, v_original, v_replacement);
end;
$manual_product_selection$;

-- The existing ranked search already authenticates its actor and controls
-- product visibility. Project only an approved, selectable recipe identity;
-- unlinked products remain usable for food logging with a null recipe identity.
-- No new public RPC or catalog-table privilege is introduced.
do $catalog_recipe_product$
declare
  v_signature regprocedure := 'public.search_food_catalog_ranked(uuid,text,text[],text,integer,jsonb,text,integer)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_signature);
  v_original text := $original$        'nutrition_version_id', context.nutrition_version_id,$original$;
  v_replacement text := $replacement$        'nutrition_version_id', context.nutrition_version_id,
        'recipe_ingredient_id', (
          select link.ingredient_id
          from public.food_product_ingredient_links as link
          join public.ingredients as ingredient on ingredient.id = link.ingredient_id
          where link.product_id = context.id
            and link.relation = 'represents'
            and link.review_status = 'approved'
            and link.is_primary
            and link.is_active
            and context.deleted_at is null
            and context.moderation_status = 'visible'
            and (context.visibility = 'public'
              or (context.visibility = 'private' and context.owner_user_id = p_actor_id))
            and public.is_selectable_catalog_ingredient(ingredient.id)
        ),$replacement$;
begin
  if (length(v_definition) - length(replace(v_definition, v_original, '')))
    / length(v_original) <> 1 then
    raise exception 'CATALOG_RECIPE_PRODUCT_PROJECTION_SHAPE_CHANGED';
  end if;
  execute replace(v_definition, v_original, v_replacement);
end;
$catalog_recipe_product$;

notify pgrst, 'reload schema';
commit;
