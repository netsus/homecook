begin;

create or replace function private.verify_full_local_internal_scope()
returns void
language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), ''),
    '{}'
  )::jsonb;
  v_scope text := v_headers ->> 'x-homecook-internal-scope';
  v_method text := upper(coalesce(current_setting('request.method', true), ''));
  v_path text := coalesce(current_setting('request.path', true), '');
begin
  if v_scope = 'marketing-validation'
    and v_method in ('GET', 'POST', 'PATCH')
    and v_path = '/marketing_validation_sessions' then
    return;
  end if;

  if v_scope = 'marketing-validation-export'
    and v_method = 'GET'
    and v_path = '/marketing_validation_sessions' then
    return;
  end if;

  if v_scope = 'marketing-validation-purge'
    and v_method in ('GET', 'DELETE')
    and v_path = '/marketing_validation_sessions' then
    return;
  end if;

  if v_scope = 'snapshot-v2-session'
    and v_method = 'POST'
    and v_path in (
      '/rpc/complete_cooking_session',
      '/rpc/complete_standalone_cooking'
    ) then
    return;
  end if;

  perform private.verify_full_local_internal_scope_pre_legacy_compat();
end;
$function$;

alter function private.verify_full_local_internal_scope() owner to postgres;

revoke all on function private.verify_full_local_internal_scope()
  from public, anon, authenticated, service_role;

commit;
