begin;

-- The session-attempt route reads this RPC, not the legacy cooking/session
-- reader. Keep its authority and pinned snapshot identity; enrich only its
-- ingredient labels, preserving original JSON fields and original row order.
do $cook_mode_product_labels$
declare
  v_signature regprocedure := 'public.read_snapshot_v2_cook_mode(uuid,timestamptz,text,integer,timestamptz,uuid,timestamptz)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_signature);
  v_original text := $original$    'ingredients', v_snapshot.ingredients_json,$original$;
  v_replacement text := $replacement$    'ingredients', (
      select coalesce(jsonb_agg(
        ingredient.value || jsonb_build_object(
          'standard_name', coalesce(
            case when nullif(ingredient.value ->> 'food_product_id', '') is not null
              and nullif(ingredient.value ->> 'food_product_name', '') is not null
            then concat_ws(' · ',
              nullif(ingredient.value ->> 'food_product_brand', ''),
              ingredient.value ->> 'food_product_name') end,
            nullif(ingredient.value ->> 'standard_name', ''),
            dictionary.standard_name,
            '재료'
          )
        ) order by ingredient.position
      ), '[]'::jsonb)
      from jsonb_array_elements(v_snapshot.ingredients_json) with ordinality
        as ingredient(value, position)
      left join public.ingredients as dictionary
        on dictionary.id = (ingredient.value ->> 'ingredient_id')::uuid
    ),$replacement$;
begin
  if (length(v_definition) - length(replace(v_definition, v_original, '')))
    / length(v_original) <> 1 then
    raise exception 'SNAPSHOT_COOK_MODE_PRODUCT_LABEL_SHAPE_CHANGED';
  end if;
  v_definition := replace(v_definition, v_original, v_replacement);
  -- The canonical catalog column is standard_name. The old reader retained a
  -- historical fixture-only name reference in pantry candidates.
  v_definition := replace(v_definition, 'dictionary.name', 'dictionary.standard_name');
  execute v_definition;
end;
$cook_mode_product_labels$;

notify pgrst, 'reload schema';
commit;
