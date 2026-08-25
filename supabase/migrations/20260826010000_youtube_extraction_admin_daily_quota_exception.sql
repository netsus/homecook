begin;

-- Administrator identity remains public.admin_members. The enqueue owner gets
-- only the current JWT subject's user_id column, never table-wide admin access.
revoke all privileges on public.admin_members
  from youtube_extraction_enqueue_rpc_owner;
do $revoke_column_privileges$
declare
  v_column record;
begin
  for v_column in
    select attribute.attname
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid = 'public.admin_members'::regclass
      and attribute.attnum > 0
      and not attribute.attisdropped
  loop
    execute pg_catalog.format(
      'revoke select (%1$I), insert (%1$I), update (%1$I), references (%1$I) on public.admin_members from youtube_extraction_enqueue_rpc_owner',
      v_column.attname
    );
  end loop;
end;
$revoke_column_privileges$;
grant select (user_id) on public.admin_members
  to youtube_extraction_enqueue_rpc_owner;

drop policy if exists youtube_extraction_admin_members_enqueue_owner_select
  on public.admin_members;
create policy youtube_extraction_admin_members_enqueue_owner_select
  on public.admin_members
  for select
  to youtube_extraction_enqueue_rpc_owner
  using (user_id = auth.uid());

do $membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'grant youtube_extraction_enqueue_rpc_owner, youtube_extraction_credential_manager_rpc_owner to %I with inherit false, set true granted by %I',
      current_user,
      current_user
    );
  else
    execute format(
      'grant youtube_extraction_enqueue_rpc_owner, youtube_extraction_credential_manager_rpc_owner to %I',
      current_user
    );
  end if;
end;
$membership$;

grant create on schema public
  to youtube_extraction_enqueue_rpc_owner,
     youtube_extraction_credential_manager_rpc_owner;
grant create on schema private
  to youtube_extraction_credential_manager_rpc_owner;

set local role youtube_extraction_enqueue_rpc_owner;

do $rewrite_enqueue$
declare
  v_signature constant regprocedure :=
    'public.enqueue_youtube_extraction_job(text,bigint,text,text,text,text,text,text)'::regprocedure;
  v_definition text;
  v_rewritten text;
  v_occurrences integer;
begin
  v_definition := pg_catalog.pg_get_functiondef(v_signature);

  v_occurrences := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, '  v_daily_count integer;', ''))
  ) / pg_catalog.length('  v_daily_count integer;');
  if v_occurrences <> 1 then
    raise exception 'YouTube enqueue declaration source drifted'
      using errcode = '55000';
  end if;
  v_rewritten := pg_catalog.replace(
    v_definition,
    '  v_daily_count integer;',
    E'  v_daily_count integer;\n  v_is_admin boolean;'
  );

  v_occurrences := (
    pg_catalog.length(v_rewritten)
    - pg_catalog.length(pg_catalog.replace(
        v_rewritten,
        E'  select\n    count(*) filter (where job.status in (''queued'', ''processing'')),',
        ''
      ))
  ) / pg_catalog.length(
    E'  select\n    count(*) filter (where job.status in (''queued'', ''processing'')),'
  );
  if v_occurrences <> 1 then
    raise exception 'YouTube enqueue budget source drifted'
      using errcode = '55000';
  end if;
  v_rewritten := pg_catalog.replace(
    v_rewritten,
    E'  select\n    count(*) filter (where job.status in (''queued'', ''processing'')),',
    E'  select exists (\n    select 1\n    from public.admin_members as member\n    where member.user_id = v_owner_id\n  )\n    into v_is_admin;\n\n  select\n    count(*) filter (where job.status in (''queued'', ''processing'')),'
  );

  v_occurrences := (
    pg_catalog.length(v_rewritten)
    - pg_catalog.length(pg_catalog.replace(
        v_rewritten,
        '  if v_active_count >= 2 or v_daily_count >= 10 then',
        ''
      ))
  ) / pg_catalog.length('  if v_active_count >= 2 or v_daily_count >= 10 then');
  if v_occurrences <> 1 then
    raise exception 'YouTube enqueue limit predicate source drifted'
      using errcode = '55000';
  end if;
  v_rewritten := pg_catalog.replace(
    v_rewritten,
    '  if v_active_count >= 2 or v_daily_count >= 10 then',
    '  if v_active_count >= 2 or (not v_is_admin and v_daily_count >= 10) then'
  );

  if pg_catalog.strpos(v_rewritten, 'public.admin_members as member') = 0
    or pg_catalog.strpos(
      v_rewritten,
      'v_active_count >= 2 or (not v_is_admin and v_daily_count >= 10)'
    ) = 0 then
    raise exception 'YouTube administrator quota rewrite failed'
      using errcode = '55000';
  end if;

  execute v_rewritten;
end;
$rewrite_enqueue$;

comment on function public.enqueue_youtube_extraction_job(
  text, bigint, text, text, text, text, text, text
) is
  'Enqueues owner jobs atomically; admin_members bypass only the rolling daily budget.';

reset role;
set local role youtube_extraction_credential_manager_rpc_owner;

do $rewrite_catalog$
declare
  v_previous_fingerprint constant text :=
    '605c4e37ccd34313f00d4687c5340d8ea8ccdf958eb297805bbae871438775cc';
  v_current_fingerprint constant text :=
    '2b0dc95c374e140443e0f46a35ea16bcc6653f0857b7f986ae457eab01c44ff3';
  v_signature regprocedure;
  v_definition text;
  v_rewritten text;
  v_occurrences integer;
begin
  v_signature := 'public.read_youtube_extraction_enqueue_readiness()'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_signature);

  v_occurrences := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(
        v_definition,
        'private.youtube_extraction_shared_dependency_contract_v1()',
        ''
      ))
  ) / pg_catalog.length('private.youtube_extraction_shared_dependency_contract_v1()');
  if v_occurrences <> 1 then
    raise exception 'YouTube shared dependency insertion source drifted'
      using errcode = '55000';
  end if;

  v_rewritten := pg_catalog.replace(
    v_definition,
    'private.youtube_extraction_shared_dependency_contract_v1()',
    $replacement$pg_catalog.concat_ws(
      E'\n',
      private.youtube_extraction_shared_dependency_contract_v1(),
      'admin_membership_required_column',
      coalesce((
        select pg_catalog.string_agg(
          namespace.nspname || '.' || relation.relname || '.' || attribute.attname
            || '|type=' || pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
            || '|not_null=' || attribute.attnotnull::text,
          E'\n'
          order by namespace.nspname, relation.relname, attribute.attname
        )
        from pg_catalog.pg_attribute as attribute
        join pg_catalog.pg_class as relation on relation.oid = attribute.attrelid
        join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
        where attribute.attnum > 0
          and not attribute.attisdropped
          and namespace.nspname = 'public'
          and relation.relname = 'admin_members'
          and attribute.attname = 'user_id'
      ), ''),
      'admin_membership_owner',
      coalesce((
        select case
          when pg_catalog.pg_get_userbyid(relation.relowner) in (
            'postgres', 'supabase_admin'
          ) then 'platform_admin'
          else pg_catalog.pg_get_userbyid(relation.relowner)
        end
        from pg_catalog.pg_class as relation
        join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'admin_members'
      ), ''),
      'admin_membership_rls',
      coalesce((
        select namespace.nspname || '.' || relation.relname
          || '|rls=' || relation.relrowsecurity::text
          || '|force=' || relation.relforcerowsecurity::text
        from pg_catalog.pg_class as relation
        join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'admin_members'
      ), ''),
      'admin_membership_policy',
      coalesce((
        select pg_catalog.string_agg(
          policy.schemaname || '.' || policy.tablename || '|' || policy.policyname
            || '|permissive=' || policy.permissive
            || '|cmd=' || policy.cmd
            || '|roles=' || coalesce(pg_catalog.array_to_string(policy.roles, ','), '')
            || '|qual=' || coalesce(policy.qual, '')
            || '|check=' || coalesce(policy.with_check, ''),
          E'\n'
          order by policy.policyname
        )
        from pg_catalog.pg_policies as policy
        where policy.schemaname = 'public'
          and policy.tablename = 'admin_members'
      ), ''),
      'admin_membership_table_acl',
      coalesce((
        select pg_catalog.string_agg(
          coalesce(grantee.rolname, 'PUBLIC') || '|'
            || privilege.privilege_type
            || '|grantable=' || privilege.is_grantable::text,
          E'\n'
          order by coalesce(grantee.rolname, 'PUBLIC'), privilege.privilege_type
        )
        from pg_catalog.pg_class as relation
        join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
        cross join lateral pg_catalog.aclexplode(
          coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
        ) as privilege
        left join pg_catalog.pg_roles as grantee on grantee.oid = privilege.grantee
        where namespace.nspname = 'public'
          and relation.relname = 'admin_members'
          and privilege.grantee is distinct from relation.relowner
      ), ''),
      'admin_membership_column_acl',
      coalesce((
        select pg_catalog.string_agg(
          attribute.attname || '|'
            || coalesce(grantee.rolname, 'PUBLIC') || '|'
            || privilege.privilege_type
            || '|grantable=' || privilege.is_grantable::text,
          E'\n'
          order by attribute.attname, coalesce(grantee.rolname, 'PUBLIC'),
            privilege.privilege_type
        )
        from pg_catalog.pg_attribute as attribute
        join pg_catalog.pg_class as relation on relation.oid = attribute.attrelid
        join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
        cross join lateral pg_catalog.aclexplode(
          attribute.attacl
        ) as privilege
        left join pg_catalog.pg_roles as grantee on grantee.oid = privilege.grantee
        where attribute.attnum > 0
          and not attribute.attisdropped
          and namespace.nspname = 'public'
          and relation.relname = 'admin_members'
          and privilege.grantee is distinct from relation.relowner
      ), '')
    )$replacement$
  );

  v_occurrences := (
    pg_catalog.length(v_rewritten)
    - pg_catalog.length(pg_catalog.replace(v_rewritten, v_previous_fingerprint, ''))
  ) / pg_catalog.length(v_previous_fingerprint);
  if v_occurrences <> 1 then
    raise exception 'YouTube readiness fingerprint source drifted'
      using errcode = '55000';
  end if;
  v_rewritten := pg_catalog.replace(
    v_rewritten,
    v_previous_fingerprint,
    v_current_fingerprint
  );

  if pg_catalog.strpos(v_rewritten, 'admin_membership_required_column') = 0
    or pg_catalog.strpos(v_rewritten, v_previous_fingerprint) <> 0
    or pg_catalog.strpos(v_rewritten, v_current_fingerprint) = 0 then
    raise exception 'YouTube administrator catalog rewrite failed'
      using errcode = '55000';
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
$rewrite_catalog$;

reset role;

revoke create on schema public
  from youtube_extraction_enqueue_rpc_owner,
       youtube_extraction_credential_manager_rpc_owner;
revoke create on schema private
  from youtube_extraction_credential_manager_rpc_owner;

do $membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'revoke youtube_extraction_enqueue_rpc_owner, youtube_extraction_credential_manager_rpc_owner from %I granted by %I',
      current_user,
      current_user
    );
  else
    execute format(
      'revoke youtube_extraction_enqueue_rpc_owner, youtube_extraction_credential_manager_rpc_owner from %I',
      current_user
    );
  end if;
end;
$membership$;

comment on policy youtube_extraction_admin_members_enqueue_owner_select
  on public.admin_members is
  'Allows the NOLOGIN enqueue owner to inspect only the current JWT subject membership row.';

commit;
