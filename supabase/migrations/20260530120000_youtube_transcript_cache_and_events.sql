create table if not exists public.youtube_transcript_cache (
  id uuid primary key default gen_random_uuid(),
  youtube_video_id varchar(20) not null,
  language text not null,
  source_provider text not null,
  source_kind text not null default 'caption',
  transcript_text text not null,
  segments_json jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  constraint youtube_transcript_cache_video_id_check
    check (youtube_video_id ~ '^[A-Za-z0-9_-]{6,20}$'),
  constraint youtube_transcript_cache_language_check
    check (length(trim(language)) between 2 and 16),
  constraint youtube_transcript_cache_source_provider_check
    check (source_provider in (
      'youtube_public_timedtext',
      'youtube_timedtext',
      'youtube_timedtext_cookie_retry',
      'external_transcript_api'
    )),
  constraint youtube_transcript_cache_source_kind_check
    check (source_kind in ('caption', 'transcript')),
  constraint youtube_transcript_cache_expires_after_created
    check (expires_at > created_at)
);

create unique index if not exists youtube_transcript_cache_video_language_provider_idx
  on public.youtube_transcript_cache (youtube_video_id, language, source_provider);

create index if not exists youtube_transcript_cache_lookup_idx
  on public.youtube_transcript_cache (youtube_video_id, expires_at desc, last_used_at desc);

alter table public.youtube_transcript_cache enable row level security;

create table if not exists public.youtube_transcript_fetch_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  youtube_video_id varchar(20) not null,
  provider text not null,
  cache_hit boolean not null default false,
  status text not null,
  reason text,
  estimated_cost_microusd integer not null default 0,
  created_at timestamptz not null default now(),
  constraint youtube_transcript_fetch_events_video_id_check
    check (youtube_video_id ~ '^[A-Za-z0-9_-]{6,20}$'),
  constraint youtube_transcript_fetch_events_provider_check
    check (provider in (
      'transcript_cache',
      'youtube_public_timedtext',
      'youtube_timedtext',
      'youtube_timedtext_cookie_retry',
      'external_transcript_api'
    )),
  constraint youtube_transcript_fetch_events_status_check
    check (status in ('success', 'unavailable', 'error', 'skipped')),
  constraint youtube_transcript_fetch_events_cost_check
    check (estimated_cost_microusd >= 0)
);

create index if not exists youtube_transcript_fetch_events_provider_day_idx
  on public.youtube_transcript_fetch_events (provider, status, created_at desc);

create index if not exists youtube_transcript_fetch_events_user_day_idx
  on public.youtube_transcript_fetch_events (user_id, provider, status, created_at desc);

alter table public.youtube_transcript_fetch_events enable row level security;
