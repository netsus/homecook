create table if not exists public.youtube_visual_extraction_cache (
  id uuid primary key default gen_random_uuid(),
  youtube_video_id varchar(20) not null,
  provider text not null,
  schema_version text not null,
  visual_request_hash text not null,
  result_json jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  constraint youtube_visual_extraction_cache_video_id_check
    check (youtube_video_id ~ '^[A-Za-z0-9_-]{6,20}$'),
  constraint youtube_visual_extraction_cache_provider_check
    check (provider in ('gemini')),
  constraint youtube_visual_extraction_cache_schema_version_check
    check (length(trim(schema_version)) > 0),
  constraint youtube_visual_extraction_cache_hash_check
    check (length(trim(visual_request_hash)) > 0),
  constraint youtube_visual_extraction_cache_result_object_check
    check (jsonb_typeof(result_json) = 'object'),
  constraint youtube_visual_extraction_cache_expires_after_created
    check (expires_at > created_at)
);

create unique index if not exists youtube_visual_extraction_cache_video_provider_schema_hash_idx
  on public.youtube_visual_extraction_cache (youtube_video_id, provider, schema_version, visual_request_hash);

create index if not exists youtube_visual_extraction_cache_lookup_idx
  on public.youtube_visual_extraction_cache (
    youtube_video_id,
    provider,
    schema_version,
    visual_request_hash,
    expires_at desc,
    last_used_at desc
  );

alter table public.youtube_visual_extraction_cache enable row level security;

create table if not exists public.youtube_visual_extraction_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  youtube_video_id varchar(20) not null,
  provider text not null,
  model text,
  cache_hit boolean not null default false,
  event_type text not null,
  status text not null,
  reason text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_microusd integer not null default 0,
  created_at timestamptz not null default now(),
  constraint youtube_visual_extraction_events_video_id_check
    check (youtube_video_id ~ '^[A-Za-z0-9_-]{6,20}$'),
  constraint youtube_visual_extraction_events_provider_check
    check (provider in ('gemini')),
  constraint youtube_visual_extraction_events_event_type_check
    check (event_type in ('attempted', 'cache_hit', 'quota_denied', 'success', 'error')),
  constraint youtube_visual_extraction_events_status_check
    check (status in ('success', 'unavailable', 'error', 'skipped')),
  constraint youtube_visual_extraction_events_tokens_check
    check (input_tokens >= 0 and output_tokens >= 0),
  constraint youtube_visual_extraction_events_cost_check
    check (estimated_cost_microusd >= 0)
);

create index if not exists youtube_visual_extraction_events_provider_day_idx
  on public.youtube_visual_extraction_events (provider, status, event_type, created_at desc);

create index if not exists youtube_visual_extraction_events_user_day_idx
  on public.youtube_visual_extraction_events (user_id, provider, status, event_type, created_at desc);

alter table public.youtube_visual_extraction_events enable row level security;
