create table if not exists public.user_achievement_awards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  achievement_key text not null,
  category_key text not null,
  track_key text,
  target_value integer not null,
  achieved_value integer not null,
  badge_key text,
  source_event_id uuid references public.user_progress_events(id) on delete set null,
  source_activity_id uuid references public.user_growth_activity_events(id) on delete set null,
  idempotency_key text not null,
  earned_at timestamptz not null default now(),
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  constraint user_achievement_awards_key_not_empty check (length(trim(achievement_key)) > 0),
  constraint user_achievement_awards_category_check
    check (category_key in (
      'tutorial',
      'recipe',
      'planner',
      'shopping',
      'cooking',
      'pantry',
      'leftovers',
      'recipebook'
    )),
  constraint user_achievement_awards_target_positive check (target_value > 0),
  constraint user_achievement_awards_achieved_nonnegative check (achieved_value >= 0),
  constraint user_achievement_awards_user_key_unique unique (user_id, achievement_key),
  constraint user_achievement_awards_user_idempotency_unique unique (user_id, idempotency_key)
);

create index if not exists user_achievement_awards_user_category_earned_idx
  on public.user_achievement_awards (user_id, category_key, earned_at desc);

create index if not exists user_achievement_awards_user_seen_earned_idx
  on public.user_achievement_awards (user_id, seen_at, earned_at desc);

alter table public.user_achievement_awards enable row level security;

drop policy if exists user_achievement_awards_select_own on public.user_achievement_awards;
create policy user_achievement_awards_select_own
  on public.user_achievement_awards
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.user_achievement_awards from anon;
revoke all on public.user_achievement_awards from authenticated;
grant select on public.user_achievement_awards to authenticated;
grant all privileges on public.user_achievement_awards to service_role;

alter table public.user_progress_notifications
  drop constraint if exists user_progress_notifications_type_check;

alter table public.user_progress_notifications
  add constraint user_progress_notifications_type_check
  check (notification_type in (
    'xp_awarded',
    'achievement_unlocked',
    'badge_unlocked',
    'quest_completed',
    'level_up'
  ));

update public.user_progress_notifications
set priority = 2
where notification_type = 'achievement_unlocked'
  and priority <> 2;

alter table public.user_growth_activity_events
  drop constraint if exists user_growth_activity_events_type_check;

alter table public.user_growth_activity_events
  add constraint user_growth_activity_events_type_check
  check (activity_type in (
    'shopping_bundle_prepared',
    'pantry_item_added',
    'leftover_eaten',
    'meal_add_path_used',
    'recipe_registered',
    'recipebook_created',
    'recipebook_recipe_added',
    'recipebook_recipe_removed'
  ));
