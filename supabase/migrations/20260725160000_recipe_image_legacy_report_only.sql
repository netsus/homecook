begin;

create table if not exists public.recipe_image_legacy_inventory_runs (
  id uuid primary key default gen_random_uuid(),
  inventory_key uuid not null unique,
  storage_origin text not null,
  snapshot_hash text not null,
  service_object_count bigint not null,
  known_reference_count bigint not null,
  referenced_private_count bigint not null,
  referenced_public_shared_count bigint not null,
  deletion_candidate_unverified_count bigint not null,
  suspicious_unclassified_count bigint not null,
  enqueue_count bigint not null default 0,
  delete_count bigint not null default 0,
  created_at timestamptz not null default clock_timestamp(),
  constraint recipe_image_legacy_inventory_origin_check
    check (
      storage_origin ~
        '^https://[a-z0-9][a-z0-9.-]*(:[0-9]{1,5})?$'
    ),
  constraint recipe_image_legacy_inventory_snapshot_hash_check
    check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  constraint recipe_image_legacy_inventory_counts_check
  check (
    service_object_count >= 0
    and known_reference_count >= 0
    and referenced_private_count >= 0
    and referenced_public_shared_count >= 0
    and deletion_candidate_unverified_count >= 0
    and suspicious_unclassified_count >= 0
    and known_reference_count =
      referenced_private_count + referenced_public_shared_count
    and service_object_count >=
      deletion_candidate_unverified_count
      + suspicious_unclassified_count
  ),
  constraint recipe_image_legacy_inventory_report_only_check
    check (enqueue_count = 0 and delete_count = 0)
);

create table if not exists
public.recipe_image_legacy_positive_references (
  id uuid primary key default gen_random_uuid(),
  inventory_run_id uuid not null
    references public.recipe_image_legacy_inventory_runs(id)
    on delete restrict,
  storage_object_id uuid not null,
  bucket_id text not null,
  object_path text not null,
  path_hash text not null,
  owner_uuid uuid not null,
  reference_type text not null,
  consumer_id uuid not null,
  expected_visibility text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint recipe_image_legacy_positive_reference_unique
    unique (
      inventory_run_id,
      storage_object_id,
      reference_type,
      consumer_id
    ),
  constraint recipe_image_legacy_positive_bucket_check
    check (bucket_id = 'recipe-images'),
  constraint recipe_image_legacy_positive_path_check
    check (
      object_path ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      and split_part(object_path, '/', 1) = owner_uuid::text
    ),
  constraint recipe_image_legacy_positive_hash_check
    check (path_hash ~ '^[0-9a-f]{64}$'),
  constraint recipe_image_legacy_positive_type_check
    check (
      reference_type in ('recipe_thumbnail', 'recipe_book_cover')
    ),
  constraint recipe_image_legacy_positive_visibility_check
    check (expected_visibility in ('private', 'public_shared'))
);

create table if not exists
public.recipe_image_legacy_candidate_reports (
  id uuid primary key default gen_random_uuid(),
  inventory_run_id uuid not null
    references public.recipe_image_legacy_inventory_runs(id)
    on delete restrict,
  path_hash text not null,
  classification text not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint recipe_image_legacy_candidate_report_unique
    unique (inventory_run_id, path_hash),
  constraint recipe_image_legacy_candidate_hash_check
    check (path_hash ~ '^[0-9a-f]{64}$'),
  constraint recipe_image_legacy_candidate_classification_check
    check (
      classification in (
        'deletion_candidate_unverified',
        'suspicious_unclassified'
      )
    )
);

alter table public.recipe_image_legacy_inventory_runs
  enable row level security;
alter table public.recipe_image_legacy_positive_references
  enable row level security;
alter table public.recipe_image_legacy_candidate_reports
  enable row level security;

revoke all on table public.recipe_image_legacy_inventory_runs
  from public, anon, authenticated, service_role;
revoke all on table public.recipe_image_legacy_positive_references
  from public, anon, authenticated, service_role;
revoke all on table public.recipe_image_legacy_candidate_reports
  from public, anon, authenticated, service_role;

create or replace function public.inventory_recipe_image_legacy_objects(
  p_inventory_key uuid,
  p_storage_origin text
)
returns table (
  inventory_run_id uuid,
  service_object_count bigint,
  known_reference_count bigint,
  referenced_private_count bigint,
  referenced_public_shared_count bigint,
  deletion_candidate_unverified_count bigint,
  suspicious_unclassified_count bigint,
  enqueue_count bigint,
  delete_count bigint
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions, pg_temp
as $function$
declare
  v_existing public.recipe_image_legacy_inventory_runs%rowtype;
  v_run public.recipe_image_legacy_inventory_runs%rowtype;
  v_snapshot_hash text;
begin
  if p_inventory_key is null
    or p_storage_origin is null
    or p_storage_origin <> lower(p_storage_origin)
    or p_storage_origin !~
      '^https://[a-z0-9][a-z0-9.-]*(:[0-9]{1,5})?$' then
    raise exception 'recipe image legacy inventory identity is invalid'
      using errcode = '22023';
  end if;

  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Recipe image legacy inventory requires READ COMMITTED'
      using errcode = '25001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'homecook-recipe-image-legacy-inventory',
      0
    )
  );

  create temporary table if not exists
  recipe_image_legacy_inventory_work (
    storage_object_id uuid primary key,
    bucket_id text not null,
    object_path text not null,
    owner_id text,
    owner_uuid uuid,
    strict_path boolean not null,
    owner_signal_consistent boolean not null,
    path_hash text not null
  ) on commit drop;

  create temporary table if not exists
  recipe_image_legacy_positive_work (
    storage_object_id uuid not null,
    bucket_id text not null,
    object_path text not null,
    path_hash text not null,
    owner_uuid uuid not null,
    reference_type text not null,
    consumer_id uuid not null,
    expected_visibility text not null,
    primary key (
      storage_object_id,
      reference_type,
      consumer_id
    )
  ) on commit drop;

  create temporary table if not exists
  recipe_image_legacy_candidate_work (
    path_hash text primary key,
    classification text not null
  ) on commit drop;

  truncate table
    recipe_image_legacy_inventory_work,
    recipe_image_legacy_positive_work,
    recipe_image_legacy_candidate_work;

  insert into recipe_image_legacy_inventory_work (
    storage_object_id,
    bucket_id,
    object_path,
    owner_id,
    owner_uuid,
    strict_path,
    owner_signal_consistent,
    path_hash
  )
  select
    object.id,
    object.bucket_id,
    object.name,
    object.owner_id,
    case
      when object.name ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$'
      then split_part(object.name, '/', 1)::uuid
      else null
    end,
    object.name ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$',
    object.owner_id is null
      or object.owner_id = split_part(object.name, '/', 1),
    encode(
      extensions.digest(
        pg_catalog.convert_to(
          object.bucket_id || '/' || object.name,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    )
  from storage.objects as object
  where object.bucket_id = 'recipe-images';

  insert into recipe_image_legacy_positive_work (
    storage_object_id,
    bucket_id,
    object_path,
    path_hash,
    owner_uuid,
    reference_type,
    consumer_id,
    expected_visibility
  )
  select
    inventory.storage_object_id,
    inventory.bucket_id,
    inventory.object_path,
    inventory.path_hash,
    inventory.owner_uuid,
    'recipe_thumbnail',
    recipe.id,
    case recipe.visibility::text
      when 'public' then 'public_shared'
      else 'private'
    end
  from recipe_image_legacy_inventory_work as inventory
  join public.recipes as recipe
    on recipe.thumbnail_url =
      p_storage_origin
      || '/storage/v1/object/public/recipe-images/'
      || inventory.object_path
  where inventory.strict_path
    and inventory.owner_signal_consistent
  union all
  select
    inventory.storage_object_id,
    inventory.bucket_id,
    inventory.object_path,
    inventory.path_hash,
    inventory.owner_uuid,
    'recipe_book_cover',
    recipe_book.id,
    'private'
  from recipe_image_legacy_inventory_work as inventory
  join public.recipe_books as recipe_book
    on recipe_book.cover_image_url =
      p_storage_origin
      || '/storage/v1/object/public/recipe-images/'
      || inventory.object_path
  where inventory.strict_path
    and inventory.owner_signal_consistent;

  insert into recipe_image_legacy_candidate_work (
    path_hash,
    classification
  )
  select
    inventory.path_hash,
    case
      when inventory.strict_path
        and inventory.owner_signal_consistent
        then 'deletion_candidate_unverified'
      else 'suspicious_unclassified'
    end
  from recipe_image_legacy_inventory_work as inventory
  where not exists (
    select 1
    from recipe_image_legacy_positive_work as positive
    where positive.storage_object_id = inventory.storage_object_id
  );

  select encode(
    extensions.digest(
      pg_catalog.convert_to(
        coalesce((
          select string_agg(
            inventory.path_hash
            || ':'
            || coalesce(inventory.owner_id, ''),
            ',' order by inventory.path_hash
          )
          from recipe_image_legacy_inventory_work as inventory
        ), '')
        || '|'
        || coalesce((
          select string_agg(
            positive.path_hash
            || ':'
            || positive.reference_type
            || ':'
            || positive.consumer_id::text
            || ':'
            || positive.expected_visibility,
            ',' order by
              positive.path_hash,
              positive.reference_type,
              positive.consumer_id
          )
          from recipe_image_legacy_positive_work as positive
        ), ''),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  into v_snapshot_hash;

  select run.*
    into v_existing
  from public.recipe_image_legacy_inventory_runs as run
  where run.inventory_key = p_inventory_key;

  if v_existing.id is not null then
    if v_existing.storage_origin is distinct from p_storage_origin
      or v_existing.snapshot_hash is distinct from v_snapshot_hash then
      raise exception
        'recipe image legacy inventory key reused with different snapshot'
        using errcode = '23505';
    end if;

    return query
    select
      v_existing.id,
      v_existing.service_object_count,
      v_existing.known_reference_count,
      v_existing.referenced_private_count,
      v_existing.referenced_public_shared_count,
      v_existing.deletion_candidate_unverified_count,
      v_existing.suspicious_unclassified_count,
      v_existing.enqueue_count,
      v_existing.delete_count;
    return;
  end if;

  insert into public.recipe_image_legacy_inventory_runs (
    inventory_key,
    storage_origin,
    snapshot_hash,
    service_object_count,
    known_reference_count,
    referenced_private_count,
    referenced_public_shared_count,
    deletion_candidate_unverified_count,
    suspicious_unclassified_count,
    enqueue_count,
    delete_count
  )
  select
    p_inventory_key,
    p_storage_origin,
    v_snapshot_hash,
    (select count(*) from recipe_image_legacy_inventory_work),
    (select count(*) from recipe_image_legacy_positive_work),
    (
      select count(*)
      from recipe_image_legacy_positive_work
      where expected_visibility = 'private'
    ),
    (
      select count(*)
      from recipe_image_legacy_positive_work
      where expected_visibility = 'public_shared'
    ),
    (
      select count(*)
      from recipe_image_legacy_candidate_work
      where classification = 'deletion_candidate_unverified'
    ),
    (
      select count(*)
      from recipe_image_legacy_candidate_work
      where classification = 'suspicious_unclassified'
    ),
    0,
    0
  returning * into v_run;

  insert into public.recipe_image_legacy_positive_references (
    inventory_run_id,
    storage_object_id,
    bucket_id,
    object_path,
    path_hash,
    owner_uuid,
    reference_type,
    consumer_id,
    expected_visibility
  )
  select
    v_run.id,
    positive.storage_object_id,
    positive.bucket_id,
    positive.object_path,
    positive.path_hash,
    positive.owner_uuid,
    positive.reference_type,
    positive.consumer_id,
    positive.expected_visibility
  from recipe_image_legacy_positive_work as positive;

  insert into public.recipe_image_legacy_candidate_reports (
    inventory_run_id,
    path_hash,
    classification
  )
  select
    v_run.id,
    candidate.path_hash,
    candidate.classification
  from recipe_image_legacy_candidate_work as candidate;

  return query
  select
    v_run.id,
    v_run.service_object_count,
    v_run.known_reference_count,
    v_run.referenced_private_count,
    v_run.referenced_public_shared_count,
    v_run.deletion_candidate_unverified_count,
    v_run.suspicious_unclassified_count,
    v_run.enqueue_count,
    v_run.delete_count;
end;
$function$;

revoke all
  on function public.inventory_recipe_image_legacy_objects(uuid, text)
  from public, anon, authenticated, service_role;
grant execute
  on function public.inventory_recipe_image_legacy_objects(uuid, text)
  to service_role;

commit;
