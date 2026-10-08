-- Reviewed official-source nutrition expansion; immutable sources and history remain preserved.
set local lock_timeout='10s';
set local statement_timeout='180s';
do $resolution$
declare
  v_input jsonb := current_setting('homecook.nutrition_representatives_input',true)::jsonb;
  v_patch jsonb := v_input->'patch';
  v_row jsonb; v_actual jsonb; v_links jsonb; v_result jsonb;
  v_hash text; v_cutover uuid; v_count integer;
  v_aliases_before jsonb; v_removed_import_aliases jsonb; v_removed_old_aliases jsonb := '[]'; v_alias jsonb;
begin
  if v_input->>'schema_version' is distinct from 'homecook-nutrition-representatives-20261008'
    or v_input->>'operation_checksum' is distinct from '5b350ef20678cc9441358ffda80ad4f09bcef50a6eccd4c970276c9953b0eb90'
    or jsonb_array_length(v_input->'decisions') is distinct from 61 then
    raise exception 'REPRESENTATIVE_INPUT_MISMATCH';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('homecook:nutrition-representatives-20261008',0));
  if exists(select 1 from operational_events where event_type='ingredient_nutrition_representatives_applied'
    and metadata_json->>'operation_checksum'=v_input->>'operation_checksum') then
    raise notice 'Nutrition expansion already applied; no writes'; return;
  end if;
  if exists(select 1 from operational_events where event_type='ingredient_nutrition_review_applied'
    and metadata_json->>'payload_checksum'=v_patch->>'payload_checksum') then raise exception 'REPRESENTATIVE_INCOMPLETE'; end if;
  lock table public.ingredients in share mode;
  lock table public.ingredient_catalog_entries in share row exclusive mode;
  lock table public.ingredient_synonyms in share row exclusive mode;
  select md5(string_agg(to_jsonb(i)::text,'' order by id)) into v_hash from public.ingredients i;
  if v_hash is distinct from v_input->>'expected_ingredients_checksum' then raise exception 'REPRESENTATIVE_INGREDIENT_DRIFT'; end if;
  select md5(string_agg(to_jsonb(e)::text,'' order by ingredient_id)) into v_hash from public.ingredient_catalog_entries e;
  if v_hash is distinct from v_input->>'expected_entries_checksum' then raise exception 'REPRESENTATIVE_CATALOG_DRIFT'; end if;
  perform public.lock_recipe_nutrition_ingredient_ids(array(select (value->>'ingredient_id')::uuid from jsonb_array_elements(v_input->'expected_links')),false);
  for v_row in select value from jsonb_array_elements(v_input->'expected_links') loop
    select coalesce(jsonb_agg(id::text order by id),'[]'::jsonb) into v_links from public.ingredient_nutrition_profiles
      where ingredient_id=(v_row->>'ingredient_id')::uuid and is_active and is_primary and review_status='approved';
    if v_links is distinct from v_row->'active_links' then raise exception 'REPRESENTATIVE_LINK_DRIFT'; end if;
  end loop;
  select current_cutover_attempt_id into v_cutover from public.account_generation_capability_state where singleton and state='generation_active' for key share;
  if v_cutover is null then raise exception 'REPRESENTATIVE_WRITER_UNAVAILABLE'; end if;
  perform public.set_account_generation_internal_writer_marker(v_cutover,true);
  -- Imports must not add source labels as ambiguous searchable ingredient aliases.
  select coalesce(jsonb_agg(id::text),'[]') into v_aliases_before from public.ingredient_synonyms;
  if jsonb_array_length(v_patch->'entries')>0 then
    if exists(select 1 from jsonb_array_elements(v_patch->'entries') e
      join public.nutrition_sources s on s.provider_code=e->'source'->>'provider_code' and s.dataset_name=e->'source'->>'dataset_name' and s.source_version=e->'source'->>'source_version'
      join public.nutrition_source_items si on si.source_id=s.id and si.external_item_key=e->'source_item'->>'external_item_key'
      join public.nutrition_profiles p on p.source_item_id=si.id where p.review_status in ('revoked','rejected')) then raise exception 'REPRESENTATIVE_SOURCE_QUALITY_HOLD'; end if;
    v_result:=public.apply_reviewed_ingredient_nutrition(v_patch);
    if (v_result->>'applied_count')::integer is distinct from jsonb_array_length(v_patch->'entries') then raise exception 'REPRESENTATIVE_NUTRITION_COUNT'; end if;
  end if;
  with removed as (
    delete from public.ingredient_synonyms a where not(v_aliases_before ? a.id::text)
      and a.ingredient_id in(select (value->>'ingredient_id')::uuid from jsonb_array_elements(v_patch->'entries')) returning to_jsonb(a) data
  ) select coalesce(jsonb_agg(data),'[]') into v_removed_import_aliases from removed;
  for v_row in select value from jsonb_array_elements(v_input->'revocations') loop
    update public.ingredient_nutrition_profiles set is_active=false,is_primary=false,review_status='revoked',
      decision_reason=v_row->>'reason',reviewed_by=(v_patch->>'reviewed_by')::uuid,reviewed_at=(v_patch->>'reviewed_at')::timestamptz
      where id=(v_row->>'link_id')::uuid and ingredient_id=(v_row->>'ingredient_id')::uuid and is_active and is_primary and review_status='approved';
    if not found then raise exception 'REPRESENTATIVE_REVOCATION_DRIFT'; end if;
  end loop;
  for v_row in select value from jsonb_array_elements(v_input->'invalid_aliases') loop
    delete from public.ingredient_synonyms where id=(v_row->>'id')::uuid and ingredient_id=(v_row->>'ingredient_id')::uuid and synonym=v_row->>'synonym' returning to_jsonb(ingredient_synonyms) into v_alias;
    if v_alias is null then raise exception 'REPRESENTATIVE_ALIAS_DRIFT'; end if;
    v_removed_old_aliases:=v_removed_old_aliases||jsonb_build_array(v_alias);
  end loop;
  for v_row in select value from jsonb_array_elements(v_input->'catalog_updates') loop
    update public.ingredient_catalog_entries set definition=v_row->>'definition',display_name=v_row->>'display_name',
      presentation=v_row->>'presentation',review_state=v_row->>'review_state',retain_dimensions=v_row->'retain_dimensions',review_version='nutrition-representatives-20261008-v1'
      where ingredient_id=(v_row->>'id')::uuid;
    if not found then raise exception 'REPRESENTATIVE_ENTRY_MISSING'; end if;
  end loop;
  for v_row in select value from jsonb_array_elements(v_patch->'entries') loop
    select jsonb_object_agg(v.nutrient_code,jsonb_build_object('amount',v.amount,'unit',v.source_unit,'status',v.value_status)) into v_actual
      from public.ingredient_nutrition_profiles l join public.nutrition_profiles p on p.id=l.nutrition_profile_id
      join public.nutrition_source_items si on si.id=p.source_item_id join public.nutrition_values v on v.profile_id=p.id
      where l.ingredient_id=(v_row->>'ingredient_id')::uuid and l.is_active and l.is_primary and l.review_status='approved'
      and p.is_active and p.review_status='approved' and si.external_item_key=v_row->'source_item'->>'external_item_key'
      and si.external_name=v_row->'source_item'->>'external_name';
    if v_actual is distinct from (select jsonb_object_agg(key,jsonb_build_object('amount',value->'amount','unit',value->'unit',
      'status',case when value->>'amount' is not null then 'observed' when value->>'missing_reason'='trace' then 'trace'
      when value->>'missing_reason' in ('malformed','parse_error') then 'parse_error' else 'missing' end)) from jsonb_each(v_row->'values')) then raise exception 'REPRESENTATIVE_NUTRIENT_VERIFICATION'; end if;
  end loop;
  select count(*) into v_count from public.ingredient_catalog_entries where review_version='nutrition-representatives-20261008-v1';
  if v_count is distinct from jsonb_array_length(v_patch->'entries') then raise exception 'REPRESENTATIVE_COVERAGE'; end if;
  insert into public.operational_events(event_type,severity,source,actor_user_id,message_summary,metadata_json)
    values('ingredient_nutrition_representatives_applied','info','ingredient-nutrition-representatives-20261008',(v_patch->>'reviewed_by')::uuid,
      'Link user-approved representative references with explicit scope',jsonb_build_object('operation_checksum',v_input->>'operation_checksum',
      'payload_checksum',v_patch->>'payload_checksum','counts',v_input->'counts','representative_policy',v_input->'policy','decisions',v_input->'decisions','catalog_updates',v_input->'catalog_updates','source_manifests',v_input->'source_manifests',
      'expected_previous_links',v_input->'expected_links','revocations',v_input->'revocations','removed_aliases',v_removed_old_aliases,'discarded_import_aliases',v_removed_import_aliases));
  perform public.set_account_generation_internal_writer_marker(v_cutover,false);
  perform pg_notify('pgrst','reload schema');
end;
$resolution$;
commit;
