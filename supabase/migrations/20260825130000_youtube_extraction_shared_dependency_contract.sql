begin;

-- Keep the queue catalog exact for YouTube-owned objects while representing
-- shared catalog dependencies by the narrow surface the worker actually uses.
create or replace function private.youtube_extraction_shared_dependency_contract_v1()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.concat_ws(
    E'\n',
    'youtube-extraction-shared-dependency-contract-v1',
    'required_columns',
    coalesce((
      select pg_catalog.string_agg(
        namespace.nspname || '.' || relation.relname || '.' || attribute.attname
          || '|type=' || pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
          || '|not_null=' || attribute.attnotnull::text
          || '|default=' || coalesce(
            pg_catalog.pg_get_expr(attribute_default.adbin, attribute_default.adrelid),
            ''
          ),
        E'\n'
        order by namespace.nspname, relation.relname, attribute.attname
      )
      from pg_catalog.pg_attribute as attribute
      join pg_catalog.pg_class as relation on relation.oid = attribute.attrelid
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      left join pg_catalog.pg_attrdef as attribute_default
        on attribute_default.adrelid = attribute.attrelid
       and attribute_default.adnum = attribute.attnum
      where attribute.attnum > 0
        and not attribute.attisdropped
        and (namespace.nspname, relation.relname, attribute.attname) in (
          ('public', 'ingredients', 'id'),
          ('public', 'ingredients', 'standard_name'),
          ('public', 'ingredients', 'category'),
          ('public', 'ingredients', 'default_unit'),
          ('public', 'ingredient_synonyms', 'ingredient_id'),
          ('public', 'ingredient_synonyms', 'synonym'),
          ('public', 'cooking_methods', 'id'),
          ('public', 'cooking_methods', 'code'),
          ('public', 'cooking_methods', 'label'),
          ('public', 'cooking_methods', 'color_key'),
          ('public', 'cooking_methods', 'is_system'),
          ('public', 'cooking_methods', 'display_order')
        )
    ), ''),
    'rls',
    coalesce((
      select pg_catalog.string_agg(
        namespace.nspname || '.' || relation.relname
          || '|rls=' || relation.relrowsecurity::text
          || '|force=' || relation.relforcerowsecurity::text,
        E'\n'
        order by relation.relname
      )
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname in ('ingredients', 'ingredient_synonyms', 'cooking_methods')
    ), ''),
    'required_policies',
    coalesce((
      select pg_catalog.string_agg(
        policy.schemaname || '.' || policy.tablename || '|' || policy.policyname
          || '|permissive=' || policy.permissive
          || '|cmd=' || policy.cmd
          || '|roles=' || coalesce(pg_catalog.array_to_string(policy.roles, ','), '')
          || '|qual=' || coalesce(policy.qual, '')
          || '|check=' || coalesce(policy.with_check, ''),
        E'\n'
        order by policy.tablename, policy.policyname
      )
      from pg_catalog.pg_policies as policy
      where policy.schemaname = 'public'
        and (policy.tablename, policy.policyname) in (
          ('ingredients', 'youtube_worker_catalog_ingredients_select'),
          ('ingredient_synonyms', 'youtube_worker_catalog_ingredient_synonyms_select'),
          ('cooking_methods', 'youtube_worker_catalog_cooking_methods_all')
        )
    ), ''),
    'required_grants',
    pg_catalog.concat_ws(
      E'\n',
      'ingredients|select=' || pg_catalog.has_table_privilege(
        'youtube_extraction_worker_rpc_owner',
        'public.ingredients',
        'SELECT'
      )::text,
      'ingredient_synonyms|select=' || pg_catalog.has_table_privilege(
        'youtube_extraction_worker_rpc_owner',
        'public.ingredient_synonyms',
        'SELECT'
      )::text,
      'cooking_methods|select=' || pg_catalog.has_table_privilege(
        'youtube_extraction_worker_rpc_owner',
        'public.cooking_methods',
        'SELECT'
      )::text,
      'cooking_methods|insert=' || pg_catalog.has_table_privilege(
        'youtube_extraction_worker_rpc_owner',
        'public.cooking_methods',
        'INSERT'
      )::text,
      'cooking_methods|update=' || pg_catalog.has_table_privilege(
        'youtube_extraction_worker_rpc_owner',
        'public.cooking_methods',
        'UPDATE'
      )::text
    ),
    'scope_marker',
    coalesce(private.youtube_extraction_internal_scope_contract_v1(), ''),
    'contract_definition',
    coalesce((
      select pg_catalog.encode(
        extensions.digest(
          pg_catalog.convert_to(pg_catalog.pg_get_functiondef(procedure.oid), 'UTF8'),
          'sha256'
        ),
        'hex'
      )
      from pg_catalog.pg_proc as procedure
      where procedure.oid = pg_catalog.to_regprocedure(
        'private.youtube_extraction_shared_dependency_contract_v1()'
      )
    ), '')
  );
$function$;

alter function private.youtube_extraction_shared_dependency_contract_v1()
  owner to postgres;
revoke all on function private.youtube_extraction_shared_dependency_contract_v1()
  from public, anon, authenticated, service_role,
    youtube_extraction_worker, youtube_extraction_credential_manager;
grant execute on function private.youtube_extraction_shared_dependency_contract_v1()
  to youtube_extraction_credential_manager_rpc_owner;
comment on function private.youtube_extraction_shared_dependency_contract_v1() is
  'Stable required-column, worker-policy, worker-grant, and scope contract for shared YouTube dependencies.';

do $membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'grant youtube_extraction_credential_manager_rpc_owner to %I with inherit false, set true granted by %I',
      current_user,
      current_user
    );
  else
    execute format(
      'grant youtube_extraction_credential_manager_rpc_owner to %I',
      current_user
    );
  end if;
end;
$membership$;

grant create on schema public, private
  to youtube_extraction_credential_manager_rpc_owner;

set local role youtube_extraction_credential_manager_rpc_owner;

do $migration$
declare
  v_previous_fingerprint constant text :=
    'a0740a9e9789d0176d55bac206f3bc7a7ed2b5dc9eb31737317d072512477d6c';
  v_current_fingerprint constant text :=
    '605c4e37ccd34313f00d4687c5340d8ea8ccdf958eb297805bbae871438775cc';
  v_signature regprocedure;
  v_definition text;
  v_rewritten text;
  v_occurrences integer;
begin
  v_signature := 'public.read_youtube_extraction_enqueue_readiness()'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_signature);
  v_occurrences := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_previous_fingerprint, ''))
  ) / pg_catalog.length(v_previous_fingerprint);
  if v_occurrences <> 1 then
    raise exception 'YouTube readiness fingerprint source drifted'
      using errcode = '55000';
  end if;

  v_rewritten := pg_catalog.replace(
    v_definition,
    v_previous_fingerprint,
    v_current_fingerprint
  );

  -- Remove complete-head shared catalog inventory. The narrow helper below is
  -- inserted as a separate reviewed component instead.
  v_rewritten := pg_catalog.regexp_replace(
    v_rewritten,
    $pattern$[[:space:]]+or table_row\.tablename in \('cooking_methods', 'ingredient_synonyms', 'ingredients'\)$pattern$,
    '',
    'g'
  );
  v_rewritten := pg_catalog.regexp_replace(
    v_rewritten,
    $pattern$[[:space:]]*'public\.cooking_methods',[[:space:]]*'public\.ingredient_synonyms',[[:space:]]*'public\.ingredients',$pattern$,
    '',
    'g'
  );
  v_rewritten := pg_catalog.regexp_replace(
    v_rewritten,
    $pattern$[[:space:]]+or relation\.relname in \('cooking_methods', 'ingredient_synonyms', 'ingredients'\)$pattern$,
    '',
    'g'
  );
  v_rewritten := pg_catalog.regexp_replace(
    v_rewritten,
    $pattern$[[:space:]]+or policy\.tablename in \('cooking_methods', 'ingredient_synonyms', 'ingredients'\)$pattern$,
    '',
    'g'
  );

  -- PostgreSQL 15/17 and full-local restore can use different trusted platform
  -- owner names without changing the YouTube authorization contract.
  v_rewritten := pg_catalog.replace(
    v_rewritten,
    'pg_catalog.pg_get_userbyid(relation.relowner)',
    $rewrite$case when pg_catalog.pg_get_userbyid(relation.relowner) in ('postgres', 'supabase_admin') then 'platform_admin' else pg_catalog.pg_get_userbyid(relation.relowner) end$rewrite$
  );
  v_rewritten := pg_catalog.replace(
    v_rewritten,
    'pg_catalog.pg_get_userbyid(namespace.nspowner)',
    $rewrite$case when pg_catalog.pg_get_userbyid(namespace.nspowner) in ('postgres', 'supabase_admin', 'pg_database_owner') then 'platform_admin' else pg_catalog.pg_get_userbyid(namespace.nspowner) end$rewrite$
  );
  v_rewritten := pg_catalog.replace(
    v_rewritten,
    $rewrite$        where namespace.nspname in ('private', 'public')
      )
    ), ''),
    'memberships',$rewrite$,
    $rewrite$        where namespace.nspname in ('private', 'public')
      )
      and role_row.rolname not in ('postgres', 'supabase_admin', 'pg_database_owner')
    ), ''),
    'memberships',$rewrite$
  );

  -- Owner/default platform privileges and the explicit postgres EXECUTE row are
  -- deployment-shape noise. Non-owner grants still remain exact and fail closed.
  v_rewritten := pg_catalog.replace(
    v_rewritten,
    $rewrite$      left join pg_catalog.pg_roles as grantee on grantee.oid = privilege.grantee
      where relation.relkind in ('r', 'p')$rewrite$,
    $rewrite$      left join pg_catalog.pg_roles as grantee on grantee.oid = privilege.grantee
      where privilege.grantee is distinct from relation.relowner
        and coalesce(grantee.rolname, 'PUBLIC') not in ('postgres', 'supabase_admin')
        and not (
          namespace.nspname = 'public'
          and relation.relname in (
            'youtube_extraction_candidates',
            'youtube_extraction_sessions',
            'youtube_llm_extraction_cache',
            'youtube_llm_extraction_events',
            'youtube_transcript_cache',
            'youtube_transcript_fetch_events',
            'youtube_visual_extraction_cache',
            'youtube_visual_extraction_events'
          )
          and coalesce(grantee.rolname, 'PUBLIC') in (
            'anon', 'authenticated', 'service_role'
          )
        )
        and relation.relkind in ('r', 'p')$rewrite$
  );
  v_rewritten := pg_catalog.replace(
    v_rewritten,
    $rewrite$            left join pg_catalog.pg_roles as grantee on grantee.oid = privilege.grantee
          ), ''),$rewrite$,
    $rewrite$            left join pg_catalog.pg_roles as grantee on grantee.oid = privilege.grantee
            where coalesce(grantee.rolname, 'PUBLIC') <> 'postgres'
          ), ''),$rewrite$
  );

  -- Canonicalize equivalent PostgreSQL 15/17 cast rendering in check clauses.
  v_rewritten := pg_catalog.replace(
    v_rewritten,
    'pg_catalog.pg_get_constraintdef(constraint_row.oid, true)',
    $rewrite$pg_catalog.regexp_replace(pg_catalog.pg_get_constraintdef(constraint_row.oid, true), '::(text|character varying)(\[\])?', '', 'g')$rewrite$
  );

  v_rewritten := pg_catalog.replace(
    v_rewritten,
    $rewrite$    'internal_scope_function_definition',
$rewrite$,
    $rewrite$    'shared_dependency_contract',
    private.youtube_extraction_shared_dependency_contract_v1(),
    'internal_scope_function_definition',
$rewrite$
  );

  if pg_catalog.strpos(v_rewritten, v_previous_fingerprint) <> 0
    or pg_catalog.strpos(v_rewritten, v_current_fingerprint) = 0
    or pg_catalog.strpos(v_rewritten, 'shared_dependency_contract') = 0
    or pg_catalog.strpos(v_rewritten, $rewrite$'public.cooking_methods',$rewrite$) <> 0 then
    raise exception 'YouTube shared dependency catalog rewrite failed'
      using errcode = '55000', detail = pg_catalog.format(
        'previous=%s current=%s component=%s shared_table=%s',
        pg_catalog.strpos(v_rewritten, v_previous_fingerprint),
        pg_catalog.strpos(v_rewritten, v_current_fingerprint),
        pg_catalog.strpos(v_rewritten, 'shared_dependency_contract'),
        pg_catalog.strpos(v_rewritten, $rewrite$'public.cooking_methods',$rewrite$)
      );
  end if;
  execute v_rewritten;

  v_signature := 'private.assert_youtube_extraction_catalog_ready()'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_signature);
  v_occurrences := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_previous_fingerprint, ''))
  ) / pg_catalog.length(v_previous_fingerprint);
  if v_occurrences <> 1 then
    raise exception 'YouTube catalog assertion fingerprint source drifted'
      using errcode = '55000';
  end if;
  execute pg_catalog.replace(
    v_definition,
    v_previous_fingerprint,
    v_current_fingerprint
  );
end;
$migration$;

comment on function public.read_youtube_extraction_enqueue_readiness() is
  'Returns exact YouTube-owned and required shared-dependency attestation before enqueue.';
comment on function private.assert_youtube_extraction_catalog_ready() is
  'Fails closed unless YouTube-owned and required shared-dependency contracts match.';

reset role;

revoke create on schema public, private
  from youtube_extraction_credential_manager_rpc_owner;

do $membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'revoke youtube_extraction_credential_manager_rpc_owner from %I granted by %I',
      current_user,
      current_user
    );
  else
    execute format(
      'revoke youtube_extraction_credential_manager_rpc_owner from %I',
      current_user
    );
  end if;
end;
$membership$;

commit;
