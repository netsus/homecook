begin;

alter table public.recipes
  add column if not exists visibility text not null default 'public',
  add column if not exists origin_recipe_id uuid references public.recipes(id) on delete restrict,
  add column if not exists deleted_at timestamptz,
  add column if not exists revision bigint not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.recipes'::regclass
      and conname = 'recipes_visibility_check'
  ) then
    alter table public.recipes
      add constraint recipes_visibility_check
      check (visibility in ('public', 'private'));
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.recipes'::regclass
      and conname = 'recipes_revision_positive_check'
  ) then
    alter table public.recipes
      add constraint recipes_revision_positive_check
      check (revision > 0);
  end if;
end
$$;

create schema if not exists recipe_visibility_guard;
revoke all on schema recipe_visibility_guard from public;

do $role$
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'homecook_recipe_visibility_guard_owner'
  ) then
    execute 'create role homecook_recipe_visibility_guard_owner nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'homecook_recipe_visibility_guard_owner'
      and (
        rolcanlogin
        or rolsuper
        or rolcreatedb
        or rolcreaterole
        or rolinherit
        or rolreplication
        or rolbypassrls
      )
  ) then
    raise exception 'recipe visibility guard owner has unsafe attributes'
      using errcode = '42501';
  end if;
end;
$role$;

do $preexisting_guard_membership$
declare
  v_has_unsafe_membership boolean;
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute $membership_check$
      select exists (
        select 1
        from pg_catalog.pg_auth_members as membership
        join pg_catalog.pg_roles as granted_role
          on granted_role.oid = membership.roleid
        join pg_catalog.pg_roles as member_role
          on member_role.oid = membership.member
        where granted_role.rolname = 'homecook_recipe_visibility_guard_owner'
          and (
            member_role.rolname <> current_user
            or not membership.admin_option
            or membership.inherit_option
            or membership.set_option
          )
      )
    $membership_check$
    into v_has_unsafe_membership;
  else
    select exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as granted_role
        on granted_role.oid = membership.roleid
      where granted_role.rolname = 'homecook_recipe_visibility_guard_owner'
    )
      into v_has_unsafe_membership;
  end if;

  if coalesce(v_has_unsafe_membership, false) then
    raise exception
      'recipe visibility guard owner has unexpected members'
      using errcode = '42501';
  end if;
end;
$preexisting_guard_membership$;

grant usage on schema recipe_visibility_guard
  to anon, authenticated, homecook_recipe_visibility_guard_owner;

grant select on table public.user_account_lifecycles to homecook_recipe_visibility_guard_owner;
revoke insert, update, delete, truncate, references, trigger
  on table public.user_account_lifecycles
  from homecook_recipe_visibility_guard_owner;

drop policy if exists recipe_visibility_guard_lifecycle_select
  on public.user_account_lifecycles;
create policy recipe_visibility_guard_lifecycle_select
on public.user_account_lifecycles
for select
to homecook_recipe_visibility_guard_owner
using (true);

do $runner_membership_grant$
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
$runner_membership_grant$;

grant create on schema recipe_visibility_guard
  to homecook_recipe_visibility_guard_owner;

set local role homecook_recipe_visibility_guard_owner;

create or replace function recipe_visibility_guard.is_owner_publicly_visible(p_owner_uuid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_latest_status text;
begin
  if p_owner_uuid is null then
    return true;
  end if;

  select lifecycle.status
    into v_latest_status
  from public.user_account_lifecycles as lifecycle
  where lifecycle.owner_uuid = p_owner_uuid
  order by account_generation desc
  limit 1;

  return v_latest_status is null or v_latest_status = 'active';
end
$function$;

revoke all on function recipe_visibility_guard.is_owner_publicly_visible(uuid) from public, service_role;
grant execute on function recipe_visibility_guard.is_owner_publicly_visible(uuid) to anon, authenticated;

reset role;

revoke create on schema recipe_visibility_guard
  from homecook_recipe_visibility_guard_owner;

do $runner_membership_revoke$
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
$runner_membership_revoke$;

do $runner_membership$
declare
  v_runner_is_superuser boolean;
  v_runner_has_set_capability boolean;
  v_has_unsafe_membership boolean;
begin
  select runner.rolsuper
    into v_runner_is_superuser
  from pg_catalog.pg_roles as runner
  where runner.rolname = current_user;

  if coalesce(v_runner_is_superuser, false) then
    select exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as granted_role
        on granted_role.oid = membership.roleid
      join pg_catalog.pg_roles as member_role
        on member_role.oid = membership.member
      where granted_role.rolname = 'homecook_recipe_visibility_guard_owner'
        and member_role.rolname = current_user
    )
      into v_runner_has_set_capability;
  elsif current_setting('server_version_num')::integer >= 160000 then
    execute $membership_check$
      select
        pg_catalog.pg_has_role(
          current_user,
          'homecook_recipe_visibility_guard_owner',
          'SET'
        )
        or pg_catalog.pg_has_role(
          current_user,
          'homecook_recipe_visibility_guard_owner',
          'USAGE'
        )
    $membership_check$
    into v_runner_has_set_capability;
  else
    v_runner_has_set_capability :=
      pg_catalog.pg_has_role(
        current_user,
        'homecook_recipe_visibility_guard_owner',
        'MEMBER'
      )
      or pg_catalog.pg_has_role(
        current_user,
        'homecook_recipe_visibility_guard_owner',
        'USAGE'
      );
  end if;

  if coalesce(v_runner_has_set_capability, false) then
    raise exception
      'migration runner retained set-capable recipe visibility guard membership'
      using errcode = '42501';
  end if;

  if current_setting('server_version_num')::integer >= 160000 then
    execute $membership_check$
      select exists (
        select 1
        from pg_catalog.pg_auth_members as membership
        join pg_catalog.pg_roles as granted_role
          on granted_role.oid = membership.roleid
        join pg_catalog.pg_roles as member_role
          on member_role.oid = membership.member
        where granted_role.rolname = 'homecook_recipe_visibility_guard_owner'
          and (
            member_role.rolname <> current_user
            or not membership.admin_option
            or membership.inherit_option
            or membership.set_option
          )
      )
    $membership_check$
    into v_has_unsafe_membership;
  else
    select exists (
      select 1
      from pg_catalog.pg_auth_members as membership
      join pg_catalog.pg_roles as granted_role
        on granted_role.oid = membership.roleid
      where granted_role.rolname = 'homecook_recipe_visibility_guard_owner'
    )
      into v_has_unsafe_membership;
  end if;

  if coalesce(v_has_unsafe_membership, false) then
    raise exception
      'recipe visibility guard owner retained unexpected members'
      using errcode = '42501';
  end if;

  if pg_catalog.has_schema_privilege(
    'homecook_recipe_visibility_guard_owner',
    'recipe_visibility_guard',
    'CREATE'
  ) then
    raise exception 'recipe visibility guard owner retained schema create'
      using errcode = '42501';
  end if;
end;
$runner_membership$;

alter table public.recipes enable row level security;

drop policy if exists recipes_public_and_owner_read on public.recipes;
create policy recipes_public_and_owner_read
on public.recipes
for select
to anon, authenticated
using (
  deleted_at is null
  and recipe_visibility_guard.is_owner_publicly_visible(created_by)
  and (
    visibility = 'public'
    or auth.uid() = created_by
  )
);

alter table public.recipe_sources enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_steps enable row level security;
alter table public.recipe_step_cooking_methods enable row level security;
alter table public.recipe_tags enable row level security;

drop policy if exists recipe_sources_parent_read on public.recipe_sources;
create policy recipe_sources_parent_read
on public.recipe_sources
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.recipes as recipe
    where recipe.id = recipe_sources.recipe_id
  )
);

drop policy if exists recipe_ingredients_parent_read on public.recipe_ingredients;
create policy recipe_ingredients_parent_read
on public.recipe_ingredients
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.recipes as recipe
    where recipe.id = recipe_ingredients.recipe_id
  )
);

drop policy if exists recipe_steps_parent_read on public.recipe_steps;
create policy recipe_steps_parent_read
on public.recipe_steps
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.recipes as recipe
    where recipe.id = recipe_steps.recipe_id
  )
);

drop policy if exists recipe_step_cooking_methods_parent_read
  on public.recipe_step_cooking_methods;
create policy recipe_step_cooking_methods_parent_read
on public.recipe_step_cooking_methods
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.recipe_steps as step
    join public.recipes as recipe
      on recipe.id = step.recipe_id
    where step.id = recipe_step_cooking_methods.step_id
  )
);

drop policy if exists recipe_tags_public_approved_read on public.recipe_tags;
drop policy if exists recipe_tags_parent_read on public.recipe_tags;
create policy recipe_tags_parent_read
on public.recipe_tags
for select
to anon, authenticated
using (
  visibility = 'public'
  and review_status = 'approved'
  and exists (
    select 1
    from public.recipes as recipe
    where recipe.id = recipe_tags.recipe_id
  )
);

drop policy if exists tags_public_read on public.tags;
create policy tags_public_read
on public.tags
for select
to anon, authenticated
using (
  is_system = true
  or exists (
    select 1
    from public.recipe_tags as recipe_tag
    join public.recipes as recipe
      on recipe.id = recipe_tag.recipe_id
    where recipe_tag.tag_id = tags.id
      and recipe_tag.visibility = 'public'
      and recipe_tag.review_status = 'approved'
  )
);

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
begin
  select coalesce(array_agg(rt.tag_id), '{}'::uuid[])
    into v_touched_tag_ids
    from public.recipe_tags as rt
   where rt.recipe_id = p_recipe_id;

  delete from public.recipe_tags
   where recipe_id = p_recipe_id;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb))
  loop
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
      coalesce(nullif(v_item ->> 'visibility', ''), 'public'),
      coalesce(nullif(v_item ->> 'review_status', ''), 'approved'),
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
     set tags = coalesce((
           select array_agg(tag.label order by rt.sort_order, tag.label)
             from public.recipe_tags as rt
             join public.tags as tag
               on tag.id = rt.tag_id
            where rt.recipe_id = p_recipe_id
              and rt.visibility = 'public'
              and rt.review_status = 'approved'
         ), '{}'::text[]),
         updated_at = now()
   where id = p_recipe_id;

  update public.tags as tag
     set usage_count = (
       select count(*)::integer
         from public.recipe_tags as rt
        where rt.tag_id = tag.id
          and rt.visibility = 'public'
          and rt.review_status = 'approved'
     ),
     updated_at = now()
   where tag.id = any(v_touched_tag_ids);
end;
$function$;

revoke execute on function public.set_recipe_tags(uuid, jsonb, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_recipe_tags(uuid, jsonb, uuid, text)
  to service_role;

update public.recipes as recipe
   set tags = coalesce((
         select array_agg(tag.label order by rt.sort_order, tag.label)
           from public.recipe_tags as rt
           join public.tags as tag
             on tag.id = rt.tag_id
          where rt.recipe_id = recipe.id
            and rt.visibility = 'public'
            and rt.review_status = 'approved'
       ), '{}'::text[])
 where recipe.tags is distinct from coalesce((
         select array_agg(tag.label order by rt.sort_order, tag.label)
           from public.recipe_tags as rt
           join public.tags as tag
             on tag.id = rt.tag_id
          where rt.recipe_id = recipe.id
            and rt.visibility = 'public'
            and rt.review_status = 'approved'
       ), '{}'::text[]);

revoke select on table public.tags from anon, authenticated;
grant select (
  id,
  normalized_key,
  label,
  slug,
  kind,
  is_system,
  theme_eligible
) on table public.tags to anon, authenticated;

create or replace function public.find_recipe_ids_by_public_tags(
  p_q text default null,
  p_tag text default null
)
returns table(recipe_id uuid)
language sql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
  select distinct recipe_tag.recipe_id
  from public.recipe_tags as recipe_tag
  join public.tags as tag
    on tag.id = recipe_tag.tag_id
  join public.recipes as recipe
    on recipe.id = recipe_tag.recipe_id
  where recipe_tag.visibility = 'public'
    and recipe_tag.review_status = 'approved'
    and recipe.visibility = 'public'
    and recipe.deleted_at is null
    and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
    and (p_tag is null or tag.normalized_key = p_tag)
    and (
      p_q is null
      or tag.label ilike '%' || p_q || '%'
      or tag.normalized_key ilike '%' || p_q || '%'
    );
$$;

create or replace function public.list_public_recipe_tags(
  p_q text default null,
  p_kind text default null,
  p_theme_eligible boolean default null,
  p_limit integer default 30
)
returns table(
  normalized_key text,
  label text,
  slug text,
  kind text,
  is_system boolean,
  theme_eligible boolean,
  usage_count integer
)
language sql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
  with visible_usage as (
    select
      recipe_tag.tag_id,
      count(*)::integer as usage_count
    from public.recipe_tags as recipe_tag
    join public.recipes as recipe
      on recipe.id = recipe_tag.recipe_id
    where recipe_tag.visibility = 'public'
      and recipe_tag.review_status = 'approved'
      and recipe.visibility = 'public'
      and recipe.deleted_at is null
      and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
    group by recipe_tag.tag_id
  )
  select
    tag.normalized_key,
    tag.label,
    tag.slug,
    tag.kind,
    tag.is_system,
    tag.theme_eligible,
    coalesce(visible_usage.usage_count, 0)::integer
  from public.tags as tag
  left join visible_usage
    on visible_usage.tag_id = tag.id
  where (tag.is_system = true or visible_usage.usage_count > 0)
    and (
      p_q is null
      or tag.label ilike '%' || p_q || '%'
      or tag.normalized_key ilike '%' || p_q || '%'
    )
    and (p_kind is null or tag.kind = p_kind)
    and (p_theme_eligible is null or tag.theme_eligible = p_theme_eligible)
    and (
      p_theme_eligible is distinct from true
      or (tag.is_system = true and tag.kind in ('semantic', 'source'))
    )
  order by
    tag.theme_eligible desc,
    coalesce(visible_usage.usage_count, 0) desc,
    tag.label asc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

create or replace function public.list_home_theme_recipes(
  p_tag_limit integer default 8,
  p_recipes_per_tag integer default 10
)
returns table(
  tag_normalized_key text,
  tag_label text,
  tag_slug text,
  theme_rank integer,
  recipe_rank integer,
  id uuid,
  title varchar(200),
  thumbnail_url text,
  tags text[],
  base_servings integer,
  view_count integer,
  like_count integer,
  save_count integer,
  source_type public.recipe_source_type
)
language sql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
  with visible_recipe_tags as (
    select
      recipe_tag.tag_id,
      recipe_tag.recipe_id
    from public.recipe_tags as recipe_tag
    join public.recipes as recipe
      on recipe.id = recipe_tag.recipe_id
    where recipe_tag.visibility = 'public'
      and recipe_tag.review_status = 'approved'
      and recipe.visibility = 'public'
      and recipe.deleted_at is null
      and recipe_visibility_guard.is_owner_publicly_visible(recipe.created_by)
  ),
  seed_tags as (
    select
      tag.id,
      tag.normalized_key,
      tag.label,
      tag.slug,
      row_number() over (
        order by count(visible_recipe_tag.recipe_id) desc, tag.label asc, tag.normalized_key asc
      )::integer as theme_rank
    from public.tags as tag
    join visible_recipe_tags as visible_recipe_tag
      on visible_recipe_tag.tag_id = tag.id
    where tag.is_system = true
      and tag.theme_eligible = true
      and tag.kind in ('semantic', 'source')
    group by tag.id, tag.normalized_key, tag.label, tag.slug
    order by count(visible_recipe_tag.recipe_id) desc, tag.label asc, tag.normalized_key asc
    limit least(greatest(coalesce(p_tag_limit, 8), 1), 12)
  ),
  ranked_recipes as (
    select
      seed_tag.normalized_key as tag_normalized_key,
      seed_tag.label as tag_label,
      seed_tag.slug as tag_slug,
      seed_tag.theme_rank,
      row_number() over (
        partition by seed_tag.id
        order by recipe.view_count desc, recipe.id asc
      )::integer as recipe_rank,
      recipe.id,
      recipe.title,
      recipe.thumbnail_url,
      recipe.tags,
      recipe.base_servings,
      recipe.view_count,
      recipe.like_count,
      recipe.save_count,
      recipe.source_type
    from seed_tags as seed_tag
    join visible_recipe_tags as visible_recipe_tag
      on visible_recipe_tag.tag_id = seed_tag.id
    join public.recipes as recipe
      on recipe.id = visible_recipe_tag.recipe_id
  )
  select
    ranked_recipe.tag_normalized_key,
    ranked_recipe.tag_label,
    ranked_recipe.tag_slug,
    ranked_recipe.theme_rank,
    ranked_recipe.recipe_rank,
    ranked_recipe.id,
    ranked_recipe.title,
    ranked_recipe.thumbnail_url,
    ranked_recipe.tags,
    ranked_recipe.base_servings,
    ranked_recipe.view_count,
    ranked_recipe.like_count,
    ranked_recipe.save_count,
    ranked_recipe.source_type
  from ranked_recipes as ranked_recipe
  where ranked_recipe.recipe_rank <= least(
    greatest(coalesce(p_recipes_per_tag, 10), 1),
    10
  )
  order by ranked_recipe.theme_rank asc, ranked_recipe.recipe_rank asc;
$$;

revoke all on function public.find_recipe_ids_by_public_tags(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.list_public_recipe_tags(text, text, boolean, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.list_home_theme_recipes(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.find_recipe_ids_by_public_tags(text, text)
  to anon, authenticated;
grant execute on function public.list_public_recipe_tags(text, text, boolean, integer)
  to anon, authenticated;
grant execute on function public.list_home_theme_recipes(integer, integer)
  to anon, authenticated;

commit;
