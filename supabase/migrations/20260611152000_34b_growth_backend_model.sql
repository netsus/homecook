alter table public.user_progress_events
  add column if not exists source_meta_json jsonb not null default '{}'::jsonb;

alter table public.user_progress_events
  drop constraint if exists user_progress_events_event_type_check;

alter table public.user_progress_events
  add constraint user_progress_events_event_type_check
  check (event_type in (
    'cooking_completed',
    'shopping_completed',
    'recipe_saved',
    'custom_book_created',
    'planner_registered'
  ));

alter table public.user_progress_summary
  add column if not exists level_curve_version text not null default 'v1';

create table if not exists public.user_growth_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  activity_type text not null,
  category text not null,
  source_key text not null,
  source_table text not null,
  source_id uuid not null,
  source_meta_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint user_growth_activity_events_type_check
    check (activity_type in (
      'shopping_bundle_prepared',
      'pantry_item_added',
      'leftover_eaten',
      'meal_add_path_used',
      'recipebook_created',
      'recipebook_recipe_added',
      'recipebook_recipe_removed'
    )),
  constraint user_growth_activity_events_category_check
    check (category in (
      'recipe',
      'planner',
      'shopping',
      'cooking',
      'pantry',
      'leftovers',
      'recipebook'
    )),
  constraint user_growth_activity_events_source_key_not_empty check (length(trim(source_key)) > 0),
  constraint user_growth_activity_events_user_source_unique unique (user_id, activity_type, source_key)
);

create index if not exists user_growth_activity_events_user_type_occurred_idx
  on public.user_growth_activity_events (user_id, activity_type, occurred_at desc);

create index if not exists user_growth_activity_events_user_category_occurred_idx
  on public.user_growth_activity_events (user_id, category, occurred_at desc);

alter table public.user_growth_activity_events enable row level security;

drop policy if exists user_growth_activity_events_select_own on public.user_growth_activity_events;
create policy user_growth_activity_events_select_own
  on public.user_growth_activity_events
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.user_growth_activity_events from anon;
revoke all on public.user_growth_activity_events from authenticated;
grant select on public.user_growth_activity_events to authenticated;
grant all privileges on public.user_growth_activity_events to service_role;

alter table public.user_progress_notifications
  add column if not exists priority integer not null default 4,
  add column if not exists delivery_channel text not null default 'toast',
  add column if not exists toast_eligible boolean not null default true,
  add column if not exists group_key text;

update public.user_progress_notifications
set priority = case notification_type
  when 'badge_unlocked' then 2
  when 'quest_completed' then 3
  else 4
end
where priority = 4;

alter table public.user_progress_notifications
  drop constraint if exists user_progress_notifications_type_check;

alter table public.user_progress_notifications
  add constraint user_progress_notifications_type_check
  check (notification_type in ('xp_awarded', 'badge_unlocked', 'quest_completed', 'level_up'));

alter table public.user_progress_notifications
  drop constraint if exists user_progress_notifications_priority_check;

alter table public.user_progress_notifications
  add constraint user_progress_notifications_priority_check
  check (priority in (1, 2, 3, 4));

alter table public.user_progress_notifications
  drop constraint if exists user_progress_notifications_delivery_channel_check;

alter table public.user_progress_notifications
  add constraint user_progress_notifications_delivery_channel_check
  check (delivery_channel in ('toast', 'archive_only', 'silent'));

create index if not exists user_progress_notifications_user_priority_created_idx
  on public.user_progress_notifications (user_id, seen_at, toast_eligible, priority asc, created_at desc, id desc);

create index if not exists user_progress_notifications_user_archive_idx
  on public.user_progress_notifications (user_id, delivery_channel, created_at desc, id desc);
