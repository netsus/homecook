begin;

create table if not exists public.storage_object_deletion_outbox (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  object_path text not null,
  owner_uuid uuid not null,
  account_generation bigint not null,
  cleanup_generation bigint not null,
  reason text not null,
  state text not null default 'pending',
  terminal_result text,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint storage_object_deletion_outbox_object_generation_unique
    unique (bucket_id, object_path, cleanup_generation),
  constraint storage_object_deletion_outbox_owner_generation_check
    check (account_generation > 0 and cleanup_generation > 0),
  constraint storage_object_deletion_outbox_reason_check
    check (length(btrim(reason)) > 0),
  constraint storage_object_deletion_outbox_state_check
    check (
      state in (
        'pending',
        'processing',
        'awaiting_not_found_recheck',
        'succeeded',
        'failed',
        'dead_letter'
      )
    ),
  constraint storage_object_deletion_outbox_terminal_result_check
    check (
      (
        state = 'succeeded'
        and terminal_result in ('deleted', 'verified_not_found')
      )
      or (
        state <> 'succeeded'
        and terminal_result is null
      )
    ),
  constraint storage_object_deletion_outbox_attempts_check
    check (attempts >= 0),
  constraint storage_object_deletion_outbox_lease_check
    check (
      (
        state = 'processing'
        and lease_token is not null
        and lease_expires_at is not null
      )
      or (
        state <> 'processing'
        and lease_token is null
        and lease_expires_at is null
      )
    )
);

create index if not exists storage_object_deletion_outbox_due_idx
  on public.storage_object_deletion_outbox (
    next_attempt_at,
    id
  )
  where state = 'pending';

create index if not exists storage_object_deletion_outbox_owner_generation_idx
  on public.storage_object_deletion_outbox (
    owner_uuid,
    account_generation,
    cleanup_generation,
    state,
    id
  );

alter table public.storage_object_deletion_outbox enable row level security;

revoke all on table public.storage_object_deletion_outbox
  from public, anon, authenticated, service_role;

create or replace function public.enqueue_recipe_image_cleanup(
  p_image_object_id uuid,
  p_owner_uuid uuid,
  p_account_generation bigint,
  p_cleanup_generation bigint,
  p_reason text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_object public.recipe_image_objects%rowtype;
  v_existing public.storage_object_deletion_outbox%rowtype;
  v_outbox_id uuid;
begin
  if p_image_object_id is null
    or p_owner_uuid is null
    or p_account_generation is null
    or p_account_generation <= 0
    or p_cleanup_generation is null
    or p_cleanup_generation <= 0
    or nullif(btrim(p_reason), '') is null then
    raise exception 'complete cleanup identity is required'
      using errcode = '22023';
  end if;

  select object.*
    into v_object
  from public.recipe_image_objects as object
  where object.id = p_image_object_id
  for update;

  if not found
    or v_object.visibility <> 'private'
    or v_object.owner_uuid is distinct from p_owner_uuid
    or v_object.account_generation is distinct from p_account_generation
    or v_object.cleanup_generation <> p_cleanup_generation
    or v_object.state <> 'cleanup_pending'
    or exists (
      select 1
      from public.recipe_image_object_references as reference
      where reference.image_object_id = p_image_object_id
    ) then
    return null;
  end if;

  select outbox.*
    into v_existing
  from public.storage_object_deletion_outbox as outbox
  where outbox.bucket_id = v_object.bucket_id
    and outbox.object_path = v_object.object_path
    and outbox.cleanup_generation = p_cleanup_generation
  for update;

  if found then
    if v_existing.owner_uuid is distinct from p_owner_uuid
      or v_existing.account_generation <> p_account_generation
      or v_existing.state = 'succeeded' then
      return null;
    end if;
    return v_existing.id;
  end if;

  insert into public.storage_object_deletion_outbox (
    bucket_id,
    object_path,
    owner_uuid,
    account_generation,
    cleanup_generation,
    reason,
    state,
    next_attempt_at
  ) values (
    v_object.bucket_id,
    v_object.object_path,
    p_owner_uuid,
    p_account_generation,
    p_cleanup_generation,
    btrim(p_reason),
    'pending',
    now()
  )
  returning id into v_outbox_id;

  return v_outbox_id;
end;
$function$;

create or replace function public.claim_recipe_image_cleanup(
  p_limit integer,
  p_lease_token uuid,
  p_now timestamptz
)
returns table (
  outbox_id uuid,
  bucket_id text,
  object_path text,
  owner_uuid uuid,
  account_generation bigint,
  cleanup_generation bigint,
  reason text,
  lease_token uuid
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if p_limit is null
    or p_limit < 1
    or p_limit > 50
    or p_lease_token is null
    or p_now is null then
    raise exception 'valid cleanup claim input is required'
      using errcode = '22023';
  end if;

  return query
  with candidates as (
    select outbox.id
    from public.storage_object_deletion_outbox as outbox
    where outbox.state = 'pending'
      and outbox.next_attempt_at <= p_now
    order by outbox.next_attempt_at, outbox.id
    for update of outbox skip locked
    limit p_limit
  ),
  claimed as (
    update public.storage_object_deletion_outbox as outbox
       set state = 'processing',
           attempts = outbox.attempts + 1,
           lease_token = p_lease_token,
           lease_expires_at = p_now + interval '5 minutes',
           last_error = null,
           updated_at = p_now
      from candidates
     where outbox.id = candidates.id
    returning outbox.*
  )
  select
    claimed.id,
    claimed.bucket_id,
    claimed.object_path,
    claimed.owner_uuid,
    claimed.account_generation,
    claimed.cleanup_generation,
    claimed.reason,
    claimed.lease_token
  from claimed
  order by claimed.next_attempt_at, claimed.id;
end;
$function$;

create or replace function public.authorize_recipe_image_cleanup_delete(
  p_outbox_id uuid,
  p_owner_uuid uuid,
  p_account_generation bigint,
  p_cleanup_generation bigint,
  p_lease_token uuid,
  p_authorized_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
  select exists (
    select 1
    from public.storage_object_deletion_outbox as outbox
    join public.recipe_image_objects as object
      on object.bucket_id = outbox.bucket_id
     and object.object_path = outbox.object_path
    where outbox.id = p_outbox_id
      and outbox.owner_uuid = p_owner_uuid
      and outbox.account_generation = p_account_generation
      and outbox.cleanup_generation = p_cleanup_generation
      and outbox.state = 'processing'
      and outbox.lease_token = p_lease_token
      and outbox.lease_expires_at > p_authorized_at
      and object.visibility = 'private'
      and object.owner_uuid = p_owner_uuid
      and object.account_generation = p_account_generation
      and object.cleanup_generation = p_cleanup_generation
      and object.state = 'cleanup_pending'
      and not exists (
        select 1
        from public.recipe_image_object_references as reference
        where reference.image_object_id = object.id
      )
  )
$function$;

create or replace function public.observe_recipe_image_cleanup_not_found(
  p_outbox_id uuid,
  p_owner_uuid uuid,
  p_account_generation bigint,
  p_cleanup_generation bigint,
  p_lease_token uuid,
  p_observed_at timestamptz
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_image_object_id uuid;
begin
  select object.id
    into v_image_object_id
  from public.storage_object_deletion_outbox as outbox
  join public.recipe_image_objects as object
    on object.bucket_id = outbox.bucket_id
   and object.object_path = outbox.object_path
  where outbox.id = p_outbox_id
    and outbox.owner_uuid = p_owner_uuid
    and outbox.account_generation = p_account_generation
    and outbox.cleanup_generation = p_cleanup_generation
    and outbox.state = 'processing'
    and outbox.lease_token = p_lease_token
    and outbox.lease_expires_at > p_observed_at
    and object.visibility = 'private'
    and object.owner_uuid = p_owner_uuid
    and object.account_generation = p_account_generation
    and object.cleanup_generation = p_cleanup_generation
    and object.state = 'cleanup_pending'
    and not exists (
      select 1
      from public.recipe_image_object_references as reference
      where reference.image_object_id = object.id
    )
  for update of outbox, object;

  if not found then
    return false;
  end if;

  update public.recipe_image_objects
     set state = 'not_found_observed',
         upload_attempt_token = null,
         upload_lease_expires_at = null,
         unlinked_cleanup_after = null,
         not_found_observed_at = p_observed_at,
         late_upload_quarantine_until = p_observed_at + interval '15 minutes',
         updated_at = p_observed_at
   where id = v_image_object_id;

  update public.storage_object_deletion_outbox
     set state = 'awaiting_not_found_recheck',
         next_attempt_at = p_observed_at + interval '15 minutes',
         lease_token = null,
         lease_expires_at = null,
         last_error = null,
         updated_at = p_observed_at
   where id = p_outbox_id;

  return true;
end;
$function$;

create or replace function public.recheck_recipe_image_cleanup_not_found(
  p_outbox_id uuid,
  p_owner_uuid uuid,
  p_account_generation bigint,
  p_cleanup_generation bigint,
  p_object_found boolean,
  p_rechecked_at timestamptz
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_image_object_id uuid;
begin
  if p_object_found is null or p_rechecked_at is null then
    return null;
  end if;

  select object.id
    into v_image_object_id
  from public.storage_object_deletion_outbox as outbox
  join public.recipe_image_objects as object
    on object.bucket_id = outbox.bucket_id
   and object.object_path = outbox.object_path
  where outbox.id = p_outbox_id
    and outbox.owner_uuid = p_owner_uuid
    and outbox.account_generation = p_account_generation
    and outbox.cleanup_generation = p_cleanup_generation
    and outbox.state = 'awaiting_not_found_recheck'
    and outbox.next_attempt_at <= p_rechecked_at
    and object.visibility = 'private'
    and object.owner_uuid = p_owner_uuid
    and object.account_generation = p_account_generation
    and object.cleanup_generation = p_cleanup_generation
    and object.state = 'not_found_observed'
    and object.late_upload_quarantine_until <= p_rechecked_at
    and not exists (
      select 1
      from public.recipe_image_object_references as reference
      where reference.image_object_id = object.id
    )
  for update of outbox, object;

  if not found then
    return null;
  end if;

  if p_object_found then
    update public.recipe_image_objects
       set state = 'cleanup_pending',
           not_found_observed_at = null,
           late_upload_quarantine_until = null,
           updated_at = p_rechecked_at
     where id = v_image_object_id;

    update public.storage_object_deletion_outbox
       set state = 'pending',
           terminal_result = null,
           next_attempt_at = p_rechecked_at,
           lease_token = null,
           lease_expires_at = null,
           last_error = null,
           updated_at = p_rechecked_at
     where id = p_outbox_id;

    return 'pending';
  end if;

  update public.recipe_image_objects
     set state = 'verified_not_found',
         not_found_observed_at = null,
         late_upload_quarantine_until = null,
         next_terminal_scan_at = p_rechecked_at + interval '5 minutes',
         updated_at = p_rechecked_at
   where id = v_image_object_id;

  update public.storage_object_deletion_outbox
     set state = 'succeeded',
         terminal_result = 'verified_not_found',
         next_attempt_at = p_rechecked_at,
         lease_token = null,
         lease_expires_at = null,
         last_error = null,
         updated_at = p_rechecked_at
   where id = p_outbox_id;

  return 'verified_not_found';
end;
$function$;

create or replace function public.complete_recipe_image_cleanup_deleted(
  p_outbox_id uuid,
  p_owner_uuid uuid,
  p_account_generation bigint,
  p_cleanup_generation bigint,
  p_lease_token uuid,
  p_completed_at timestamptz
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_image_object_id uuid;
begin
  select object.id
    into v_image_object_id
  from public.storage_object_deletion_outbox as outbox
  join public.recipe_image_objects as object
    on object.bucket_id = outbox.bucket_id
   and object.object_path = outbox.object_path
  where outbox.id = p_outbox_id
    and outbox.owner_uuid = p_owner_uuid
    and outbox.account_generation = p_account_generation
    and outbox.cleanup_generation = p_cleanup_generation
    and outbox.state = 'processing'
    and outbox.lease_token = p_lease_token
    and outbox.lease_expires_at > p_completed_at
    and object.visibility = 'private'
    and object.owner_uuid = p_owner_uuid
    and object.account_generation = p_account_generation
    and object.cleanup_generation = p_cleanup_generation
    and object.state = 'cleanup_pending'
    and not exists (
      select 1
      from public.recipe_image_object_references as reference
      where reference.image_object_id = object.id
    )
  for update of outbox, object;

  if not found then
    return false;
  end if;

  update public.recipe_image_objects
     set state = 'deleted',
         upload_attempt_token = null,
         upload_lease_expires_at = null,
         unlinked_cleanup_after = null,
         not_found_observed_at = null,
         late_upload_quarantine_until = null,
         next_terminal_scan_at = p_completed_at + interval '5 minutes',
         updated_at = p_completed_at
   where id = v_image_object_id;

  update public.storage_object_deletion_outbox
     set state = 'succeeded',
         terminal_result = 'deleted',
         next_attempt_at = p_completed_at,
         lease_token = null,
         lease_expires_at = null,
         last_error = null,
         updated_at = p_completed_at
   where id = p_outbox_id;

  return true;
end;
$function$;

revoke all on function public.enqueue_recipe_image_cleanup(
  uuid,
  uuid,
  bigint,
  bigint,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.enqueue_recipe_image_cleanup(
  uuid,
  uuid,
  bigint,
  bigint,
  text
) to service_role;

revoke all on function public.claim_recipe_image_cleanup(
  integer,
  uuid,
  timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.claim_recipe_image_cleanup(
  integer,
  uuid,
  timestamptz
) to service_role;

revoke all on function public.authorize_recipe_image_cleanup_delete(
  uuid,
  uuid,
  bigint,
  bigint,
  uuid,
  timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.authorize_recipe_image_cleanup_delete(
  uuid,
  uuid,
  bigint,
  bigint,
  uuid,
  timestamptz
) to service_role;

revoke all on function public.observe_recipe_image_cleanup_not_found(
  uuid,
  uuid,
  bigint,
  bigint,
  uuid,
  timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.observe_recipe_image_cleanup_not_found(
  uuid,
  uuid,
  bigint,
  bigint,
  uuid,
  timestamptz
) to service_role;

revoke all on function public.recheck_recipe_image_cleanup_not_found(
  uuid,
  uuid,
  bigint,
  bigint,
  boolean,
  timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.recheck_recipe_image_cleanup_not_found(
  uuid,
  uuid,
  bigint,
  bigint,
  boolean,
  timestamptz
) to service_role;

revoke all on function public.complete_recipe_image_cleanup_deleted(
  uuid,
  uuid,
  bigint,
  bigint,
  uuid,
  timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.complete_recipe_image_cleanup_deleted(
  uuid,
  uuid,
  bigint,
  bigint,
  uuid,
  timestamptz
) to service_role;

commit;
