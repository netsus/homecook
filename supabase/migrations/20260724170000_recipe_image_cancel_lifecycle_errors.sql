begin;

do $migration$
declare
  v_definition text;
  v_previous_guard text := $previous$
  if v_lifecycle.owner_uuid is null
    or v_lifecycle.status is distinct from 'active'
    or v_lifecycle.auth_identity_created_at_snapshot
      is distinct from p_auth_identity_created_at_snapshot then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;
$previous$;
  v_lifecycle_guard text := $replacement$
  if v_lifecycle.owner_uuid is null then
    raise exception 'ACCOUNT_CUTOVER_UNCLASSIFIED'
      using errcode = '55000';
  elsif v_lifecycle.status = 'quarantined' then
    raise exception 'ACCOUNT_CUTOVER_QUARANTINED'
      using errcode = '55000';
  elsif v_lifecycle.status in ('deleting', 'cleanup_pending', 'complete') then
    raise exception 'ACCOUNT_DELETING'
      using errcode = '55000';
  elsif v_lifecycle.status is distinct from 'active'
    or v_lifecycle.auth_identity_created_at_snapshot
      is distinct from p_auth_identity_created_at_snapshot then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;
$replacement$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.cancel_recipe_image_upload(uuid,timestamp with time zone,text,integer,uuid,uuid,timestamp with time zone)'::regprocedure
  )
  into strict v_definition;

  if pg_catalog.strpos(v_definition, v_previous_guard) > 0 then
    execute pg_catalog.replace(
      v_definition,
      v_previous_guard,
      v_lifecycle_guard
    );
  elsif pg_catalog.strpos(v_definition, v_lifecycle_guard) = 0 then
    raise exception
      'cancel_recipe_image_upload lifecycle guard definition drift';
  end if;
end;
$migration$;

revoke all on function public.cancel_recipe_image_upload(
  uuid,
  timestamp with time zone,
  text,
  integer,
  uuid,
  uuid,
  timestamp with time zone
) from public, anon, authenticated, service_role;
grant execute on function public.cancel_recipe_image_upload(
  uuid,
  timestamp with time zone,
  text,
  integer,
  uuid,
  uuid,
  timestamp with time zone
) to service_role;

commit;
