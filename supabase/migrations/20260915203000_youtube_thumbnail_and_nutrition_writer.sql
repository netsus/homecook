-- Preserve YouTube thumbnails for async extraction and allow an authenticated
-- owner to finalize the derived nutrition snapshot for their new recipe.

begin;

create or replace function private.fill_youtube_extraction_thumbnail()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if nullif(btrim(new.thumbnail_url), '') is null
    and nullif(btrim(new.youtube_video_id), '') is not null then
    new.thumbnail_url := 'https://i.ytimg.com/vi/'
      || btrim(new.youtube_video_id)
      || '/hqdefault.jpg';
  end if;
  return new;
end
$function$;

drop trigger if exists fill_youtube_extraction_thumbnail
  on public.youtube_extraction_sessions;
create trigger fill_youtube_extraction_thumbnail
before insert or update of youtube_video_id, thumbnail_url
on public.youtube_extraction_sessions
for each row execute function private.fill_youtube_extraction_thumbnail();

update public.youtube_extraction_sessions
set thumbnail_url = 'https://i.ytimg.com/vi/'
  || btrim(youtube_video_id)
  || '/hqdefault.jpg'
where nullif(btrim(thumbnail_url), '') is null
  and nullif(btrim(youtube_video_id), '') is not null;

do $backfill$
declare
  v_cutover_attempt_id uuid;
begin
  select current_cutover_attempt_id
  into v_cutover_attempt_id
  from public.account_generation_capability_state
  where singleton
    and state = 'generation_active';

  if v_cutover_attempt_id is null then
    return;
  end if;

  perform public.set_account_generation_internal_writer_marker(
    v_cutover_attempt_id,
    true
  );

  update public.recipes as recipe
  set thumbnail_url = 'https://i.ytimg.com/vi/'
    || btrim(source.youtube_video_id)
    || '/hqdefault.jpg'
  from public.recipe_sources as source
  where source.recipe_id = recipe.id
    and recipe.source_type = 'youtube'
    and nullif(btrim(recipe.thumbnail_url), '') is null
    and nullif(btrim(source.youtube_video_id), '') is not null;

  perform public.set_account_generation_internal_writer_marker(
    v_cutover_attempt_id,
    false
  );
end
$backfill$;

create or replace function public.write_owned_youtube_recipe_nutrition_snapshot(
  p_user_id uuid,
  p_recipe_id uuid,
  p_snapshot jsonb,
  p_expected_recipe_updated_at timestamptz,
  p_input_guard jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if auth.uid() is null or auth.uid() is distinct from p_user_id then
    raise exception 'ACCOUNT_SESSION_STALE' using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.recipes as recipe
    where recipe.id = p_recipe_id
      and recipe.created_by = p_user_id
      and recipe.source_type = 'youtube'
      and recipe.deleted_at is null
  ) then
    raise exception 'RESOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;

  return public.write_recipe_nutrition_snapshot(
    p_recipe_id,
    p_snapshot,
    p_expected_recipe_updated_at,
    p_input_guard
  );
end
$function$;

alter function private.fill_youtube_extraction_thumbnail() owner to postgres;
alter function public.write_owned_youtube_recipe_nutrition_snapshot(
  uuid, uuid, jsonb, timestamptz, jsonb
) owner to postgres;

revoke all on function private.fill_youtube_extraction_thumbnail()
  from public, anon, authenticated, service_role;
revoke all on function public.write_owned_youtube_recipe_nutrition_snapshot(
  uuid, uuid, jsonb, timestamptz, jsonb
) from public, anon;
grant execute on function public.write_owned_youtube_recipe_nutrition_snapshot(
  uuid, uuid, jsonb, timestamptz, jsonb
) to authenticated, service_role;

commit;
