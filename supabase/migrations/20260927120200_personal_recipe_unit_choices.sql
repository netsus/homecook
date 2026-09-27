-- Validate unit choices at the authoritative writer, after source access and
-- revision checks, before replacing ingredient rows. Existing source units can
-- be retained for the same ingredient/component; submitted text is not trusted.
begin;
do $unit_choices$
declare
  v_definition text := pg_get_functiondef('public.write_personal_recipe_core(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,jsonb,jsonb,uuid,bigint,uuid,timestamptz)'::regprocedure);
  v_anchor text := '    if jsonb_array_length(coalesce(p_tags, ''[]''::jsonb)) > 20 then';
  v_guard text := $guard$
    -- personal_recipe_unit_choices_v1
    if exists (
      select 1 from jsonb_array_elements(p_draft -> 'ingredients') as item
      where item ->> 'ingredient_type' = 'QUANT'
        and not coalesce(item ->> 'unit' = any(array[
          'g','ml','kg','l','개','장','대','모','큰술','작은술','컵',
          'tbsp','tsp','cup','piece','pieces','T','t',
          '스푼','밥숟갈','숟갈','숟가락','왕큰술','티스푼'
        ]), false)
        and not exists (
          select 1 from public.recipe_ingredients as original
          where original.recipe_id = case when p_operation in ('fork','save_as_new')
            then p_source_recipe_id else p_recipe_id end
            and original.ingredient_id = (item ->> 'ingredient_id')::uuid
            and coalesce(nullif(btrim(original.component_label), ''), '')
              = coalesce(nullif(btrim(item ->> 'component_label'), ''), '')
            and original.unit = item ->> 'unit'
        )
    ) then
      raise exception 'VALIDATION_ERROR' using errcode = '22023';
    end if;

$guard$;
begin
  if strpos(v_definition, 'personal_recipe_unit_choices_v1') > 0 then return; end if;
  if (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'PERSONAL_RECIPE_UNIT_CHOICES_SOURCE_DRIFT';
  end if;
  execute replace(v_definition, v_anchor, v_guard || v_anchor);
end;
$unit_choices$;

-- New manual recipes have no source-unit exception. Keep the existing owner,
-- lifecycle, session, product and managed-image checks around this small guard.
do $manual_unit_choices$
declare
  v_definition text := pg_get_functiondef('public.create_manual_recipe_with_managed_image(uuid,timestamptz,text,integer,uuid,bigint,text,integer,text,text[],text,jsonb,jsonb,timestamptz)'::regprocedure);
  v_anchor text := '  insert into public.recipes (';
  v_guard text := $guard$
  -- manual_recipe_unit_choices_v1
  if exists (
    select 1 from jsonb_array_elements(p_ingredients) as item
    where item ->> 'ingredient_type' = 'QUANT'
      and not coalesce(item ->> 'unit' = any(array[
        'g','ml','kg','l','개','장','대','모','큰술','작은술','컵',
        'tbsp','tsp','cup','piece','pieces','T','t',
        '스푼','밥숟갈','숟갈','숟가락','왕큰술','티스푼'
      ]), false)
  ) then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

$guard$;
begin
  if strpos(v_definition, 'manual_recipe_unit_choices_v1') > 0 then return; end if;
  if (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'MANUAL_RECIPE_UNIT_CHOICES_SOURCE_DRIFT';
  end if;
  execute replace(v_definition, v_anchor, v_guard || v_anchor);
end;
$manual_unit_choices$;
commit;
