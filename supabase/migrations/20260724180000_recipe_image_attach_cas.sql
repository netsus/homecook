begin;

create or replace function public.attach_recipe_image_object(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamp with time zone,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_recipe_id uuid,
  p_image_object_id uuid,
  p_expected_cleanup_generation bigint,
  p_now timestamp with time zone default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_capability_state text;
  v_lifecycle public.user_account_lifecycles%rowtype;
  v_binding public.user_session_generation_bindings%rowtype;
  v_recipe public.recipes%rowtype;
  v_upload_idempotency public.mutation_idempotency_keys%rowtype;
  v_object public.recipe_image_objects%rowtype;
  v_reference_id uuid;
  v_quota_released boolean;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'recipe image attach requires READ COMMITTED'
      using errcode = '25001';
  end if;

  if p_owner_uuid is null
    or p_auth_identity_created_at_snapshot is null
    or nullif(p_session_key_hash, '') is null
    or length(p_session_key_hash) < 32
    or p_hmac_key_version is null
    or p_hmac_key_version <= 0
    or p_recipe_id is null
    or p_image_object_id is null
    or p_expected_cleanup_generation is null
    or p_expected_cleanup_generation < 0
    or p_now is null then
    raise exception 'recipe image attach fields are invalid'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock_shared(
    pg_catalog.hashtextextended('homecook-account-generation-cutover', 0)
  );

  select capability.state
    into v_capability_state
  from public.account_generation_capability_state as capability
  where capability.singleton
  for key share;

  if v_capability_state is distinct from 'generation_active' then
    raise exception 'ACCOUNT_GENERATION_STALE'
      using errcode = '55000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-owner:' || p_owner_uuid::text,
      0
    )
  );

  select lifecycle.*
    into v_lifecycle
  from public.user_account_lifecycles as lifecycle
  where lifecycle.owner_uuid = p_owner_uuid
  order by lifecycle.account_generation desc
  limit 1
  for update;

  if v_lifecycle.owner_uuid is null then
    raise exception 'ACCOUNT_CUTOVER_UNCLASSIFIED'
      using errcode = '55000';
  end if;

  if v_lifecycle.status = 'quarantined' then
    raise exception 'ACCOUNT_CUTOVER_QUARANTINED'
      using errcode = '55000';
  end if;

  if v_lifecycle.status in ('deleting', 'cleanup_pending', 'complete') then
    raise exception 'ACCOUNT_DELETING'
      using errcode = '55000';
  end if;

  if v_lifecycle.status is distinct from 'active'
    or v_lifecycle.auth_identity_created_at_snapshot
      is distinct from p_auth_identity_created_at_snapshot then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  select binding.*
    into v_binding
  from public.user_session_generation_bindings as binding
  where binding.session_key_hash = p_session_key_hash
    and binding.hmac_key_version = p_hmac_key_version
    and binding.owner_uuid = p_owner_uuid
    and binding.expected_account_generation = v_lifecycle.account_generation
    and binding.auth_identity_created_at_snapshot
      = p_auth_identity_created_at_snapshot
    and binding.revoked_at is null
  for key share;

  if v_binding.owner_uuid is null then
    raise exception 'ACCOUNT_SESSION_STALE'
      using errcode = '55000';
  end if;

  select recipe.*
    into v_recipe
  from public.recipes as recipe
  where recipe.id = p_recipe_id
  for update;

  if v_recipe.id is null
    or v_recipe.created_by is distinct from p_owner_uuid
    or v_recipe.visibility is distinct from 'private'
    or v_recipe.deleted_at is not null then
    raise exception 'IMAGE_VISIBILITY_MISMATCH'
      using errcode = '55000';
  end if;

  select idempotency.*
    into v_upload_idempotency
  from public.mutation_idempotency_keys as idempotency
  where idempotency.owner_uuid = p_owner_uuid
    and idempotency.account_generation = v_lifecycle.account_generation
    and idempotency.operation_scope = 'recipe_image_upload'
    and idempotency.result_reference = p_image_object_id
  for update;

  select object.*
    into v_object
  from public.recipe_image_objects as object
  where object.id = p_image_object_id
  for update;

  if v_object.id is null then
    raise exception 'IMAGE_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  if v_object.owner_uuid is distinct from p_owner_uuid
    or v_object.account_generation
      is distinct from v_lifecycle.account_generation
    or v_object.visibility is distinct from 'private'
    or v_object.bucket_id is distinct from 'recipe-images-private' then
    raise exception 'IMAGE_VISIBILITY_MISMATCH'
      using errcode = '55000';
  end if;

  if v_upload_idempotency.id is null
    or v_upload_idempotency.state is distinct from 'succeeded'
    or v_upload_idempotency.result_reference
      is distinct from p_image_object_id
    or v_object.state is distinct from 'uploaded_unlinked'
    or v_object.cleanup_generation
      is distinct from p_expected_cleanup_generation
    or v_object.unlinked_cleanup_after is null
    or v_object.unlinked_cleanup_after <= p_now
    or exists (
      select 1
      from public.recipe_image_object_references as reference
      where reference.image_object_id = p_image_object_id
         or (
           reference.reference_type = 'recipe_thumbnail'
           and reference.consumer_id = p_recipe_id
         )
    ) then
    raise exception 'IMAGE_EXPIRED'
      using errcode = '55000';
  end if;

  insert into public.recipe_image_object_references (
    image_object_id,
    reference_type,
    consumer_id,
    created_at
  ) values (
    p_image_object_id,
    'recipe_thumbnail',
    p_recipe_id,
    p_now
  )
  returning id into v_reference_id;

  update public.recipe_image_objects as object
  set state = 'attached_private',
      unlinked_cleanup_after = null,
      upload_attempt_token = null,
      upload_lease_expires_at = null,
      updated_at = p_now
  where object.id = p_image_object_id
    and object.owner_uuid = p_owner_uuid
    and object.account_generation = v_lifecycle.account_generation
    and object.visibility = 'private'
    and object.bucket_id = 'recipe-images-private'
    and object.state = 'uploaded_unlinked'
    and object.cleanup_generation = p_expected_cleanup_generation
    and object.unlinked_cleanup_after > p_now;

  if not found then
    raise exception 'IMAGE_EXPIRED'
      using errcode = '55000';
  end if;

  v_quota_released := public.release_recipe_image_upload_reservation(
    p_owner_uuid,
    v_lifecycle.account_generation,
    p_image_object_id,
    p_now
  );

  if not v_quota_released then
    raise exception 'recipe image attach quota release failed'
      using errcode = '55000';
  end if;

  return jsonb_build_object(
    'outcome',
    'succeeded',
    'recipe_id',
    p_recipe_id,
    'object_id',
    p_image_object_id,
    'reference_id',
    v_reference_id,
    'account_generation',
    v_lifecycle.account_generation,
    'cleanup_generation',
    p_expected_cleanup_generation,
    'state',
    'attached_private'
  );
end;
$function$;

revoke all on function public.attach_recipe_image_object(
  uuid,
  timestamp with time zone,
  text,
  integer,
  uuid,
  uuid,
  bigint,
  timestamp with time zone
) from public, anon, authenticated, service_role;

grant execute on function public.attach_recipe_image_object(
  uuid,
  timestamp with time zone,
  text,
  integer,
  uuid,
  uuid,
  bigint,
  timestamp with time zone
) to service_role;

commit;
