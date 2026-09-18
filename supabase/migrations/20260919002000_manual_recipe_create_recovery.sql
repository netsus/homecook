begin;

-- Receipts commit in the same transaction as recipe creation and image attachment.
-- They survive recipe deletion so a lost response cannot resurrect a deleted recipe.
create table private.manual_recipe_create_receipts (
  owner_uuid uuid not null references public.users(id) on delete cascade,
  account_generation bigint not null,
  idempotency_key uuid not null,
  request_body jsonb not null check (jsonb_typeof(request_body) = 'object'),
  response_body jsonb not null check (jsonb_typeof(response_body) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (owner_uuid, account_generation, idempotency_key)
);
alter table private.manual_recipe_create_receipts owner to postgres;
alter table private.manual_recipe_create_receipts enable row level security;
revoke all on private.manual_recipe_create_receipts from public, anon, authenticated, service_role;

create function public.read_manual_recipe_create_result(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_idempotency_key uuid
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_authority jsonb;
  v_response jsonb;
begin
  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash,
    p_hmac_key_version, p_session_issued_at
  );
  if p_idempotency_key is null then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;
  select receipt.response_body into v_response
  from private.manual_recipe_create_receipts as receipt
  where receipt.owner_uuid = p_owner_uuid
    and receipt.account_generation = (v_authority ->> 'account_generation')::bigint
    and receipt.idempotency_key = p_idempotency_key;
  return jsonb_build_object('recipe', v_response);
end;
$function$;

create function public.create_manual_recipe_recoverable(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_idempotency_key uuid,
  p_request_body jsonb,
  p_create_payload jsonb
) returns jsonb
language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_authority jsonb;
  v_receipt private.manual_recipe_create_receipts%rowtype;
  v_response jsonb;
  v_generation bigint;
  v_image_id uuid;
begin
  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash,
    p_hmac_key_version, p_session_issued_at
  );
  v_generation := (v_authority ->> 'account_generation')::bigint;
  if p_idempotency_key is null
    or p_request_body is null or jsonb_typeof(p_request_body) <> 'object'
    or p_create_payload is null or jsonb_typeof(p_create_payload) <> 'object' then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;
  -- The authority check already holds the account-owner transaction lock.
  select receipt.* into v_receipt
  from private.manual_recipe_create_receipts as receipt
  where receipt.owner_uuid = p_owner_uuid
    and receipt.account_generation = v_generation
    and receipt.idempotency_key = p_idempotency_key;
  if found then
    if v_receipt.request_body is distinct from p_request_body then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '23505';
    end if;
    return v_receipt.response_body;
  end if;
  v_image_id := nullif(p_request_body ->> 'image_object_id', '')::uuid;
  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid, true
  );
  v_response := public.create_manual_recipe_with_managed_image(
    p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash,
    p_hmac_key_version, v_image_id, case when v_image_id is null then null else 0 end,
    p_create_payload ->> 'p_title',
    (p_create_payload ->> 'p_base_servings')::integer,
    p_create_payload ->> 'p_thumbnail_url',
    array(select jsonb_array_elements_text(p_create_payload -> 'p_tags')),
    p_create_payload ->> 'p_tag_source',
    p_create_payload -> 'p_ingredients', p_create_payload -> 'p_steps'
  );
  perform public.set_account_generation_internal_writer_marker(
    (v_authority ->> 'cutover_attempt_id')::uuid, false
  );
  if v_response ->> 'id' is null or v_response ->> 'error_code' is not null then
    raise exception 'INTERNAL_ERROR' using errcode = '55000';
  end if;
  insert into private.manual_recipe_create_receipts (
    owner_uuid, account_generation, idempotency_key, request_body, response_body
  ) values (p_owner_uuid, v_generation, p_idempotency_key, p_request_body, v_response);
  return v_response;
end;
$function$;

alter function public.read_manual_recipe_create_result(uuid,timestamptz,text,integer,timestamptz,uuid) owner to postgres;
alter function public.create_manual_recipe_recoverable(uuid,timestamptz,text,integer,timestamptz,uuid,jsonb,jsonb) owner to postgres;

revoke all on function public.read_manual_recipe_create_result(uuid,timestamptz,text,integer,timestamptz,uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_manual_recipe_recoverable(uuid,timestamptz,text,integer,timestamptz,uuid,jsonb,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.read_manual_recipe_create_result(uuid,timestamptz,text,integer,timestamptz,uuid) to service_role;
grant execute on function public.create_manual_recipe_recoverable(uuid,timestamptz,text,integer,timestamptz,uuid,jsonb,jsonb) to service_role;

alter function private.verify_full_local_internal_scope()
  rename to verify_full_local_internal_scope_pre_manual_recovery_20260919;
create function private.verify_full_local_internal_scope()
returns void language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
begin
  if v_headers ->> 'x-homecook-internal-scope' = 'recipe-future-propagation'
    and upper(coalesce(current_setting('request.method', true), '')) = 'POST'
    and current_setting('request.path', true) in (
      '/rpc/read_manual_recipe_create_result', '/rpc/create_manual_recipe_recoverable'
    ) then
    return;
  end if;
  perform private.verify_full_local_internal_scope_pre_manual_recovery_20260919();
end;
$function$;
alter function private.verify_full_local_internal_scope() owner to postgres;
alter function private.verify_full_local_internal_scope_pre_manual_recovery_20260919() owner to postgres;
revoke all on function private.verify_full_local_internal_scope() from public, anon, authenticated, service_role;
revoke all on function private.verify_full_local_internal_scope_pre_manual_recovery_20260919() from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
