alter table public.meal_plan_columns
  add constraint meal_plan_columns_id_user_unique unique (id, user_id);

create table public.product_planner_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan_date date not null,
  column_id uuid not null,
  product_id uuid not null,
  product_nutrition_version_id uuid not null,
  quantity_amount numeric(12,4) not null check (quantity_amount > 0),
  quantity_unit varchar(20) not null check (quantity_unit in ('serving', 'package', 'g', 'ml')),
  product_name_snapshot varchar(200) not null check (nullif(btrim(product_name_snapshot), '') is not null),
  product_brand_snapshot varchar(200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_planner_entries_column_owner_fk
    foreign key (column_id, user_id)
    references public.meal_plan_columns(id, user_id)
    on delete restrict,
  constraint product_planner_entries_pinned_version_fk
    foreign key (product_id, product_nutrition_version_id)
    references public.food_product_nutrition_versions(product_id, id)
    on delete restrict
);

create index product_planner_entries_user_slot_idx
  on public.product_planner_entries (user_id, plan_date, column_id);
create index product_planner_entries_version_idx
  on public.product_planner_entries (product_nutrition_version_id);

create function public.product_planner_quantity_scale(
  p_product_nutrition_version_id uuid,
  p_quantity_amount numeric,
  p_quantity_unit text
)
returns numeric
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_version public.food_product_nutrition_versions%rowtype;
  v_profile public.nutrition_profiles%rowtype;
  v_candidate_count integer;
  v_scale numeric;
begin
  if p_quantity_amount is null
    or p_quantity_amount <= 0
    or round(p_quantity_amount, 4) <= 0
    or round(p_quantity_amount, 4) >= 100000000
    or p_quantity_unit not in ('serving', 'package', 'g', 'ml')
  then
    raise exception 'VALIDATION_ERROR';
  end if;

  select * into v_version
  from public.food_product_nutrition_versions
  where id = p_product_nutrition_version_id;
  if v_version.id is null then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;

  select * into v_profile
  from public.nutrition_profiles
  where id = v_version.nutrition_profile_id;
  if v_profile.id is null
    or v_profile.basis_amount <= 0
    or v_profile.basis_unit not in ('serving', 'package', 'g', 'ml')
  then
    raise exception 'NUTRITION_BASIS_MISMATCH';
  end if;

  if p_quantity_unit = v_profile.basis_unit then
    return p_quantity_amount / v_profile.basis_amount;
  end if;

  select count(*), max(
    case
      when relation -> 'from' ->> 'unit' = p_quantity_unit
        and relation -> 'to' ->> 'unit' = v_profile.basis_unit
      then p_quantity_amount
        * (relation -> 'to' ->> 'amount')::numeric
        / (relation -> 'from' ->> 'amount')::numeric
        / v_profile.basis_amount
      when relation -> 'to' ->> 'unit' = p_quantity_unit
        and relation -> 'from' ->> 'unit' = v_profile.basis_unit
      then p_quantity_amount
        * (relation -> 'from' ->> 'amount')::numeric
        / (relation -> 'to' ->> 'amount')::numeric
        / v_profile.basis_amount
      else null
    end
  )
  into v_candidate_count, v_scale
  from jsonb_array_elements(v_version.basis_relations_json) relation
  where (
    relation -> 'from' ->> 'unit' = p_quantity_unit
    and relation -> 'to' ->> 'unit' = v_profile.basis_unit
  ) or (
    relation -> 'to' ->> 'unit' = p_quantity_unit
    and relation -> 'from' ->> 'unit' = v_profile.basis_unit
  );

  if v_candidate_count <> 1 or v_scale is null or v_scale <= 0 then
    raise exception 'NUTRITION_BASIS_MISMATCH';
  end if;
  return v_scale;
end;
$$;

create function public.protect_product_planner_entry()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_product public.food_products%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into v_product
    from public.food_products
    where id = new.product_id
    for update;

    if v_product.id is null then
      raise exception 'RESOURCE_NOT_FOUND';
    end if;
    if v_product.visibility = 'private' and v_product.owner_user_id is distinct from new.user_id then
      raise exception 'FORBIDDEN';
    end if;
    if v_product.deleted_at is not null then
      raise exception 'PRODUCT_DELETED';
    end if;
    if v_product.current_nutrition_version_id is null
      or v_product.current_nutrition_version_id is distinct from new.product_nutrition_version_id
    then
      raise exception 'NUTRITION_VERSION_CONFLICT';
    end if;
    if v_product.name is distinct from new.product_name_snapshot
      or v_product.brand is distinct from new.product_brand_snapshot
    then
      raise exception 'IMMUTABLE_PRODUCT_PLANNER_ENTRY';
    end if;
  else
    if new.id is distinct from old.id
      or new.user_id is distinct from old.user_id
      or new.plan_date is distinct from old.plan_date
      or new.column_id is distinct from old.column_id
      or new.product_id is distinct from old.product_id
      or new.product_nutrition_version_id is distinct from old.product_nutrition_version_id
      or new.product_name_snapshot is distinct from old.product_name_snapshot
      or new.product_brand_snapshot is distinct from old.product_brand_snapshot
      or new.created_at is distinct from old.created_at
    then
      raise exception 'IMMUTABLE_PRODUCT_PLANNER_ENTRY';
    end if;
    new.updated_at := now();
  end if;

  perform public.product_planner_quantity_scale(
    new.product_nutrition_version_id,
    new.quantity_amount,
    new.quantity_unit
  );
  return new;
end;
$$;

create trigger protect_product_planner_entry
before insert or update on public.product_planner_entries
for each row execute function public.protect_product_planner_entry();

create function public.product_planner_entry_payload(
  p_entry_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_entry public.product_planner_entries%rowtype;
  v_version public.food_product_nutrition_versions%rowtype;
  v_profile public.nutrition_profiles%rowtype;
  v_scale numeric;
  v_values jsonb;
  v_optional jsonb;
  v_sources jsonb;
  v_core_count integer;
begin
  select * into v_entry
  from public.product_planner_entries
  where id = p_entry_id and user_id = p_user_id;
  if v_entry.id is null then return null; end if;

  select * into v_version
  from public.food_product_nutrition_versions
  where id = v_entry.product_nutrition_version_id
    and product_id = v_entry.product_id;
  select * into v_profile
  from public.nutrition_profiles
  where id = v_version.nutrition_profile_id;
  v_scale := public.product_planner_quantity_scale(
    v_entry.product_nutrition_version_id,
    v_entry.quantity_amount,
    v_entry.quantity_unit
  );

  select jsonb_object_agg(core.code, jsonb_build_object(
      'amount', case when value.value_status = 'observed' then value.amount * v_scale else null end,
      'known_amount', null,
      'status', case when value.value_status = 'observed' then 'complete' else 'unavailable' end,
      'display_mode', case when value.value_status = 'observed' then 'total' else null end
    ) order by core.position),
    count(value.amount) filter (where value.value_status = 'observed')
  into v_values, v_core_count
  from (values
    ('energy_kcal', 1), ('carbohydrate_g', 2), ('protein_g', 3),
    ('fat_g', 4), ('sodium_mg', 5)
  ) core(code, position)
  left join public.nutrition_values value
    on value.profile_id = v_profile.id and value.nutrient_code = core.code;

  select coalesce(jsonb_object_agg(value.nutrient_code, jsonb_build_object(
      'amount', value.amount * v_scale,
      'known_amount', null,
      'status', 'complete',
      'display_mode', 'total'
    ) order by definition.display_order), '{}'::jsonb)
  into v_optional
  from public.nutrition_values value
  join public.nutrient_definitions definition on definition.code = value.nutrient_code
  where value.profile_id = v_profile.id
    and not definition.is_core
    and value.value_status = 'observed'
    and value.amount is not null;
  v_values := v_values || v_optional;

  if v_version.source_item_id is null then
    v_sources := jsonb_build_array(jsonb_build_object(
      'provider', 'user_label', 'dataset', null, 'source_version', null,
      'data_basis_date', null, 'license', null, 'source_url', null
    ));
  else
    select jsonb_build_array(jsonb_build_object(
      'provider', source.provider_code,
      'dataset', source.dataset_name,
      'source_version', source.source_version,
      'data_basis_date', source.data_basis_date,
      'license', source.license_name,
      'source_url', source.source_url
    )) into v_sources
    from public.nutrition_source_items item
    join public.nutrition_sources source on source.id = item.source_id
    where item.id = v_version.source_item_id;
  end if;

  return jsonb_build_object(
    'entry_type', 'product',
    'id', v_entry.id,
    'product_id', v_entry.product_id,
    'product_name', v_entry.product_name_snapshot,
    'product_brand', v_entry.product_brand_snapshot,
    'plan_date', v_entry.plan_date,
    'column_id', v_entry.column_id,
    'quantity', jsonb_build_object('amount', v_entry.quantity_amount, 'unit', v_entry.quantity_unit),
    'workflow_status', null,
    'product_nutrition_version_id', v_entry.product_nutrition_version_id,
    'basis_relations', v_version.basis_relations_json,
    'nutrition', jsonb_build_object(
      'basis', jsonb_build_object('amount', v_entry.quantity_amount, 'unit', v_entry.quantity_unit),
      'values', v_values,
      'calculation_status', case
        when v_core_count = 5 then 'complete'
        when v_core_count > 0 then 'partial'
        else 'unavailable'
      end,
      'calculation_quality', case when v_core_count > 0 then 'direct' else null end,
      'warnings', '[]'::jsonb,
      'sources', coalesce(v_sources, '[]'::jsonb)
    )
  );
end;
$$;

create function public.create_product_planner_entry(
  p_user_id uuid,
  p_product_id uuid,
  p_plan_date date,
  p_column_id uuid,
  p_quantity_amount numeric,
  p_quantity_unit text,
  p_expected_current_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_product public.food_products%rowtype;
  v_column_user_id uuid;
  v_entry_id uuid;
begin
  perform public.assert_food_product_actor(p_user_id);
  if p_plan_date is null or p_product_id is null or p_column_id is null then
    raise exception 'VALIDATION_ERROR';
  end if;

  select user_id into v_column_user_id
  from public.meal_plan_columns
  where id = p_column_id
  for update;
  if v_column_user_id is null then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;
  if v_column_user_id is distinct from p_user_id then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_product
  from public.food_products
  where id = p_product_id
  for update;
  if v_product.id is null then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;
  if v_product.visibility = 'private' and v_product.owner_user_id is distinct from p_user_id then
    raise exception 'FORBIDDEN';
  end if;
  if v_product.deleted_at is not null then
    raise exception 'PRODUCT_DELETED';
  end if;
  if v_product.current_nutrition_version_id is null
    or p_expected_current_version_id is null
    or v_product.current_nutrition_version_id is distinct from p_expected_current_version_id
  then
    raise exception 'NUTRITION_VERSION_CONFLICT';
  end if;

  perform public.product_planner_quantity_scale(
    v_product.current_nutrition_version_id,
    p_quantity_amount,
    p_quantity_unit
  );

  insert into public.product_planner_entries (
    user_id, plan_date, column_id, product_id, product_nutrition_version_id,
    quantity_amount, quantity_unit, product_name_snapshot, product_brand_snapshot
  ) values (
    p_user_id, p_plan_date, p_column_id, p_product_id,
    v_product.current_nutrition_version_id, p_quantity_amount, p_quantity_unit,
    v_product.name, v_product.brand
  ) returning id into v_entry_id;

  return public.product_planner_entry_payload(v_entry_id, p_user_id);
end;
$$;

create function public.update_product_planner_entry_quantity(
  p_user_id uuid,
  p_entry_id uuid,
  p_quantity_amount numeric,
  p_quantity_unit text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_entry public.product_planner_entries%rowtype;
begin
  perform public.assert_food_product_actor(p_user_id);
  select * into v_entry
  from public.product_planner_entries
  where id = p_entry_id
  for update;
  if v_entry.id is null then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;
  if v_entry.user_id is distinct from p_user_id then
    raise exception 'FORBIDDEN';
  end if;

  perform public.product_planner_quantity_scale(
    v_entry.product_nutrition_version_id,
    p_quantity_amount,
    p_quantity_unit
  );
  update public.product_planner_entries
  set quantity_amount = p_quantity_amount,
      quantity_unit = p_quantity_unit
  where id = p_entry_id;
  return public.product_planner_entry_payload(p_entry_id, p_user_id);
end;
$$;

create function public.delete_product_planner_entry(
  p_user_id uuid,
  p_entry_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_entry public.product_planner_entries%rowtype;
begin
  perform public.assert_food_product_actor(p_user_id);
  select * into v_entry
  from public.product_planner_entries
  where id = p_entry_id
  for update;
  if v_entry.id is null then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;
  if v_entry.user_id is distinct from p_user_id then
    raise exception 'FORBIDDEN';
  end if;

  delete from public.product_planner_entries where id = p_entry_id;
  return jsonb_build_object('deleted', true, 'entry_id', p_entry_id);
end;
$$;

create function public.list_product_planner_entries(
  p_user_id uuid,
  p_start_date date,
  p_end_date date,
  p_column_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_entries jsonb;
begin
  perform public.assert_food_product_actor(p_user_id);
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'VALIDATION_ERROR';
  end if;
  if p_column_id is not null and not exists (
    select 1 from public.meal_plan_columns
    where id = p_column_id and user_id = p_user_id
  ) then
    raise exception 'FORBIDDEN';
  end if;

  with context as (
    select
      entry.*,
      version.basis_relations_json,
      version.source_item_id,
      profile.id as profile_id,
      public.product_planner_quantity_scale(
        entry.product_nutrition_version_id,
        entry.quantity_amount,
        entry.quantity_unit
      ) as scale
    from public.product_planner_entries entry
    join public.food_product_nutrition_versions version
      on version.id = entry.product_nutrition_version_id
      and version.product_id = entry.product_id
    join public.nutrition_profiles profile on profile.id = version.nutrition_profile_id
    where entry.user_id = p_user_id
      and entry.plan_date between p_start_date and p_end_date
      and (p_column_id is null or entry.column_id = p_column_id)
  ), core_values as (
    select
      context.id,
      jsonb_object_agg(core.code, jsonb_build_object(
        'amount', case when value.value_status = 'observed' then value.amount * context.scale else null end,
        'known_amount', null,
        'status', case when value.value_status = 'observed' then 'complete' else 'unavailable' end,
        'display_mode', case when value.value_status = 'observed' then 'total' else null end
      ) order by core.position) as values_json,
      count(value.amount) filter (where value.value_status = 'observed') as core_count
    from context
    cross join (values
      ('energy_kcal', 1), ('carbohydrate_g', 2), ('protein_g', 3),
      ('fat_g', 4), ('sodium_mg', 5)
    ) core(code, position)
    left join public.nutrition_values value
      on value.profile_id = context.profile_id and value.nutrient_code = core.code
    group by context.id
  ), optional_values as (
    select context.id, coalesce((
      select jsonb_object_agg(
        value.nutrient_code,
        jsonb_build_object(
          'amount', value.amount * context.scale,
          'known_amount', null,
          'status', 'complete',
          'display_mode', 'total'
        ) order by definition.display_order
      )
      from public.nutrition_values value
      join public.nutrient_definitions definition
        on definition.code = value.nutrient_code and not definition.is_core
      where value.profile_id = context.profile_id
        and value.value_status = 'observed'
        and value.amount is not null
    ), '{}'::jsonb) as values_json
    from context
  ), source_values as (
    select context.id, case
      when context.source_item_id is null then jsonb_build_array(jsonb_build_object(
        'provider', 'user_label', 'dataset', null, 'source_version', null,
        'data_basis_date', null, 'license', null, 'source_url', null
      ))
      else coalesce(jsonb_build_array(jsonb_build_object(
        'provider', source.provider_code,
        'dataset', source.dataset_name,
        'source_version', source.source_version,
        'data_basis_date', source.data_basis_date,
        'license', source.license_name,
        'source_url', source.source_url
      )), '[]'::jsonb)
    end as sources_json
    from context
    left join public.nutrition_source_items item on item.id = context.source_item_id
    left join public.nutrition_sources source on source.id = item.source_id
  ), payloads as (
    select
      context.plan_date,
      context.column_id,
      context.created_at,
      context.id,
      jsonb_build_object(
        'entry_type', 'product',
        'id', context.id,
        'product_id', context.product_id,
        'product_name', context.product_name_snapshot,
        'product_brand', context.product_brand_snapshot,
        'plan_date', context.plan_date,
        'column_id', context.column_id,
        'quantity', jsonb_build_object('amount', context.quantity_amount, 'unit', context.quantity_unit),
        'workflow_status', null,
        'product_nutrition_version_id', context.product_nutrition_version_id,
        'basis_relations', context.basis_relations_json,
        'nutrition', jsonb_build_object(
          'basis', jsonb_build_object('amount', context.quantity_amount, 'unit', context.quantity_unit),
          'values', core.values_json || optional.values_json,
          'calculation_status', case
            when core.core_count = 5 then 'complete'
            when core.core_count > 0 then 'partial'
            else 'unavailable'
          end,
          'calculation_quality', case when core.core_count > 0 then 'direct' else null end,
          'warnings', '[]'::jsonb,
          'sources', source.sources_json
        )
      ) as payload
    from context
    join core_values core on core.id = context.id
    join optional_values optional on optional.id = context.id
    join source_values source on source.id = context.id
  )
  select coalesce(
    jsonb_agg(payload order by plan_date, column_id, created_at, id),
    '[]'::jsonb
  ) into v_entries
  from payloads;

  return v_entries;
end;
$$;

create function public.delete_owned_planner_column(
  p_user_id uuid,
  p_column_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_column_user_id uuid;
  v_column_count integer;
begin
  perform public.assert_food_product_actor(p_user_id);
  select user_id into v_column_user_id
  from public.meal_plan_columns
  where id = p_column_id
  for update;
  if v_column_user_id is null then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;
  if v_column_user_id is distinct from p_user_id then
    raise exception 'FORBIDDEN';
  end if;

  perform 1 from public.meal_plan_columns
  where user_id = p_user_id
  for update;
  select count(*) into v_column_count
  from public.meal_plan_columns
  where user_id = p_user_id;
  if v_column_count <= 1 then
    raise exception 'MIN_COLUMN_REQUIRED';
  end if;

  if exists (
    select 1 from public.meals
    where user_id = p_user_id and column_id = p_column_id
  ) or exists (
    select 1 from public.product_planner_entries
    where user_id = p_user_id and column_id = p_column_id
  ) then
    raise exception 'COLUMN_HAS_MEALS';
  end if;

  delete from public.meal_plan_columns where id = p_column_id;
  update public.meal_plan_columns
  set sort_order = sort_order + 1000
  where user_id = p_user_id;
  with ordered as (
    select id, row_number() over (order by sort_order, id) - 1 as next_sort_order
    from public.meal_plan_columns
    where user_id = p_user_id
  )
  update public.meal_plan_columns column_row
  set sort_order = ordered.next_sort_order
  from ordered
  where column_row.id = ordered.id;

  return jsonb_build_object('deleted', true);
end;
$$;

alter table public.product_planner_entries enable row level security;

create policy product_planner_entries_select_owner
on public.product_planner_entries
for select to authenticated
using (auth.uid() = user_id);

create policy product_planner_entries_insert_owner
on public.product_planner_entries
for insert to authenticated
with check (auth.uid() = user_id);

create policy product_planner_entries_update_owner
on public.product_planner_entries
for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy product_planner_entries_delete_owner
on public.product_planner_entries
for delete to authenticated
using (auth.uid() = user_id);

revoke all on table public.product_planner_entries from anon, authenticated, service_role;
grant select, delete on table public.product_planner_entries to authenticated;
grant insert (user_id, plan_date, column_id, product_id, quantity_amount, quantity_unit)
  on table public.product_planner_entries to authenticated;
grant update (quantity_amount, quantity_unit)
  on table public.product_planner_entries to authenticated;
grant select, insert, update, delete on table public.product_planner_entries to service_role;
revoke truncate on table public.product_planner_entries from anon, authenticated, service_role;

revoke all on function public.product_planner_quantity_scale(uuid, numeric, text)
  from public, anon, authenticated, service_role;
revoke all on function public.protect_product_planner_entry()
  from public, anon, authenticated, service_role;
revoke all on function public.product_planner_entry_payload(uuid, uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.create_product_planner_entry(uuid, uuid, date, uuid, numeric, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.create_product_planner_entry(uuid, uuid, date, uuid, numeric, text, uuid)
  to authenticated, service_role;
revoke all on function public.update_product_planner_entry_quantity(uuid, uuid, numeric, text)
  from public, anon, authenticated, service_role;
grant execute on function public.update_product_planner_entry_quantity(uuid, uuid, numeric, text)
  to authenticated, service_role;
revoke all on function public.delete_product_planner_entry(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_product_planner_entry(uuid, uuid)
  to authenticated, service_role;
revoke all on function public.list_product_planner_entries(uuid, date, date, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_product_planner_entries(uuid, date, date, uuid)
  to authenticated, service_role;
revoke all on function public.delete_owned_planner_column(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_owned_planner_column(uuid, uuid)
  to authenticated, service_role;
