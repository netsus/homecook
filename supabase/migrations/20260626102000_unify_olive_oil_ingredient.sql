do $$
declare
  v_canonical_id uuid;
  v_duplicate_id uuid;
begin
  select id
    into v_canonical_id
    from public.ingredients
   where standard_name = '올리브 오일';

  select id
    into v_duplicate_id
    from public.ingredients
   where standard_name = '올리브유';

  if v_canonical_id is null and v_duplicate_id is not null then
    update public.ingredients
       set standard_name = '올리브 오일'
     where id = v_duplicate_id;

    v_canonical_id := v_duplicate_id;
    v_duplicate_id := null;
  end if;

  if v_canonical_id is null then
    return;
  end if;

  insert into public.ingredient_synonyms (ingredient_id, synonym)
  values (v_canonical_id, '올리브유')
  on conflict (ingredient_id, synonym) do nothing;

  if v_duplicate_id is null or v_canonical_id = v_duplicate_id then
    delete from public.ingredient_synonyms
     where ingredient_id = v_canonical_id
       and lower(trim(synonym)) = lower('올리브 오일');

    return;
  end if;

  insert into public.ingredient_synonyms (ingredient_id, synonym)
  select v_canonical_id, synonym
    from public.ingredient_synonyms
   where ingredient_id = v_duplicate_id
     and lower(trim(synonym)) <> lower('올리브 오일')
     and lower(trim(synonym)) <> ''
  on conflict (ingredient_id, synonym) do nothing;

  delete from public.ingredient_synonyms
   where ingredient_id = v_duplicate_id;

  delete from public.pantry_items duplicate_pantry
   where duplicate_pantry.ingredient_id = v_duplicate_id
     and exists (
       select 1
         from public.pantry_items canonical_pantry
        where canonical_pantry.user_id = duplicate_pantry.user_id
          and canonical_pantry.ingredient_id = v_canonical_id
     );

  update public.pantry_items
     set ingredient_id = v_canonical_id
   where ingredient_id = v_duplicate_id;

  delete from public.ingredient_bundle_items duplicate_bundle_item
   where duplicate_bundle_item.ingredient_id = v_duplicate_id
     and exists (
       select 1
         from public.ingredient_bundle_items canonical_bundle_item
        where canonical_bundle_item.bundle_id = duplicate_bundle_item.bundle_id
          and canonical_bundle_item.ingredient_id = v_canonical_id
     );

  update public.ingredient_bundle_items
     set ingredient_id = v_canonical_id
   where ingredient_id = v_duplicate_id;

  update public.recipe_ingredients
     set ingredient_id = v_canonical_id
   where ingredient_id = v_duplicate_id;

  update public.shopping_list_items
     set ingredient_id = v_canonical_id
   where ingredient_id = v_duplicate_id;

  update public.recipe_steps
     set ingredients_used = replace(ingredients_used::text, v_duplicate_id::text, v_canonical_id::text)::jsonb
   where ingredients_used::text like '%' || v_duplicate_id::text || '%';

  delete from public.ingredients
   where id = v_duplicate_id;
end $$;
