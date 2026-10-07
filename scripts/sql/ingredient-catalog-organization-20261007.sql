-- Reviewed, atomic schema + data organization. Never rewrites nutrition payloads.
set local lock_timeout='10s';
set local statement_timeout='180s';
do $organize$
declare
  v_input jsonb := current_setting('homecook.catalog_organization_input',true)::jsonb;
  v_schema text := current_setting('homecook.catalog_organization_schema',true);
  v_row jsonb; v_actual jsonb; v_rec record; v_column text;
  v_hash text; v_ledger text; v_count bigint; v_cutover uuid;
  v_deleted_ids uuid[]; v_patterns text[]; v_deleted_rows jsonb; v_deleted_aliases jsonb;
  v_added_aliases integer := 0;
begin
  if v_input->>'schema_version' is distinct from 'homecook-catalog-organization-20261007'
    or v_input->>'operation_checksum' is distinct from '59619e307c98830a2df82e9f503ff390d9e061b0ec74f18f10addebf7aeec9cf'
    or jsonb_array_length(v_input->'entries') is distinct from 1930
    or jsonb_array_length(v_input->'representatives') is distinct from 20 then
    raise exception 'CATALOG_ORGANIZATION_INPUT_MISMATCH';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('homecook:catalog-organization-20261007',0));
  select sha256 into v_ledger from homecook_deploy.migrations where filename=v_input->'migration'->>'filename';
  if v_ledger is not null and v_ledger is distinct from v_input->'migration'->>'sha256' then
    raise exception 'CATALOG_SCHEMA_LEDGER_DRIFT';
  end if;
  if exists(select 1 from public.operational_events where event_type='ingredient_catalog_organization_applied'
    and metadata_json->>'operation_checksum'=v_input->>'operation_checksum') then
    if v_ledger is null or to_regclass('public.ingredient_catalog_entries') is null then
      raise exception 'CATALOG_ORGANIZATION_INCOMPLETE';
    end if;
    raise notice 'Catalog organization already applied; no writes'; return;
  end if;
  lock table public.ingredients in share row exclusive mode;
  select md5(string_agg(to_jsonb(i)::text,'' order by id)) into v_hash from public.ingredients i;
  if v_hash is distinct from v_input->>'expected_catalog_checksum' then raise exception 'CATALOG_ORGANIZATION_SOURCE_DRIFT'; end if;
  select array_agg((value->>'id')::uuid),array_agg('%'||(value->>'id')||'%') into v_deleted_ids,v_patterns
    from jsonb_array_elements(v_input->'deletes');
  perform 1 from public.ingredients where id=any(v_deleted_ids) order by id for update;
  for v_rec in select distinct value->>'schema_name' schema_name,value->>'table_name' table_name
    from jsonb_array_elements(v_input->'json_reference_scope') order by 1,2 loop
    if v_rec.schema_name='private' and v_rec.table_name='youtube_extraction_current_policy' then
      execute format('lock table %I.%I in access share mode',v_rec.schema_name,v_rec.table_name);
    else
      execute format('lock table %I.%I in share mode',v_rec.schema_name,v_rec.table_name);
    end if;
  end loop;
  for v_rec in select c.conrelid,c.conkey,n.nspname,t.relname from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid=c.conrelid join pg_catalog.pg_namespace n on n.oid=t.relnamespace
    where c.contype='f' and c.confrelid='public.ingredients'::regclass loop
    if array_length(v_rec.conkey,1) is distinct from 1 then raise exception 'CATALOG_UNKNOWN_FK_SHAPE'; end if;
    select attname into v_column from pg_catalog.pg_attribute where attrelid=v_rec.conrelid and attnum=v_rec.conkey[1];
    if v_rec.nspname='public' and v_rec.relname='ingredient_synonyms' and v_column='ingredient_id' then continue; end if;
    execute format('select count(*) from %I.%I where %I=any($1)',v_rec.nspname,v_rec.relname,v_column) into v_count using v_deleted_ids;
    if v_count<>0 then raise exception 'CATALOG_DELETE_REFERENCED: %.%',v_rec.relname,v_column; end if;
  end loop;
  if exists(select 1 from public.shopping_list_items where unavailable_ingredient_id=any(v_deleted_ids)) then raise exception 'CATALOG_DELETE_REFERENCED'; end if;
  for v_row in select value from jsonb_array_elements(v_input->'json_reference_scope') loop
    execute format('select count(*) from %I.%I where %I::text ilike any($1)',v_row->>'schema_name',v_row->>'table_name',v_row->>'column_name') into v_count using v_patterns;
    if v_count<>0 then raise exception 'CATALOG_DELETE_JSON_REFERENCED: %.%',v_row->>'table_name',v_row->>'column_name'; end if;
  end loop;
  lock table public.ingredient_synonyms in share mode;
  for v_row in select value from jsonb_array_elements(v_input->'renames') loop
    if not exists(select 1 from public.ingredients where id=(v_row->>'id')::uuid and standard_name=v_row->>'old_name') then raise exception 'CATALOG_RENAME_DRIFT'; end if;
    if exists(select 1 from public.ingredients where id<>(v_row->>'id')::uuid and search_name=public.normalize_ingredient_search_name(v_row->>'new_name')) then raise exception 'CATALOG_RENAME_COLLISION'; end if;
    if exists(select 1 from public.ingredient_synonyms where ingredient_id<>(v_row->>'id')::uuid
      and public.normalize_ingredient_search_name(synonym) in (public.normalize_ingredient_search_name(v_row->>'old_name'),public.normalize_ingredient_search_name(v_row->>'new_name'))) then
      raise exception 'CATALOG_RENAME_ALIAS_COLLISION';
    end if;
  end loop;
  if v_ledger is null then
    if to_regclass('public.ingredient_catalog_groups') is not null or to_regclass('public.ingredient_catalog_entries') is not null then raise exception 'CATALOG_UNTRACKED_SCHEMA'; end if;
    if v_schema is null or encode(extensions.digest(v_schema,'sha256'),'hex') is distinct from v_input->'migration'->>'body_sha256' then raise exception 'CATALOG_SCHEMA_CHECKSUM_MISMATCH'; end if;
    execute v_schema;
  end if;
  select count(*) into v_count from public.ingredient_catalog_entries;
  if v_count<>0 then raise exception 'CATALOG_REVIEWED_DATA_ALREADY_EXISTS'; end if;
  select count(*) into v_count from public.ingredient_catalog_groups;
  if v_count<>0 then raise exception 'CATALOG_GROUPS_ALREADY_EXIST'; end if;
  select coalesce(jsonb_agg(to_jsonb(i) order by id),'[]'::jsonb) into v_deleted_rows from public.ingredients i where id=any(v_deleted_ids);
  select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]'::jsonb) into v_deleted_aliases from public.ingredient_synonyms a where ingredient_id=any(v_deleted_ids);
  select current_cutover_attempt_id into v_cutover from public.account_generation_capability_state where singleton and state='generation_active' for key share;
  if v_cutover is null then raise exception 'CATALOG_WRITER_UNAVAILABLE'; end if;
  perform public.set_account_generation_internal_writer_marker(v_cutover,true);
  delete from public.ingredients where id=any(v_deleted_ids);
  get diagnostics v_count=row_count;
  if v_count is distinct from 2 then raise exception 'CATALOG_DELETE_COUNT_MISMATCH'; end if;
  for v_row in select value from jsonb_array_elements(v_input->'renames') loop
    update public.ingredients set standard_name=v_row->>'new_name' where id=(v_row->>'id')::uuid;
    -- Keep a previously unambiguous old spelling resolving to the same ID.
    insert into public.ingredient_synonyms(ingredient_id,synonym) values((v_row->>'id')::uuid,v_row->>'old_name') on conflict(ingredient_id,synonym) do nothing;
    get diagnostics v_count=row_count; v_added_aliases:=v_added_aliases+v_count;
  end loop;
  perform public.lock_recipe_nutrition_ingredient_ids(array(select distinct x from (
    select (value->>'source_ingredient_id')::uuid x from jsonb_array_elements(v_input->'representatives')
    union select (value->>'representative_ingredient_id')::uuid from jsonb_array_elements(v_input->'representatives'))ids),true);
  for v_row in select value from jsonb_array_elements(v_input->'representatives') loop
    select count(*) into v_count from public.ingredient_nutrition_profiles l
      join public.nutrition_profiles p on p.id=l.nutrition_profile_id
      where l.ingredient_id in ((v_row->>'source_ingredient_id')::uuid,(v_row->>'representative_ingredient_id')::uuid)
      and l.nutrition_profile_id=(v_row->>'nutrition_profile_id')::uuid and l.preparation_state=v_row->>'preparation_state'
      and l.review_status='approved' and l.is_active and l.is_primary and p.is_active and p.review_status='approved'
      and p.source_item_id=(v_row->>'nutrition_source_item_id')::uuid;
    if v_count<>2 then raise exception 'CATALOG_REPRESENTATIVE_SOURCE_DRIFT'; end if;
    if exists(select 1 from public.ingredient_representative_links where source_ingredient_id=(v_row->>'source_ingredient_id')::uuid
      and (representative_ingredient_id<>(v_row->>'representative_ingredient_id')::uuid or nutrition_source_item_id<>(v_row->>'nutrition_source_item_id')::uuid)) then
      raise exception 'CATALOG_REPRESENTATIVE_CONFLICT';
    end if;
    insert into public.ingredient_representative_links(source_ingredient_id,representative_ingredient_id,nutrition_source_item_id,evidence_json,decision_reason,reviewed_by,reviewed_at)
    values((v_row->>'source_ingredient_id')::uuid,(v_row->>'representative_ingredient_id')::uuid,(v_row->>'nutrition_source_item_id')::uuid,
      jsonb_build_object('profile_id',v_row->>'nutrition_profile_id','source_name',v_row->>'source_name','representative_name',v_row->>'representative_name','operation_checksum',v_input->>'operation_checksum'),
      v_row->>'reason',(v_input->>'actor_id')::uuid,(v_input->>'reviewed_at')::timestamptz)
    on conflict(source_ingredient_id) do nothing;
  end loop;
  insert into public.ingredient_catalog_groups(id,category,name,sort_order)
    select id,category,name,sort_order from jsonb_to_recordset(v_input->'groups') as g(id uuid,category text,name text,sort_order integer);
  -- Roots first so alias projections can never point to an absent/unreviewed row.
  insert into public.ingredient_catalog_entries(ingredient_id,group_id,display_name,presentation,review_state,retain_dimensions,representative_ingredient_id,review_version)
    select ingredient_id,group_id,display_name,presentation,review_state,retain_dimensions,representative_ingredient_id,review_version
    from jsonb_to_recordset(v_input->'entries') as e(ingredient_id uuid,group_id uuid,display_name text,presentation text,review_state text,retain_dimensions jsonb,representative_ingredient_id uuid,review_version text)
    where presentation<>'alias';
  insert into public.ingredient_catalog_entries(ingredient_id,group_id,display_name,presentation,review_state,retain_dimensions,representative_ingredient_id,review_version)
    select ingredient_id,group_id,display_name,presentation,review_state,retain_dimensions,representative_ingredient_id,review_version
    from jsonb_to_recordset(v_input->'entries') as e(ingredient_id uuid,group_id uuid,display_name text,presentation text,review_state text,retain_dimensions jsonb,representative_ingredient_id uuid,review_version text)
    where presentation='alias';
  select count(*) into v_count from public.ingredient_catalog_items;
  if v_count<>1930 or exists(select 1 from public.ingredient_catalog_items where review_state='unreviewed') then raise exception 'CATALOG_ORGANIZATION_COVERAGE_FAILED'; end if;
  select jsonb_object_agg(presentation,n) into v_actual from (select presentation,count(*) n from public.ingredient_catalog_entries group by presentation)c;
  if v_actual is distinct from v_input->'counts'->'presentations' then raise exception 'CATALOG_ORGANIZATION_COUNTS_MISMATCH'; end if;
  insert into public.operational_events(event_type,severity,source,actor_user_id,message_summary,metadata_json)
  values('ingredient_catalog_organization_applied','info','ingredient-catalog-organization-20261007',(v_input->>'actor_id')::uuid,
    'Organize catalog without changing nutrition or historical ingredient identities',
    jsonb_build_object('operation_checksum',v_input->>'operation_checksum','source_review_checksum',v_input->>'source_review_checksum','migration',v_input->'migration',
      'counts',v_input->'counts','deleted_ingredients',v_deleted_rows,'deleted_aliases',v_deleted_aliases,'renames',v_input->'renames',
      'preserved_old_name_aliases_added',v_added_aliases,'representatives',v_input->'representatives','deferred_aliases',v_input->'deferred_aliases','deferred_renames',v_input->'deferred_renames'));
  perform public.set_account_generation_internal_writer_marker(v_cutover,false);
  perform pg_notify('pgrst','reload schema');
  raise notice 'Catalog organization applied: %',v_input->'counts';
end;
$organize$;
-- Only the deployment ledger uses its existing owner. Catalog/data work above
-- runs as postgres; no grants are broadened. Both phases commit atomically.
reset role;
insert into homecook_deploy.migrations(filename,sha256)
select current_setting('homecook.catalog_organization_input')::jsonb->'migration'->>'filename',
       current_setting('homecook.catalog_organization_input')::jsonb->'migration'->>'sha256'
on conflict(filename) do nothing;
do $ledger$
declare
  v_input jsonb := current_setting('homecook.catalog_organization_input')::jsonb;
  v_hash text;
begin
  select sha256 into v_hash from homecook_deploy.migrations
    where filename=v_input->'migration'->>'filename' for update;
  if v_hash is distinct from v_input->'migration'->>'sha256' then
    raise exception 'CATALOG_SCHEMA_LEDGER_DRIFT';
  end if;
end;
$ledger$;
commit;
