begin;

do $guard_runner_context$
begin
  perform set_config('homecook.recipe_visibility_migration_runner', current_user, true);
end;
$guard_runner_context$;

do $guard_runner_membership_grant$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'grant homecook_recipe_visibility_guard_owner to %I with inherit false, set true granted by %I',
      current_user,
      current_user
    );
  else
    execute format(
      'grant homecook_recipe_visibility_guard_owner to %I',
      current_user
    );
  end if;
end;
$guard_runner_membership_grant$;

set local role homecook_recipe_visibility_guard_owner;

do $guard_function_execute_grant$
declare
  v_runner name := current_setting('homecook.recipe_visibility_migration_runner')::name;
begin
  execute format(
    'grant usage on schema recipe_visibility_guard to %I',
    v_runner
  );
  execute format(
    'grant execute on function recipe_visibility_guard.is_owner_publicly_visible(uuid) to %I',
    v_runner
  );
end;
$guard_function_execute_grant$;

reset role;

do $guard_runner_membership_revoke$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'revoke homecook_recipe_visibility_guard_owner from %I granted by %I',
      current_user,
      current_user
    );
  else
    execute format(
      'revoke homecook_recipe_visibility_guard_owner from %I',
      current_user
    );
  end if;
end;
$guard_runner_membership_revoke$;

create or replace function public.set_recipe_tags(
  p_recipe_id uuid,
  p_tags jsonb,
  p_actor_user_id uuid default null,
  p_source text default 'system_suggested'
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_item jsonb;
  v_tag_id uuid;
  v_touched_tag_ids uuid[] := '{}'::uuid[];
  v_sort_order integer := 0;
  v_parent_visibility text;
  v_parent_deleted_at timestamptz;
  v_requested_visibility text;
  v_effective_visibility text;
  v_review_status text;
begin
  select
    recipe.visibility,
    recipe.deleted_at
    into
      v_parent_visibility,
      v_parent_deleted_at
  from public.recipes as recipe
  where recipe.id = p_recipe_id
  for update;

  if not found then
    raise exception 'RESOURCE_NOT_FOUND'
      using errcode = 'P0002';
  end if;

  select coalesce(array_agg(recipe_tag.tag_id), '{}'::uuid[])
    into v_touched_tag_ids
  from public.recipe_tags as recipe_tag
  where recipe_tag.recipe_id = p_recipe_id;

  delete from public.recipe_tags
  where recipe_id = p_recipe_id;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb))
  loop
    v_requested_visibility :=
      coalesce(nullif(v_item ->> 'visibility', ''), 'public');
    v_review_status :=
      coalesce(nullif(v_item ->> 'review_status', ''), 'approved');
    v_effective_visibility := case
      when v_parent_visibility <> 'public'
        or v_parent_deleted_at is not null
        then 'private'
      when v_requested_visibility = 'public'
        and v_review_status <> 'approved'
        then 'public_pending'
      else v_requested_visibility
    end;

    insert into public.tags (
      normalized_key,
      label,
      kind,
      is_system,
      theme_eligible,
      created_by
    ) values (
      v_item ->> 'normalized_key',
      v_item ->> 'label',
      coalesce(nullif(v_item ->> 'kind', ''), 'user'),
      coalesce((v_item ->> 'is_system')::boolean, false),
      coalesce((v_item ->> 'theme_eligible')::boolean, false),
      case
        when coalesce((v_item ->> 'is_system')::boolean, false) then null
        else p_actor_user_id
      end
    )
    on conflict (normalized_key) do update
    set label = case
          when public.tags.is_system then public.tags.label
          else excluded.label
        end,
        kind = case
          when public.tags.is_system then public.tags.kind
          else excluded.kind
        end,
        updated_at = now()
    returning id into v_tag_id;

    insert into public.recipe_tags (
      recipe_id,
      tag_id,
      source,
      confidence,
      visibility,
      review_status,
      sort_order,
      created_by
    ) values (
      p_recipe_id,
      v_tag_id,
      coalesce(
        nullif(v_item ->> 'source', ''),
        p_source,
        'system_suggested'
      ),
      coalesce(nullif(v_item ->> 'confidence', '')::numeric, 1),
      v_effective_visibility,
      v_review_status,
      v_sort_order,
      p_actor_user_id
    )
    on conflict (recipe_id, tag_id) do update
    set source = excluded.source,
        confidence = excluded.confidence,
        visibility = excluded.visibility,
        review_status = excluded.review_status,
        sort_order = excluded.sort_order,
        created_by = excluded.created_by;

    if array_position(v_touched_tag_ids, v_tag_id) is null then
      v_touched_tag_ids := array_append(v_touched_tag_ids, v_tag_id);
    end if;

    v_sort_order := v_sort_order + 1;
  end loop;

  update public.recipes
  set
    tags = coalesce((
      select array_agg(tag.label order by recipe_tag.sort_order, tag.label)
      from public.recipe_tags as recipe_tag
      join public.tags as tag
        on tag.id = recipe_tag.tag_id
      where recipe_tag.recipe_id = p_recipe_id
        and recipe_tag.review_status = 'approved'
        and (
          (
            v_parent_visibility = 'public'
            and v_parent_deleted_at is null
            and recipe_tag.visibility = 'public'
          )
          or v_parent_visibility <> 'public'
          or v_parent_deleted_at is not null
        )
    ), '{}'::text[]),
    updated_at = now()
  where id = p_recipe_id;

  update public.tags as tag
  set
    usage_count = (
      select count(*)::integer
      from public.recipe_tags as recipe_tag
      join public.recipes as recipe
        on recipe.id = recipe_tag.recipe_id
      where recipe_tag.tag_id = tag.id
        and recipe_tag.visibility = 'public'
        and recipe_tag.review_status = 'approved'
        and recipe.visibility = 'public'
        and recipe.deleted_at is null
        and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
    ),
    updated_at = now()
  where tag.id = any(v_touched_tag_ids);
end;
$function$;

revoke insert, update, delete
  on table public.recipe_tags
  from public, anon, authenticated, service_role;

revoke execute on function public.set_recipe_tags(uuid, jsonb, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_recipe_tags(uuid, jsonb, uuid, text)
  to service_role;

create or replace function public.reconcile_recipe_tag_usage_counts(
  p_dry_run boolean default true
)
returns table(
  tag_id uuid,
  normalized_key text,
  label text,
  before_count integer,
  after_count integer,
  would_update boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  create temporary table if not exists pg_temp.recipe_tag_usage_reconcile_report (
    tag_id uuid,
    normalized_key text,
    label text,
    before_count integer,
    after_count integer,
    would_update boolean
  ) on commit drop;

  truncate table pg_temp.recipe_tag_usage_reconcile_report;

  insert into pg_temp.recipe_tag_usage_reconcile_report (
    tag_id,
    normalized_key,
    label,
    before_count,
    after_count,
    would_update
  )
  select
    tag.id,
    tag.normalized_key,
    tag.label,
    tag.usage_count,
    count(recipe.id)::integer,
    tag.usage_count is distinct from count(recipe.id)::integer
  from public.tags as tag
  left join public.recipe_tags as recipe_tag
    on recipe_tag.tag_id = tag.id
   and recipe_tag.visibility = 'public'
   and recipe_tag.review_status = 'approved'
  left join public.recipes as recipe
    on recipe.id = recipe_tag.recipe_id
   and recipe.visibility = 'public'
   and recipe.deleted_at is null
   and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
  group by tag.id, tag.normalized_key, tag.label, tag.usage_count;

  if p_dry_run is false then
    update public.tags as tag
       set usage_count = report.after_count,
           updated_at = now()
      from pg_temp.recipe_tag_usage_reconcile_report as report
     where report.tag_id = tag.id
       and report.would_update = true;
  end if;

  return query
  select
    report.tag_id,
    report.normalized_key,
    report.label,
    report.before_count,
    report.after_count,
    report.would_update
  from pg_temp.recipe_tag_usage_reconcile_report as report
  where report.would_update = true
  order by report.normalized_key asc;
end;
$function$;

revoke execute on function public.reconcile_recipe_tag_usage_counts(boolean)
  from public, anon, authenticated;
grant execute on function public.reconcile_recipe_tag_usage_counts(boolean)
  to service_role;

update public.recipe_tags as recipe_tag
set visibility = 'private'
from public.recipes as recipe
where recipe.id = recipe_tag.recipe_id
  and (
    recipe.visibility <> 'public'
    or recipe.deleted_at is not null
  )
  and recipe_tag.visibility <> 'private';

update public.recipe_tags
set visibility = 'public_pending'
where visibility = 'public'
  and review_status <> 'approved';

update public.recipes as recipe
set tags = coalesce((
  select array_agg(tag.label order by recipe_tag.sort_order, tag.label)
  from public.recipe_tags as recipe_tag
  join public.tags as tag
    on tag.id = recipe_tag.tag_id
  where recipe_tag.recipe_id = recipe.id
    and recipe_tag.review_status = 'approved'
    and (
      (
        recipe.visibility = 'public'
        and recipe.deleted_at is null
        and recipe_tag.visibility = 'public'
      )
      or recipe.visibility <> 'public'
      or recipe.deleted_at is not null
    )
), '{}'::text[])
where recipe.tags is distinct from coalesce((
  select array_agg(tag.label order by recipe_tag.sort_order, tag.label)
  from public.recipe_tags as recipe_tag
  join public.tags as tag
    on tag.id = recipe_tag.tag_id
  where recipe_tag.recipe_id = recipe.id
    and recipe_tag.review_status = 'approved'
    and (
      (
        recipe.visibility = 'public'
        and recipe.deleted_at is null
        and recipe_tag.visibility = 'public'
      )
      or recipe.visibility <> 'public'
      or recipe.deleted_at is not null
    )
), '{}'::text[]);

update public.tags as tag
set usage_count = (
  select count(*)::integer
  from public.recipe_tags as recipe_tag
  join public.recipes as recipe
    on recipe.id = recipe_tag.recipe_id
  where recipe_tag.tag_id = tag.id
    and recipe_tag.visibility = 'public'
    and recipe_tag.review_status = 'approved'
    and recipe.visibility = 'public'
    and recipe.deleted_at is null
    and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
)
where tag.usage_count is distinct from (
  select count(*)::integer
  from public.recipe_tags as recipe_tag
  join public.recipes as recipe
    on recipe.id = recipe_tag.recipe_id
  where recipe_tag.tag_id = tag.id
    and recipe_tag.visibility = 'public'
    and recipe_tag.review_status = 'approved'
    and recipe.visibility = 'public'
    and recipe.deleted_at is null
    and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
);

commit;
