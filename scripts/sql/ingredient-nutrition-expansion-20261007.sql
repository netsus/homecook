-- Reviewed official-source nutrition expansion; immutable sources and history remain preserved.
set local lock_timeout='10s';
set local statement_timeout='180s';
do $resolution$
declare
  v_input jsonb := current_setting('homecook.nutrition_expansion_input',true)::jsonb;
  v_patch jsonb := v_input->'patch';
  v_schema text := current_setting('homecook.nutrition_expansion_schema',true);
  v_row jsonb; v_actual jsonb; v_links jsonb; v_result jsonb;
  v_hash text; v_ledger text; v_cutover uuid; v_count integer;
  v_aliases_before jsonb; v_removed_import_aliases jsonb; v_removed_old_aliases jsonb := '[]'; v_alias jsonb;
begin
  if v_input->>'schema_version' is distinct from 'homecook-nutrition-expansion-20261007'
    or v_input->>'operation_checksum' is distinct from '6b1053df1894361289dd43da3db8f0b7de4f0e029547f6a1f1032cb954b938ce'
    or jsonb_array_length(v_input->'decisions') is distinct from 93 then
    raise exception 'EXPANSION_INPUT_MISMATCH';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('homecook:nutrition-expansion-20261007',0));
  select sha256 into v_ledger from homecook_deploy.migrations where filename=v_input->'migration'->>'filename';
  if v_ledger is not null and v_ledger is distinct from v_input->'migration'->>'sha256' then raise exception 'EXPANSION_SCHEMA_LEDGER_DRIFT'; end if;
  if exists(select 1 from operational_events where event_type='ingredient_nutrition_expansion_applied'
    and metadata_json->>'operation_checksum'=v_input->>'operation_checksum') then
    if v_ledger is null then raise exception 'EXPANSION_INCOMPLETE_SCHEMA'; end if;
    raise notice 'Nutrition expansion already applied; no writes'; return;
  end if;
  if exists(select 1 from operational_events where event_type='ingredient_nutrition_review_applied'
    and metadata_json->>'payload_checksum'=v_patch->>'payload_checksum') then raise exception 'EXPANSION_INCOMPLETE'; end if;
  lock table public.ingredients in share mode;
  lock table public.ingredient_catalog_entries in share row exclusive mode;
  lock table public.ingredient_synonyms in share row exclusive mode;
  select md5(string_agg(to_jsonb(i)::text,'' order by id)) into v_hash from public.ingredients i;
  if v_hash is distinct from v_input->>'expected_ingredients_checksum' then raise exception 'EXPANSION_INGREDIENT_DRIFT'; end if;
  select md5(string_agg(to_jsonb(e)::text,'' order by ingredient_id)) into v_hash from public.ingredient_catalog_entries e;
  if v_hash is distinct from v_input->>'expected_entries_checksum' then raise exception 'EXPANSION_CATALOG_DRIFT'; end if;
  perform public.lock_recipe_nutrition_ingredient_ids(array(select (value->>'ingredient_id')::uuid from jsonb_array_elements(v_input->'expected_links')),false);
  for v_row in select value from jsonb_array_elements(v_input->'expected_links') loop
    select coalesce(jsonb_agg(id::text order by id),'[]'::jsonb) into v_links from public.ingredient_nutrition_profiles
      where ingredient_id=(v_row->>'ingredient_id')::uuid and is_active and is_primary and review_status='approved';
    if v_links is distinct from v_row->'active_links' then raise exception 'EXPANSION_LINK_DRIFT'; end if;
  end loop;
  if v_ledger is null then
    if (select character_maximum_length from information_schema.columns where table_schema='public' and table_name='ingredient_synonyms' and column_name='synonym') is distinct from 100 then raise exception 'EXPANSION_ALIAS_SCHEMA_DRIFT'; end if;
    if v_schema is null or encode(extensions.digest(v_schema,'sha256'),'hex') is distinct from v_input->'migration'->>'body_sha256' then raise exception 'EXPANSION_SCHEMA_CHECKSUM'; end if;
    execute v_schema;
  end if;
  select current_cutover_attempt_id into v_cutover from public.account_generation_capability_state where singleton and state='generation_active' for key share;
  if v_cutover is null then raise exception 'EXPANSION_WRITER_UNAVAILABLE'; end if;
  perform public.set_account_generation_internal_writer_marker(v_cutover,true);
  -- Imports must not add source labels as ambiguous searchable ingredient aliases.
  select coalesce(jsonb_agg(id::text),'[]') into v_aliases_before from public.ingredient_synonyms;
  if jsonb_array_length(v_patch->'entries')>0 then
    if exists(select 1 from jsonb_array_elements(v_patch->'entries') e
      join public.nutrition_sources s on s.provider_code=e->'source'->>'provider_code' and s.dataset_name=e->'source'->>'dataset_name' and s.source_version=e->'source'->>'source_version'
      join public.nutrition_source_items si on si.source_id=s.id and si.external_item_key=e->'source_item'->>'external_item_key'
      join public.nutrition_profiles p on p.source_item_id=si.id where p.review_status in ('revoked','rejected')) then raise exception 'EXPANSION_SOURCE_QUALITY_HOLD'; end if;
    v_result:=public.apply_reviewed_ingredient_nutrition(v_patch);
    if (v_result->>'applied_count')::integer is distinct from jsonb_array_length(v_patch->'entries') then raise exception 'EXPANSION_NUTRITION_COUNT'; end if;
  end if;
  with removed as (
    delete from public.ingredient_synonyms a where not(v_aliases_before ? a.id::text)
      and a.ingredient_id in(select (value->>'ingredient_id')::uuid from jsonb_array_elements(v_patch->'entries')) returning to_jsonb(a) data
  ) select coalesce(jsonb_agg(data),'[]') into v_removed_import_aliases from removed;
  for v_row in select value from jsonb_array_elements(v_input->'revocations') loop
    update public.ingredient_nutrition_profiles set is_active=false,is_primary=false,review_status='revoked',
      decision_reason=v_row->>'reason',reviewed_by=(v_patch->>'reviewed_by')::uuid,reviewed_at=(v_patch->>'reviewed_at')::timestamptz
      where id=(v_row->>'link_id')::uuid and ingredient_id=(v_row->>'ingredient_id')::uuid and is_active and is_primary and review_status='approved';
    if not found then raise exception 'EXPANSION_REVOCATION_DRIFT'; end if;
  end loop;
  for v_row in select value from jsonb_array_elements(v_input->'invalid_aliases') loop
    delete from public.ingredient_synonyms where id=(v_row->>'id')::uuid and ingredient_id=(v_row->>'ingredient_id')::uuid and synonym=v_row->>'synonym' returning to_jsonb(ingredient_synonyms) into v_alias;
    if v_alias is null then raise exception 'EXPANSION_ALIAS_DRIFT'; end if;
    v_removed_old_aliases:=v_removed_old_aliases||jsonb_build_array(v_alias);
  end loop;
  for v_row in select value from jsonb_array_elements(v_input->'catalog_updates') loop
    update public.ingredient_catalog_entries set definition=v_row->>'definition',display_name=v_row->>'display_name',
      presentation=v_row->>'presentation',review_state=v_row->>'review_state',retain_dimensions=v_row->'retain_dimensions',review_version='nutrition-expansion-20261007-v1'
      where ingredient_id=(v_row->>'id')::uuid;
    if not found then raise exception 'EXPANSION_ENTRY_MISSING'; end if;
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
      when value->>'missing_reason' in ('malformed','parse_error') then 'parse_error' else 'missing' end)) from jsonb_each(v_row->'values')) then raise exception 'EXPANSION_NUTRIENT_VERIFICATION'; end if;
  end loop;
  select count(*) into v_count from public.ingredient_catalog_entries where review_version='nutrition-expansion-20261007-v1';
  if v_count is distinct from jsonb_array_length(v_patch->'entries') then raise exception 'EXPANSION_COVERAGE'; end if;
  insert into public.operational_events(event_type,severity,source,actor_user_id,message_summary,metadata_json)
    values('ingredient_nutrition_expansion_applied','info','ingredient-nutrition-expansion-20261007',(v_patch->>'reviewed_by')::uuid,
      'Link reviewed USDA and MEXT official food data',jsonb_build_object('operation_checksum',v_input->>'operation_checksum',
      'payload_checksum',v_patch->>'payload_checksum','counts',v_input->'counts','decisions',v_input->'decisions','catalog_updates',v_input->'catalog_updates','source_manifests',v_input->'source_manifests','migration',v_input->'migration',
      'expected_previous_links',v_input->'expected_links','revocations',v_input->'revocations','removed_aliases',v_removed_old_aliases,'discarded_import_aliases',v_removed_import_aliases));
  perform public.set_account_generation_internal_writer_marker(v_cutover,false);
  perform pg_notify('pgrst','reload schema');
end;
$resolution$;
-- Only the existing deployment-ledger owner writes its ledger, atomically.
reset role;
insert into homecook_deploy.migrations(filename,sha256)
select current_setting('homecook.nutrition_expansion_input')::jsonb->'migration'->>'filename',current_setting('homecook.nutrition_expansion_input')::jsonb->'migration'->>'sha256'
on conflict(filename) do nothing;
do $ledger$
declare v_input jsonb:=current_setting('homecook.nutrition_expansion_input')::jsonb; v_hash text;
begin
 select sha256 into v_hash from homecook_deploy.migrations where filename=v_input->'migration'->>'filename' for update;
 if v_hash is distinct from v_input->'migration'->>'sha256' then raise exception 'EXPANSION_SCHEMA_LEDGER_DRIFT'; end if;
end;
$ledger$;
commit;
