begin;

-- New direct ingredient entries and previews use the same source preference.
-- Existing entries keep their pinned link; this selector is never used there.
create function private.preferred_meal_log_ingredient_profile(p_ingredient_id uuid)
returns uuid language sql stable security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
  select link.id
  from public.ingredient_nutrition_profiles link
  join public.nutrition_profiles profile on profile.id = link.nutrition_profile_id
  left join public.nutrition_source_items item on item.id = profile.source_item_id
  left join public.nutrition_sources source on source.id = item.source_id
  where link.ingredient_id = p_ingredient_id
    and link.is_primary and link.is_active and link.review_status = 'approved'
  order by case when source.provider_code = 'HOMECOOK_AI_ESTIMATE' then 1 else 0 end,
    link.id
  limit 1;
$function$;
alter function private.preferred_meal_log_ingredient_profile(uuid) owner to postgres;
revoke all on function private.preferred_meal_log_ingredient_profile(uuid)
  from public, anon, authenticated, service_role;

-- AI amounts retain their distinct status and public provider. Existing v2
-- snapshot keys, six-key sources, official input guards/hashes and all pinned
-- historical values remain unchanged. This migration writes no application rows.
-- Checked edits retain every existing function signature and privilege boundary.
do $patch_consumers$
declare
  patch record;
  v_oid regprocedure;
  v_definition text;
  v_count integer;
begin
  for patch in select * from (values
    ('public.preview_meal_log_nutrition(uuid,timestamptz,text,integer,timestamptz,text,uuid,numeric,text)', $old$select id into v_profile from public.ingredient_nutrition_profiles
  where ingredient_id=p_source_id and is_primary and is_active and review_status='approved';$old$, $new$select private.preferred_meal_log_ingredient_profile(p_source_id) into v_profile;$new$, 1),
    ('private.mutate_meal_log_entry_prelaunch_20260919(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz)', $old$else select profile.id into v_ingredient_profile from public.ingredient_nutrition_profiles profile
        where profile.ingredient_id=v_source_id and profile.is_primary and profile.is_active and profile.review_status='approved';$old$, $new$else select private.preferred_meal_log_ingredient_profile(v_source_id) into v_ingredient_profile;$new$, 1),
    ('private.build_recipe_nutrition_input_guard_pre_product_20260922(uuid)', $old$  cross join lateral (
    select
      unit_flags.is_volume_input,$old$, $new$  cross join lateral (
    select
      count(*) filter (where candidate ->> 'basis_unit' = 'g') as mass_count,
      count(*) filter (where candidate ->> 'basis_unit' = 'ml') as volume_count,
      (array_agg((candidate ->> 'link_id')::uuid order by candidate ->> 'link_id' collate "C")
        filter (where candidate ->> 'basis_unit' = 'g'))[1] as single_mass_link_id,
      (array_agg((candidate ->> 'link_id')::uuid order by candidate ->> 'link_id' collate "C")
        filter (where candidate ->> 'basis_unit' = 'ml'))[1] as single_volume_link_id
    from jsonb_array_elements(nutrition.candidates) candidate
    where candidate #>> '{source,provider}' is distinct from 'HOMECOOK_AI_ESTIMATE'
      or not exists (
        select 1 from jsonb_array_elements(nutrition.candidates) official
        where official #>> '{source,provider}' is distinct from 'HOMECOOK_AI_ESTIMATE'
      )
  ) preferred
  cross join lateral (
    select
      unit_flags.is_volume_input,$new$, 1),
    ('private.build_recipe_nutrition_input_guard_pre_product_20260922(uuid)', $old$nutrition.mass_count$old$, $new$preferred.mass_count$new$, 6),
    ('private.build_recipe_nutrition_input_guard_pre_product_20260922(uuid)', $old$nutrition.volume_count$old$, $new$preferred.volume_count$new$, 6),
    ('private.build_recipe_nutrition_input_guard_pre_product_20260922(uuid)', $old$nutrition.single_mass_link_id$old$, $new$preferred.single_mass_link_id$new$, 2),
    ('private.build_recipe_nutrition_input_guard_pre_product_20260922(uuid)', $old$nutrition.single_volume_link_id$old$, $new$preferred.single_volume_link_id$new$, 2),
    ('private.build_recipe_draft_nutrition_guard_pre_product_20260922(jsonb)', $old$  cross join lateral (
    select unit_flags.is_volume_input,$old$, $new$  cross join lateral (
    select
      count(*) filter (where candidate ->> 'basis_unit' = 'g') as mass_count,
      count(*) filter (where candidate ->> 'basis_unit' = 'ml') as volume_count,
      (array_agg((candidate ->> 'link_id')::uuid order by candidate ->> 'link_id' collate "C")
        filter (where candidate ->> 'basis_unit' = 'g'))[1] as single_mass_link_id,
      (array_agg((candidate ->> 'link_id')::uuid order by candidate ->> 'link_id' collate "C")
        filter (where candidate ->> 'basis_unit' = 'ml'))[1] as single_volume_link_id
    from jsonb_array_elements(nutrition.candidates) candidate
    where candidate #>> '{source,provider}' is distinct from 'HOMECOOK_AI_ESTIMATE'
      or not exists (
        select 1 from jsonb_array_elements(nutrition.candidates) official
        where official #>> '{source,provider}' is distinct from 'HOMECOOK_AI_ESTIMATE'
      )
  ) preferred
  cross join lateral (
    select unit_flags.is_volume_input,$new$, 1),
    ('private.build_recipe_draft_nutrition_guard_pre_product_20260922(jsonb)', $old$nutrition.mass_count$old$, $new$preferred.mass_count$new$, 6),
    ('private.build_recipe_draft_nutrition_guard_pre_product_20260922(jsonb)', $old$nutrition.volume_count$old$, $new$preferred.volume_count$new$, 6),
    ('private.build_recipe_draft_nutrition_guard_pre_product_20260922(jsonb)', $old$nutrition.single_mass_link_id$old$, $new$preferred.single_mass_link_id$new$, 2),
    ('private.build_recipe_draft_nutrition_guard_pre_product_20260922(jsonb)', $old$nutrition.single_volume_link_id$old$, $new$preferred.single_volume_link_id$new$, 2),
    ('private.build_recipe_draft_nutrition_guard_pre_product_20260922(jsonb)', $old$case when product_link.id is null then null
            else ingredient -> 'food_product_id' end$old$, $new$ingredient -> 'food_product_id'$new$, 1),
    ('private.build_recipe_draft_nutrition_guard_pre_product_20260922(jsonb)', $old$case when product_link.id is null then null
        else ingredient.ingredient -> 'food_product_id' end$old$, $new$ingredient.ingredient -> 'food_product_id'$new$, 1),
    ('private.build_recipe_draft_nutrition_guard_pre_product_20260922(jsonb)', $old$case when product_link.id is null then null
              else ingredient -> 'food_product_nutrition_version_id' end$old$, $new$ingredient -> 'food_product_nutrition_version_id'$new$, 1),
    ('private.build_recipe_draft_nutrition_guard_pre_product_20260922(jsonb)', $old$case when product_link.id is null then null
        else ingredient.ingredient -> 'food_product_nutrition_version_id' end$old$, $new$ingredient.ingredient -> 'food_product_nutrition_version_id'$new$, 1),
    ('private.recipe_nutrition_sources_pre_product_20260922(jsonb)', $old$where value ->> 'value_status' = 'observed'
              and value -> 'amount' <> 'null'::jsonb
          )$old$, $new$where (value ->> 'value_status' = 'observed'
              or (value ->> 'value_status' = 'estimated'
                and selected.nutrition_candidate #>> '{source,provider}' = 'HOMECOOK_AI_ESTIMATE'))
              and value -> 'amount' <> 'null'::jsonb
              and (value ->> 'amount')::numeric >= 0
          )$new$, 1),
    ('private.recipe_nutrition_sources_pre_product_20260922(jsonb)', $old$where value ->> 'value_status' = 'observed'
              and value -> 'amount' <> 'null'::jsonb
              and (value ->> 'amount')::numeric = 0$old$, $new$where value ->> 'value_status' = 'observed'
              and selected.nutrition_candidate #>> '{source,provider}' is distinct from 'HOMECOOK_AI_ESTIMATE'
              and value -> 'amount' <> 'null'::jsonb
              and (value ->> 'amount')::numeric = 0$new$, 2),
    ('public.validate_recipe_nutrition_snapshot_payload(jsonb)', $old$'REPRESENTATIVE_VOLUME_CONVERSION_USED', 'PIECE_WEIGHT_CONVERSION_USED'$old$, $new$'REPRESENTATIVE_VOLUME_CONVERSION_USED', 'PIECE_WEIGHT_CONVERSION_USED', 'AI_NUTRITION_ESTIMATE_USED'$new$, 3),
    ('public.validate_recipe_nutrition_snapshot_payload(jsonb)', $old$  v_core_complete integer := 0;$old$, $new$  v_has_ai_source boolean := false;
  v_core_complete integer := 0;$new$, 1),
    ('public.validate_recipe_nutrition_snapshot_payload(jsonb)', $old$  foreach v_core_code in array array[$old$, $new$  select exists (
    select 1 from jsonb_array_elements(p_snapshot -> 'sources') source
    where source ->> 'provider' = 'HOMECOOK_AI_ESTIMATE'
  ) into v_has_ai_source;
  if ((p_snapshot -> 'warnings') ? 'AI_NUTRITION_ESTIMATE_USED') is distinct from v_has_ai_source
    or (v_has_ai_source and p_snapshot ->> 'calculation_quality' not in ('estimated','mixed'))
    or (v_has_ai_source and not exists (
      select 1 from jsonb_array_elements(p_snapshot -> 'sources') source
      where source ->> 'provider' <> 'HOMECOOK_AI_ESTIMATE'
    ) and p_snapshot ->> 'calculation_quality' is distinct from 'estimated') then
    raise exception 'INVALID_SNAPSHOT_STATUS';
  end if;

  foreach v_core_code in array array[$new$, 1),
    ('private.compact_meal_log_nutrition(text,jsonb,numeric)', $old$    'calculation_status',p_status,$old$, $new$    'calculation_status',p_status,
    'contains_ai_estimate',coalesce(p_values -> 'contains_ai_estimate' = 'true'::jsonb,false),$new$, 1),
    ('private.resolve_cooked_batch_nutrition(uuid,uuid)', $old$      'values', v_unavailable_values,$old$, $new$      'contains_ai_estimate', false,
      'values', v_unavailable_values,$new$, 1),
    ('private.resolve_cooked_batch_nutrition(uuid,uuid)', $old$    'warnings', v_snapshot.warnings_json,$old$, $new$    'contains_ai_estimate', coalesce(v_snapshot.warnings_json ? 'AI_NUTRITION_ESTIMATE_USED', false),
    'warnings', v_snapshot.warnings_json,$new$, 1),
    ('private.mutate_meal_log_entry_prelaunch_20260919(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,timestamptz)', $old$coalesce(v_batch_nutrition->'values','{}'::jsonb),$old$, $new$coalesce(v_batch_nutrition->'values','{}'::jsonb) || jsonb_build_object(
          'contains_ai_estimate',coalesce(v_batch_nutrition->'contains_ai_estimate' = 'true'::jsonb,false)),$new$, 1),
    ('public.preview_meal_log_nutrition(uuid,timestamptz,text,integer,timestamptz,text,uuid,numeric,text)', $old$coalesce(v_nutrition->'values','{}'::jsonb),p_amount/v_batch.finished_weight_g)$old$, $new$coalesce(v_nutrition->'values','{}'::jsonb) || jsonb_build_object(
        'contains_ai_estimate',coalesce(v_nutrition->'contains_ai_estimate' = 'true'::jsonb,false)),p_amount/v_batch.finished_weight_g)$new$, 1),
    ('private.estimate_legacy_meal_log_nutrition(uuid,numeric)', $old$    v_snapshot.nutrient_status_json,$old$, $new$    v_snapshot.nutrient_status_json || jsonb_build_object(
      'contains_ai_estimate',coalesce(v_snapshot.warnings_json ? 'AI_NUTRITION_ESTIMATE_USED',false)),$new$, 1),
    ('private.project_meal_log_entry(public.meal_log_entries)', $old$'nutrition',p_entry.nutrition_evidence_json,$old$, $new$'nutrition',p_entry.nutrition_evidence_json || jsonb_build_object(
      'contains_ai_estimate',coalesce(p_entry.nutrition_evidence_json->'contains_ai_estimate' = 'true'::jsonb,false)),$new$, 1),
    ('public.get_meal_log_day(uuid,timestamptz,text,integer,timestamptz,date)', $old$      'calories_kcal',sum((e.nutrition_evidence_json->>'calories_kcal')::numeric),$old$, $new$      'contains_ai_estimate',coalesce(bool_or(e.nutrition_evidence_json->'contains_ai_estimate' = 'true'::jsonb),false),
      'calories_kcal',sum((e.nutrition_evidence_json->>'calories_kcal')::numeric),$new$, 2),
    ('public.get_meal_log_day(uuid,timestamptz,text,integer,timestamptz,date)', $old$    'calories_kcal',sum((nutrition_evidence_json->>'calories_kcal')::numeric),$old$, $new$    'contains_ai_estimate',coalesce(bool_or(nutrition_evidence_json->'contains_ai_estimate' = 'true'::jsonb),false),
    'calories_kcal',sum((nutrition_evidence_json->>'calories_kcal')::numeric),$new$, 1)
  ) as patches(signature, old_text, new_text, expected_count) loop
    v_oid := to_regprocedure(patch.signature);
    if v_oid is null then
      raise exception 'AI_NUTRITION_MIGRATION_FUNCTION_MISSING: %',patch.signature;
    end if;
    v_definition := pg_get_functiondef(v_oid);
    v_count := (length(v_definition)-length(replace(v_definition,patch.old_text,''))) / length(patch.old_text);
    if v_count <> patch.expected_count then
      raise exception 'AI_NUTRITION_MIGRATION_ANCHOR_MISMATCH: % expected %, found %',
        patch.signature,patch.expected_count,v_count;
    end if;
    execute replace(v_definition,patch.old_text,patch.new_text);
  end loop;
end;
$patch_consumers$;

create or replace function private.resolve_meal_log_profile_nutrition(
  p_profile_id uuid,
  p_amount numeric,
  p_unit text,
  p_allow_superseded boolean
) returns jsonb
language plpgsql stable security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_profile public.nutrition_profiles%rowtype;
  v_scale numeric;
  v_values jsonb;
  v_observed integer;
  v_is_ai boolean := false;
  v_contains_ai boolean := false;
begin
  select * into v_profile from public.nutrition_profiles where id=p_profile_id;
  if v_profile.id is null or not (
    (v_profile.is_active and v_profile.review_status in ('approved','self_reported'))
    or (p_allow_superseded and not v_profile.is_active and v_profile.review_status='superseded')
  ) then
    raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002';
  end if;
  if p_unit is distinct from v_profile.basis_unit then
    if not (p_unit in ('g','kg') and v_profile.normalization_method='mass_100g') then
      raise exception 'UNIT_CONVERSION_MISSING' using errcode='22023';
    end if;
  end if;
  -- Provider identity gates estimated values, including historical pinned
  -- superseded profiles. Product labels never gain a generic AI fallback.
  select exists (
    select 1 from public.nutrition_source_items item
    join public.nutrition_sources source on source.id=item.source_id
    where item.id=v_profile.source_item_id
      and v_profile.profile_kind='ingredient_source'
      and source.provider_code='HOMECOOK_AI_ESTIMATE'
  ) into v_is_ai;
  v_scale := (case when p_unit='kg' then p_amount*1000 else p_amount end) / v_profile.basis_amount;
  select jsonb_object_agg(nutrient_code,case when eligible then amount else null end),
    count(*) filter(where eligible),
    coalesce(bool_or(eligible and value_status='estimated' and v_is_ai),false)
  into v_values,v_observed,v_contains_ai
  from (
    select nutrient_code,amount,value_status,
      (value_status='observed' or (value_status='estimated' and v_is_ai
        and amount is not null and amount>=0
        and amount::text not in ('NaN','Infinity','-Infinity'))) as eligible
    from public.nutrition_values
    where profile_id=p_profile_id
      and nutrient_code in ('energy_kcal','carbohydrate_g','protein_g','fat_g','sodium_mg')
  ) values_with_evidence;
  return private.compact_meal_log_nutrition(
    case when coalesce(v_observed,0)=5 then 'complete'
      when coalesce(v_observed,0)=0 then 'unavailable' else 'partial' end,
    coalesce(v_values,'{}'::jsonb) || jsonb_build_object('contains_ai_estimate',v_contains_ai),v_scale
  );
end;
$function$;

-- CREATE OR REPLACE retains the resolver's existing owner/ACL. No public RPC,
-- grants, source identifiers, calculation version, or immutable rows are added.
notify pgrst, 'reload schema';
commit;
