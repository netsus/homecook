-- Split recipe future follow-up RPCs into exact route-scoped internal clients.

begin;

create or replace function private.verify_full_local_internal_scope()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), ''),
    '{}'
  )::jsonb;
  v_scope text;
  v_method text := upper(coalesce(current_setting('request.method', true), ''));
  v_path text := coalesce(current_setting('request.path', true), '');
begin
  v_scope := v_headers ->> 'x-homecook-internal-scope';

  if not (
    v_method in ('GET', 'POST', 'PUT', 'DELETE')
    and (
      (
        v_scope = 'auth-flow'
        and v_method = 'POST'
        and v_path in (
          '/rpc/read_full_local_auth_control',
          '/rpc/insert_auth_flow_attempt',
          '/rpc/read_auth_flow_attempt',
          '/rpc/terminal_auth_flow_attempt',
          '/rpc/expire_and_count_remote_auth_flows'
        )
      )
      or (
        v_scope in ('auth-callback', 'auth-refresh')
        and v_method = 'POST'
        and v_path in (
          '/rpc/read_full_local_auth_control',
          '/rpc/record_hybrid_remote_session_authority',
          '/rpc/record_full_local_session_authority',
          '/rpc/get_account_generation_capability',
          '/rpc/bootstrap_account_generation_identity',
          '/rpc/bootstrap_legacy_auth_callback_identity'
        )
      )
      or (
        v_scope = 'request-authority'
        and v_method = 'POST'
        and v_path in (
          '/rpc/read_full_local_auth_control',
          '/rpc/assert_hybrid_remote_session_authority',
          '/rpc/assert_full_local_session_authority'
        )
      )
      or (
        v_scope = 'session-logout'
        and v_method = 'POST'
        and v_path in (
          '/rpc/read_full_local_auth_control',
          '/rpc/revoke_hybrid_remote_session_authority',
          '/rpc/revoke_full_local_session_authority'
        )
      )
      or (
        v_scope = 'account-lifecycle'
        and v_method = 'POST'
        and v_path in (
          '/rpc/get_account_generation_capability',
          '/rpc/bootstrap_account_generation_identity',
          '/rpc/initiate_account_generation_delete',
          '/rpc/replay_account_generation_delete',
          '/rpc/resolve_account_cutover_quarantine',
          '/rpc/delete_user_private_data_with_generation_receipt',
          '/rpc/start_legacy_external_write_attempt',
          '/rpc/finalize_legacy_external_write_attempt',
          '/operational_events'
        )
      )
      or (
        v_scope = 'admin-data'
        and (
          (
            v_method = 'GET'
            and v_path in (
              '/admin_audit_logs',
              '/admin_members',
              '/meals',
              '/operational_events',
              '/pantry_items',
              '/recipe_books',
              '/shopping_lists',
              '/users'
            )
          )
          or (
            v_method = 'POST'
            and v_path in ('/admin_audit_logs', '/operational_events')
          )
        )
      )
      or (
        v_scope in ('not-found-feedback', 'operational-event')
        and v_method = 'POST'
        and v_path = '/rpc/record_internal_operational_event'
      )
      or (
        v_scope = 'recipe-image'
        and v_method = 'POST'
        and v_path in (
          '/rpc/cancel_recipe_image_upload',
          '/rpc/compensate_recipe_image_upload',
          '/rpc/finalize_recipe_image_upload',
          '/rpc/read_recipe_image_projections',
          '/rpc/reserve_recipe_image_upload',
          '/operational_events'
        )
      )
      or (
        v_scope = 'recipe-future-propagation'
        and (
          (
            v_method = 'POST'
            and v_path in (
              '/rpc/preview_recipe_future_plan_impact',
              '/rpc/write_personal_recipe_core',
              '/rpc/write_recipe_future_plan_change'
            )
          )
          or (
            v_method = 'GET'
            and v_path in (
              '/ingredient_conversion_assignments',
              '/ingredient_nutrition_profiles'
            )
          )
        )
      )
      or (
        v_scope = 'snapshot-v2-session'
        and v_method = 'POST'
        and v_path in (
          '/rpc/start_snapshot_v2_cooking_session',
          '/rpc/read_snapshot_v2_cook_mode',
          '/rpc/cancel_snapshot_v2_cooking_session'
        )
      )
      or (
        v_scope = 'future-meal-write'
        and v_method = 'POST'
        and v_path = '/rpc/write_future_meal_with_snapshot_authority'
      )
      or (
        v_scope = 'shopping-create'
        and v_method = 'POST'
        and v_path = '/rpc/create_shopping_list_with_snapshot_authority'
      )
      or (
        v_scope = 'youtube-ingredient-registration'
        and v_method = 'POST'
        and v_path = '/rpc/register_youtube_ingredient'
      )
    )
  ) then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;
end;
$function$;

revoke all on function private.verify_full_local_internal_scope()
  from public, anon, authenticated, service_role;

commit;
