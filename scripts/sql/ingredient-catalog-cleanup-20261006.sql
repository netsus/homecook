-- Reviewed data-only catalog cleanup; preserves nutrition-model deletion protections.
set local lock_timeout='10s';
set local statement_timeout='120s';
do $cleanup$
declare
  v_input jsonb := current_setting('homecook.catalog_cleanup_input',true)::jsonb;
  v_row jsonb; v_actual jsonb; v_relation record; v_count bigint; v_column text;
  v_ids uuid[]; v_patterns text[]; v_cutover uuid;
  v_deleted_aliases jsonb; v_removed_aliases jsonb := '[]'::jsonb;
begin
  if v_input->>'schema_version' is distinct from 'homecook-catalog-cleanup-20261006'
    or v_input->>'operation_checksum' is distinct from 'b23ebcc8f0a4550150a01bda4af9b94977a28a0b22c0fa6547588965db7e276e'
    or jsonb_array_length(v_input->'deletes') is distinct from 18
    or jsonb_array_length(v_input->'renames') is distinct from 33
    or jsonb_array_length(v_input->'category_fixes') is distinct from 11
    or jsonb_array_length(v_input->'alias_removals') is distinct from 179 then
    raise exception 'CATALOG_CLEANUP_INPUT_MISMATCH';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('homecook:catalog-cleanup-20261006',0));
  if exists(select 1 from public.operational_events where event_type='ingredient_catalog_cleanup_applied'
    and metadata_json->>'operation_checksum'=v_input->>'operation_checksum') then
    raise notice 'Catalog cleanup already applied; no writes'; return;
  end if;
  select array_agg((value->>'id')::uuid),array_agg('%'||(value->>'id')||'%') into v_ids,v_patterns
    from jsonb_array_elements(v_input->'deletes');
  -- Ingredient row locks also prevent new FK references during the bounded cleanup.
  perform 1 from public.ingredients where id in (
    select (value->>'id')::uuid from jsonb_array_elements((v_input->'deletes')||(v_input->'renames')||(v_input->'category_fixes'))
  ) order by id for update;
  for v_row in select value from jsonb_array_elements((v_input->'deletes')||(v_input->'renames')||(v_input->'category_fixes')) loop
    select to_jsonb(i) into v_actual from public.ingredients i where id=(v_row->>'id')::uuid;
    if v_actual is distinct from v_row->'expected' then raise exception 'CATALOG_ROW_DRIFT: %',v_row->>'id'; end if;
  end loop;
  for v_relation in select distinct value->>'schema_name' schema_name,value->>'table_name' table_name from jsonb_array_elements(v_input->'json_reference_scope') order by 1,2 loop
    if v_relation.schema_name='private' and v_relation.table_name='youtube_extraction_current_policy' then
      -- Model settings are not user ingredient records and are read-only for this operator.
      execute format('lock table %I.%I in access share mode',v_relation.schema_name,v_relation.table_name);
    else
      execute format('lock table %I.%I in share mode',v_relation.schema_name,v_relation.table_name);
    end if;
  end loop;
  -- Discover every current direct FK, not just the catalog known by the renderer.
  for v_relation in select c.conrelid, c.conkey, n.nspname, t.relname from pg_catalog.pg_constraint c
    join pg_catalog.pg_class t on t.oid=c.conrelid join pg_catalog.pg_namespace n on n.oid=t.relnamespace
    where c.contype='f' and c.confrelid='public.ingredients'::regclass
  loop
    if array_length(v_relation.conkey,1) is distinct from 1 then raise exception 'CATALOG_UNKNOWN_REFERENCE_SHAPE'; end if;
    select attname into v_column from pg_catalog.pg_attribute where attrelid=v_relation.conrelid and attnum=v_relation.conkey[1];
    if v_relation.nspname='public' and v_relation.relname='ingredient_synonyms' and v_column='ingredient_id' then continue; end if;
    execute format('select count(*) from %I.%I where %I=any($1)',v_relation.nspname,v_relation.relname,v_column) into v_count using v_ids;
    if v_count<>0 then raise exception 'CATALOG_DELETE_REFERENCED: %.%',v_relation.relname,v_column; end if;
  end loop;
  if exists(select 1 from public.shopping_list_items where unavailable_ingredient_id=any(v_ids)) then
    raise exception 'CATALOG_DELETE_REFERENCED: unavailable_ingredient_id';
  end if;
  for v_row in select value from jsonb_array_elements(v_input->'json_reference_scope') loop
    execute format('select count(*) from %I.%I where %I::text ilike any($1)',v_row->>'schema_name',v_row->>'table_name',v_row->>'column_name') into v_count using v_patterns;
    if v_count<>0 then raise exception 'CATALOG_DELETE_JSON_REFERENCED: %.%',v_row->>'table_name',v_row->>'column_name'; end if;
  end loop;
  for v_row in select value from jsonb_array_elements(v_input->'renames') loop
    if exists(select 1 from public.ingredients where id<>(v_row->>'id')::uuid
      and public.normalize_ingredient_search_name(standard_name)=public.normalize_ingredient_search_name(v_row->>'new_name')) then
      raise exception 'CATALOG_RENAME_COLLISION: %',v_row->>'new_name';
    end if;
  end loop;
  select coalesce(jsonb_agg(to_jsonb(a) order by id),'[]'::jsonb) into v_deleted_aliases
    from public.ingredient_synonyms a where ingredient_id=any(v_ids);
  select current_cutover_attempt_id into v_cutover from public.account_generation_capability_state
    where singleton and state='generation_active' for key share;
  if v_cutover is null then raise exception 'CATALOG_WRITER_UNAVAILABLE'; end if;
  perform public.set_account_generation_internal_writer_marker(v_cutover,true);
  for v_row in select value from jsonb_array_elements(v_input->'alias_removals') loop
    delete from public.ingredient_synonyms where id=(v_row->>'id')::uuid
      and ingredient_id=(v_row->>'ingredient_id')::uuid and synonym=v_row->>'synonym' returning to_jsonb(ingredient_synonyms) into v_actual;
    if v_actual is null then raise exception 'CATALOG_ALIAS_DRIFT'; end if;
    v_removed_aliases:=v_removed_aliases||jsonb_build_array(v_actual);
  end loop;
  for v_row in select value from jsonb_array_elements(v_input->'renames') loop
    update public.ingredients set standard_name=v_row->>'new_name' where id=(v_row->>'id')::uuid;
  end loop;
  for v_row in select value from jsonb_array_elements(v_input->'category_fixes') loop
    if not exists(select 1 from public.ingredient_categories where code=v_row->>'new_category_code'
      and legacy_category=v_row->>'new_category' and is_active) then raise exception 'CATALOG_CATEGORY_INVALID'; end if;
    update public.ingredients set category=v_row->>'new_category',category_code=v_row->>'new_category_code' where id=(v_row->>'id')::uuid;
  end loop;
  for v_row in select value from jsonb_array_elements(v_input->'default_unit_fixes') loop
    update public.ingredients set default_unit=v_row->>'new_unit'
      where id=(v_row->>'id')::uuid and default_unit is not distinct from v_row->>'old_unit';
    if not found then raise exception 'CATALOG_DEFAULT_UNIT_DRIFT'; end if;
  end loop;
  delete from public.ingredients where id=any(v_ids);
  get diagnostics v_count=row_count;
  if v_count<>18 then raise exception 'CATALOG_DELETE_COUNT_MISMATCH'; end if;
  insert into public.operational_events(event_type,severity,source,actor_user_id,message_summary,metadata_json)
  values('ingredient_catalog_cleanup_applied','info','ingredient-catalog-cleanup-20261006',(v_input->>'actor_id')::uuid,
    'Remove unused out-of-scope ingredients and repair catalog names/categories without changing nutrition',
    jsonb_build_object('operation_checksum',v_input->>'operation_checksum','user_scope',v_input->>'user_scope',
      'deleted_ingredients',v_input->'deletes','deleted_ingredient_aliases',v_deleted_aliases,
      'renames',v_input->'renames','category_fixes',v_input->'category_fixes','default_unit_fixes',v_input->'default_unit_fixes',
      'removed_attribute_aliases',v_removed_aliases,'json_reference_scope',v_input->'json_reference_scope'));
  perform public.set_account_generation_internal_writer_marker(v_cutover,false);
  raise notice 'Catalog cleanup applied: 18 deletions, 33 names, 11 categories, 179 attribute aliases';
end;
$cleanup$;
commit;
