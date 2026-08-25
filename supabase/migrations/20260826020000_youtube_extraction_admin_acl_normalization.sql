begin;

-- Restored production snapshots can retain historical application-role ACLs
-- even though admin_members is service-role control-plane data. Normalize both
-- table and column grants before attesting the current catalog.
revoke all privileges on public.admin_members from anon, authenticated;

do $revoke_app_role_column_privileges$
declare
  v_column record;
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated']::text[]
  loop
    for v_column in
      select attribute.attname
      from pg_catalog.pg_attribute as attribute
      where attribute.attrelid = 'public.admin_members'::regclass
        and attribute.attnum > 0
        and not attribute.attisdropped
    loop
      execute pg_catalog.format(
        'revoke select (%1$I), insert (%1$I), update (%1$I), references (%1$I) on public.admin_members from %2$I',
        v_column.attname,
        v_role
      );
    end loop;
  end loop;
end;
$revoke_app_role_column_privileges$;

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

do $rewrite_catalog$
declare
  v_previous_fingerprint constant text :=
    '2b0dc95c374e140443e0f46a35ea16bcc6653f0857b7f986ae457eab01c44ff3';
  v_current_fingerprint constant text :=
    '1f452cdfb35031c2f9be5f8162f11878f443834d5d42265b64e77dceddc129e3';
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
        'and privilege.grantee is distinct from relation.relowner',
        ''
      ))
  ) / pg_catalog.length(
    'and privilege.grantee is distinct from relation.relowner'
  );
  if v_occurrences <> 2 then
    raise exception 'YouTube administrator ACL inventory source drifted'
      using errcode = '55000';
  end if;
  v_rewritten := pg_catalog.replace(
    v_definition,
    'and privilege.grantee is distinct from relation.relowner',
    E'and privilege.grantee is distinct from relation.relowner\n          and coalesce(grantee.rolname, ''PUBLIC'') <> ''service_role'''
  );

  v_occurrences := (
    pg_catalog.length(v_rewritten)
    - pg_catalog.length(pg_catalog.replace(v_rewritten, v_previous_fingerprint, ''))
  ) / pg_catalog.length(v_previous_fingerprint);
  if v_occurrences <> 1 then
    raise exception 'YouTube ACL normalization fingerprint source drifted'
      using errcode = '55000';
  end if;
  v_rewritten := pg_catalog.replace(
    v_rewritten,
    v_previous_fingerprint,
    v_current_fingerprint
  );

  if pg_catalog.strpos(v_rewritten, v_previous_fingerprint) <> 0
    or pg_catalog.strpos(v_rewritten, v_current_fingerprint) = 0
    or pg_catalog.strpos(v_rewritten, '<> ''service_role''') = 0 then
    raise exception 'YouTube administrator ACL normalization rewrite failed'
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

comment on function public.read_youtube_extraction_enqueue_readiness() is
  'Returns exact YouTube catalog attestation with normalized admin application ACLs.';

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
