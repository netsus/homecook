begin;

create table if not exists public.recipe_image_objects (
  id uuid primary key default gen_random_uuid(),
  owner_uuid uuid,
  account_generation bigint,
  bucket_id text not null,
  object_path text not null,
  raw_sha256 text,
  byte_size bigint,
  actual_mime_type text,
  visibility text not null,
  state text not null,
  upload_attempt_token uuid,
  cleanup_generation bigint not null default 0,
  upload_lease_expires_at timestamptz,
  unlinked_cleanup_after timestamptz,
  not_found_observed_at timestamptz,
  late_upload_quarantine_until timestamptz,
  next_terminal_scan_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recipe_image_objects_bucket_path_unique
    unique (bucket_id, object_path),
  constraint recipe_image_objects_visibility_check
    check (visibility in ('private', 'public_shared')),
  constraint recipe_image_objects_state_check
    check (
      state in (
        'pending_upload',
        'uploaded_unlinked',
        'attached_private',
        'attached_public_shared',
        'cleanup_pending',
        'not_found_observed',
        'deleted',
        'verified_not_found'
      )
    ),
  constraint recipe_image_objects_owner_shape_check
    check (
      (
        visibility = 'private'
        and owner_uuid is not null
        and account_generation is not null
        and account_generation > 0
      )
      or (
        visibility = 'public_shared'
        and owner_uuid is null
        and account_generation is null
      )
    ),
  constraint recipe_image_objects_path_shape_check
    check (
      (
        visibility = 'private'
        and bucket_id = 'recipe-images-private'
        and object_path like (
          owner_uuid::text
          || '/'
          || account_generation::text
          || '/'
          || id::text
          || '.%'
        )
      )
      or (
        visibility = 'public_shared'
        and bucket_id = 'recipe-images'
        and object_path like ('shared/' || id::text || '.%')
      )
    ),
  constraint recipe_image_objects_extension_check
    check (object_path ~ '\.(jpg|jpeg|png|webp)$'),
  constraint recipe_image_objects_hash_check
    check (
      raw_sha256 is null
      or raw_sha256 ~ '^[0-9a-f]{64}$'
    ),
  constraint recipe_image_objects_size_check
    check (
      byte_size is null
      or byte_size between 0 and 5242880
    ),
  constraint recipe_image_objects_mime_check
    check (
      actual_mime_type is null
      or actual_mime_type in ('image/jpeg', 'image/png', 'image/webp')
    ),
  constraint recipe_image_objects_metadata_shape_check
    check (
      (
        raw_sha256 is null
        and byte_size is null
        and actual_mime_type is null
      )
      or (
        raw_sha256 is not null
        and byte_size is not null
        and actual_mime_type is not null
      )
    ),
  constraint recipe_image_objects_state_visibility_check
    check (
      (
        state = 'attached_public_shared'
        and visibility = 'public_shared'
      )
      or (
        state in (
          'pending_upload',
          'uploaded_unlinked',
          'attached_private',
          'cleanup_pending',
          'not_found_observed',
          'deleted',
          'verified_not_found'
        )
        and visibility = 'private'
      )
    ),
  constraint recipe_image_objects_state_metadata_check
    check (
      state not in (
        'uploaded_unlinked',
        'attached_private',
        'attached_public_shared'
      )
      or (
        raw_sha256 is not null
        and byte_size is not null
        and actual_mime_type is not null
      )
    ),
  constraint recipe_image_objects_pending_lease_check
    check (
      state <> 'pending_upload'
      or (
        upload_attempt_token is not null
        and upload_lease_expires_at is not null
      )
    ),
  constraint recipe_image_objects_unlinked_grace_check
    check (
      state <> 'uploaded_unlinked'
      or unlinked_cleanup_after is not null
    ),
  constraint recipe_image_objects_cleanup_generation_check
    check (
      cleanup_generation >= 0
      and (
        state not in (
          'cleanup_pending',
          'not_found_observed',
          'deleted',
          'verified_not_found'
        )
        or cleanup_generation > 0
      )
    ),
  constraint recipe_image_objects_not_found_check
    check (
      state <> 'not_found_observed'
      or (
        not_found_observed_at is not null
        and late_upload_quarantine_until is not null
        and late_upload_quarantine_until >= not_found_observed_at
      )
    ),
  constraint recipe_image_objects_terminal_scan_check
    check (
      state not in ('deleted', 'verified_not_found')
      or next_terminal_scan_at is not null
    )
);

create table if not exists public.recipe_image_object_references (
  id uuid primary key default gen_random_uuid(),
  image_object_id uuid not null
    references public.recipe_image_objects(id) on delete restrict,
  reference_type text not null,
  consumer_id uuid not null,
  created_at timestamptz not null default now(),
  constraint recipe_image_object_references_type_check
    check (reference_type in ('recipe_thumbnail', 'recipe_book_cover')),
  constraint recipe_image_object_references_consumer_unique
    unique (reference_type, consumer_id)
);

create index if not exists recipe_image_objects_owner_generation_state_idx
  on public.recipe_image_objects (
    owner_uuid,
    account_generation,
    state,
    id
  )
  where owner_uuid is not null;

create index if not exists recipe_image_objects_cleanup_scan_idx
  on public.recipe_image_objects (
    state,
    unlinked_cleanup_after,
    id
  )
  where state in ('uploaded_unlinked', 'cleanup_pending');

create index if not exists recipe_image_objects_terminal_scan_idx
  on public.recipe_image_objects (
    next_terminal_scan_at,
    id
  )
  where state in ('deleted', 'verified_not_found');

create index if not exists recipe_image_object_references_object_idx
  on public.recipe_image_object_references (image_object_id);

alter table public.recipe_image_objects enable row level security;
alter table public.recipe_image_object_references enable row level security;

revoke all on table public.recipe_image_objects
  from public, anon, authenticated, service_role;
revoke all on table public.recipe_image_object_references
  from public, anon, authenticated, service_role;

commit;
