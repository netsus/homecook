-- Atomic definition review and exact-source nutrition curation.
set local lock_timeout='10s';
set local statement_timeout='180s';
do $resolution$
declare
  v_input jsonb := current_setting('homecook.definition_resolution_input',true)::jsonb;
  v_schema text := current_setting('homecook.definition_resolution_schema',true);
  v_patch jsonb := v_input->'patch';
  v_row jsonb; v_actual jsonb; v_links jsonb; v_result jsonb;
  v_hash text; v_ledger text; v_cutover uuid; v_count integer;
  v_aliases_before jsonb; v_removed_import_aliases jsonb; v_removed_old_aliases jsonb := '[]'; v_alias jsonb;
begin
  if v_input->>'schema_version' is distinct from 'homecook-definition-resolution-20261007'
    or v_input->>'operation_checksum' is distinct from 'f3d2b3a63df2cdc80f394e6336f30a98b1730935840a8200326b3bd8d3809e50'
    or jsonb_array_length(v_input->'decisions') is distinct from 324 then
    raise exception 'DEFINITION_INPUT_MISMATCH';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('homecook:definition-resolution-20261007',0));
  select sha256 into v_ledger from homecook_deploy.migrations where filename=v_input->'migration'->>'filename';
  if v_ledger is not null and v_ledger is distinct from v_input->'migration'->>'sha256' then raise exception 'DEFINITION_LEDGER_DRIFT'; end if;
  if exists(select 1 from operational_events where event_type='ingredient_definition_resolution_applied'
    and metadata_json->>'operation_checksum'=v_input->>'operation_checksum') then
    if v_ledger is null then raise exception 'DEFINITION_INCOMPLETE'; end if;
    raise notice 'Definition resolution already applied; no writes'; return;
  end if;
  if exists(select 1 from operational_events where event_type='ingredient_nutrition_review_applied'
    and metadata_json->>'payload_checksum'=v_patch->>'payload_checksum') then raise exception 'DEFINITION_INCOMPLETE'; end if;
  lock table public.ingredients in share mode;
  lock table public.ingredient_catalog_entries in share row exclusive mode;
  lock table public.ingredient_synonyms in share row exclusive mode;
  select md5(string_agg(to_jsonb(i)::text,'' order by id)) into v_hash from public.ingredients i;
  if v_hash is distinct from v_input->>'expected_ingredients_checksum' then raise exception 'DEFINITION_INGREDIENT_DRIFT'; end if;
  select md5(string_agg(to_jsonb(e)::text,'' order by ingredient_id)) into v_hash from public.ingredient_catalog_entries e;
  if v_hash is distinct from v_input->>'expected_entries_checksum' then raise exception 'DEFINITION_CATALOG_DRIFT'; end if;
  perform public.lock_recipe_nutrition_ingredient_ids(array(select (value->>'ingredient_id')::uuid from jsonb_array_elements(v_input->'expected_links')),false);
  for v_row in select value from jsonb_array_elements(v_input->'expected_links') loop
    select coalesce(jsonb_agg(id::text order by id),'[]'::jsonb) into v_links from public.ingredient_nutrition_profiles
      where ingredient_id=(v_row->>'ingredient_id')::uuid and is_active and is_primary and review_status='approved';
    if v_links is distinct from v_row->'active_links' then raise exception 'DEFINITION_LINK_DRIFT'; end if;
  end loop;
  if v_ledger is null then
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name='ingredient_catalog_entries' and column_name='definition') then raise exception 'DEFINITION_UNTRACKED_SCHEMA'; end if;
    if v_schema is null or encode(extensions.digest(v_schema,'sha256'),'hex') is distinct from v_input->'migration'->>'body_sha256' then raise exception 'DEFINITION_SCHEMA_DRIFT'; end if;
    execute v_schema;
  end if;
  select current_cutover_attempt_id into v_cutover from public.account_generation_capability_state where singleton and state='generation_active' for key share;
  if v_cutover is null then raise exception 'DEFINITION_WRITER_UNAVAILABLE'; end if;
  perform public.set_account_generation_internal_writer_marker(v_cutover,true);
  -- Imports must not add source labels as ambiguous searchable ingredient aliases.
  select coalesce(jsonb_agg(id::text),'[]') into v_aliases_before from public.ingredient_synonyms;
  if jsonb_array_length(v_patch->'entries')>0 then
    if not exists(select 1 from public.nutrition_sources where id='8ed16622-19ef-41f0-8061-2f9e47d60cce'
      and manifest_sha256='999505db59474e9f321fb04ff2c970aa8842bce530ee26a794613ced6880d313'
      and review_status='approved' and is_active and freshness_status='current') then raise exception 'DEFINITION_SOURCE_DRIFT'; end if;
    if exists(select 1 from jsonb_array_elements(v_patch->'entries') e
      join public.nutrition_sources s on s.provider_code=e->'source'->>'provider_code' and s.source_version=e->'source'->>'source_version'
      join public.nutrition_source_items si on si.source_id=s.id and si.external_item_key=e->'source_item'->>'external_item_key'
      join public.nutrition_profiles p on p.source_item_id=si.id where p.review_status in ('revoked','rejected')) then raise exception 'DEFINITION_SOURCE_QUALITY_HOLD'; end if;
    v_result:=public.apply_reviewed_ingredient_nutrition(v_patch);
    if (v_result->>'applied_count')::integer is distinct from jsonb_array_length(v_patch->'entries') then raise exception 'DEFINITION_NUTRITION_COUNT'; end if;
  end if;
  with removed as (
    delete from public.ingredient_synonyms a where not(v_aliases_before ? a.id::text)
      and a.ingredient_id in(select (value->>'ingredient_id')::uuid from jsonb_array_elements(v_patch->'entries')) returning to_jsonb(a) data
  ) select coalesce(jsonb_agg(data),'[]') into v_removed_import_aliases from removed;
  for v_row in select value from jsonb_array_elements(v_input->'revocations') loop
    update public.ingredient_nutrition_profiles set is_active=false,is_primary=false,review_status='revoked',
      decision_reason=v_row->>'reason',reviewed_by=(v_patch->>'reviewed_by')::uuid,reviewed_at=(v_patch->>'reviewed_at')::timestamptz
      where id=(v_row->>'link_id')::uuid and ingredient_id=(v_row->>'ingredient_id')::uuid and is_active and is_primary and review_status='approved';
    if not found then raise exception 'DEFINITION_REVOCATION_DRIFT'; end if;
  end loop;
  for v_row in select value from jsonb_array_elements(v_input->'invalid_aliases') loop
    delete from public.ingredient_synonyms where id=(v_row->>'id')::uuid and ingredient_id=(v_row->>'ingredient_id')::uuid and synonym=v_row->>'synonym' returning to_jsonb(ingredient_synonyms) into v_alias;
    if v_alias is null then raise exception 'DEFINITION_ALIAS_DRIFT'; end if;
    v_removed_old_aliases:=v_removed_old_aliases||jsonb_build_array(v_alias);
  end loop;
  for v_row in select value from jsonb_array_elements(v_input->'decisions') loop
    update public.ingredient_catalog_entries set definition=v_row->>'definition',display_name=v_row->>'display_name',
      presentation=v_row->>'presentation',review_state=v_row->>'review_state',retain_dimensions=v_row->'retain_dimensions',review_version='definition-resolution-20261007-v1'
      where ingredient_id=(v_row->>'id')::uuid;
    if not found then raise exception 'DEFINITION_ENTRY_MISSING'; end if;
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
      when value->>'missing_reason' in ('malformed','parse_error') then 'parse_error' else 'missing' end)) from jsonb_each(v_row->'values')) then raise exception 'DEFINITION_NUTRIENT_VERIFICATION'; end if;
  end loop;
  select count(*) into v_count from public.ingredient_catalog_entries where review_version='definition-resolution-20261007-v1';
  if v_count<>324 then raise exception 'DEFINITION_COVERAGE'; end if;
  insert into public.operational_events(event_type,severity,source,actor_user_id,message_summary,metadata_json)
    values('ingredient_definition_resolution_applied','info','ingredient-definition-resolution-20261007',(v_patch->>'reviewed_by')::uuid,
      'Resolve everyday ingredient definitions and exact nutrition sources',jsonb_build_object('operation_checksum',v_input->>'operation_checksum',
      'payload_checksum',v_patch->>'payload_checksum','migration',v_input->'migration','counts',v_input->'counts','decisions',v_input->'decisions',
      'expected_previous_links',v_input->'expected_links','revocations',v_input->'revocations','removed_aliases',v_removed_old_aliases,'discarded_import_aliases',v_removed_import_aliases));
  perform public.set_account_generation_internal_writer_marker(v_cutover,false);
  perform pg_notify('pgrst','reload schema');
end;
$resolution$;
-- No privilege broadening: only the ledger owner writes its existing table.
reset role;
insert into homecook_deploy.migrations(filename,sha256)
select current_setting('homecook.definition_resolution_input')::jsonb->'migration'->>'filename',current_setting('homecook.definition_resolution_input')::jsonb->'migration'->>'sha256'
on conflict(filename) do nothing;
do $ledger$
declare v_input jsonb:=current_setting('homecook.definition_resolution_input')::jsonb; v_hash text;
begin
  select sha256 into v_hash from homecook_deploy.migrations where filename=v_input->'migration'->>'filename' for update;
  if v_hash is distinct from v_input->'migration'->>'sha256' then raise exception 'DEFINITION_LEDGER_DRIFT'; end if;
end;
$ledger$;
commit;
