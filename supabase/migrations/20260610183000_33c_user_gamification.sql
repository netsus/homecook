create table if not exists public.user_badge_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  badge_key text not null,
  source_event_id uuid references public.user_progress_events(id) on delete set null,
  idempotency_key text not null,
  earned_at timestamptz not null default now(),
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_badge_awards_badge_key_not_empty check (length(trim(badge_key)) > 0),
  constraint user_badge_awards_idempotency_key_not_empty check (length(trim(idempotency_key)) > 0),
  constraint user_badge_awards_user_badge_unique unique (user_id, badge_key),
  constraint user_badge_awards_idempotency_unique unique (user_id, idempotency_key)
);

create index if not exists user_badge_awards_user_earned_idx
  on public.user_badge_awards (user_id, earned_at desc);

create table if not exists public.user_quest_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  quest_key text not null,
  quest_type text not null,
  status text not null,
  progress_current integer not null default 0,
  progress_target integer not null,
  source_event_id uuid references public.user_progress_events(id) on delete set null,
  completed_at timestamptz,
  dismissed_at timestamptz,
  seen_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint user_quest_progress_quest_key_not_empty check (length(trim(quest_key)) > 0),
  constraint user_quest_progress_type_check check (quest_type in ('standard', 'tutorial')),
  constraint user_quest_progress_status_check check (status in ('active', 'completed', 'dismissed')),
  constraint user_quest_progress_current_nonnegative check (progress_current >= 0),
  constraint user_quest_progress_target_positive check (progress_target > 0),
  constraint user_quest_progress_user_quest_unique unique (user_id, quest_key)
);

create index if not exists user_quest_progress_user_status_updated_idx
  on public.user_quest_progress (user_id, status, updated_at desc);

create table if not exists public.user_progress_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  notification_key text not null,
  notification_type text not null,
  source_event_id uuid references public.user_progress_events(id) on delete set null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  constraint user_progress_notifications_key_not_empty check (length(trim(notification_key)) > 0),
  constraint user_progress_notifications_type_check
    check (notification_type in ('xp_awarded', 'badge_unlocked', 'quest_completed')),
  constraint user_progress_notifications_user_key_unique unique (user_id, notification_key)
);

create index if not exists user_progress_notifications_user_seen_created_idx
  on public.user_progress_notifications (user_id, seen_at, created_at desc);

alter table public.user_badge_awards enable row level security;
alter table public.user_quest_progress enable row level security;
alter table public.user_progress_notifications enable row level security;

drop policy if exists user_badge_awards_select_own on public.user_badge_awards;
create policy user_badge_awards_select_own
  on public.user_badge_awards
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_quest_progress_select_own on public.user_quest_progress;
create policy user_quest_progress_select_own
  on public.user_quest_progress
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_progress_notifications_select_own on public.user_progress_notifications;
create policy user_progress_notifications_select_own
  on public.user_progress_notifications
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.user_badge_awards from anon;
revoke all on public.user_quest_progress from anon;
revoke all on public.user_progress_notifications from anon;
revoke insert, update, delete on public.user_badge_awards from authenticated;
revoke insert, update, delete on public.user_quest_progress from authenticated;
revoke insert, update, delete on public.user_progress_notifications from authenticated;
grant select on public.user_badge_awards to authenticated;
grant select on public.user_quest_progress to authenticated;
grant select on public.user_progress_notifications to authenticated;
grant all privileges on public.user_badge_awards to service_role;
grant all privileges on public.user_quest_progress to service_role;
grant all privileges on public.user_progress_notifications to service_role;
