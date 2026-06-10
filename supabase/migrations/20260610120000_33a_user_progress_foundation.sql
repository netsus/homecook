create table if not exists public.user_progress_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event_type text not null,
  source_key text not null,
  source_table text not null,
  source_id uuid not null,
  xp_delta integer not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint user_progress_events_event_type_check
    check (event_type in (
      'cooking_completed',
      'shopping_completed',
      'recipe_saved',
      'custom_book_created'
    )),
  constraint user_progress_events_xp_delta_positive check (xp_delta > 0),
  constraint user_progress_events_source_unique unique (user_id, event_type, source_key)
);

create index if not exists user_progress_events_user_created_idx
  on public.user_progress_events (user_id, created_at desc);

create table if not exists public.user_progress_summary (
  user_id uuid primary key references public.users(id) on delete cascade,
  total_xp integer not null default 0,
  current_level integer not null default 1,
  event_counts jsonb not null default '{}'::jsonb,
  last_event_at timestamptz,
  last_updated_at timestamptz not null default now(),
  constraint user_progress_summary_total_xp_nonnegative check (total_xp >= 0),
  constraint user_progress_summary_current_level_positive check (current_level > 0)
);

alter table public.user_progress_events enable row level security;
alter table public.user_progress_summary enable row level security;

drop policy if exists user_progress_events_select_own on public.user_progress_events;
create policy user_progress_events_select_own
  on public.user_progress_events
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_progress_summary_select_own on public.user_progress_summary;
create policy user_progress_summary_select_own
  on public.user_progress_summary
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.user_progress_events from anon;
revoke all on public.user_progress_summary from anon;
revoke insert, update, delete on public.user_progress_events from authenticated;
revoke insert, update, delete on public.user_progress_summary from authenticated;
grant select on public.user_progress_events to authenticated;
grant select on public.user_progress_summary to authenticated;
grant all privileges on public.user_progress_events to service_role;
grant all privileges on public.user_progress_summary to service_role;
