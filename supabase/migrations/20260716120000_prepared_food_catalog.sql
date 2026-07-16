create function public.validate_food_product_basis_relations(p_relations jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select jsonb_typeof(p_relations) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(p_relations) relation
      where jsonb_typeof(relation) <> 'object'
        or jsonb_typeof(relation -> 'from') <> 'object'
        or jsonb_typeof(relation -> 'to') <> 'object'
        or jsonb_typeof(relation -> 'from' -> 'amount') <> 'number'
        or jsonb_typeof(relation -> 'to' -> 'amount') <> 'number'
        or (relation -> 'from' ->> 'amount')::numeric <= 0
        or (relation -> 'to' ->> 'amount')::numeric <= 0
        or relation -> 'from' ->> 'unit' not in ('serving', 'package', 'g', 'ml')
        or relation -> 'to' ->> 'unit' not in ('serving', 'package', 'g', 'ml')
        or relation -> 'from' ->> 'unit' = relation -> 'to' ->> 'unit'
        or (select count(*) from jsonb_object_keys(relation)) <> 2
        or (select count(*) from jsonb_object_keys(relation -> 'from')) <> 2
        or (select count(*) from jsonb_object_keys(relation -> 'to')) <> 2
    )
    and (
      select count(*) = count(distinct relation::text)
      from jsonb_array_elements(p_relations) relation
    )
$$;

create table public.food_products (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.users(id) on delete restrict,
  visibility varchar(20) not null,
  source_type varchar(20) not null,
  name varchar(200) not null check (nullif(btrim(name), '') is not null),
  brand varchar(200),
  external_product_key text,
  barcode text,
  image_url text,
  current_nutrition_version_id uuid not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (
      visibility = 'public'
      and source_type = 'public_dataset'
      and owner_user_id is null
      and nullif(btrim(external_product_key), '') is not null
    )
    or (
      visibility = 'private'
      and source_type = 'manual'
      and owner_user_id is not null
      and external_product_key is null
    )
  ),
  unique (id, current_nutrition_version_id)
);

create unique index food_products_source_key_idx
  on public.food_products (source_type, external_product_key)
  where external_product_key is not null;
create index food_products_catalog_order_idx
  on public.food_products (created_at desc, id desc)
  where deleted_at is null;
create index food_products_owner_catalog_order_idx
  on public.food_products (owner_user_id, created_at desc, id desc)
  where deleted_at is null;
create index food_products_search_idx
  on public.food_products (lower(name), lower(coalesce(brand, '')))
  where deleted_at is null;

create table public.food_product_nutrition_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.food_products(id) on delete restrict,
  nutrition_profile_id uuid not null references public.nutrition_profiles(id) on delete restrict,
  version integer not null check (version > 0),
  label_basis_text text,
  basis_relations_json jsonb not null default '[]'::jsonb
    check (public.validate_food_product_basis_relations(basis_relations_json)),
  source_item_id uuid references public.nutrition_source_items(id) on delete restrict,
  created_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (product_id, id),
  unique (product_id, version),
  unique (product_id, nutrition_profile_id)
);

alter table public.food_products
  add constraint food_products_current_version_fk
  foreign key (id, current_nutrition_version_id)
  references public.food_product_nutrition_versions(product_id, id)
  deferrable initially deferred;

create function public.protect_food_product_nutrition_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'IMMUTABLE_PRODUCT_NUTRITION_VERSION';
end;
$$;

create trigger protect_food_product_nutrition_version
before update or delete on public.food_product_nutrition_versions
for each row execute function public.protect_food_product_nutrition_version();

create function public.protect_food_product_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id
    or new.visibility is distinct from old.visibility
    or new.source_type is distinct from old.source_type
    or new.external_product_key is distinct from old.external_product_key
    or new.created_at is distinct from old.created_at
  then
    raise exception 'IMMUTABLE_PRODUCT_IDENTITY';
  end if;
  if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
    raise exception 'PRODUCT_DELETED';
  end if;
  return new;
end;
$$;

create trigger protect_food_product_identity
before update on public.food_products
for each row execute function public.protect_food_product_identity();

drop trigger validate_nutrition_value_insert on public.nutrition_values;

create function public.validate_product_aware_nutrition_value_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_profile public.nutrition_profiles%rowtype;
begin
  select * into v_profile from public.nutrition_profiles where id = new.profile_id;
  if v_profile.profile_kind = 'product_label'
    and v_profile.source_item_id is null
    and v_profile.normalization_method = 'as_labeled'
    and v_profile.review_status = 'self_reported'
    and v_profile.is_active
    and v_profile.created_by is not null
  then
    if new.source_nutrient_code is not null
      or new.source_unit is not null
      or new.source_token is not null
      or new.value_status <> 'observed'
      or new.amount is null
      or new.amount < 0
    then
      raise exception 'INVALID_MANUAL_PRODUCT_NUTRITION_VALUE';
    end if;
    return new;
  end if;

  if nullif(btrim(new.source_nutrient_code), '') is null or not exists (
    select 1
    from public.nutrition_profiles profile
    join public.nutrition_source_items item on item.id = profile.source_item_id
    join public.nutrition_sources source on source.id = item.source_id
    where profile.id = new.profile_id
      and profile.review_status = 'approved'
      and profile.is_active
      and item.review_status = 'approved'
      and source.freshness_status = 'current'
      and source.review_status = 'approved'
      and source.is_active
  ) then
    raise exception 'INVALID_NUTRITION_VALUE_CONTEXT';
  end if;
  return new;
end;
$$;

create trigger validate_nutrition_value_insert
before insert on public.nutrition_values
for each row execute function public.validate_product_aware_nutrition_value_insert();

create function public.validate_food_product_current_version()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_version public.food_product_nutrition_versions%rowtype;
  v_profile public.nutrition_profiles%rowtype;
  v_core_count integer;
begin
  select * into v_version
  from public.food_product_nutrition_versions
  where id = new.current_nutrition_version_id and product_id = new.id;
  if v_version.id is null then
    raise exception 'INVALID_PRODUCT_CURRENT_VERSION';
  end if;

  select * into v_profile from public.nutrition_profiles where id = v_version.nutrition_profile_id;
  if v_profile.id is null
    or v_profile.profile_kind <> 'product_label'
    or v_profile.normalization_method <> 'as_labeled'
    or v_profile.basis_amount <= 0
    or v_profile.basis_unit not in ('serving', 'package', 'g', 'ml')
    or not v_profile.is_active
  then
    raise exception 'INVALID_PRODUCT_NUTRITION_PROFILE';
  end if;

  select count(*) into v_core_count
  from public.nutrition_values value
  where value.profile_id = v_profile.id
    and value.nutrient_code in (
      'energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g', 'sodium_mg'
    )
    and value.value_status = 'observed'
    and value.amount is not null;

  if new.visibility = 'private' then
    if v_version.source_item_id is not null
      or v_version.created_by is distinct from new.owner_user_id
      or v_profile.source_item_id is not null
      or v_profile.created_by is distinct from new.owner_user_id
      or v_profile.review_status <> 'self_reported'
      or v_version.basis_relations_json <> '[]'::jsonb
      or not exists (
        select 1 from public.nutrition_values value
        where value.profile_id = v_profile.id
          and value.nutrient_code = 'energy_kcal'
          and value.value_status = 'observed'
          and value.amount is not null
      )
    then
      raise exception 'INVALID_MANUAL_PRODUCT_VERSION';
    end if;
  else
    if v_version.source_item_id is null
      or v_version.created_by is not null
      or v_profile.source_item_id is distinct from v_version.source_item_id
      or v_profile.review_status <> 'approved'
      or v_core_count <> 5
      or not exists (
        select 1
        from public.nutrition_source_items item
        join public.nutrition_sources source on source.id = item.source_id
        where item.id = v_version.source_item_id
          and item.external_item_key = new.external_product_key
          and item.review_status = 'approved'
          and source.review_status = 'approved'
          and source.freshness_status = 'current'
          and source.is_active
          and nullif(btrim(source.source_version), '') is not null
      )
    then
      raise exception 'INVALID_PUBLIC_PRODUCT_VERSION';
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger validate_food_product_current_version
after insert or update on public.food_products
deferrable initially deferred
for each row execute function public.validate_food_product_current_version();

create function public.assert_food_product_actor(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, auth
as $$
declare
  v_claim_role text := coalesce(
    current_setting('request.jwt.claim.role', true),
    current_setting('role', true),
    ''
  );
begin
  if auth.uid() is distinct from p_user_id and v_claim_role <> 'service_role' then
    raise exception 'FORBIDDEN';
  end if;
end;
$$;

create function public.insert_manual_food_product_values(
  p_profile_id uuid,
  p_values jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text;
  v_value jsonb;
  v_amount numeric;
begin
  if jsonb_typeof(p_values) <> 'object'
    or not (p_values ? 'energy_kcal')
    or p_values -> 'energy_kcal' = 'null'::jsonb
  then
    raise exception 'VALIDATION_ERROR';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_values) code
    where code not in (
      'energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g', 'sodium_mg',
      'sugars_g', 'saturated_fat_g', 'fiber_g'
    )
  ) then
    raise exception 'UNSUPPORTED_NUTRIENT';
  end if;

  for v_code, v_value in select key, value from jsonb_each(p_values)
  loop
    if v_value = 'null'::jsonb then
      continue;
    end if;
    if jsonb_typeof(v_value) <> 'number' then
      raise exception 'VALIDATION_ERROR';
    end if;
    v_amount := (v_value #>> '{}')::numeric;
    if v_amount < 0 then raise exception 'VALIDATION_ERROR'; end if;
    insert into public.nutrition_values (
      profile_id, nutrient_code, source_nutrient_code, source_unit,
      amount, value_status, source_token
    ) values (
      p_profile_id, v_code, null, null, v_amount, 'observed', null
    );
  end loop;
end;
$$;

create function public.food_product_payload(p_product_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_product public.food_products%rowtype;
  v_version public.food_product_nutrition_versions%rowtype;
  v_profile public.nutrition_profiles%rowtype;
  v_values jsonb;
  v_optional jsonb;
  v_sources jsonb;
  v_core_count integer;
begin
  select * into v_product from public.food_products where id = p_product_id;
  if v_product.id is null then return null; end if;
  select * into v_version from public.food_product_nutrition_versions
    where id = v_product.current_nutrition_version_id and product_id = v_product.id;
  select * into v_profile from public.nutrition_profiles where id = v_version.nutrition_profile_id;

  select jsonb_object_agg(core.code, jsonb_build_object(
      'amount', value.amount,
      'known_amount', null,
      'status', case when value.amount is null then 'unavailable' else 'complete' end,
      'display_mode', case when value.amount is null then null else 'total' end
    ) order by core.position),
    count(value.amount)
  into v_values, v_core_count
  from (values
    ('energy_kcal', 1), ('carbohydrate_g', 2), ('protein_g', 3),
    ('fat_g', 4), ('sodium_mg', 5)
  ) core(code, position)
  left join public.nutrition_values value
    on value.profile_id = v_profile.id and value.nutrient_code = core.code;

  select coalesce(jsonb_object_agg(value.nutrient_code, jsonb_build_object(
      'amount', value.amount,
      'known_amount', null,
      'status', 'complete',
      'display_mode', 'total'
    ) order by definition.display_order), '{}'::jsonb)
  into v_optional
  from public.nutrition_values value
  join public.nutrient_definitions definition on definition.code = value.nutrient_code
  where value.profile_id = v_profile.id and not definition.is_core
    and value.value_status = 'observed' and value.amount is not null;
  v_values := v_values || v_optional;

  if v_product.visibility = 'private' then
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
    where item.id = v_version.source_item_id
      and item.review_status = 'approved'
      and source.review_status = 'approved'
      and source.freshness_status = 'current'
      and source.is_active;
  end if;

  return jsonb_build_object(
    'id', v_product.id,
    'name', v_product.name,
    'brand', v_product.brand,
    'visibility', v_product.visibility,
    'source_type', v_product.source_type,
    'editable', v_product.visibility = 'private' and v_product.owner_user_id = p_user_id,
    'nutrition_version_id', v_version.id,
    'basis_relations', v_version.basis_relations_json,
    'nutrition', jsonb_build_object(
      'basis', jsonb_build_object('amount', v_profile.basis_amount, 'unit', v_profile.basis_unit),
      'values', v_values,
      'calculation_status', case when v_core_count = 5 then 'complete' when v_core_count > 0 then 'partial' else 'unavailable' end,
      'calculation_quality', case when v_core_count > 0 then 'direct' else null end,
      'warnings', '[]'::jsonb,
      'sources', coalesce(v_sources, '[]'::jsonb)
    )
  );
end;
$$;

create function public.create_manual_food_product(
  p_user_id uuid,
  p_name text,
  p_brand text,
  p_nutrition jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_product_id uuid := gen_random_uuid();
  v_profile_id uuid := gen_random_uuid();
  v_version_id uuid := gen_random_uuid();
  v_basis jsonb := p_nutrition -> 'basis';
begin
  perform public.assert_food_product_actor(p_user_id);
  if nullif(btrim(p_name), '') is null or length(btrim(p_name)) > 200
    or (p_brand is not null and length(btrim(p_brand)) > 200)
    or jsonb_typeof(v_basis) <> 'object'
    or jsonb_typeof(v_basis -> 'amount') <> 'number'
    or (v_basis ->> 'amount')::numeric <= 0
    or v_basis ->> 'unit' not in ('serving', 'package', 'g', 'ml')
  then
    raise exception 'VALIDATION_ERROR';
  end if;

  set constraints food_products_current_version_fk deferred;
  insert into public.food_products (
    id, owner_user_id, visibility, source_type, name, brand,
    external_product_key, current_nutrition_version_id
  ) values (
    v_product_id, p_user_id, 'private', 'manual', btrim(p_name),
    case when p_brand is null or btrim(p_brand) = '' then null else btrim(p_brand) end,
    null, v_version_id
  );
  insert into public.nutrition_profiles (
    id, source_item_id, profile_kind, normalization_method, basis_amount, basis_unit,
    version, review_status, is_active, created_by
  ) values (
    v_profile_id, null, 'product_label', 'as_labeled',
    (v_basis ->> 'amount')::numeric, v_basis ->> 'unit',
    1, 'self_reported', true, p_user_id
  );
  perform public.insert_manual_food_product_values(v_profile_id, p_nutrition -> 'values');
  insert into public.food_product_nutrition_versions (
    id, product_id, nutrition_profile_id, version, label_basis_text,
    basis_relations_json, source_item_id, created_by
  ) values (
    v_version_id, v_product_id, v_profile_id, 1, null,
    '[]'::jsonb, null, p_user_id
  );
  return public.food_product_payload(v_product_id, p_user_id);
end;
$$;

create function public.update_manual_food_product(
  p_user_id uuid,
  p_product_id uuid,
  p_patch jsonb,
  p_expected_current_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_product public.food_products%rowtype;
  v_profile_id uuid;
  v_version_id uuid;
  v_basis jsonb;
  v_next_version integer;
begin
  perform public.assert_food_product_actor(p_user_id);
  select * into v_product from public.food_products
  where id = p_product_id for update;
  if v_product.id is null then raise exception 'RESOURCE_NOT_FOUND'; end if;
  if v_product.visibility = 'public' then raise exception 'FORBIDDEN'; end if;
  if v_product.owner_user_id is distinct from p_user_id then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;
  if v_product.deleted_at is not null then raise exception 'RESOURCE_NOT_FOUND'; end if;
  if v_product.current_nutrition_version_id is distinct from p_expected_current_version_id then
    raise exception 'NUTRITION_VERSION_CONFLICT';
  end if;
  if jsonb_typeof(p_patch) <> 'object'
    or (select count(*) from jsonb_object_keys(p_patch)) = 0
    or exists (
      select 1 from jsonb_object_keys(p_patch) key
      where key not in ('name', 'brand', 'nutrition')
    )
  then
    raise exception 'VALIDATION_ERROR';
  end if;

  if p_patch ? 'name' and (
    jsonb_typeof(p_patch -> 'name') <> 'string'
    or nullif(btrim(p_patch ->> 'name'), '') is null
    or length(btrim(p_patch ->> 'name')) > 200
  ) then raise exception 'VALIDATION_ERROR'; end if;
  if p_patch ? 'brand' and p_patch -> 'brand' <> 'null'::jsonb and (
    jsonb_typeof(p_patch -> 'brand') <> 'string'
    or length(btrim(p_patch ->> 'brand')) > 200
  ) then raise exception 'VALIDATION_ERROR'; end if;

  update public.food_products
  set name = case when p_patch ? 'name' then btrim(p_patch ->> 'name') else name end,
      brand = case when p_patch ? 'brand' then nullif(btrim(p_patch ->> 'brand'), '') else brand end,
      updated_at = now()
  where id = p_product_id;

  if p_patch ? 'nutrition' then
    v_basis := p_patch -> 'nutrition' -> 'basis';
    if jsonb_typeof(v_basis) <> 'object'
      or jsonb_typeof(v_basis -> 'amount') <> 'number'
      or (v_basis ->> 'amount')::numeric <= 0
      or v_basis ->> 'unit' not in ('serving', 'package', 'g', 'ml')
    then raise exception 'VALIDATION_ERROR'; end if;
    v_profile_id := gen_random_uuid();
    v_version_id := gen_random_uuid();
    select coalesce(max(version), 0) + 1 into v_next_version
      from public.food_product_nutrition_versions where product_id = p_product_id;
    insert into public.nutrition_profiles (
      id, source_item_id, profile_kind, normalization_method, basis_amount, basis_unit,
      version, review_status, is_active, created_by
    ) values (
      v_profile_id, null, 'product_label', 'as_labeled',
      (v_basis ->> 'amount')::numeric, v_basis ->> 'unit',
      v_next_version, 'self_reported', true, p_user_id
    );
    perform public.insert_manual_food_product_values(
      v_profile_id, p_patch -> 'nutrition' -> 'values'
    );
    insert into public.food_product_nutrition_versions (
      id, product_id, nutrition_profile_id, version, label_basis_text,
      basis_relations_json, source_item_id, created_by
    ) values (
      v_version_id, p_product_id, v_profile_id, v_next_version, null,
      '[]'::jsonb, null, p_user_id
    );
    update public.food_products
    set current_nutrition_version_id = v_version_id, updated_at = now()
    where id = p_product_id
      and current_nutrition_version_id = p_expected_current_version_id;
    if not found then raise exception 'NUTRITION_VERSION_CONFLICT'; end if;
  end if;
  return public.food_product_payload(p_product_id, p_user_id);
end;
$$;

create function public.delete_manual_food_product(p_user_id uuid, p_product_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_product public.food_products%rowtype;
begin
  perform public.assert_food_product_actor(p_user_id);
  select * into v_product from public.food_products where id = p_product_id for update;
  if v_product.id is null then raise exception 'RESOURCE_NOT_FOUND'; end if;
  if v_product.visibility = 'public' then raise exception 'FORBIDDEN'; end if;
  if v_product.owner_user_id is distinct from p_user_id then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;
  if v_product.deleted_at is null then
    update public.food_products set deleted_at = now(), updated_at = now()
    where id = p_product_id and owner_user_id = p_user_id and deleted_at is null;
  end if;
  return jsonb_build_object('deleted', true);
end;
$$;

create function public.list_food_products(
  p_user_id uuid,
  p_query text default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_items jsonb := '[]'::jsonb;
  v_has_next boolean := false;
  v_last_created_at timestamptz;
  v_last_id uuid;
  v_cursor text;
begin
  perform public.assert_food_product_actor(p_user_id);
  if p_limit < 1 or p_limit > 50
    or ((p_cursor_created_at is null) <> (p_cursor_id is null))
  then raise exception 'VALIDATION_ERROR'; end if;

  with eligible as materialized (
    select product.*
    from public.food_products product
    where product.deleted_at is null
      and (
        (
          product.visibility = 'public'
          and exists (
            select 1
            from public.food_product_nutrition_versions admitted_version
            join public.nutrition_profiles admitted_profile
              on admitted_profile.id = admitted_version.nutrition_profile_id
            join public.nutrition_source_items admitted_item
              on admitted_item.id = admitted_version.source_item_id
            join public.nutrition_sources admitted_source
              on admitted_source.id = admitted_item.source_id
            where admitted_version.id = product.current_nutrition_version_id
              and admitted_version.product_id = product.id
              and admitted_profile.source_item_id = admitted_item.id
              and admitted_profile.profile_kind = 'product_label'
              and admitted_profile.review_status = 'approved'
              and admitted_profile.is_active
              and admitted_item.external_item_key = product.external_product_key
              and admitted_item.review_status = 'approved'
              and admitted_source.review_status = 'approved'
              and admitted_source.freshness_status = 'current'
              and admitted_source.is_active
              and nullif(btrim(admitted_source.source_version), '') is not null
              and (
                select count(*)
                from public.nutrition_values admitted_value
                where admitted_value.profile_id = admitted_profile.id
                  and admitted_value.nutrient_code in (
                    'energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g', 'sodium_mg'
                  )
                  and admitted_value.value_status = 'observed'
                  and admitted_value.amount is not null
              ) = 5
          )
        )
        or (product.visibility = 'private' and product.owner_user_id = p_user_id)
      )
      and (
        nullif(btrim(p_query), '') is null
        or product.name ilike '%' || btrim(p_query) || '%'
        or coalesce(product.brand, '') ilike '%' || btrim(p_query) || '%'
      )
      and (
        p_cursor_created_at is null
        or product.created_at < p_cursor_created_at
        or (product.created_at = p_cursor_created_at and product.id < p_cursor_id)
      )
    order by product.created_at desc, product.id desc
    limit p_limit + 1
  ), page as materialized (
    select * from eligible
    order by created_at desc, id desc
    limit p_limit
  ), context as materialized (
    select product.*,
      version.id as nutrition_version_id,
      version.basis_relations_json,
      version.source_item_id,
      profile.id as profile_id,
      profile.basis_amount,
      profile.basis_unit
    from page product
    join public.food_product_nutrition_versions version
      on version.id = product.current_nutrition_version_id
      and version.product_id = product.id
    join public.nutrition_profiles profile on profile.id = version.nutrition_profile_id
  ), core_values as (
    select context.id,
      jsonb_object_agg(core.code, jsonb_build_object(
        'amount', value.amount,
        'known_amount', null,
        'status', case when value.amount is null then 'unavailable' else 'complete' end,
        'display_mode', case when value.amount is null then null else 'total' end
      ) order by core.position) as values_json,
      count(value.amount) as observed_count
    from context
    cross join (values
      ('energy_kcal', 1), ('carbohydrate_g', 2), ('protein_g', 3),
      ('fat_g', 4), ('sodium_mg', 5)
    ) core(code, position)
    left join public.nutrition_values value
      on value.profile_id = context.profile_id and value.nutrient_code = core.code
    group by context.id
  ), optional_values as (
    select context.id,
      jsonb_object_agg(value.nutrient_code, jsonb_build_object(
        'amount', value.amount,
        'known_amount', null,
        'status', 'complete',
        'display_mode', 'total'
      ) order by definition.display_order) as values_json
    from context
    join public.nutrition_values value on value.profile_id = context.profile_id
    join public.nutrient_definitions definition on definition.code = value.nutrient_code
    where not definition.is_core
      and value.value_status = 'observed'
      and value.amount is not null
    group by context.id
  ), source_projection as (
    select context.id,
      jsonb_build_array(jsonb_build_object(
        'provider', source.provider_code,
        'dataset', source.dataset_name,
        'source_version', source.source_version,
        'data_basis_date', source.data_basis_date,
        'license', source.license_name,
        'source_url', source.source_url
      )) as sources_json
    from context
    join public.nutrition_source_items item on item.id = context.source_item_id
    join public.nutrition_sources source on source.id = item.source_id
    where context.visibility = 'public'
      and item.review_status = 'approved'
      and source.review_status = 'approved'
      and source.freshness_status = 'current'
      and source.is_active
  ), payloads as (
    select context.id, context.created_at,
      jsonb_build_object(
        'id', context.id,
        'name', context.name,
        'brand', context.brand,
        'visibility', context.visibility,
        'source_type', context.source_type,
        'editable', context.visibility = 'private' and context.owner_user_id = p_user_id,
        'nutrition_version_id', context.nutrition_version_id,
        'basis_relations', context.basis_relations_json,
        'nutrition', jsonb_build_object(
          'basis', jsonb_build_object('amount', context.basis_amount, 'unit', context.basis_unit),
          'values', core.values_json || coalesce(optional.values_json, '{}'::jsonb),
          'calculation_status', case
            when core.observed_count = 5 then 'complete'
            when core.observed_count > 0 then 'partial'
            else 'unavailable'
          end,
          'calculation_quality', case when core.observed_count > 0 then 'direct' else null end,
          'warnings', '[]'::jsonb,
          'sources', case when context.visibility = 'private'
            then jsonb_build_array(jsonb_build_object(
              'provider', 'user_label', 'dataset', null, 'source_version', null,
              'data_basis_date', null, 'license', null, 'source_url', null
            ))
            else coalesce(source.sources_json, '[]'::jsonb)
          end
        )
      ) as payload
    from context
    join core_values core on core.id = context.id
    left join optional_values optional on optional.id = context.id
    left join source_projection source on source.id = context.id
  )
  select
    coalesce((select jsonb_agg(payload order by created_at desc, id desc) from payloads), '[]'::jsonb),
    (select count(*) > p_limit from eligible),
    (select created_at from page order by created_at asc, id asc limit 1),
    (select id from page order by created_at asc, id asc limit 1)
  into v_items, v_has_next, v_last_created_at, v_last_id;

  if v_has_next then
    v_cursor := translate(rtrim(regexp_replace(encode(convert_to(
      jsonb_build_object(
        'created_at', to_char(v_last_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'id', v_last_id
      )::text,
      'UTF8'
    ), 'base64'), E'\\s', '', 'g'), '='), '+/', '-_');
  end if;
  return jsonb_build_object(
    'items', v_items,
    'next_cursor', case when v_has_next then v_cursor else null end,
    'has_next', v_has_next
  );
end;
$$;

alter table public.food_products enable row level security;
alter table public.food_product_nutrition_versions enable row level security;

create policy food_products_select_visible on public.food_products
for select to authenticated
using (
  deleted_at is null and (
    visibility = 'public'
    or (visibility = 'private' and owner_user_id = auth.uid())
  )
);

create policy food_products_update_private_owner on public.food_products
for update to authenticated
using (visibility = 'private' and owner_user_id = auth.uid())
with check (visibility = 'private' and owner_user_id = auth.uid());

create policy food_product_versions_select_visible
on public.food_product_nutrition_versions
for select to authenticated
using (exists (
  select 1 from public.food_products product
  where product.id = product_id
    and (
      product.visibility = 'public'
      or (product.visibility = 'private' and product.owner_user_id = auth.uid())
    )
));

revoke all on table public.food_products from anon, authenticated, service_role;
grant select on table public.food_products to authenticated, service_role;
grant update (name, brand, deleted_at, updated_at) on table public.food_products to authenticated;
revoke all on table public.food_product_nutrition_versions from anon, authenticated, service_role;
grant select on table public.food_product_nutrition_versions to authenticated, service_role;
revoke truncate on table public.food_products, public.food_product_nutrition_versions
  from anon, authenticated, service_role;

revoke all on function public.validate_food_product_basis_relations(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.protect_food_product_nutrition_version()
  from public, anon, authenticated, service_role;
revoke all on function public.protect_food_product_identity()
  from public, anon, authenticated, service_role;
revoke all on function public.validate_product_aware_nutrition_value_insert()
  from public, anon, authenticated, service_role;
revoke all on function public.validate_food_product_current_version()
  from public, anon, authenticated, service_role;
revoke all on function public.assert_food_product_actor(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.insert_manual_food_product_values(uuid, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.food_product_payload(uuid, uuid)
  from public, anon, authenticated, service_role;

revoke all on function public.create_manual_food_product(uuid, text, text, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.create_manual_food_product(uuid, text, text, jsonb)
  to authenticated, service_role;
revoke all on function public.update_manual_food_product(uuid, uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.update_manual_food_product(uuid, uuid, jsonb, uuid)
  to authenticated, service_role;
revoke all on function public.delete_manual_food_product(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_manual_food_product(uuid, uuid)
  to authenticated, service_role;
revoke all on function public.list_food_products(uuid, text, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_food_products(uuid, text, timestamptz, uuid, integer)
  to authenticated, service_role;
