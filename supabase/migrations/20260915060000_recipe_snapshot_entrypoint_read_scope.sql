begin;

-- Permit the existing recipe snapshot entrypoint reads through their assigned
-- internal scope. Preserve every predecessor branch and its legacy delegate.
create or replace function private.verify_full_local_internal_scope()
returns void language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_scope text := v_headers ->> 'x-homecook-internal-scope';
  v_method text := upper(coalesce(current_setting('request.method', true), ''));
  v_path text := coalesce(current_setting('request.path', true), '');
begin
  if v_scope is null or v_scope = '' then
    raise exception 'ACCOUNT_SESSION_STALE' using errcode = '55000';
  end if;
  if v_scope = 'recipe-future-propagation' and v_method = 'POST'
    and v_path in (
      '/rpc/read_recipe_snapshot_ui_mode',
      '/rpc/read_recipe_snapshot_entrypoint_context'
    ) then return; end if;
  if v_scope = 'marketing-round2' and v_method = 'POST'
    and v_path = '/rpc/marketing_round2_apply' then return; end if;
  if v_scope = 'snapshot-v2-session' and v_method = 'POST'
    and v_path in (
      '/rpc/get_meal_log_day', '/rpc/get_recent_meal_log_sources',
      '/rpc/mutate_meal_log_entry', '/rpc/list_cooked_batches',
      -- Retain the exact predecessor cooked-batch operations; its migration
      -- replaces direct legacy DML with these session-verified RPCs.
      '/rpc/complete_snapshot_v2_cooking_session', '/rpc/mutate_legacy_leftover_status',
      '/rpc/mutate_cooked_batch_weight', '/rpc/discard_cooked_batch',
      '/rpc/adjust_cooked_batch', '/rpc/close_unweighed_cooked_batch'
    ) then return; end if;
  if v_scope = 'gamification-projection' and v_method = 'POST'
    and v_path = '/rpc/write_user_gamification_projection' then
    return;
  end if;
  if v_scope = 'marketing-validation' and v_method in ('GET', 'POST', 'PATCH')
    and v_path = '/marketing_validation_sessions' then return; end if;
  if v_scope = 'marketing-validation-export' and v_method = 'GET'
    and v_path = '/marketing_validation_sessions' then return; end if;
  if v_scope = 'marketing-validation-purge' and v_method in ('GET', 'DELETE')
    and v_path = '/marketing_validation_sessions' then return; end if;
  if v_scope = 'snapshot-v2-session' and v_method = 'POST'
    and v_path in ('/rpc/complete_cooking_session', '/rpc/complete_standalone_cooking') then return; end if;
  perform private.verify_full_local_internal_scope_pre_legacy_compat();
end;
$function$;
alter function private.verify_full_local_internal_scope() owner to postgres;
revoke all on function private.verify_full_local_internal_scope()
  from public, anon, authenticated, service_role;

commit;
