delete from public.user_progress_notifications
where notification_type = 'quest_completed';

alter table public.user_progress_notifications
  drop constraint if exists user_progress_notifications_type_check;

alter table public.user_progress_notifications
  add constraint user_progress_notifications_type_check
  check (notification_type in (
    'xp_awarded',
    'achievement_unlocked',
    'badge_unlocked',
    'level_up'
  ));
