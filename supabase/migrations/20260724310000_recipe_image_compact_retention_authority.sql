begin;

alter table public.recipe_image_objects
  add column if not exists retention_compacted_cleanup_generation bigint;

create index if not exists recipe_image_objects_retention_due_idx
  on public.recipe_image_objects (
    updated_at,
    id
  )
  where visibility = 'private'
    and state in ('deleted', 'verified_not_found')
    and next_terminal_scan_at is not null;

create or replace function public.compact_recipe_image_retention_details(
  p_limit integer,
  p_now timestamp with time zone default clock_timestamp()
)
returns table (
  object_id uuid,
  cleanup_generation bigint,
  idempotency_rows integer,
  outbox_rows integer,
  quota_events_removed integer
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_capability_state text;
  v_candidate record;
  v_object public.recipe_image_objects%rowtype;
  v_idempotency_rows integer;
  v_outbox_rows integer;
  v_request_events_before integer;
  v_byte_events_before integer;
  v_request_events_after integer;
  v_byte_events_after integer;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Recipe image retention compaction requires READ COMMITTED'
      using errcode = '25001';
  end if;

  if p_limit is null
    or p_limit < 1
    or p_limit > 50
    or p_now is null then
    raise exception 'valid recipe image retention compaction input is required'
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

  for v_candidate in
    select
      object.id,
      object.owner_uuid
    from public.recipe_image_objects as object
    where object.visibility = 'private'
      and object.owner_uuid is not null
      and object.account_generation is not null
      and object.state in ('deleted', 'verified_not_found')
      and object.updated_at <= p_now - interval '90 days'
      and object.next_terminal_scan_at > p_now
      and object.next_terminal_scan_at <= p_now + interval '24 hours'
      and object.retention_compacted_cleanup_generation
        is distinct from object.cleanup_generation
      and exists (
        select 1
        from public.storage_object_deletion_outbox as outbox
        where outbox.bucket_id = object.bucket_id
          and outbox.object_path = object.object_path
          and outbox.owner_uuid = object.owner_uuid
          and outbox.account_generation = object.account_generation
          and outbox.cleanup_generation = object.cleanup_generation
          and outbox.state = 'succeeded'
          and outbox.terminal_result = object.state
      )
    order by object.updated_at, object.id
    limit p_limit
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'homecook-account-owner:' || v_candidate.owner_uuid::text,
        0
      )
    );

    perform 1
    from public.mutation_idempotency_keys as idempotency
    where idempotency.operation_scope = 'recipe_image_upload'
      and idempotency.result_reference = v_candidate.id
    order by idempotency.id
    for update;

    select object.*
      into v_object
    from public.recipe_image_objects as object
    where object.id = v_candidate.id
      and object.visibility = 'private'
      and object.owner_uuid = v_candidate.owner_uuid
      and object.account_generation is not null
      and object.state in ('deleted', 'verified_not_found')
      and object.updated_at <= p_now - interval '90 days'
      and object.next_terminal_scan_at > p_now
      and object.next_terminal_scan_at <= p_now + interval '24 hours'
      and object.retention_compacted_cleanup_generation
        is distinct from object.cleanup_generation
      and exists (
        select 1
        from public.storage_object_deletion_outbox as outbox
        where outbox.bucket_id = object.bucket_id
          and outbox.object_path = object.object_path
          and outbox.owner_uuid = object.owner_uuid
          and outbox.account_generation = object.account_generation
          and outbox.cleanup_generation = object.cleanup_generation
          and outbox.state = 'succeeded'
          and outbox.terminal_result = object.state
      )
    for update skip locked;

    if v_object.id is null then
      continue;
    end if;

    update public.mutation_idempotency_keys as idempotency
    set attempt_token = null,
        attempts = 1,
        lease_expires_at = null
    where idempotency.operation_scope = 'recipe_image_upload'
      and idempotency.result_reference = v_object.id
      and idempotency.owner_uuid = v_object.owner_uuid
      and idempotency.account_generation = v_object.account_generation
      and idempotency.state in ('succeeded', 'failed_terminal', 'cancelled');

    get diagnostics v_idempotency_rows = row_count;

    update public.storage_object_deletion_outbox as outbox
    set attempts = 0,
        lease_token = null,
        lease_expires_at = null,
        last_error = null
    where outbox.bucket_id = v_object.bucket_id
      and outbox.object_path = v_object.object_path
      and outbox.owner_uuid = v_object.owner_uuid
      and outbox.account_generation = v_object.account_generation
      and outbox.cleanup_generation = v_object.cleanup_generation
      and outbox.state = 'succeeded'
      and outbox.terminal_result = v_object.state;

    get diagnostics v_outbox_rows = row_count;

    v_request_events_before := 0;
    v_byte_events_before := 0;
    v_request_events_after := 0;
    v_byte_events_after := 0;

    select
      jsonb_array_length(counter.request_events),
      jsonb_array_length(counter.byte_events)
    into
      v_request_events_before,
      v_byte_events_before
    from public.image_upload_quota_counters as counter
    where counter.owner_uuid = v_object.owner_uuid
      and counter.account_generation = v_object.account_generation
    for update;

    if found then
      update public.image_upload_quota_counters as counter
      set request_events = (
            select coalesce(
              jsonb_agg(event.value order by event.ordinality),
              '[]'::jsonb
            )
            from jsonb_array_elements(counter.request_events)
              with ordinality as event(value, ordinality)
            where (event.value ->> 'at')::timestamp with time zone
              > p_now - interval '90 days'
          ),
          byte_events = (
            select coalesce(
              jsonb_agg(event.value order by event.ordinality),
              '[]'::jsonb
            )
            from jsonb_array_elements(counter.byte_events)
              with ordinality as event(value, ordinality)
            where (event.value ->> 'at')::timestamp with time zone
              > p_now - interval '90 days'
          )
      where counter.owner_uuid = v_object.owner_uuid
        and counter.account_generation = v_object.account_generation
      returning
        jsonb_array_length(counter.request_events),
        jsonb_array_length(counter.byte_events)
      into
        v_request_events_after,
        v_byte_events_after;
    end if;

    update public.recipe_image_objects as object
    set retention_compacted_cleanup_generation = object.cleanup_generation
    where object.id = v_object.id
      and object.owner_uuid = v_object.owner_uuid
      and object.account_generation = v_object.account_generation
      and object.cleanup_generation = v_object.cleanup_generation
      and object.state = v_object.state
      and object.next_terminal_scan_at = v_object.next_terminal_scan_at;

    if not found then
      raise exception 'Recipe image retention compaction cursor changed'
        using errcode = '40001';
    end if;

    object_id := v_object.id;
    cleanup_generation := v_object.cleanup_generation;
    idempotency_rows := v_idempotency_rows;
    outbox_rows := v_outbox_rows;
    quota_events_removed :=
      v_request_events_before
      + v_byte_events_before
      - v_request_events_after
      - v_byte_events_after;
    return next;
  end loop;
end;
$function$;

revoke all on function public.compact_recipe_image_retention_details(
  integer,
  timestamp with time zone
) from public, anon, authenticated, service_role;

grant execute on function public.compact_recipe_image_retention_details(
  integer,
  timestamp with time zone
) to service_role;

commit;
