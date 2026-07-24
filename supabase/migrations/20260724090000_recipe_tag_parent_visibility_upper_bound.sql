begin;

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
);

commit;
