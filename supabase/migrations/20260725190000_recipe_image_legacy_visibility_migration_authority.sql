begin;

create table if not exists
public.recipe_image_legacy_visibility_migration_runs (
  id uuid primary key default gen_random_uuid(),
  migration_key uuid not null unique,
  inventory_run_id uuid not null
    references public.recipe_image_legacy_inventory_runs(id)
    on delete restrict,
  cutover_attempt_id uuid not null
    references public.account_generation_cutover_attempts(id)
    on delete restrict,
  capability_revision bigint not null check (capability_revision > 0),
  snapshot_hash text not null
    check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  positive_reference_count integer not null
    check (positive_reference_count between 1 and 100),
  target_count integer not null default 0
    check (target_count between 0 and 100),
  finalized_target_count integer not null default 0
    check (
      finalized_target_count between 0 and target_count
    ),
  state text not null default 'planned'
    check (state in ('planned', 'finalized')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists
public.recipe_image_legacy_visibility_targets (
  id uuid primary key default gen_random_uuid(),
  migration_run_id uuid not null
    references public.recipe_image_legacy_visibility_migration_runs(id)
    on delete restrict,
  target_object_id uuid not null unique,
  source_storage_object_id uuid not null,
  source_bucket_id text not null,
  source_object_path text not null,
  source_path_hash text not null
    check (source_path_hash ~ '^[0-9a-f]{64}$'),
  expected_visibility text not null
    check (expected_visibility in ('private', 'public_shared')),
  owner_uuid uuid,
  account_generation bigint,
  target_bucket_id text not null,
  target_object_path text not null,
  state text not null default 'planned'
    check (state in ('planned', 'finalized')),
  raw_sha256 text check (
    raw_sha256 is null or raw_sha256 ~ '^[0-9a-f]{64}$'
  ),
  byte_size bigint check (
    byte_size is null or byte_size between 1 and 5242880
  ),
  actual_mime_type text check (
    actual_mime_type is null
    or actual_mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  finalized_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint recipe_image_legacy_visibility_target_identity_unique
    unique nulls not distinct (
      migration_run_id,
      source_storage_object_id,
      expected_visibility,
      owner_uuid,
      account_generation
    ),
  constraint recipe_image_legacy_visibility_target_shape_check
    check (
      (
        expected_visibility = 'private'
        and owner_uuid is not null
        and account_generation is not null
        and account_generation > 0
        and target_bucket_id = 'recipe-images-private'
        and target_object_path like (
          owner_uuid::text
          || '/'
          || account_generation::text
          || '/'
          || target_object_id::text
          || '.%'
        )
      )
      or (
        expected_visibility = 'public_shared'
        and owner_uuid is null
        and account_generation is null
        and target_bucket_id = 'recipe-images'
        and target_object_path like (
          'shared/' || target_object_id::text || '.%'
        )
      )
    ),
  constraint recipe_image_legacy_visibility_target_extension_check
    check (target_object_path ~ '\.(jpg|jpeg|png|webp)$'),
  constraint recipe_image_legacy_visibility_target_finalize_check
    check (
      (
        state = 'planned'
        and raw_sha256 is null
        and byte_size is null
        and actual_mime_type is null
        and finalized_at is null
      )
      or (
        state = 'finalized'
        and raw_sha256 is not null
        and byte_size is not null
        and actual_mime_type is not null
        and finalized_at is not null
      )
    )
);

create table if not exists
public.recipe_image_legacy_visibility_target_references (
  id uuid primary key default gen_random_uuid(),
  migration_target_id uuid not null
    references public.recipe_image_legacy_visibility_targets(id)
    on delete restrict,
  positive_reference_id uuid not null unique
    references public.recipe_image_legacy_positive_references(id)
    on delete restrict,
  reference_type text not null
    check (reference_type in ('recipe_thumbnail', 'recipe_book_cover')),
  consumer_id uuid not null,
  expected_legacy_url text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint recipe_image_legacy_visibility_target_consumer_unique
    unique (migration_target_id, reference_type, consumer_id)
);

create index if not exists
recipe_image_legacy_visibility_targets_run_state_idx
  on public.recipe_image_legacy_visibility_targets (
    migration_run_id,
    state,
    target_object_id
  );

alter table public.recipe_image_legacy_visibility_migration_runs
  enable row level security;
alter table public.recipe_image_legacy_visibility_targets
  enable row level security;
alter table public.recipe_image_legacy_visibility_target_references
  enable row level security;

revoke all
  on table public.recipe_image_legacy_visibility_migration_runs
  from public, anon, authenticated, service_role;
revoke all
  on table public.recipe_image_legacy_visibility_targets
  from public, anon, authenticated, service_role;
revoke all
  on table public.recipe_image_legacy_visibility_target_references
  from public, anon, authenticated, service_role;

create or replace function
public.prepare_recipe_image_legacy_visibility_migration(
  p_migration_key uuid,
  p_inventory_run_id uuid,
  p_cutover_attempt_id uuid,
  p_expected_capability_revision bigint,
  p_positive_reference_ids uuid[]
)
returns table (
  migration_run_id uuid,
  target_object_id uuid,
  source_bucket_id text,
  source_object_path text,
  expected_visibility text,
  owner_uuid uuid,
  account_generation bigint,
  target_bucket_id text,
  target_object_path text,
  state text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_capability public.account_generation_capability_state%rowtype;
  v_inventory public.recipe_image_legacy_inventory_runs%rowtype;
  v_existing
    public.recipe_image_legacy_visibility_migration_runs%rowtype;
  v_run public.recipe_image_legacy_visibility_migration_runs%rowtype;
  v_positive public.recipe_image_legacy_positive_references%rowtype;
  v_recipe public.recipes%rowtype;
  v_recipe_book public.recipe_books%rowtype;
  v_staging public.account_generation_cutover_staging%rowtype;
  v_target_object_id uuid;
  v_target_id uuid;
  v_target_bucket_id text;
  v_target_object_path text;
  v_expected_legacy_url text;
  v_extension text;
  v_account_generation bigint;
  v_snapshot_hash text;
  v_input_count integer;
  v_distinct_count integer;
  v_found_count integer := 0;
  v_target_count integer;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception
      'recipe image legacy visibility migration requires READ COMMITTED'
      using errcode = '25001';
  end if;

  if p_migration_key is null
    or p_inventory_run_id is null
    or p_cutover_attempt_id is null
    or p_expected_capability_revision is null
    or p_expected_capability_revision <= 0
    or p_positive_reference_ids is null
    or cardinality(p_positive_reference_ids) not between 1 and 100
    or array_position(p_positive_reference_ids, null) is not null then
    raise exception 'legacy visibility migration input is invalid'
      using errcode = '22023';
  end if;

  select
    count(*),
    count(distinct input.positive_reference_id)
  into v_input_count, v_distinct_count
  from unnest(p_positive_reference_ids)
    as input(positive_reference_id);

  if v_input_count <> v_distinct_count then
    raise exception
      'legacy visibility migration input contains duplicate references'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-generation-cutover',
      0
    )
  );

  select capability.*
  into v_capability
  from public.account_generation_capability_state as capability
  where capability.singleton
  for update;

  if v_capability.state is distinct from 'cutover_maintenance'
    or v_capability.current_cutover_attempt_id
      is distinct from p_cutover_attempt_id
    or v_capability.revision
      is distinct from p_expected_capability_revision then
    raise exception
      'legacy visibility migration cutover authority is unavailable'
      using errcode = '40001';
  end if;

  select inventory.*
  into v_inventory
  from public.recipe_image_legacy_inventory_runs as inventory
  where inventory.id = p_inventory_run_id
  for key share;

  if v_inventory.id is null
    or v_inventory.enqueue_count <> 0
    or v_inventory.delete_count <> 0 then
    raise exception
      'legacy visibility migration requires a report-only inventory'
      using errcode = '55000';
  end if;

  create temporary table if not exists
  recipe_image_legacy_visibility_reference_work (
    positive_reference_id uuid primary key,
    source_storage_object_id uuid not null,
    source_bucket_id text not null,
    source_object_path text not null,
    source_path_hash text not null,
    expected_visibility text not null,
    owner_uuid uuid not null,
    account_generation bigint,
    reference_type text not null,
    consumer_id uuid not null,
    expected_legacy_url text not null
  ) on commit drop;

  create temporary table if not exists
  recipe_image_legacy_visibility_target_work (
    target_object_id uuid primary key,
    source_storage_object_id uuid not null,
    source_bucket_id text not null,
    source_object_path text not null,
    source_path_hash text not null,
    expected_visibility text not null,
    owner_uuid uuid,
    account_generation bigint,
    target_bucket_id text not null,
    target_object_path text not null
  ) on commit drop;

  truncate table
    recipe_image_legacy_visibility_reference_work,
    recipe_image_legacy_visibility_target_work;

  for v_positive in
    select positive.*
    from unnest(p_positive_reference_ids) with ordinality
      as input(positive_reference_id, ordinality)
    join public.recipe_image_legacy_positive_references as positive
      on positive.id = input.positive_reference_id
    order by input.ordinality
  loop
    v_found_count := v_found_count + 1;

    if v_positive.inventory_run_id is distinct from p_inventory_run_id
      or v_positive.bucket_id is distinct from 'recipe-images' then
      raise exception 'legacy visibility migration source drifted'
        using errcode = '40001';
    end if;

    v_expected_legacy_url :=
      v_inventory.storage_origin
      || '/storage/v1/object/public/recipe-images/'
      || v_positive.object_path;

    if v_positive.reference_type = 'recipe_thumbnail' then
      select recipe.*
      into v_recipe
      from public.recipes as recipe
      where recipe.id = v_positive.consumer_id
      for key share;

      if v_recipe.id is null
        or v_recipe.thumbnail_url is distinct from
          v_inventory.storage_origin
          || '/storage/v1/object/public/recipe-images/'
          || v_positive.object_path
        or v_recipe.created_by is distinct from v_positive.owner_uuid
        or (
          case
            when v_recipe.visibility::text = 'public'
              then 'public_shared'
            else 'private'
          end
        ) is distinct from v_positive.expected_visibility then
        raise exception 'legacy visibility migration source drifted'
          using errcode = '40001';
      end if;
    elsif v_positive.reference_type = 'recipe_book_cover' then
      select recipe_book.*
      into v_recipe_book
      from public.recipe_books as recipe_book
      where recipe_book.id = v_positive.consumer_id
      for key share;

      if v_recipe_book.id is null
        or v_recipe_book.cover_image_url is distinct from
          v_inventory.storage_origin
          || '/storage/v1/object/public/recipe-images/'
          || v_positive.object_path
        or v_recipe_book.user_id is distinct from v_positive.owner_uuid
        or v_positive.expected_visibility is distinct from 'private' then
        raise exception 'legacy visibility migration source drifted'
          using errcode = '40001';
      end if;
    else
      raise exception 'legacy visibility migration source drifted'
        using errcode = '40001';
    end if;

    if exists (
      select 1
      from public.recipe_image_object_references as reference
      where reference.reference_type = v_positive.reference_type
        and reference.consumer_id = v_positive.consumer_id
    ) then
      raise exception 'legacy visibility migration source drifted'
        using errcode = '40001';
    end if;

    v_account_generation := null;
    if v_positive.expected_visibility = 'private' then
      select staging.*
      into v_staging
      from public.account_generation_cutover_staging as staging
      where staging.attempt_id = p_cutover_attempt_id
        and staging.owner_uuid = v_positive.owner_uuid
      for key share;

      if v_staging.owner_uuid is null
        or v_staging.proposed_account_generation is null
        or v_staging.proposed_account_generation <= 0
        or v_staging.proposed_action not in ('activate', 'quarantine')
        or v_staging.validation_state is distinct from 'validated' then
        raise exception
          'legacy visibility migration private generation is unavailable'
          using errcode = '55000';
      end if;
      v_account_generation := v_staging.proposed_account_generation;
    end if;

    v_extension := lower(
      substring(v_positive.object_path from '\.([^.]+)$')
    );
    if v_extension not in ('jpg', 'jpeg', 'png', 'webp') then
      raise exception 'legacy visibility migration source drifted'
        using errcode = '40001';
    end if;

    select target.target_object_id
    into v_target_object_id
    from recipe_image_legacy_visibility_target_work as target
    where target.source_storage_object_id
      = v_positive.storage_object_id
      and target.expected_visibility
        = v_positive.expected_visibility
      and target.owner_uuid is not distinct from (
        case
          when v_positive.expected_visibility = 'private'
            then v_positive.owner_uuid
          else null
        end
      )
      and target.account_generation
        is not distinct from v_account_generation;

    if v_target_object_id is null then
      v_target_object_id := gen_random_uuid();
      if v_positive.expected_visibility = 'private' then
        v_target_bucket_id := 'recipe-images-private';
        v_target_object_path :=
          v_positive.owner_uuid::text
          || '/'
          || v_account_generation::text
          || '/'
          || v_target_object_id::text
          || '.'
          || v_extension;
      else
        v_target_bucket_id := 'recipe-images';
        v_target_object_path :=
          'shared/'
          || v_target_object_id::text
          || '.'
          || v_extension;
      end if;

      insert into recipe_image_legacy_visibility_target_work (
        target_object_id,
        source_storage_object_id,
        source_bucket_id,
        source_object_path,
        source_path_hash,
        expected_visibility,
        owner_uuid,
        account_generation,
        target_bucket_id,
        target_object_path
      ) values (
        v_target_object_id,
        v_positive.storage_object_id,
        v_positive.bucket_id,
        v_positive.object_path,
        v_positive.path_hash,
        v_positive.expected_visibility,
        case
          when v_positive.expected_visibility = 'private'
            then v_positive.owner_uuid
          else null
        end,
        v_account_generation,
        v_target_bucket_id,
        v_target_object_path
      );
    end if;

    insert into recipe_image_legacy_visibility_reference_work (
      positive_reference_id,
      source_storage_object_id,
      source_bucket_id,
      source_object_path,
      source_path_hash,
      expected_visibility,
      owner_uuid,
      account_generation,
      reference_type,
      consumer_id,
      expected_legacy_url
    ) values (
      v_positive.id,
      v_positive.storage_object_id,
      v_positive.bucket_id,
      v_positive.object_path,
      v_positive.path_hash,
      v_positive.expected_visibility,
      v_positive.owner_uuid,
      v_account_generation,
      v_positive.reference_type,
      v_positive.consumer_id,
      v_expected_legacy_url
    );
  end loop;

  if v_found_count <> v_input_count then
    raise exception 'legacy visibility migration source drifted'
      using errcode = '40001';
  end if;

  select encode(
    extensions.digest(
      pg_catalog.convert_to(
        string_agg(
          reference.positive_reference_id::text
          || ':'
          || reference.source_storage_object_id::text
          || ':'
          || reference.source_path_hash
          || ':'
          || reference.expected_visibility
          || ':'
          || reference.owner_uuid::text
          || ':'
          || coalesce(reference.account_generation::text, '')
          || ':'
          || reference.reference_type
          || ':'
          || reference.consumer_id::text
          || ':'
          || reference.expected_legacy_url,
          ',' order by reference.positive_reference_id
        ),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  into v_snapshot_hash
  from recipe_image_legacy_visibility_reference_work as reference;

  select run.*
  into v_existing
  from public.recipe_image_legacy_visibility_migration_runs as run
  where run.migration_key = p_migration_key
  for update;

  if v_existing.id is not null then
    if v_existing.inventory_run_id
        is distinct from p_inventory_run_id
      or v_existing.cutover_attempt_id
        is distinct from p_cutover_attempt_id
      or v_existing.capability_revision
        is distinct from p_expected_capability_revision
      or v_existing.positive_reference_count
        is distinct from v_input_count
      or v_existing.snapshot_hash is distinct from v_snapshot_hash then
      raise exception
        'legacy visibility migration key reused with different snapshot'
        using errcode = '23505';
    end if;

    return query
    select
      v_existing.id,
      target.target_object_id,
      target.source_bucket_id,
      target.source_object_path,
      target.expected_visibility,
      target.owner_uuid,
      target.account_generation,
      target.target_bucket_id,
      target.target_object_path,
      target.state
    from public.recipe_image_legacy_visibility_targets as target
    where target.migration_run_id = v_existing.id
    order by target.target_object_id;
    return;
  end if;

  select count(*)
  into v_target_count
  from recipe_image_legacy_visibility_target_work;

  insert into public.recipe_image_legacy_visibility_migration_runs (
    migration_key,
    inventory_run_id,
    cutover_attempt_id,
    capability_revision,
    snapshot_hash,
    positive_reference_count,
    target_count,
    finalized_target_count,
    state
  ) values (
    p_migration_key,
    p_inventory_run_id,
    p_cutover_attempt_id,
    p_expected_capability_revision,
    v_snapshot_hash,
    v_input_count,
    v_target_count,
    0,
    'planned'
  )
  returning * into v_run;

  insert into public.recipe_image_legacy_visibility_targets (
    migration_run_id,
    target_object_id,
    source_storage_object_id,
    source_bucket_id,
    source_object_path,
    source_path_hash,
    expected_visibility,
    owner_uuid,
    account_generation,
    target_bucket_id,
    target_object_path,
    state
  )
  select
    v_run.id,
    target.target_object_id,
    target.source_storage_object_id,
    target.source_bucket_id,
    target.source_object_path,
    target.source_path_hash,
    target.expected_visibility,
    target.owner_uuid,
    target.account_generation,
    target.target_bucket_id,
    target.target_object_path,
    'planned'
  from recipe_image_legacy_visibility_target_work as target;

  insert into
  public.recipe_image_legacy_visibility_target_references (
    migration_target_id,
    positive_reference_id,
    reference_type,
    consumer_id,
    expected_legacy_url
  )
  select
    target.id,
    reference.positive_reference_id,
    reference.reference_type,
    reference.consumer_id,
    reference.expected_legacy_url
  from recipe_image_legacy_visibility_reference_work as reference
  join public.recipe_image_legacy_visibility_targets as target
    on target.migration_run_id = v_run.id
    and target.source_storage_object_id
      = reference.source_storage_object_id
    and target.expected_visibility = reference.expected_visibility
    and target.owner_uuid is not distinct from (
      case
        when reference.expected_visibility = 'private'
          then reference.owner_uuid
        else null
      end
    )
    and target.account_generation
      is not distinct from reference.account_generation;

  return query
  select
    v_run.id,
    target.target_object_id,
    target.source_bucket_id,
    target.source_object_path,
    target.expected_visibility,
    target.owner_uuid,
    target.account_generation,
    target.target_bucket_id,
    target.target_object_path,
    target.state
  from public.recipe_image_legacy_visibility_targets as target
  where target.migration_run_id = v_run.id
  order by target.target_object_id;
end;
$function$;

create or replace function
public.finalize_recipe_image_legacy_visibility_target(
  p_migration_run_id uuid,
  p_target_object_id uuid,
  p_expected_capability_revision bigint,
  p_raw_sha256 text,
  p_byte_size bigint,
  p_actual_mime_type text,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_capability public.account_generation_capability_state%rowtype;
  v_run public.recipe_image_legacy_visibility_migration_runs%rowtype;
  v_inventory public.recipe_image_legacy_inventory_runs%rowtype;
  v_target public.recipe_image_legacy_visibility_targets%rowtype;
  v_target_reference
    public.recipe_image_legacy_visibility_target_references%rowtype;
  v_recipe public.recipes%rowtype;
  v_recipe_book public.recipe_books%rowtype;
  v_expected_mime_type text;
  v_finalized_target_count integer;
  v_target_count integer;
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception
      'recipe image legacy visibility finalize requires READ COMMITTED'
      using errcode = '25001';
  end if;

  if p_migration_run_id is null
    or p_target_object_id is null
    or p_expected_capability_revision is null
    or p_expected_capability_revision <= 0
    or p_raw_sha256 is null
    or p_raw_sha256 !~ '^[0-9a-f]{64}$'
    or p_byte_size is null
    or p_byte_size not between 1 and 5242880
    or p_actual_mime_type not in (
      'image/jpeg',
      'image/png',
      'image/webp'
    )
    or p_now is null then
    raise exception 'legacy visibility finalize evidence is invalid'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-account-generation-cutover',
      0
    )
  );

  select capability.*
  into v_capability
  from public.account_generation_capability_state as capability
  where capability.singleton
  for update;

  select run.*
  into v_run
  from public.recipe_image_legacy_visibility_migration_runs as run
  where run.id = p_migration_run_id
  for update;

  select target.*
  into v_target
  from public.recipe_image_legacy_visibility_targets as target
  where target.migration_run_id = p_migration_run_id
    and target.target_object_id = p_target_object_id
  for update;

  if v_run.id is null
    or v_target.id is null
    or v_capability.state is distinct from 'cutover_maintenance'
    or v_capability.current_cutover_attempt_id
      is distinct from v_run.cutover_attempt_id
    or v_capability.revision
      is distinct from p_expected_capability_revision
    or v_run.capability_revision
      is distinct from p_expected_capability_revision then
    raise exception
      'legacy visibility finalize cutover authority is unavailable'
      using errcode = '40001';
  end if;

  select inventory.*
  into v_inventory
  from public.recipe_image_legacy_inventory_runs as inventory
  where inventory.id = v_run.inventory_run_id
  for key share;

  if v_inventory.id is null
    or v_inventory.enqueue_count <> 0
    or v_inventory.delete_count <> 0 then
    raise exception
      'legacy visibility finalize requires a report-only inventory'
      using errcode = '55000';
  end if;

  v_expected_mime_type := case
    when v_target.target_object_path ~ '\.(jpg|jpeg)$'
      then 'image/jpeg'
    when v_target.target_object_path ~ '\.png$'
      then 'image/png'
    when v_target.target_object_path ~ '\.webp$'
      then 'image/webp'
    else null
  end;

  if v_expected_mime_type is distinct from p_actual_mime_type then
    raise exception 'legacy visibility finalize evidence is invalid'
      using errcode = '22023';
  end if;

  if v_target.state = 'finalized' then
    if v_target.raw_sha256 is distinct from p_raw_sha256
      or v_target.byte_size is distinct from p_byte_size
      or v_target.actual_mime_type is distinct from p_actual_mime_type then
      raise exception
        'legacy visibility finalize replay evidence changed'
        using errcode = '23505';
    end if;

    return jsonb_build_object(
      'migration_run_id', v_run.id,
      'target_object_id', v_target.target_object_id,
      'state', 'finalized',
      'replayed', true
    );
  end if;

  perform 1
  from storage.objects as source_object
  where source_object.id = v_target.source_storage_object_id
    and source_object.bucket_id = v_target.source_bucket_id
    and source_object.name = v_target.source_object_path
  for key share;

  if not found then
    raise exception 'legacy visibility migration source drifted'
      using errcode = '40001';
  end if;

  perform 1
  from storage.objects as target_object
  where target_object.bucket_id = v_target.target_bucket_id
    and target_object.name = v_target.target_object_path
  for key share;

  if not found then
    raise exception 'legacy visibility copied target is unavailable'
      using errcode = '55000';
  end if;

  for v_target_reference in
    select target_reference.*
    from public.recipe_image_legacy_visibility_target_references
      as target_reference
    where target_reference.migration_target_id = v_target.id
    order by
      target_reference.reference_type,
      target_reference.consumer_id
    for update
  loop
    if v_target_reference.reference_type = 'recipe_thumbnail' then
      select recipe.*
      into v_recipe
      from public.recipes as recipe
      where recipe.id = v_target_reference.consumer_id
      for update;

      if v_recipe.id is null
        or v_recipe.thumbnail_url is distinct from
          v_target_reference.expected_legacy_url
        or v_recipe.created_by is distinct from
          (
            select positive.owner_uuid
            from public.recipe_image_legacy_positive_references
              as positive
            where positive.id
              = v_target_reference.positive_reference_id
          )
        or (
          case
            when v_recipe.visibility::text = 'public'
              then 'public_shared'
            else 'private'
          end
        ) is distinct from v_target.expected_visibility then
        raise exception 'legacy visibility migration source drifted'
          using errcode = '40001';
      end if;
    elsif v_target_reference.reference_type = 'recipe_book_cover' then
      select recipe_book.*
      into v_recipe_book
      from public.recipe_books as recipe_book
      where recipe_book.id = v_target_reference.consumer_id
      for update;

      if v_recipe_book.id is null
        or v_recipe_book.cover_image_url is distinct from
          v_target_reference.expected_legacy_url
        or v_recipe_book.user_id is distinct from v_target.owner_uuid
        or v_target.expected_visibility is distinct from 'private' then
        raise exception 'legacy visibility migration source drifted'
          using errcode = '40001';
      end if;
    else
      raise exception 'legacy visibility migration source drifted'
        using errcode = '40001';
    end if;

    if exists (
      select 1
      from public.recipe_image_object_references as reference
      join public.recipe_image_legacy_positive_references as positive
        on positive.id = v_target_reference.positive_reference_id
      where reference.reference_type = positive.reference_type
        and reference.consumer_id = positive.consumer_id
    ) then
      raise exception 'legacy visibility migration source drifted'
        using errcode = '40001';
    end if;
  end loop;

  insert into public.recipe_image_objects (
    id,
    owner_uuid,
    account_generation,
    bucket_id,
    object_path,
    raw_sha256,
    byte_size,
    actual_mime_type,
    visibility,
    state,
    cleanup_generation,
    created_at,
    updated_at
  ) values (
    v_target.target_object_id,
    v_target.owner_uuid,
    v_target.account_generation,
    v_target.target_bucket_id,
    v_target.target_object_path,
    p_raw_sha256,
    p_byte_size,
    p_actual_mime_type,
    v_target.expected_visibility,
    case v_target.expected_visibility
      when 'private' then 'attached_private'
      else 'attached_public_shared'
    end,
    0,
    p_now,
    p_now
  );

  insert into public.recipe_image_object_references (
    image_object_id,
    reference_type,
    consumer_id,
    created_at
  )
  select
    v_target.target_object_id,
    target_reference.reference_type,
    target_reference.consumer_id,
    p_now
  from public.recipe_image_legacy_visibility_target_references
    as target_reference
  where target_reference.migration_target_id = v_target.id
  order by
    target_reference.reference_type,
    target_reference.consumer_id;

  update public.recipe_image_legacy_visibility_targets
  set
    state = 'finalized',
    raw_sha256 = p_raw_sha256,
    byte_size = p_byte_size,
    actual_mime_type = p_actual_mime_type,
    finalized_at = p_now,
    updated_at = p_now
  where id = v_target.id
    and state = 'planned';

  if not found then
    raise exception 'legacy visibility finalize compare-and-swap failed'
      using errcode = '40001';
  end if;

  select
    count(*) filter (where target.state = 'finalized'),
    count(*)
  into v_finalized_target_count, v_target_count
  from public.recipe_image_legacy_visibility_targets as target
  where target.migration_run_id = v_run.id;

  update public.recipe_image_legacy_visibility_migration_runs
  set
    finalized_target_count = v_finalized_target_count,
    state = case
      when v_finalized_target_count = v_target_count
        then 'finalized'
      else 'planned'
    end,
    updated_at = p_now
  where id = v_run.id;

  return jsonb_build_object(
    'migration_run_id', v_run.id,
    'target_object_id', v_target.target_object_id,
    'state', 'finalized',
    'replayed', false,
    'finalized_target_count', v_finalized_target_count,
    'target_count', v_target_count
  );
end;
$function$;

revoke all on function
public.prepare_recipe_image_legacy_visibility_migration(
  uuid,
  uuid,
  uuid,
  bigint,
  uuid[]
) from public, anon, authenticated, service_role;
grant execute on function
public.prepare_recipe_image_legacy_visibility_migration(
  uuid,
  uuid,
  uuid,
  bigint,
  uuid[]
) to service_role;

revoke all on function
public.finalize_recipe_image_legacy_visibility_target(
  uuid,
  uuid,
  bigint,
  text,
  bigint,
  text,
  timestamp with time zone
) from public, anon, authenticated, service_role;
grant execute on function
public.finalize_recipe_image_legacy_visibility_target(
  uuid,
  uuid,
  bigint,
  text,
  bigint,
  text,
  timestamp with time zone
) to service_role;

commit;
