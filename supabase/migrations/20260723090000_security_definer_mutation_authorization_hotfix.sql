-- Security hotfix: pin every application-controlled public function to an
-- exact API principal contract. Provider/extension-managed functions are an
-- immutable observed baseline and are intentionally absent from this DDL.

begin;

create temporary table security_function_contract (
  signature text primary key,
  effect text not null check (effect in ('read-only', 'mutation', 'trigger/internal', 'auth-hook')),
  exposure text not null check (exposure in ('public', 'authenticated-self', 'service-internal', 'auth-hook-internal')),
  allowed_principals text[] not null,
  optional_before_local_nutrition_head boolean not null default false
) on commit drop;

insert into security_function_contract (
  signature,
  effect,
  exposure,
  allowed_principals,
  optional_before_local_nutrition_head
) values
  ('public.apply_ingredient_nutrition_model(jsonb)', 'mutation', 'service-internal', array['service_role'], false),
  ('public.apply_ingredient_nutrition_model_single_bundle(jsonb)', 'mutation', 'service-internal', array[]::text[], false),
  ('public.apply_ingredient_nutrition_model_without_reviewed_aliases(jsonb)', 'mutation', 'service-internal', array[]::text[], false),
  ('public.apply_public_prepared_food_catalog_import(jsonb)', 'mutation', 'service-internal', array['service_role'], false),
  ('public.apply_reviewed_ingredient_nutrition(jsonb)', 'mutation', 'service-internal', array['service_role'], true),
  ('public.assert_food_product_actor(uuid)', 'read-only', 'service-internal', array[]::text[], false),
  ('public.backfill_foodsafety_recipe_nutrition_meal_pins(boolean, uuid, integer)', 'mutation', 'service-internal', array['service_role'], false),
  ('public.build_recipe_nutrition_contributing_sources(jsonb)', 'read-only', 'service-internal', array[]::text[], false),
  ('public.build_recipe_nutrition_input_guard(uuid)', 'read-only', 'service-internal', array[]::text[], false),
  ('public.build_recipe_tag_payload(text[], text)', 'read-only', 'service-internal', array[]::text[], false),
  ('public.complete_cooking_session(uuid, uuid, uuid[])', 'mutation', 'authenticated-self', array['authenticated', 'service_role'], false),
  ('public.complete_shopping_list(uuid, uuid, uuid[])', 'mutation', 'authenticated-self', array['authenticated', 'service_role'], false),
  ('public.complete_standalone_cooking(uuid, uuid, integer, uuid[])', 'mutation', 'authenticated-self', array['authenticated', 'service_role'], false),
  ('public.consume_youtube_ingredient_registration_rate_limit(uuid, uuid, uuid, text)', 'mutation', 'service-internal', array['service_role'], false),
  ('public.create_manual_food_product(uuid, text, text, jsonb)', 'mutation', 'authenticated-self', array['authenticated', 'service_role'], false),
  ('public.create_manual_recipe(uuid, text, integer, text, text[], text, jsonb, jsonb)', 'mutation', 'authenticated-self', array['authenticated', 'service_role'], false),
  ('public.create_product_planner_entry(uuid, uuid, date, uuid, numeric, text, uuid)', 'mutation', 'authenticated-self', array['authenticated', 'service_role'], false),
  ('public.create_shopping_list_from_payload(uuid, text, date, date, boolean, uuid[], jsonb, jsonb, jsonb, jsonb, integer)', 'mutation', 'authenticated-self', array['authenticated', 'service_role'], false),
  ('public.decode_recipe_nutrition_query_key(text)', 'read-only', 'service-internal', array[]::text[], false),
  ('public.delete_manual_food_product(uuid, uuid)', 'mutation', 'authenticated-self', array['authenticated', 'service_role'], false),
  ('public.delete_owned_planner_column(uuid, uuid)', 'mutation', 'authenticated-self', array['authenticated', 'service_role'], false),
  ('public.delete_product_planner_entry(uuid, uuid)', 'mutation', 'authenticated-self', array['authenticated', 'service_role'], false),
  ('public.delete_user_private_data(uuid)', 'mutation', 'service-internal', array['service_role'], false),
  ('public.disable_ingredient_nutrition_model(text, text, uuid, text, timestamp with time zone)', 'mutation', 'service-internal', array['service_role'], false),
  ('public.disable_public_prepared_food_catalog_import(text, text, uuid, text, timestamp with time zone)', 'mutation', 'service-internal', array['service_role'], false),
  ('public.dry_run_recipe_tag_projection_backfill(integer)', 'read-only', 'service-internal', array['service_role'], false),
  ('public.find_recipe_ids_by_public_tags(text, text)', 'read-only', 'public', array['anon', 'authenticated', 'service_role'], false),
  ('public.food_product_payload(uuid, uuid)', 'read-only', 'service-internal', array[]::text[], false),
  ('public.get_ingredient_nutrition_model_run(text)', 'read-only', 'service-internal', array['service_role'], false),
  ('public.get_public_prepared_food_catalog_import_run(text)', 'read-only', 'service-internal', array['service_role'], false),
  ('public.increment_recipe_view_count(uuid)', 'mutation', 'service-internal', array['service_role'], false),
  ('public.insert_manual_food_product_values(uuid, jsonb)', 'mutation', 'service-internal', array[]::text[], false),
  ('public.list_food_products(uuid, text, text, timestamp with time zone, uuid, integer)', 'read-only', 'authenticated-self', array['authenticated', 'service_role'], false),
  ('public.list_food_products(uuid, text, timestamp with time zone, uuid, integer)', 'read-only', 'authenticated-self', array['authenticated', 'service_role'], false),
  ('public.list_home_theme_recipes(integer, integer)', 'read-only', 'public', array['anon', 'authenticated', 'service_role'], false),
  ('public.list_product_planner_entries(uuid, date, date, uuid)', 'read-only', 'authenticated-self', array['authenticated', 'service_role'], false),
  ('public.list_public_recipe_tags(text, text, boolean, integer)', 'read-only', 'public', array['anon', 'authenticated', 'service_role'], false),
  ('public.lock_recipe_nutrition_ingredient_ids(uuid[], boolean)', 'read-only', 'service-internal', array[]::text[], false),
  ('public.lock_recipe_nutrition_predecessor_mutation()', 'trigger/internal', 'service-internal', array[]::text[], false),
  ('public.lock_recipe_nutrition_recipe_ids(uuid[])', 'read-only', 'service-internal', array[]::text[], false),
  ('public.lock_recipe_nutrition_recipe_ingredient_mutation()', 'trigger/internal', 'service-internal', array[]::text[], false),
  ('public.merge_ingredient_nutrition_affected_rows(jsonb, jsonb)', 'read-only', 'service-internal', array[]::text[], false),
  ('public.normalize_recipe_nutrition_unit(text)', 'read-only', 'service-internal', array[]::text[], true),
  ('public.normalize_recipe_tag_key(text)', 'read-only', 'service-internal', array[]::text[], false),
  ('public.pin_current_recipe_nutrition_snapshot_on_meal_insert()', 'trigger/internal', 'service-internal', array[]::text[], false),
  ('public.prepared_food_catalog_import_item_digest(jsonb)', 'read-only', 'service-internal', array[]::text[], false),
  ('public.product_planner_entry_payload(uuid, uuid)', 'read-only', 'service-internal', array[]::text[], false),
  ('public.product_planner_quantity_scale(uuid, numeric, text)', 'read-only', 'service-internal', array[]::text[], false),
  ('public.protect_food_product_identity()', 'trigger/internal', 'service-internal', array[]::text[], false),
  ('public.protect_food_product_nutrition_version()', 'trigger/internal', 'service-internal', array[]::text[], false),
  ('public.protect_ingredient_nutrition_run_registry()', 'trigger/internal', 'service-internal', array[]::text[], false),
  ('public.protect_meal_recipe_nutrition_pin()', 'trigger/internal', 'service-internal', array[]::text[], false),
  ('public.protect_nutrition_model_row()', 'trigger/internal', 'service-internal', array[]::text[], false),
  ('public.protect_product_planner_entry()', 'trigger/internal', 'service-internal', array[]::text[], false),
  ('public.protect_public_prepared_food_catalog_import_run_registry()', 'trigger/internal', 'service-internal', array[]::text[], false),
  ('public.protect_recipe_nutrition_snapshot()', 'trigger/internal', 'service-internal', array[]::text[], false),
  ('public.recipe_nutrition_ingredient_lock_key(uuid)', 'read-only', 'service-internal', array[]::text[], false),
  ('public.recipe_nutrition_recipe_lock_key(uuid)', 'read-only', 'service-internal', array[]::text[], false),
  ('public.reconcile_recipe_tag_usage_counts(boolean)', 'mutation', 'service-internal', array['service_role'], false),
  ('public.register_youtube_ingredient(text, text, text, text)', 'mutation', 'service-internal', array['service_role'], false),
  ('public.register_youtube_ingredient(text, text, text, text, text)', 'mutation', 'service-internal', array['service_role'], false),
  ('public.register_youtube_recipe_from_session(uuid, uuid, text, integer, text, text, text[], text, jsonb, jsonb)', 'mutation', 'authenticated-self', array['authenticated', 'service_role'], false),
  ('public.report_food_product(uuid, uuid, text, text)', 'mutation', 'authenticated-self', array['authenticated', 'service_role'], false),
  ('public.restore_recipe_nutrition_snapshot_current(uuid, uuid, uuid)', 'mutation', 'service-internal', array['service_role'], false),
  ('public.set_recipe_tags(uuid, jsonb, uuid, text)', 'mutation', 'service-internal', array['service_role'], false),
  ('public.sync_recipe_like_count()', 'trigger/internal', 'service-internal', array[]::text[], false),
  ('public.update_manual_food_product(uuid, uuid, jsonb, uuid)', 'mutation', 'authenticated-self', array['authenticated', 'service_role'], false),
  ('public.update_product_planner_entry_quantity(uuid, uuid, numeric, text)', 'mutation', 'authenticated-self', array['authenticated', 'service_role'], false),
  ('public.validate_food_product_basis_relations(jsonb)', 'read-only', 'service-internal', array[]::text[], false),
  ('public.validate_food_product_current_version()', 'trigger/internal', 'service-internal', array[]::text[], false),
  ('public.validate_ingredient_nutrition_model_insert()', 'trigger/internal', 'service-internal', array[]::text[], false),
  ('public.validate_product_aware_nutrition_value_insert()', 'trigger/internal', 'service-internal', array[]::text[], false),
  ('public.validate_recipe_nutrition_snapshot_payload(jsonb)', 'read-only', 'service-internal', array[]::text[], false),
  ('public.write_recipe_nutrition_snapshot(uuid, jsonb, timestamp with time zone, jsonb)', 'mutation', 'service-internal', array['service_role'], false);

create index if not exists youtube_ingredient_registration_attempt_rate_limit_idx
  on public.operational_events (actor_user_id, created_at desc)
  where event_type = 'youtube_ingredient_registration_attempt';

-- This function is introduced by this hotfix. Dropping it first keeps local
-- development replays deterministic if its return shape changes before merge;
-- fresh and production databases have no pre-existing object to preserve.
drop function if exists public.consume_youtube_ingredient_registration_rate_limit(uuid, uuid, uuid, text);

create or replace function public.consume_youtube_ingredient_registration_rate_limit(
  p_user_id uuid,
  p_extraction_id uuid,
  p_draft_ingredient_id uuid,
  p_request_path text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_attempt_count integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'taxonomy rate limit requires service_role' using errcode = '42501';
  end if;
  if p_user_id is null or p_extraction_id is null or p_draft_ingredient_id is null then
    raise exception 'taxonomy rate limit provenance is required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'youtube-ingredient-registration:' || p_user_id::text,
      0
    )
  );

  insert into public.operational_events (
    event_type,
    severity,
    source,
    actor_user_id,
    request_path,
    message_summary,
    metadata_json
  ) values (
    'youtube_ingredient_registration_attempt',
    'info',
    'youtube',
    p_user_id,
    pg_catalog.left(coalesce(p_request_path, ''), 500),
    'YouTube ingredient registration attempted',
    pg_catalog.jsonb_build_object(
      'extraction_id', p_extraction_id,
      'draft_ingredient_id', p_draft_ingredient_id
    )
  );

  select pg_catalog.count(*)::integer
    into v_attempt_count
    from public.operational_events
   where event_type = 'youtube_ingredient_registration_attempt'
     and actor_user_id = p_user_id
     and created_at >= pg_catalog.now() - interval '10 minutes';

  return pg_catalog.jsonb_build_object(
    'allowed', v_attempt_count <= 20,
    'attempt_count', v_attempt_count
  );
end;
$function$;

do $hotfix$
declare
  v_definition text;
  v_signature text;
  v_unexpected text;
  v_missing text;
begin
  select string_agg(actual.signature, ', ' order by actual.signature)
    into v_unexpected
    from (
      select format('%I.%I(%s)', n.nspname, p.proname, pg_catalog.oidvectortypes(p.proargtypes)) as signature
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      left join pg_catalog.pg_depend dependency
        on dependency.classid = 'pg_proc'::pg_catalog.regclass
       and dependency.objid = p.oid
       and dependency.deptype = 'e'
      where n.nspname = 'public'
        and p.prokind = 'f'
        and dependency.objid is null
    ) actual
    left join security_function_contract contract using (signature)
    where contract.signature is null;

  select string_agg(contract.signature, ', ' order by contract.signature)
    into v_missing
    from security_function_contract contract
    where not contract.optional_before_local_nutrition_head
      and pg_catalog.to_regprocedure(contract.signature) is null;

  if v_unexpected is not null or v_missing is not null then
    raise exception 'application-controlled function inventory drift: unexpected=[%], missing=[%]',
      coalesce(v_unexpected, ''),
      coalesce(v_missing, '');
  end if;

  -- Six authenticated-self functions shared the same NULL-permissive guard.
  foreach v_signature in array array[
    'public.complete_cooking_session(uuid, uuid, uuid[])',
    'public.complete_shopping_list(uuid, uuid, uuid[])',
    'public.complete_standalone_cooking(uuid, uuid, integer, uuid[])',
    'public.create_manual_recipe(uuid, text, integer, text, text[], text, jsonb, jsonb)',
    'public.create_shopping_list_from_payload(uuid, text, date, date, boolean, uuid[], jsonb, jsonb, jsonb, jsonb, integer)',
    'public.register_youtube_recipe_from_session(uuid, uuid, text, integer, text, text, text[], text, jsonb, jsonb)'
  ] loop
    select pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(v_signature))
      into v_definition;

    if v_definition not like '%auth.uid() is null or auth.uid() <> p_user_id%' then
      v_definition := pg_catalog.replace(
        v_definition,
        'if auth.uid() is not null and auth.uid() <> p_user_id then',
        $guard$if auth.role() = 'service_role' then
    null;
  elsif auth.uid() is null or auth.uid() <> p_user_id then$guard$
      );

      if v_definition not like '%auth.uid() is null or auth.uid() <> p_user_id%' then
        raise exception 'authenticated-self guard drift for %', v_signature;
      end if;

      execute v_definition;
    end if;
  end loop;

  v_signature := 'public.delete_user_private_data(uuid)';
  select pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(v_signature))
    into v_definition;
  if v_definition not like '%auth.role() is distinct from ''service_role''%' then
    v_definition := pg_catalog.replace(
      v_definition,
      'if auth.uid() is not null and auth.uid() <> p_user_id then',
      'if auth.role() is distinct from ''service_role'' then'
    );
    if v_definition not like '%auth.role() is distinct from ''service_role''%' then
      raise exception 'service-only guard drift for %', v_signature;
    end if;
    execute v_definition;
  end if;

  v_signature := 'public.register_youtube_ingredient(text, text, text, text, text)';
  select pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(v_signature))
    into v_definition;
  if v_definition not like '%taxonomy mutation requires service_role%' then
    v_definition := pg_catalog.regexp_replace(
      v_definition,
      E'\nbegin\n',
      E'\nbegin\n  if auth.role() is distinct from ''service_role'' then\n    raise exception ''taxonomy mutation requires service_role'' using errcode = ''42501'';\n  end if;\n',
      ''
    );
    if v_definition not like '%taxonomy mutation requires service_role%' then
      raise exception 'service-only guard injection drift for %', v_signature;
    end if;
    execute v_definition;
  end if;
end
$hotfix$;

create or replace function public.register_youtube_ingredient(
  p_standard_name text,
  p_category text,
  p_default_unit text,
  p_synonym text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'taxonomy mutation requires service_role' using errcode = '42501';
  end if;

  return public.register_youtube_ingredient(
    p_standard_name,
    p_category,
    null,
    p_default_unit,
    p_synonym
  );
end;
$function$;

create or replace function public.increment_recipe_view_count(p_recipe_id uuid)
returns table(id uuid, view_count integer)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'recipe view mutation requires service_role' using errcode = '42501';
  end if;

  return query
  update public.recipes
     set view_count = recipes.view_count + 1
   where recipes.id = p_recipe_id
  returning recipes.id, recipes.view_count;
end;
$function$;

do $authorization$
declare
  contract record;
  principal text;
  v_config text;
begin
  for contract in
    select *
    from security_function_contract
    where pg_catalog.to_regprocedure(signature) is not null
    order by signature
  loop
    execute format(
      'revoke execute on function %s from public, anon, authenticated, service_role',
      contract.signature
    );

    foreach principal in array contract.allowed_principals loop
      execute format(
        'grant execute on function %s to %I',
        contract.signature,
        principal
      );
    end loop;

    if (
      select p.prosecdef
      from pg_catalog.pg_proc p
      where p.oid = pg_catalog.to_regprocedure(contract.signature)
    ) then
      select pg_catalog.array_to_string(p.proconfig, ',')
        into v_config
        from pg_catalog.pg_proc p
        where p.oid = pg_catalog.to_regprocedure(contract.signature);

      if coalesce(v_config, '') like '%extensions%' and coalesce(v_config, '') like '%public%' then
        execute format(
          'alter function %s set search_path to pg_catalog, extensions, public, pg_temp',
          contract.signature
        );
      elsif coalesce(v_config, '') like '%extensions%' then
        execute format(
          'alter function %s set search_path to pg_catalog, extensions, pg_temp',
          contract.signature
        );
      elsif coalesce(v_config, '') like '%auth%' then
        execute format(
          'alter function %s set search_path to pg_catalog, auth, pg_temp',
          contract.signature
        );
      elsif coalesce(v_config, '') like '%public%' then
        execute format(
          'alter function %s set search_path to pg_catalog, public, pg_temp',
          contract.signature
        );
      else
        execute format(
          'alter function %s set search_path to pg_catalog, pg_temp',
          contract.signature
        );
      end if;
    end if;
  end loop;
end
$authorization$;

-- Critical signatures are repeated literally for migration lint and reviewer
-- verification. The contract loop above already converges these grants.
revoke execute on function public.delete_user_private_data(uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_user_private_data(uuid) to service_role;

revoke execute on function public.register_youtube_ingredient(text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.register_youtube_ingredient(text, text, text, text) to service_role;
revoke execute on function public.register_youtube_ingredient(text, text, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.register_youtube_ingredient(text, text, text, text, text) to service_role;

revoke execute on function public.increment_recipe_view_count(uuid) from public, anon, authenticated, service_role;
grant execute on function public.increment_recipe_view_count(uuid) to service_role;

revoke execute on function public.consume_youtube_ingredient_registration_rate_limit(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.consume_youtube_ingredient_registration_rate_limit(uuid, uuid, uuid, text) to service_role;

revoke execute on function public.complete_cooking_session(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.complete_cooking_session(uuid, uuid, uuid[]) to authenticated, service_role;
revoke execute on function public.complete_shopping_list(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.complete_shopping_list(uuid, uuid, uuid[]) to authenticated, service_role;
revoke execute on function public.complete_standalone_cooking(uuid, uuid, integer, uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.complete_standalone_cooking(uuid, uuid, integer, uuid[]) to authenticated, service_role;
revoke execute on function public.create_shopping_list_from_payload(uuid, text, date, date, boolean, uuid[], jsonb, jsonb, jsonb, jsonb, integer) from public, anon, authenticated, service_role;
grant execute on function public.create_shopping_list_from_payload(uuid, text, date, date, boolean, uuid[], jsonb, jsonb, jsonb, jsonb, integer) to authenticated, service_role;

commit;
