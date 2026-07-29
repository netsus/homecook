begin;

alter table public.recipe_nutrition_snapshots
  add column if not exists owner_user_id uuid;

create table if not exists public.recipe_content_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid,
  recipe_id uuid not null references public.recipes(id) on delete restrict,
  recipe_nutrition_snapshot_id uuid references public.recipe_nutrition_snapshots(id) on delete restrict,
  title varchar(200) not null,
  base_servings numeric(8,2) not null check (base_servings > 0),
  ingredients_json jsonb not null default '[]'::jsonb
    check (jsonb_typeof(ingredients_json) = 'array'),
  steps_json jsonb not null default '[]'::jsonb
    check (jsonb_typeof(steps_json) = 'array'),
  content_hash text not null,
  schema_version integer not null default 1 check (schema_version > 0),
  created_at timestamptz not null default now(),
  unique nulls not distinct (recipe_id, content_hash, recipe_nutrition_snapshot_id, schema_version)
);

alter table public.recipe_content_snapshots enable row level security;
revoke all on table public.recipe_content_snapshots from public, anon, authenticated, service_role;
grant select on table public.recipe_content_snapshots to service_role;

create or replace function public.validate_recipe_nutrition_snapshot_ownership()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_recipe_owner uuid;
  v_recipe_visibility text;
  v_recipe_deleted_at timestamptz;
  v_owner_backfill_enabled boolean := coalesce(
    current_setting('homecook.recipe_snapshot_owner_backfill', true) = 'on',
    false
  );
begin
  select recipe.created_by, recipe.visibility, recipe.deleted_at
    into v_recipe_owner, v_recipe_visibility, v_recipe_deleted_at
  from public.recipes as recipe
  where recipe.id = new.recipe_id;

  if not found then
    raise exception 'recipe_nutrition_snapshot recipe missing'
      using errcode = '23503';
  end if;

  if v_recipe_deleted_at is not null and not v_owner_backfill_enabled then
    raise exception 'validate_recipe_nutrition_snapshot_ownership deleted_at mismatch'
      using errcode = '23514';
  end if;

  if v_recipe_visibility = 'private' then
    if v_recipe_owner is null then
      raise exception 'validate_recipe_nutrition_snapshot_ownership private recipe owner missing'
        using errcode = '23514';
    end if;
    if new.owner_user_id is not null and new.owner_user_id is distinct from v_recipe_owner then
      raise exception 'validate_recipe_nutrition_snapshot_ownership owner mismatch for private recipe'
        using errcode = '23514';
    end if;
    new.owner_user_id := v_recipe_owner;
  elsif v_recipe_visibility = 'public' then
    if new.owner_user_id is not null then
      raise exception 'validate_recipe_nutrition_snapshot_ownership public recipe owner must be null'
        using errcode = '23514';
    end if;
    new.owner_user_id := null;
  else
    raise exception 'validate_recipe_nutrition_snapshot_ownership visibility mismatch'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists recipe_nutrition_snapshot_validate_ownership
  on public.recipe_nutrition_snapshots;
create trigger recipe_nutrition_snapshot_validate_ownership
before insert or update on public.recipe_nutrition_snapshots
for each row
execute function public.validate_recipe_nutrition_snapshot_ownership();

create or replace function public.validate_recipe_content_snapshot_ownership()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_recipe_owner uuid;
  v_recipe_visibility text;
  v_recipe_deleted_at timestamptz;
  v_nutrition_recipe_id uuid;
  v_nutrition_owner uuid;
begin
  select recipe.created_by, recipe.visibility, recipe.deleted_at
    into v_recipe_owner, v_recipe_visibility, v_recipe_deleted_at
  from public.recipes as recipe
  where recipe.id = new.recipe_id;

  if not found then
    raise exception 'recipe_content_snapshot recipe missing'
      using errcode = '23503';
  end if;

  if v_recipe_deleted_at is not null then
    raise exception 'validate_recipe_content_snapshot_ownership deleted_at mismatch'
      using errcode = '23514';
  end if;

  if v_recipe_visibility = 'private' and (
    new.owner_user_id is null
    or v_recipe_owner is distinct from new.owner_user_id
  ) then
    raise exception 'recipe_content_snapshot visibility private owner_user_id mismatch'
      using errcode = '23514';
  end if;

  if v_recipe_visibility = 'public' and new.owner_user_id is not null then
    raise exception 'recipe_content_snapshot visibility public owner_user_id mismatch'
      using errcode = '23514';
  end if;

  if new.recipe_nutrition_snapshot_id is null then
    return new;
  end if;

  select snapshot.recipe_id, snapshot.owner_user_id
    into v_nutrition_recipe_id, v_nutrition_owner
  from public.recipe_nutrition_snapshots as snapshot
  where snapshot.id = new.recipe_nutrition_snapshot_id;

  if not found then
    raise exception 'recipe_content_snapshot nutrition snapshot missing'
      using errcode = '23503';
  end if;

  if v_nutrition_recipe_id is distinct from new.recipe_id then
    raise exception 'recipe_content_snapshot recipe nutrition mismatch'
      using errcode = '23514';
  end if;

  if v_nutrition_owner is distinct from new.owner_user_id then
    raise exception 'recipe_content_snapshot ownership mismatch'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists recipe_content_snapshot_validate_ownership
  on public.recipe_content_snapshots;
create trigger recipe_content_snapshot_validate_ownership
before insert or update on public.recipe_content_snapshots
for each row
execute function public.validate_recipe_content_snapshot_ownership();

create or replace function public.prevent_recipe_content_snapshot_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_cleanup_owner text;
begin
  if tg_op = 'DELETE' then
    v_cleanup_owner := current_setting(
      'homecook.recipe_snapshot_account_cleanup_owner',
      true
    );

    if old.owner_user_id is not null
      and v_cleanup_owner is not null
      and v_cleanup_owner = old.owner_user_id::text then
      return old;
    end if;
  end if;

  raise exception 'recipe_content_snapshots are immutable'
    using errcode = '42501';
end;
$$;

drop trigger if exists recipe_content_snapshot_immutable_guard
  on public.recipe_content_snapshots;
create trigger recipe_content_snapshot_immutable_guard
before update or delete on public.recipe_content_snapshots
for each row
execute function public.prevent_recipe_content_snapshot_mutation();

create or replace function public.prevent_recipe_nutrition_snapshot_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_cleanup_owner text;
begin
  if tg_op = 'DELETE' then
    v_cleanup_owner := current_setting(
      'homecook.recipe_snapshot_account_cleanup_owner',
      true
    );

    if old.owner_user_id is not null
      and v_cleanup_owner is not null
      and v_cleanup_owner = old.owner_user_id::text then
      return old;
    end if;
  end if;

  raise exception 'IMMUTABLE_RECIPE_NUTRITION_SNAPSHOT'
    using errcode = '42501';
end;
$$;

create or replace function public.protect_recipe_nutrition_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_cleanup_owner text;
  v_owner_backfill_enabled boolean := coalesce(
    current_setting('homecook.recipe_snapshot_owner_backfill', true) = 'on',
    false
  );
begin
  if tg_op = 'DELETE' then
    v_cleanup_owner := current_setting(
      'homecook.recipe_snapshot_account_cleanup_owner',
      true
    );

    if old.owner_user_id is not null
      and v_cleanup_owner is not null
      and v_cleanup_owner = old.owner_user_id::text then
      return old;
    end if;

    raise exception 'IMMUTABLE_RECIPE_NUTRITION_SNAPSHOT'
      using errcode = '42501';
  end if;

  if v_owner_backfill_enabled
    and (to_jsonb(old) - 'owner_user_id' - 'is_current')
      is not distinct from (to_jsonb(new) - 'owner_user_id' - 'is_current')
    and old.is_current is not distinct from new.is_current then
    return new;
  end if;

  if current_setting('homecook.recipe_nutrition_writer', true) is distinct from 'on'
    or (to_jsonb(old) - 'is_current') is distinct from (to_jsonb(new) - 'is_current') then
    raise exception 'IMMUTABLE_RECIPE_NUTRITION_SNAPSHOT'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

do $$
begin
  perform set_config('homecook.recipe_snapshot_owner_backfill', 'on', true);

  update public.recipe_nutrition_snapshots as snapshot
  set owner_user_id = case
    when recipe.visibility = 'private' then recipe.created_by
    else null
  end
  from public.recipes as recipe
  where recipe.id = snapshot.recipe_id
    and snapshot.owner_user_id is distinct from case
      when recipe.visibility = 'private' then recipe.created_by
      else null
    end;
end
$$;

create or replace function public.build_recipe_content_snapshot_input(
  p_recipe_id uuid
)
returns table (
  owner_user_id uuid,
  title varchar(200),
  base_servings numeric(8,2),
  ingredients_json jsonb,
  steps_json jsonb,
  content_hash text
)
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_recipe_title varchar(200);
  v_recipe_base_servings numeric(8,2);
  v_recipe_owner uuid;
  v_recipe_visibility text;
  v_recipe_deleted_at timestamptz;
  v_ingredients_json jsonb := '[]'::jsonb;
  v_steps_json jsonb := '[]'::jsonb;
begin
  select
    recipe.title,
    recipe.base_servings::numeric(8,2),
    recipe.created_by,
    recipe.visibility,
    recipe.deleted_at
  into
    v_recipe_title,
    v_recipe_base_servings,
    v_recipe_owner,
    v_recipe_visibility,
    v_recipe_deleted_at
  from public.recipes as recipe
  where recipe.id = p_recipe_id;

  if v_recipe_title is null then
    raise exception 'recipe_content_snapshot recipe missing'
      using errcode = '23503';
  end if;

  if v_recipe_deleted_at is not null then
    raise exception 'recipe_content_snapshot deleted recipe cannot be pinned'
      using errcode = '23514';
  end if;

  if v_recipe_visibility = 'private' and v_recipe_owner is null then
    raise exception 'recipe_content_snapshot private recipe owner missing'
      using errcode = '23514';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'ingredient_id', ingredient.ingredient_id,
        'amount', ingredient.amount,
        'unit', ingredient.unit,
        'ingredient_type', ingredient.ingredient_type,
        'display_text', ingredient.display_text,
        'component_label', to_jsonb(ingredient) -> 'component_label',
        'sort_order', ingredient.sort_order,
        'scalable', ingredient.scalable,
        'food_product_id', to_jsonb(ingredient) -> 'food_product_id',
        'food_product_nutrition_version_id',
          to_jsonb(ingredient) -> 'food_product_nutrition_version_id',
        'food_product_name', (
          select product.name
          from public.food_products as product
          where product.id = nullif(
            to_jsonb(ingredient) ->> 'food_product_id',
            ''
          )::uuid
        ),
        'food_product_brand', (
          select product.brand
          from public.food_products as product
          where product.id = nullif(
            to_jsonb(ingredient) ->> 'food_product_id',
            ''
          )::uuid
        )
      )
      order by ingredient.sort_order asc, ingredient.id asc
    ),
    '[]'::jsonb
  )
    into v_ingredients_json
  from public.recipe_ingredients as ingredient
  where ingredient.recipe_id = p_recipe_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'step_number', step.step_number,
        'instruction', step.instruction,
        'component_label', to_jsonb(step) -> 'component_label',
        'ingredients_used', coalesce(step.ingredients_used, '[]'::jsonb),
        'heat_level', to_jsonb(step) -> 'heat_level',
        'duration_seconds', to_jsonb(step) -> 'duration_seconds',
        'duration_text', to_jsonb(step) -> 'duration_text',
        'cooking_methods', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'code', method.code,
                'label', method.label,
                'color_key', method.color_key,
                'category_code', method.category_code
              )
              order by link.position asc, method.id asc
            )
            from public.recipe_step_cooking_methods as link
            join public.cooking_methods as method
              on method.id = link.method_id
            where link.step_id = step.id
          ),
          (
            select jsonb_build_array(
              jsonb_build_object(
                'code', method.code,
                'label', method.label,
                'color_key', method.color_key,
                'category_code', method.category_code
              )
            )
            from public.cooking_methods as method
            where method.id = nullif(
              to_jsonb(step) ->> 'cooking_method_id',
              ''
            )::uuid
          ),
          '[]'::jsonb
        )
      )
      order by step.step_number asc, step.id asc
    ),
    '[]'::jsonb
  )
    into v_steps_json
  from public.recipe_steps as step
  where step.recipe_id = p_recipe_id;

  owner_user_id := case
    when v_recipe_visibility = 'private' then v_recipe_owner
    else null
  end;
  title := v_recipe_title;
  base_servings := v_recipe_base_servings;
  ingredients_json := v_ingredients_json;
  steps_json := v_steps_json;
  content_hash := encode(
    extensions.digest(
      convert_to(
        jsonb_build_array(
          v_recipe_title,
          v_recipe_base_servings,
          v_ingredients_json,
          v_steps_json
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  return next;
end;
$$;

alter table public.meals
  add column if not exists recipe_content_snapshot_id uuid
    references public.recipe_content_snapshots(id) on delete restrict,
  add column if not exists recipe_content_snapshot_origin varchar(20),
  add column if not exists revision bigint not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.meals'::regclass
      and conname = 'meals_recipe_content_snapshot_origin_check'
  ) then
    alter table public.meals
      add constraint meals_recipe_content_snapshot_origin_check
      check (
        (recipe_content_snapshot_id is null and recipe_content_snapshot_origin is null)
        or
        (
          recipe_content_snapshot_id is not null
          and recipe_content_snapshot_origin in ('created', 'legacy_backfill')
        )
      );
  end if;
end
$$;

create index if not exists meals_recipe_content_snapshot_idx
  on public.meals (recipe_content_snapshot_id);

create or replace function public.bump_meal_revision()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if new.revision is distinct from old.revision then
    raise exception 'CLIENT_SELECTED_MEAL_REVISION_NOT_ALLOWED'
      using errcode = '23514';
  end if;

  new.revision := old.revision + 1;
  return new;
end;
$$;

drop trigger if exists meals_revision_server_guard
  on public.meals;
create trigger meals_revision_server_guard
before update on public.meals
for each row
execute function public.bump_meal_revision();

create or replace function public.recipe_content_snapshot_mirror()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_content_recipe_nutrition_snapshot_id uuid;
begin
  if new.recipe_content_snapshot_id is null then
    return new;
  end if;

  select snapshot.recipe_nutrition_snapshot_id
    into v_content_recipe_nutrition_snapshot_id
  from public.recipe_content_snapshots as snapshot
  where snapshot.id = new.recipe_content_snapshot_id;

  if new.recipe_nutrition_snapshot_id is null then
    if v_content_recipe_nutrition_snapshot_id is null then
      return new;
    end if;

    new.recipe_nutrition_snapshot_id := v_content_recipe_nutrition_snapshot_id;
    return new;
  end if;

  if v_content_recipe_nutrition_snapshot_id is null then
    raise exception 'recipe_content_snapshot_mirror content recipe_nutrition_snapshot_id null mismatch'
      using errcode = '23514';
  end if;

  if new.recipe_nutrition_snapshot_id is distinct from v_content_recipe_nutrition_snapshot_id then
    raise exception 'recipe_content_snapshot_mirror content recipe_nutrition_snapshot_id mismatch not equal'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists recipe_content_snapshot_mirror
  on public.meals;
create trigger recipe_content_snapshot_mirror
before insert or update of recipe_content_snapshot_id, recipe_nutrition_snapshot_id
on public.meals
for each row
execute function public.recipe_content_snapshot_mirror();

create or replace function public.pin_current_recipe_nutrition_snapshot_on_meal_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_snapshot_id uuid;
  v_content_id uuid;
  v_owner_user_id uuid;
  v_title varchar(200);
  v_base_servings numeric(8,2);
  v_ingredients_json jsonb;
  v_steps_json jsonb;
  v_content_hash text;
begin
  if new.recipe_content_snapshot_id is not null
    or new.recipe_content_snapshot_origin is not null
    or new.recipe_nutrition_snapshot_id is not null
    or new.nutrition_snapshot_origin is not null then
    raise exception 'CLIENT_SELECTED_CONTENT_OR_NUTRITION_SNAPSHOT_NOT_ALLOWED';
  end if;

  select snapshot.id
    into v_snapshot_id
  from public.recipe_nutrition_snapshots as snapshot
  where snapshot.recipe_id = new.recipe_id
    and snapshot.is_current
  limit 1;

  select input.owner_user_id,
         input.title,
         input.base_servings,
         input.ingredients_json,
         input.steps_json,
         input.content_hash
    into v_owner_user_id,
         v_title,
         v_base_servings,
         v_ingredients_json,
         v_steps_json,
         v_content_hash
  from public.build_recipe_content_snapshot_input(new.recipe_id) as input;

  insert into public.recipe_content_snapshots (
    owner_user_id,
    recipe_id,
    recipe_nutrition_snapshot_id,
    title,
    base_servings,
    ingredients_json,
    steps_json,
    content_hash,
    schema_version
  ) values (
    v_owner_user_id,
    new.recipe_id,
    v_snapshot_id,
    v_title,
    v_base_servings,
    v_ingredients_json,
    v_steps_json,
    v_content_hash,
    1
  )
  on conflict (recipe_id, content_hash, recipe_nutrition_snapshot_id, schema_version)
  do nothing
  returning id into v_content_id;

  if v_content_id is null then
    select snapshot.id
      into v_content_id
    from public.recipe_content_snapshots as snapshot
    where snapshot.recipe_id = new.recipe_id
      and snapshot.content_hash = v_content_hash
      and snapshot.recipe_nutrition_snapshot_id is not distinct from v_snapshot_id
      and snapshot.schema_version = 1;
  end if;

  new.recipe_content_snapshot_id := v_content_id;
  new.recipe_content_snapshot_origin := 'created';
  new.recipe_nutrition_snapshot_id := v_snapshot_id;
  if v_snapshot_id is not null then
    new.nutrition_snapshot_origin := 'created';
  end if;
  return new;
end;
$$;

create or replace function public.protect_meal_recipe_content_pin()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if old.recipe_content_snapshot_id is not distinct from new.recipe_content_snapshot_id
    and old.recipe_content_snapshot_origin is not distinct from new.recipe_content_snapshot_origin then
    return new;
  end if;

  if current_setting('homecook.recipe_content_backfill', true) = 'on'
    and old.recipe_content_snapshot_id is null
    and new.recipe_content_snapshot_id is not null
    and new.recipe_content_snapshot_origin = 'legacy_backfill' then
    return new;
  end if;

  raise exception 'IMMUTABLE_MEAL_CONTENT_SNAPSHOT_PIN'
    using errcode = '42501';
end;
$$;

drop trigger if exists protect_meal_recipe_content_pin
  on public.meals;
create trigger protect_meal_recipe_content_pin
before update of recipe_content_snapshot_id, recipe_content_snapshot_origin
on public.meals
for each row
execute function public.protect_meal_recipe_content_pin();

create or replace function public.backfill_meal_recipe_content_snapshots()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_candidate record;
  v_owner_user_id uuid;
  v_title varchar(200);
  v_base_servings numeric(8,2);
  v_ingredients_json jsonb;
  v_steps_json jsonb;
  v_content_hash text;
  v_content_id uuid;
begin
  perform set_config('homecook.recipe_content_backfill', 'on', true);

  for v_candidate in
    select meal.id, meal.recipe_id, meal.recipe_nutrition_snapshot_id
    from public.meals as meal
    where meal.status in ('registered', 'shopping_done')
      and meal.recipe_content_snapshot_id is null
    order by meal.id
    for update of meal
  loop
    select input.owner_user_id,
           input.title,
           input.base_servings,
           input.ingredients_json,
           input.steps_json,
           input.content_hash
      into v_owner_user_id,
           v_title,
           v_base_servings,
           v_ingredients_json,
           v_steps_json,
           v_content_hash
    from public.build_recipe_content_snapshot_input(v_candidate.recipe_id) as input;

    insert into public.recipe_content_snapshots (
      owner_user_id,
      recipe_id,
      recipe_nutrition_snapshot_id,
      title,
      base_servings,
      ingredients_json,
      steps_json,
      content_hash,
      schema_version
    ) values (
      v_owner_user_id,
      v_candidate.recipe_id,
      v_candidate.recipe_nutrition_snapshot_id,
      v_title,
      v_base_servings,
      v_ingredients_json,
      v_steps_json,
      v_content_hash,
      1
    )
    on conflict (recipe_id, content_hash, recipe_nutrition_snapshot_id, schema_version)
    do nothing
    returning id into v_content_id;

    if v_content_id is null then
      select snapshot.id
        into v_content_id
      from public.recipe_content_snapshots as snapshot
      where snapshot.recipe_id = v_candidate.recipe_id
        and snapshot.content_hash = v_content_hash
        and snapshot.recipe_nutrition_snapshot_id
          is not distinct from v_candidate.recipe_nutrition_snapshot_id
        and snapshot.schema_version = 1;
    end if;

    update public.meals
       set recipe_content_snapshot_id = v_content_id,
           recipe_content_snapshot_origin = case
             when status in ('registered', 'shopping_done')
               then 'legacy_backfill'
             else recipe_content_snapshot_origin
           end
     where id = v_candidate.id
       and recipe_content_snapshot_id is null;
  end loop;
end;
$$;

alter table public.leftover_dishes
  add column if not exists recipe_content_snapshot_id uuid
    references public.recipe_content_snapshots(id) on delete restrict;

alter table public.cooking_sessions
  add column if not exists contract_version varchar(20) not null default 'legacy_v1',
  add column if not exists session_kind varchar(20),
  add column if not exists recipe_id uuid references public.recipes(id) on delete restrict,
  add column if not exists recipe_content_snapshot_id uuid references public.recipe_content_snapshots(id) on delete restrict,
  add column if not exists cooking_servings integer,
  add column if not exists base_recipe_revision bigint;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.cooking_sessions'::regclass
      and conname = 'cooking_sessions_contract_version_check'
  ) then
    alter table public.cooking_sessions
      add constraint cooking_sessions_contract_version_check
      check (contract_version in ('legacy_v1', 'snapshot_v2'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.cooking_sessions'::regclass
      and conname = 'cooking_sessions_snapshot_v2_shape_check'
  ) then
    alter table public.cooking_sessions
      add constraint cooking_sessions_snapshot_v2_shape_check
      check (
        (
          contract_version = 'legacy_v1'
          and session_kind is null
          and recipe_id is null
          and recipe_content_snapshot_id is null
          and cooking_servings is null
          and base_recipe_revision is null
        )
        or
        (
          contract_version = 'snapshot_v2'
          and recipe_id is not null
          and recipe_content_snapshot_id is not null
          and cooking_servings is not null
          and cooking_servings > 0
          and (
            (session_kind = 'planner' and base_recipe_revision is null)
            or
            (session_kind = 'standalone' and base_recipe_revision is not null and base_recipe_revision > 0)
          )
        )
      );
  end if;
end
$$;

create or replace function public.protect_cooking_session_snapshot_v2_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if old.contract_version = 'snapshot_v2'
    and (
      old.session_kind is distinct from new.session_kind
      or old.recipe_id is distinct from new.recipe_id
      or old.recipe_content_snapshot_id is distinct from new.recipe_content_snapshot_id
      or old.cooking_servings is distinct from new.cooking_servings
      or old.base_recipe_revision is distinct from new.base_recipe_revision
    ) then
    raise exception 'IMMUTABLE_COOKING_SESSION_SNAPSHOT_V2_MUTATION'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists cooking_session_snapshot_v2_immutable_mutation_guard
  on public.cooking_sessions;
create trigger cooking_session_snapshot_v2_immutable_mutation_guard
before update on public.cooking_sessions
for each row
execute function public.protect_cooking_session_snapshot_v2_mutation();

alter table public.cooking_session_meals
  add column if not exists meal_revision_snapshot bigint;

create or replace function public.validate_cooking_session_snapshot_v2_association()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_session_id uuid;
  v_session public.cooking_sessions%rowtype;
begin
  if TG_TABLE_NAME = 'cooking_sessions' then
    v_session_id := coalesce(new.id, old.id);
  else
    v_session_id := coalesce(new.session_id, old.session_id);
  end if;

  select *
    into v_session
  from public.cooking_sessions
  where id = v_session_id;

  if not found or v_session.contract_version <> 'snapshot_v2' then
    return coalesce(new, old);
  end if;

  if v_session.session_kind = 'planner' then
    if not exists (
      select 1
      from public.cooking_session_meals
      where session_id = v_session.id
    ) then
      raise exception 'planner sessions require at least one cooking_session_meals association'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from public.cooking_session_meals as session_meal
      join public.meals as meal on meal.id = session_meal.meal_id
      where session_meal.session_id = v_session.id
        and (
          session_meal.recipe_id is distinct from v_session.recipe_id
          or meal.recipe_id is distinct from v_session.recipe_id
          or meal.recipe_content_snapshot_id is distinct from v_session.recipe_content_snapshot_id
          or session_meal.meal_revision_snapshot is distinct from meal.revision
        )
    ) then
      raise exception 'planner session-meal recipe/content/revision mismatch'
        using errcode = '23514';
    end if;
  elsif v_session.session_kind = 'standalone' then
    if exists (
      select 1
      from public.cooking_session_meals
      where session_id = v_session.id
    ) then
      raise exception 'standalone sessions require zero cooking_session_meals associations'
        using errcode = '23514';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists validate_cooking_session_snapshot_v2_on_session
  on public.cooking_sessions;
create constraint trigger validate_cooking_session_snapshot_v2_on_session
after insert or update on public.cooking_sessions
deferrable initially deferred
for each row
execute function public.validate_cooking_session_snapshot_v2_association();

drop trigger if exists validate_cooking_session_snapshot_v2_on_session_meal
  on public.cooking_session_meals;
create constraint trigger validate_cooking_session_snapshot_v2_on_session_meal
after insert or update or delete on public.cooking_session_meals
deferrable initially deferred
for each row
execute function public.validate_cooking_session_snapshot_v2_association();

create table if not exists public.cooking_session_meal_claims (
  meal_id uuid primary key references public.meals(id) on delete cascade,
  session_id uuid not null references public.cooking_sessions(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  claimed_at timestamptz not null default now()
);

revoke all on table public.cooking_session_meal_claims
  from public, anon, authenticated, service_role;

create or replace function public.validate_cooking_session_meal_claim()
returns trigger
language plpgsql
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_session public.cooking_sessions%rowtype;
  v_meal public.meals%rowtype;
begin
  select * into v_session
  from public.cooking_sessions
  where id = new.session_id;

  if not found then
    raise exception 'claim session missing'
      using errcode = '23514';
  end if;

  select * into v_meal
  from public.meals
  where id = new.meal_id;

  if not found then
    raise exception 'claim meal missing'
      using errcode = '23514';
  end if;

  if v_session.contract_version <> 'snapshot_v2'
    or v_session.session_kind <> 'planner'
    or new.owner_user_id is distinct from v_session.user_id
    or new.owner_user_id is distinct from v_meal.user_id
    or not exists (
      select 1
      from public.cooking_session_meals
      where session_id = new.session_id
        and meal_id = new.meal_id
    ) then
    raise exception 'claim owner session meal mismatch'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists cooking_session_meal_claim_validate
  on public.cooking_session_meal_claims;
create trigger cooking_session_meal_claim_validate
before insert or update on public.cooking_session_meal_claims
for each row
execute function public.validate_cooking_session_meal_claim();

create or replace function public.recipe_snapshot_account_cleanup_guard(p_owner_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if p_owner_user_id is null then
    raise exception 'recipe snapshot owner is required'
      using errcode = '22023';
  end if;

  perform set_config(
    'homecook.recipe_snapshot_account_cleanup_owner',
    p_owner_user_id::text,
    true
  );

  if auth.uid() is not null and auth.uid() <> p_owner_user_id then
    raise exception 'recipe snapshot owner mismatch'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.recipe_snapshot_account_cleanup_guard(uuid)
  from public, anon, authenticated;
revoke all on function public.recipe_snapshot_account_cleanup_guard(uuid)
  from service_role;
grant execute on function public.recipe_snapshot_account_cleanup_guard(uuid)
  to service_role;

create or replace function public.delete_user_private_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_authored_recipe_ids uuid[] := '{}'::uuid[];
  v_preserved_recipe_ids uuid[] := '{}'::uuid[];
  v_private_recipe_ids uuid[] := '{}'::uuid[];
  v_private_content_snapshot_ids uuid[] := '{}'::uuid[];
  v_private_nutrition_snapshot_ids uuid[] := '{}'::uuid[];
  v_saved_recipe_ids uuid[] := '{}'::uuid[];
  v_liked_recipe_ids uuid[] := '{}'::uuid[];
  v_legacy_private_product_ids uuid[] := '{}'::uuid[];
  v_legacy_private_profile_ids uuid[] := '{}'::uuid[];
  v_private_session_ids uuid[] := '{}'::uuid[];
  v_private_meal_ids uuid[] := '{}'::uuid[];
  v_deleted_user_count integer := 0;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'cannot delete another user private data' using errcode = '42501';
  end if;

  perform public.recipe_snapshot_account_cleanup_guard(p_user_id);
  perform set_config('homecook.account_delete_user_id', p_user_id::text, true);

  select coalesce(array_agg(recipe.id), '{}'::uuid[]) into v_authored_recipe_ids
  from public.recipes as recipe
  where recipe.created_by = p_user_id;

  select coalesce(array_agg(recipe.id), '{}'::uuid[]) into v_private_recipe_ids
  from public.recipes as recipe
  where recipe.created_by = p_user_id
    and recipe.visibility = 'private';

  select coalesce(array_agg(recipe.id), '{}'::uuid[]) into v_preserved_recipe_ids
  from public.recipes as recipe
  where recipe.created_by = p_user_id
    and recipe.id <> all(v_private_recipe_ids);

  select coalesce(array_agg(snapshot.id), '{}'::uuid[]) into v_private_content_snapshot_ids
  from public.recipe_content_snapshots as snapshot
  where snapshot.owner_user_id = p_user_id;

  select coalesce(array_agg(snapshot.id), '{}'::uuid[]) into v_private_nutrition_snapshot_ids
  from public.recipe_nutrition_snapshots as snapshot
  where snapshot.owner_user_id = p_user_id;

  select coalesce(array_agg(distinct recipe_id), '{}'::uuid[]) into v_liked_recipe_ids
  from public.recipe_likes
  where user_id = p_user_id;

  select coalesce(array_agg(distinct rbi.recipe_id), '{}'::uuid[]) into v_saved_recipe_ids
  from public.recipe_book_items as rbi
  join public.recipe_books as rb on rb.id = rbi.book_id
  where rb.user_id = p_user_id;

  select coalesce(array_agg(distinct meal.id), '{}'::uuid[]) into v_private_meal_ids
  from public.meals as meal
  where meal.user_id = p_user_id
     or meal.recipe_id = any(v_private_recipe_ids);

  select coalesce(array_agg(distinct session.id), '{}'::uuid[]) into v_private_session_ids
  from public.cooking_sessions as session
  where session.user_id = p_user_id
     or exists (
       select 1
       from public.cooking_session_meals as session_meal
       where session_meal.session_id = session.id
         and (
           session_meal.meal_id = any(v_private_meal_ids)
           or session_meal.recipe_id = any(v_private_recipe_ids)
         )
     );

  select coalesce(array_agg(product.id), '{}'::uuid[])
    into v_legacy_private_product_ids
  from public.food_products as product
  where product.owner_user_id = p_user_id
    and product.visibility = 'private'
    and product.source_type = 'manual';

  select coalesce(array_agg(version.nutrition_profile_id), '{}'::uuid[])
    into v_legacy_private_profile_ids
  from public.food_product_nutrition_versions as version
  where version.product_id = any(v_legacy_private_product_ids);

  perform set_config(
    'homecook.account_delete_profile_ids',
    array_to_string(v_legacy_private_profile_ids, ','),
    true
  );

  delete from public.cooking_session_meal_claims
  where meal_id = any(v_private_meal_ids);

  delete from public.cooking_session_meals
  where meal_id = any(v_private_meal_ids)
     or session_id = any(v_private_session_ids)
     or recipe_id = any(v_private_recipe_ids);

  delete from public.cooking_sessions
  where id = any(v_private_session_ids);

  delete from public.meals
  where id = any(v_private_meal_ids);

  delete from public.leftover_dishes
  where user_id = p_user_id
     or recipe_id = any(v_private_recipe_ids);

  if cardinality(v_private_recipe_ids) > 0 then
    delete from public.recipe_content_snapshots
    where id = any(v_private_content_snapshot_ids);

    delete from public.recipe_nutrition_snapshots
    where id = any(v_private_nutrition_snapshot_ids);

    delete from public.recipe_book_items
    where recipe_id = any(v_private_recipe_ids);

    delete from public.recipe_likes
    where recipe_id = any(v_private_recipe_ids);

    delete from public.recipe_steps
    where recipe_id = any(v_private_recipe_ids);

    delete from public.recipe_ingredients
    where recipe_id = any(v_private_recipe_ids);

    delete from public.recipe_sources
    where recipe_id = any(v_private_recipe_ids);

    delete from public.recipes
    where id = any(v_private_recipe_ids);
  end if;

  if cardinality(v_legacy_private_product_ids) > 0 then
    set constraints food_products_current_version_fk deferred;
    delete from public.product_planner_entries
    where product_id = any(v_legacy_private_product_ids);
    delete from public.nutrition_values
    where profile_id = any(v_legacy_private_profile_ids);
    delete from public.food_product_nutrition_versions
    where product_id = any(v_legacy_private_product_ids);
    delete from public.nutrition_profiles
    where id = any(v_legacy_private_profile_ids);
    delete from public.food_products
    where id = any(v_legacy_private_product_ids);
  end if;

  update public.food_products
  set owner_user_id = null, visibility = 'public', source_type = 'manual', updated_at = now()
  where owner_user_id = p_user_id
    and visibility = 'public'
    and source_type = 'manual';

  update public.food_product_nutrition_versions as version
  set created_by = null
  from public.food_products as product
  where product.id = version.product_id
    and product.owner_user_id is null
    and product.visibility = 'public'
    and product.source_type = 'manual'
    and version.created_by = p_user_id;

  update public.nutrition_profiles as profile
  set created_by = null
  from public.food_product_nutrition_versions as version
  join public.food_products as product on product.id = version.product_id
  where profile.id = version.nutrition_profile_id
    and product.owner_user_id is null
    and product.visibility = 'public'
    and product.source_type = 'manual'
    and profile.created_by = p_user_id;

  delete from public.users
  where id = p_user_id;
  get diagnostics v_deleted_user_count = row_count;

  if cardinality(v_saved_recipe_ids) > 0 then
    update public.recipes as recipe
    set save_count = (
      select count(*)::integer
      from public.recipe_book_items as item
      where item.recipe_id = recipe.id
    )
    where recipe.id = any(v_saved_recipe_ids);
  end if;

  if cardinality(v_liked_recipe_ids) > 0 then
    update public.recipes as recipe
    set like_count = (
      select count(*)::integer
      from public.recipe_likes as like_row
      where like_row.recipe_id = recipe.id
    )
    where recipe.id = any(v_liked_recipe_ids);
  end if;

  return jsonb_build_object(
    'deleted', true,
    'user_deleted', v_deleted_user_count > 0,
    'preserved_recipe_count', cardinality(v_preserved_recipe_ids),
    'deleted_private_recipe_count', cardinality(v_private_recipe_ids)
  );
end;
$$;

revoke all on function public.delete_user_private_data(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_user_private_data(uuid)
  to service_role;

revoke all on function public.validate_recipe_nutrition_snapshot_ownership()
  from public, anon, authenticated, service_role;
revoke all on function public.validate_recipe_content_snapshot_ownership()
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_recipe_content_snapshot_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.prevent_recipe_nutrition_snapshot_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.protect_recipe_nutrition_snapshot()
  from public, anon, authenticated, service_role;
revoke all on function public.build_recipe_content_snapshot_input(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.bump_meal_revision()
  from public, anon, authenticated, service_role;
revoke all on function public.recipe_content_snapshot_mirror()
  from public, anon, authenticated, service_role;
revoke all on function public.pin_current_recipe_nutrition_snapshot_on_meal_insert()
  from public, anon, authenticated, service_role;
revoke all on function public.protect_meal_recipe_content_pin()
  from public, anon, authenticated, service_role;
revoke all on function public.backfill_meal_recipe_content_snapshots()
  from public, anon, authenticated, service_role;
grant execute on function public.backfill_meal_recipe_content_snapshots()
  to service_role;
revoke all on function public.protect_cooking_session_snapshot_v2_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.validate_cooking_session_snapshot_v2_association()
  from public, anon, authenticated, service_role;
revoke all on function public.validate_cooking_session_meal_claim()
  from public, anon, authenticated, service_role;

commit;
