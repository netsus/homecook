-- Stage 2 addendum: least-privilege local callback and operational facades.

begin;

create or replace function public.bootstrap_legacy_auth_callback_identity(
  p_owner_uuid uuid,
  p_email text,
  p_social_provider text,
  p_social_id text,
  p_nickname text,
  p_profile_image_url text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, auth, pg_temp
as $function$
declare
  v_capability_state text;
  v_conflicting_owner uuid;
  v_user public.users%rowtype;
  v_book record;
  v_column_name text;
  v_next_sort_order integer;
begin
  if coalesce(
    auth.role(),
    coalesce(
      nullif(current_setting('request.jwt.claims', true), ''),
      '{}'
    )::jsonb ->> 'role'
  ) is distinct from 'service_role' then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
      using errcode = '42501';
  end if;

  select capability.state
    into v_capability_state
  from public.account_generation_capability_state as capability
  where capability.singleton
  for share;

  if v_capability_state is distinct from 'legacy' then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
      using errcode = '55000';
  end if;

  if p_owner_uuid is null
    or nullif(pg_catalog.btrim(coalesce(p_email, '')), '') is null
    or p_social_provider not in ('google', 'naver', 'kakao')
    or nullif(pg_catalog.btrim(coalesce(p_social_id, '')), '') is null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'legacy-callback:' || pg_catalog.lower(p_email),
      0
    )
  );

  select app_user.id
    into v_conflicting_owner
  from public.users as app_user
  where app_user.email = pg_catalog.lower(p_email)
    and app_user.deleted_at is null
    and app_user.id <> p_owner_uuid
  for update;

  if v_conflicting_owner is not null then
    return jsonb_build_object('status', 'account_conflict');
  end if;

  select app_user.*
    into v_user
  from public.users as app_user
  where app_user.id = p_owner_uuid
  for update;

  if v_user.id is null then
    insert into public.users (
      id,
      nickname,
      email,
      profile_image_url,
      social_provider,
      social_id,
      settings_json,
      created_at,
      updated_at,
      deleted_at
    )
    values (
      p_owner_uuid,
      coalesce(nullif(pg_catalog.btrim(p_nickname), ''), '무먹러'),
      pg_catalog.lower(p_email),
      p_profile_image_url,
      p_social_provider::public.social_provider_type,
      p_social_id,
      '{}'::jsonb,
      clock_timestamp(),
      clock_timestamp(),
      null
    )
    returning * into v_user;
  end if;

  for v_book in
    select *
    from (
      values
        ('내가 추가한 레시피', 'my_added'::public.recipe_book_type, 'lavender', 0),
        ('저장한 레시피', 'saved'::public.recipe_book_type, 'sky', 1),
        ('좋아요한 레시피', 'liked'::public.recipe_book_type, 'coral', 2)
    ) as defaults(name, book_type, cover_color_key, sort_order)
  loop
    if not exists (
      select 1
      from public.recipe_books as recipe_book
      where recipe_book.user_id = p_owner_uuid
        and recipe_book.book_type = v_book.book_type
    ) then
      select coalesce(
        max(recipe_book.sort_order) + 1,
        v_book.sort_order
      )
        into v_next_sort_order
      from public.recipe_books as recipe_book
      where recipe_book.user_id = p_owner_uuid;

      insert into public.recipe_books (
        id,
        user_id,
        name,
        book_type,
        cover_color_key,
        cover_image_url,
        sort_order,
        created_at,
        updated_at
      )
      values (
        extensions.gen_random_uuid(),
        p_owner_uuid,
        v_book.name,
        v_book.book_type,
        v_book.cover_color_key,
        null,
        v_next_sort_order,
        clock_timestamp(),
        clock_timestamp()
      )
      on conflict do nothing;
    end if;
  end loop;

  foreach v_column_name in array array['아침', '점심', '저녁']
  loop
    if not exists (
      select 1
      from public.meal_plan_columns as planner_column
      where planner_column.user_id = p_owner_uuid
        and pg_catalog.btrim(planner_column.name) = v_column_name
    ) then
      select coalesce(max(planner_column.sort_order) + 1, 0)
        into v_next_sort_order
      from public.meal_plan_columns as planner_column
      where planner_column.user_id = p_owner_uuid;

      insert into public.meal_plan_columns (
        id,
        user_id,
        name,
        sort_order,
        created_at
      )
      values (
        extensions.gen_random_uuid(),
        p_owner_uuid,
        v_column_name,
        v_next_sort_order,
        clock_timestamp()
      )
      on conflict do nothing;
    end if;
  end loop;

  update public.users
  set settings_json = coalesce(settings_json, '{}'::jsonb)
        || jsonb_build_object('user_bootstrap_version', 3),
      updated_at = clock_timestamp()
  where id = p_owner_uuid
  returning * into v_user;

  return jsonb_build_object(
    'status', 'ok',
    'user_id', v_user.id,
    'nickname', v_user.nickname
  );
end;
$function$;

create or replace function public.record_internal_operational_event(
  p_event_type text,
  p_severity text,
  p_source text,
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_request_path text,
  p_http_status integer,
  p_error_code text,
  p_message_summary text,
  p_metadata_json jsonb
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, auth, pg_temp
as $function$
begin
  if coalesce(
    auth.role(),
    coalesce(
      nullif(current_setting('request.jwt.claims', true), ''),
      '{}'
    )::jsonb ->> 'role'
  ) is distinct from 'service_role' then
    raise exception 'ACCOUNT_LIFECYCLE_MAINTENANCE'
      using errcode = '42501';
  end if;
  if nullif(pg_catalog.btrim(coalesce(p_event_type, '')), '') is null
    or nullif(pg_catalog.btrim(coalesce(p_source, '')), '') is null
    or p_severity not in ('info', 'warn', 'error', 'critical') then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  insert into public.operational_events (
    event_type,
    severity,
    source,
    actor_user_id,
    target_user_id,
    request_path,
    http_status,
    error_code,
    message_summary,
    metadata_json
  )
  values (
    p_event_type,
    p_severity,
    p_source,
    p_actor_user_id,
    p_target_user_id,
    p_request_path,
    p_http_status,
    p_error_code,
    p_message_summary,
    coalesce(p_metadata_json, '{}'::jsonb)
  );
  return true;
end;
$function$;

revoke all on function public.bootstrap_legacy_auth_callback_identity(
  uuid, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.bootstrap_legacy_auth_callback_identity(
  uuid, text, text, text, text, text
) to service_role;

revoke all on function public.record_internal_operational_event(
  text, text, text, uuid, uuid, text, integer, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_internal_operational_event(
  text, text, text, uuid, uuid, text, integer, text, text, jsonb
) to service_role;

commit;
