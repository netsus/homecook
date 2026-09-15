begin;

-- Retain the snapshot identity without pretending a deleted catalog row exists.
alter table public.shopping_list_items
  add column unavailable_ingredient_id uuid,
  alter column display_text type text;

alter table public.shopping_list_items
  drop constraint shopping_list_items_identity_xor_check,
  add constraint shopping_list_items_identity_xor_check check (
    (
      unavailable_ingredient_id is null
      and (
        (ingredient_id is not null and food_product_id is null
          and food_product_nutrition_version_id is null)
        or (ingredient_id is null and food_product_id is not null
          and food_product_nutrition_version_id is not null)
      )
    )
    or (
      unavailable_ingredient_id is not null
      and ingredient_id is null and food_product_id is null
      and food_product_nutrition_version_id is null
      and nullif(btrim(display_text), '') is not null
      and not added_to_pantry
    )
  );

-- Patch only the final insert. The existing owner, snapshot membership,
-- completeness, split and product checks must still see the original IDs.
do $migration$
declare
  v_definition text;
  v_before text;
  v_after text;
begin
  select pg_get_functiondef(
    'public.create_shopping_list_from_payload(uuid,text,date,date,boolean,uuid[],jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure
  ) into v_definition;

  v_before := E'insert into public.shopping_list_items (\n        shopping_list_id,\n        ingredient_id,';
  v_after := E'insert into public.shopping_list_items (\n        shopping_list_id,\n        unavailable_ingredient_id,\n        ingredient_id,';
  if strpos(v_definition, v_before) = 0 then
    raise exception 'SHOPPING_CREATE_INSERT_SHAPE_CHANGED';
  end if;
  v_definition := replace(v_definition, v_before, v_after);

  v_before := E'v_list_id,\n        nullif(row ->> ''ingredient_id'', '''')::uuid,';
  v_after := E'v_list_id,\n        case when catalog.id is null then nullif(row ->> ''ingredient_id'', '''')::uuid end,\n        catalog.id,';
  if strpos(v_definition, v_before) = 0 then
    raise exception 'SHOPPING_CREATE_IDENTITY_SHAPE_CHANGED';
  end if;
  v_definition := replace(v_definition, v_before, v_after);

  v_before := E'      ) as row;\n    end if;\n\n    for v_item, v_original in';
  v_after := E'      ) as row\n      left join lateral (\n        select ingredient.id\n        from public.ingredients as ingredient\n        where ingredient.id = nullif(row ->> ''ingredient_id'', '''')::uuid\n        for key share\n      ) as catalog on true;\n    end if;\n\n    for v_item, v_original in';
  if strpos(v_definition, v_before) = 0 then
    raise exception 'SHOPPING_CREATE_SOURCE_SHAPE_CHANGED';
  end if;
  execute replace(v_definition, v_before, v_after);
end
$migration$;

comment on column public.shopping_list_items.unavailable_ingredient_id is
  'Original ingredient ID validated against the selected immutable snapshot when the catalog row is missing. Never infer a replacement or reflect this text-only item into pantry.';

commit;
