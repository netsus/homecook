-- Promote newly-created manual products into the shared catalog while keeping
-- historical private/manual rows private. All public identity and moderation
-- fields remain server-controlled.

alter table public.food_products
  add column moderation_status varchar(20) not null default 'visible'
  check (moderation_status in ('visible', 'hidden_by_report', 'hidden_by_operator')),
  add constraint food_products_visibility_moderation_check
    check (visibility = 'public' or moderation_status = 'visible'),
  add constraint food_products_source_moderation_check
    check (source_type = 'manual' or moderation_status in ('visible', 'hidden_by_operator'));

alter table public.food_products drop constraint food_products_check;
alter table public.food_products
  add constraint food_products_visibility_source_owner_check check (
    (
      visibility = 'public'
      and source_type = 'public_dataset'
      and owner_user_id is null
      and nullif(btrim(external_product_key), '') is not null
    )
    or (
      visibility = 'public'
      and source_type = 'manual'
      and external_product_key is null
    )
    or (
      visibility = 'private'
      and source_type = 'manual'
      and owner_user_id is not null
      and external_product_key is null
    )
  );

create index food_products_shared_catalog_order_idx
  on public.food_products (source_type, created_at desc, id desc)
  where deleted_at is null and visibility = 'public' and moderation_status = 'visible';

create table public.food_product_reports (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.food_products(id) on delete restrict,
  reporter_user_id uuid not null references public.users(id) on delete cascade,
  reason_code varchar(30) not null
    check (reason_code in ('spam', 'incorrect_nutrition', 'duplicate', 'rights', 'unsafe', 'other')),
  detail_text text,
  report_status varchar(20) not null default 'pending'
    check (report_status in ('pending', 'acknowledged', 'resolved', 'dismissed')),
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (product_id, reporter_user_id),
  check (
    report_status = 'pending'
    or (reviewed_by is not null and reviewed_at is not null)
  )
);

create index food_product_reports_product_created_idx
  on public.food_product_reports (product_id, created_at desc, id desc);

create or replace function public.assert_food_product_actor(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, auth
as $$
declare
  v_session_role text := current_setting('role', true);
begin
  if p_user_id is null then
    raise exception 'VALIDATION_ERROR';
  end if;
  if auth.uid() is distinct from p_user_id and v_session_role <> 'service_role' then
    raise exception 'FORBIDDEN';
  end if;
end;
$$;

-- Account deletion is the only transition that may anonymize an owned shared
-- product and its immutable authorship pointers. The transaction-local marker
-- is set only inside delete_user_private_data; direct table grants still deny
-- clients access to these columns.
create or replace function public.protect_food_product_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('role', true) = 'service_role'
    and new.moderation_status is distinct from old.moderation_status
    and (to_jsonb(old) - 'moderation_status' - 'updated_at')
      = (to_jsonb(new) - 'moderation_status' - 'updated_at')
  then
    return new;
  end if;

  if old.visibility = 'public'
    and old.source_type = 'manual'
    and old.owner_user_id is not null
    and new.owner_user_id is null
    and current_setting('homecook.account_delete_user_id', true) = old.owner_user_id::text
    and (to_jsonb(old) - 'owner_user_id' - 'updated_at')
      = (to_jsonb(new) - 'owner_user_id' - 'updated_at')
  then
    return new;
  end if;

  if new.owner_user_id is distinct from old.owner_user_id
    or new.visibility is distinct from old.visibility
    or new.source_type is distinct from old.source_type
    or new.external_product_key is distinct from old.external_product_key
    or new.moderation_status is distinct from old.moderation_status
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

create or replace function public.protect_food_product_nutrition_version()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE'
    and current_setting('homecook.account_delete_user_id', true) = old.created_by::text
    and exists (
      select 1
      from public.food_products product
      where product.id = old.product_id
        and product.visibility = 'private'
        and product.source_type = 'manual'
        and product.owner_user_id = old.created_by
    )
  then
    return old;
  end if;

  if tg_op = 'UPDATE'
    and old.created_by is not null
    and new.created_by is null
    and current_setting('homecook.account_delete_user_id', true) = old.created_by::text
    and (to_jsonb(old) - 'created_by') = (to_jsonb(new) - 'created_by')
    and exists (
      select 1
      from public.food_products product
      where product.id = old.product_id
        and product.visibility = 'public'
        and product.source_type = 'manual'
        and product.owner_user_id is null
    )
  then
    return new;
  end if;
  raise exception 'IMMUTABLE_PRODUCT_NUTRITION_VERSION';
end;
$$;

create or replace function public.protect_nutrition_model_row()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_payload jsonb;
  new_payload jsonb;
  allowed_transition boolean := false;
begin
  if tg_op = 'DELETE'
    and tg_table_name in ('nutrition_profiles', 'nutrition_values')
    and nullif(current_setting('homecook.account_delete_user_id', true), '') is not null
    and (
      (
        tg_table_name = 'nutrition_profiles'
        and (to_jsonb(old) ->> 'id')::uuid = any(
          string_to_array(current_setting('homecook.account_delete_profile_ids', true), ',')::uuid[]
        )
      )
      or (
        tg_table_name = 'nutrition_values'
        and (to_jsonb(old) ->> 'profile_id')::uuid = any(
          string_to_array(current_setting('homecook.account_delete_profile_ids', true), ',')::uuid[]
        )
      )
    )
  then
    return old;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'DELETE_NOT_ALLOWED';
  end if;

  if tg_table_name = 'nutrition_profiles'
    and to_jsonb(old) ->> 'created_by' is not null
    and to_jsonb(new) ->> 'created_by' is null
    and current_setting('homecook.account_delete_user_id', true) = to_jsonb(old) ->> 'created_by'
    and (to_jsonb(old) - 'created_by') = (to_jsonb(new) - 'created_by')
    and exists (
      select 1
      from public.food_product_nutrition_versions version
      join public.food_products product on product.id = version.product_id
      where version.nutrition_profile_id = (to_jsonb(old) ->> 'id')::uuid
        and product.visibility = 'public'
        and product.source_type = 'manual'
        and product.owner_user_id is null
    )
  then
    return new;
  end if;

  if tg_table_name in ('nutrient_definitions', 'nutrition_values') then
    raise exception 'IMMUTABLE_NUTRITION_PAYLOAD';
  elsif tg_table_name = 'measurement_conversion_profiles' then
    old_payload := to_jsonb(old) - 'is_active';
    new_payload := to_jsonb(new) - 'is_active';
    if old_payload is distinct from new_payload or old.is_active = false or new.is_active = true then
      raise exception 'IMMUTABLE_NUTRITION_PAYLOAD';
    end if;
    return new;
  elsif tg_table_name = 'nutrition_sources' then
    old_payload := to_jsonb(old) - 'freshness_checked_at' - 'freshness_status' - 'review_status' - 'decision_reason' - 'reviewed_by' - 'reviewed_at' - 'is_active' - 'superseded_by_id';
    new_payload := to_jsonb(new) - 'freshness_checked_at' - 'freshness_status' - 'review_status' - 'decision_reason' - 'reviewed_by' - 'reviewed_at' - 'is_active' - 'superseded_by_id';
    allowed_transition := (old.review_status in ('pending', 'needs_source_check') and new.review_status in ('approved', 'rejected')) or (old.review_status = 'approved' and new.review_status = 'superseded');
  elsif tg_table_name = 'nutrition_source_items' then
    old_payload := to_jsonb(old) - 'review_status' - 'decision_reason' - 'reviewed_by' - 'reviewed_at';
    new_payload := to_jsonb(new) - 'review_status' - 'decision_reason' - 'reviewed_by' - 'reviewed_at';
    allowed_transition := (old.review_status in ('pending', 'needs_review', 'needs_source_check') and new.review_status in ('approved', 'rejected')) or (old.review_status = 'approved' and new.review_status = 'superseded');
  elsif tg_table_name in ('nutrition_profiles', 'ingredient_nutrition_profiles', 'piece_unit_weights') then
    old_payload := to_jsonb(old) - 'review_status' - 'decision_reason' - 'reviewed_by' - 'reviewed_at' - 'is_active' - 'superseded_by_id' - 'is_primary';
    new_payload := to_jsonb(new) - 'review_status' - 'decision_reason' - 'reviewed_by' - 'reviewed_at' - 'is_active' - 'superseded_by_id' - 'is_primary';
    allowed_transition := (old.review_status in ('pending', 'needs_review') and new.review_status in ('approved', 'rejected')) or (old.review_status = 'approved' and new.review_status in ('revoked', 'superseded'));
  elsif tg_table_name = 'measurement_source_evidence' then
    old_payload := to_jsonb(old) - 'review_status' - 'decision_reason' - 'reviewed_by' - 'reviewed_at' - 'is_active' - 'superseded_by_id';
    new_payload := to_jsonb(new) - 'review_status' - 'decision_reason' - 'reviewed_by' - 'reviewed_at' - 'is_active' - 'superseded_by_id';
    allowed_transition := (old.review_status in ('pending', 'needs_source_check') and new.review_status in ('approved', 'rejected')) or (old.review_status = 'approved' and new.review_status = 'superseded');
  elsif tg_table_name = 'ingredient_conversion_assignments' then
    old_payload := to_jsonb(old) - 'review_status' - 'assignment_reason' - 'reviewed_by' - 'reviewed_at' - 'is_active' - 'superseded_by_id';
    new_payload := to_jsonb(new) - 'review_status' - 'assignment_reason' - 'reviewed_by' - 'reviewed_at' - 'is_active' - 'superseded_by_id';
    allowed_transition := (old.review_status in ('pending', 'needs_review') and new.review_status in ('approved', 'rejected')) or (old.review_status = 'approved' and new.review_status in ('revoked', 'superseded'));
  end if;

  if old_payload is distinct from new_payload then
    raise exception 'IMMUTABLE_NUTRITION_PAYLOAD';
  end if;
  if not allowed_transition then
    raise exception 'INVALID_REVIEW_TRANSITION';
  end if;
  return new;
end;
$$;

create or replace function public.validate_food_product_current_version()
returns trigger
language plpgsql
security definer
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
  if v_version.id is null then raise exception 'INVALID_PRODUCT_CURRENT_VERSION'; end if;

  select * into v_profile from public.nutrition_profiles where id = v_version.nutrition_profile_id;
  if v_profile.id is null
    or v_profile.profile_kind <> 'product_label'
    or v_profile.normalization_method <> 'as_labeled'
    or v_profile.basis_amount <= 0
    or v_profile.basis_unit not in ('serving', 'package', 'g', 'ml')
    or not v_profile.is_active
  then raise exception 'INVALID_PRODUCT_NUTRITION_PROFILE'; end if;

  select count(*) into v_core_count
  from public.nutrition_values value
  where value.profile_id = v_profile.id
    and value.nutrient_code in ('energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g', 'sodium_mg')
    and value.value_status = 'observed'
    and value.amount is not null;

  if new.source_type = 'manual' then
    if v_version.source_item_id is not null
      or v_profile.source_item_id is not null
      or v_profile.review_status <> 'self_reported'
      or v_version.basis_relations_json <> '[]'::jsonb
      or v_version.created_by is distinct from new.owner_user_id
      or v_profile.created_by is distinct from new.owner_user_id
      or (new.visibility = 'public' and v_profile.basis_unit not in ('g', 'ml'))
      or not exists (
        select 1 from public.nutrition_values value
        where value.profile_id = v_profile.id
          and value.nutrient_code = 'energy_kcal'
          and value.value_status = 'observed'
          and value.amount is not null
      )
    then raise exception 'INVALID_MANUAL_PRODUCT_VERSION'; end if;
  else
    if new.visibility <> 'public'
      or v_version.source_item_id is null
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
          and item.source_basis_amount is not null
          and item.source_basis_amount = v_profile.basis_amount
          and item.source_basis_unit = v_profile.basis_unit
          and item.review_status = 'approved'
          and source.review_status = 'approved'
          and source.freshness_status = 'current'
          and source.is_active
          and nullif(btrim(source.source_version), '') is not null
      )
    then raise exception 'INVALID_PUBLIC_PRODUCT_VERSION'; end if;
  end if;
  return null;
end;
$$;

create or replace function public.food_product_payload(p_product_id uuid, p_user_id uuid)
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

  if v_product.source_type = 'manual' then
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
    'editable', v_product.source_type = 'manual'
      and v_product.owner_user_id = p_user_id
      and v_product.moderation_status = 'visible'
      and v_product.deleted_at is null,
    'nutrition_version_id', v_version.id,
    'basis_relations', v_version.basis_relations_json,
    'nutrition', jsonb_build_object(
      'basis', jsonb_build_object('amount', v_profile.basis_amount, 'unit', v_profile.basis_unit),
      'label_basis_text', v_version.label_basis_text,
      'values', v_values,
      'calculation_status', case when v_core_count = 5 then 'complete' when v_core_count > 0 then 'partial' else 'unavailable' end,
      'calculation_quality', case when v_core_count > 0 then 'direct' else null end,
      'warnings', '[]'::jsonb,
      'sources', coalesce(v_sources, '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.create_manual_food_product(
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
  v_label_basis_text text;
begin
  perform public.assert_food_product_actor(p_user_id);
  if nullif(btrim(p_name), '') is null or length(btrim(p_name)) > 200
    or (p_brand is not null and length(btrim(p_brand)) > 200)
    or p_nutrition is null
    or jsonb_typeof(p_nutrition) <> 'object'
    or not (p_nutrition ? 'basis')
    or not (p_nutrition ? 'values')
    or exists (
      select 1 from jsonb_object_keys(p_nutrition) key
      where key not in ('basis', 'label_basis_text', 'values')
    )
    or jsonb_typeof(v_basis) <> 'object'
    or (select count(*) from jsonb_object_keys(v_basis)) <> 2
    or jsonb_typeof(v_basis -> 'amount') <> 'number'
    or (v_basis ->> 'amount')::numeric <= 0
    or round((v_basis ->> 'amount')::numeric, 4) >= 100000000
    or v_basis ->> 'unit' not in ('g', 'ml')
    or (
      p_nutrition ? 'label_basis_text'
      and p_nutrition -> 'label_basis_text' <> 'null'::jsonb
      and jsonb_typeof(p_nutrition -> 'label_basis_text') <> 'string'
    )
  then raise exception 'VALIDATION_ERROR'; end if;
  v_label_basis_text := case
    when p_nutrition -> 'label_basis_text' = 'null'::jsonb then null
    else nullif(btrim(p_nutrition ->> 'label_basis_text'), '')
  end;

  set constraints food_products_current_version_fk deferred;
  insert into public.food_products (
    id, owner_user_id, visibility, source_type, moderation_status, name, brand,
    external_product_key, current_nutrition_version_id
  ) values (
    v_product_id, p_user_id, 'public', 'manual', 'visible', btrim(p_name),
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
    v_version_id, v_product_id, v_profile_id, 1, v_label_basis_text,
    '[]'::jsonb, null, p_user_id
  );
  return public.food_product_payload(v_product_id, p_user_id);
end;
$$;

create or replace function public.update_manual_food_product(
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
  v_nutrition jsonb;
  v_label_basis_text text;
  v_next_version integer;
begin
  perform public.assert_food_product_actor(p_user_id);
  select * into v_product from public.food_products where id = p_product_id for update;
  if v_product.id is null then raise exception 'RESOURCE_NOT_FOUND'; end if;
  if v_product.source_type <> 'manual' or v_product.owner_user_id is distinct from p_user_id then
    raise exception 'FORBIDDEN';
  end if;
  if v_product.moderation_status <> 'visible' then raise exception 'PRODUCT_MODERATION_LOCKED'; end if;
  if v_product.deleted_at is not null then raise exception 'RESOURCE_NOT_FOUND'; end if;
  if v_product.current_nutrition_version_id is distinct from p_expected_current_version_id then
    raise exception 'NUTRITION_VERSION_CONFLICT';
  end if;
  if jsonb_typeof(p_patch) <> 'object'
    or (select count(*) from jsonb_object_keys(p_patch)) = 0
    or exists (select 1 from jsonb_object_keys(p_patch) key where key not in ('name', 'brand', 'nutrition'))
  then raise exception 'VALIDATION_ERROR'; end if;
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
    v_nutrition := p_patch -> 'nutrition';
    v_basis := v_nutrition -> 'basis';
    if jsonb_typeof(v_nutrition) <> 'object'
      or exists (
        select 1 from jsonb_object_keys(v_nutrition) key
        where key not in ('basis', 'label_basis_text', 'values')
      )
      or jsonb_typeof(v_basis) <> 'object'
      or (select count(*) from jsonb_object_keys(v_basis)) <> 2
      or jsonb_typeof(v_basis -> 'amount') <> 'number'
      or (v_basis ->> 'amount')::numeric <= 0
      or round((v_basis ->> 'amount')::numeric, 4) >= 100000000
      or v_basis ->> 'unit' not in ('g', 'ml')
      or (
        v_nutrition ? 'label_basis_text'
        and v_nutrition -> 'label_basis_text' <> 'null'::jsonb
        and jsonb_typeof(v_nutrition -> 'label_basis_text') <> 'string'
      )
    then raise exception 'VALIDATION_ERROR'; end if;
    v_label_basis_text := case
      when v_nutrition -> 'label_basis_text' = 'null'::jsonb then null
      else nullif(btrim(v_nutrition ->> 'label_basis_text'), '')
    end;
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
    perform public.insert_manual_food_product_values(v_profile_id, v_nutrition -> 'values');
    insert into public.food_product_nutrition_versions (
      id, product_id, nutrition_profile_id, version, label_basis_text,
      basis_relations_json, source_item_id, created_by
    ) values (
      v_version_id, p_product_id, v_profile_id, v_next_version, v_label_basis_text,
      '[]'::jsonb, null, p_user_id
    );
    update public.food_products
    set current_nutrition_version_id = v_version_id, updated_at = now()
    where id = p_product_id and current_nutrition_version_id = p_expected_current_version_id;
    if not found then raise exception 'NUTRITION_VERSION_CONFLICT'; end if;
  end if;
  return public.food_product_payload(p_product_id, p_user_id);
end;
$$;

create or replace function public.delete_manual_food_product(p_user_id uuid, p_product_id uuid)
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
  if v_product.source_type <> 'manual' or v_product.owner_user_id is distinct from p_user_id then
    raise exception 'FORBIDDEN';
  end if;
  if v_product.deleted_at is not null then return jsonb_build_object('deleted', true); end if;
  if v_product.moderation_status <> 'visible' then raise exception 'PRODUCT_MODERATION_LOCKED'; end if;
  update public.food_products set deleted_at = now(), updated_at = now()
  where id = p_product_id and owner_user_id = p_user_id and deleted_at is null;
  return jsonb_build_object('deleted', true);
end;
$$;

create function public.report_food_product(
  p_user_id uuid,
  p_product_id uuid,
  p_reason_code text,
  p_detail_text text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_product public.food_products%rowtype;
begin
  perform public.assert_food_product_actor(p_user_id);
  if p_reason_code is null
    or p_reason_code not in ('spam', 'incorrect_nutrition', 'duplicate', 'rights', 'unsafe', 'other')
  then
    raise exception 'VALIDATION_ERROR';
  end if;
  select * into v_product from public.food_products where id = p_product_id for share;
  if v_product.id is null then raise exception 'RESOURCE_NOT_FOUND'; end if;
  if v_product.owner_user_id = p_user_id then raise exception 'FORBIDDEN'; end if;
  if v_product.visibility <> 'public'
    or v_product.source_type <> 'manual'
    or v_product.moderation_status <> 'visible'
    or v_product.deleted_at is not null
  then raise exception 'PRODUCT_REPORT_NOT_ALLOWED'; end if;
  begin
    insert into public.food_product_reports (
      product_id, reporter_user_id, reason_code, detail_text
    ) values (
      p_product_id, p_user_id, p_reason_code, nullif(btrim(p_detail_text), '')
    );
  exception when unique_violation then
    raise exception 'PRODUCT_ALREADY_REPORTED';
  end;
  return jsonb_build_object('reported', true);
end;
$$;

create function public.list_food_products(
  p_user_id uuid,
  p_query text,
  p_source text,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_limit integer
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
  v_cursor_partition integer;
  v_cursor text;
begin
  perform public.assert_food_product_actor(p_user_id);
  if p_source is null
    or p_source not in ('all', 'public_dataset', 'manual')
    or p_limit is null or p_limit < 1 or p_limit > 50
    or ((p_cursor_created_at is null) <> (p_cursor_id is null))
  then raise exception 'VALIDATION_ERROR'; end if;

  if p_cursor_id is not null then
    select case
      when product.source_type = 'public_dataset' then 1
      when product.visibility = 'public' and product.source_type = 'manual' then 2
      else 3
    end
    into v_cursor_partition
    from public.food_products product
    where product.id = p_cursor_id
      and product.created_at = p_cursor_created_at
      and product.deleted_at is null
      and product.moderation_status = 'visible'
      and (
        (product.visibility = 'public' and product.source_type in ('public_dataset', 'manual'))
        or (product.visibility = 'private' and product.source_type = 'manual' and product.owner_user_id = p_user_id)
      )
      and (
        p_source = 'all'
        or (p_source = 'public_dataset' and product.source_type = 'public_dataset')
        or (p_source = 'manual' and product.source_type = 'manual')
      );
    if v_cursor_partition is null then raise exception 'VALIDATION_ERROR'; end if;
  end if;

  with eligible as materialized (
    select product.*,
      case
        when product.source_type = 'public_dataset' then 1
        when product.visibility = 'public' and product.source_type = 'manual' then 2
        else 3
      end as partition_rank
    from public.food_products product
    where product.deleted_at is null
      and product.moderation_status = 'visible'
      and (
        (
          product.visibility = 'public'
          and product.source_type = 'public_dataset'
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
              and admitted_profile.normalization_method = 'as_labeled'
              and admitted_profile.review_status = 'approved'
              and admitted_profile.is_active
              and admitted_item.external_item_key = product.external_product_key
              and admitted_item.source_basis_amount is not null
              and admitted_item.source_basis_amount = admitted_profile.basis_amount
              and admitted_item.source_basis_unit = admitted_profile.basis_unit
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
        or (product.visibility = 'public' and product.source_type = 'manual')
        or (product.visibility = 'private' and product.source_type = 'manual' and product.owner_user_id = p_user_id)
      )
      and (
        p_source = 'all'
        or (p_source = 'public_dataset' and product.source_type = 'public_dataset')
        or (p_source = 'manual' and product.source_type = 'manual')
      )
      and (
        nullif(btrim(p_query), '') is null
        or product.name ilike '%' || btrim(p_query) || '%'
        or coalesce(product.brand, '') ilike '%' || btrim(p_query) || '%'
      )
      and (
        v_cursor_partition is null
        or case
          when product.source_type = 'public_dataset' then 1
          when product.visibility = 'public' and product.source_type = 'manual' then 2
          else 3
        end > v_cursor_partition
        or (
          case
            when product.source_type = 'public_dataset' then 1
            when product.visibility = 'public' and product.source_type = 'manual' then 2
            else 3
          end = v_cursor_partition
          and (
            product.created_at < p_cursor_created_at
            or (product.created_at = p_cursor_created_at and product.id < p_cursor_id)
          )
        )
      )
    order by partition_rank asc, product.created_at desc, product.id desc
    limit p_limit + 1
  ), page as materialized (
    select * from eligible
    order by partition_rank asc, created_at desc, id desc
    limit p_limit
  ), context as materialized (
    select product.*,
      version.id as nutrition_version_id,
      version.label_basis_text,
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
    where context.source_type = 'public_dataset'
      and item.review_status = 'approved'
      and source.review_status = 'approved'
      and source.freshness_status = 'current'
      and source.is_active
  ), payloads as (
    select context.id, context.partition_rank, context.created_at,
      jsonb_build_object(
        'id', context.id,
        'name', context.name,
        'brand', context.brand,
        'visibility', context.visibility,
        'source_type', context.source_type,
        'editable', context.source_type = 'manual'
          and context.owner_user_id = p_user_id
          and context.moderation_status = 'visible',
        'nutrition_version_id', context.nutrition_version_id,
        'basis_relations', context.basis_relations_json,
        'nutrition', jsonb_build_object(
          'basis', jsonb_build_object('amount', context.basis_amount, 'unit', context.basis_unit),
          'label_basis_text', context.label_basis_text,
          'values', core.values_json || coalesce(optional.values_json, '{}'::jsonb),
          'calculation_status', case
            when core.observed_count = 5 then 'complete'
            when core.observed_count > 0 then 'partial'
            else 'unavailable'
          end,
          'calculation_quality', case when core.observed_count > 0 then 'direct' else null end,
          'warnings', '[]'::jsonb,
          'sources', case when context.source_type = 'manual'
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
    coalesce((
      select jsonb_agg(payload order by partition_rank asc, created_at desc, id desc)
      from payloads
    ), '[]'::jsonb),
    (select count(*) > p_limit from eligible),
    (select created_at from page order by partition_rank desc, created_at asc, id asc limit 1),
    (select id from page order by partition_rank desc, created_at asc, id asc limit 1)
  into v_items, v_has_next, v_last_created_at, v_last_id;

  if v_has_next then
    v_cursor := translate(rtrim(regexp_replace(encode(convert_to(
      jsonb_build_object(
        'created_at', to_char(v_last_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
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

-- Backward-compatible SQL overload for internal callers that predate source
-- filtering. The public HTTP contract uses the six-argument function above.
create or replace function public.list_food_products(
  p_user_id uuid,
  p_query text default null,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.list_food_products(
    p_user_id, p_query, 'all', p_cursor_created_at, p_cursor_id, p_limit
  )
$$;

create or replace function public.create_product_planner_entry(
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
  from public.meal_plan_columns where id = p_column_id for update;
  if v_column_user_id is null then raise exception 'RESOURCE_NOT_FOUND'; end if;
  if v_column_user_id is distinct from p_user_id then raise exception 'FORBIDDEN'; end if;

  select * into v_product from public.food_products where id = p_product_id for update;
  if v_product.id is null then raise exception 'RESOURCE_NOT_FOUND'; end if;
  if v_product.visibility = 'private' and v_product.owner_user_id is distinct from p_user_id then
    raise exception 'FORBIDDEN';
  end if;
  if v_product.deleted_at is not null then raise exception 'PRODUCT_DELETED'; end if;
  if v_product.visibility = 'public' and v_product.moderation_status <> 'visible' then
    raise exception 'PRODUCT_HIDDEN';
  end if;
  if v_product.current_nutrition_version_id is null
    or p_expected_current_version_id is null
    or v_product.current_nutrition_version_id is distinct from p_expected_current_version_id
  then raise exception 'NUTRITION_VERSION_CONFLICT'; end if;

  perform public.product_planner_quantity_scale(
    v_product.current_nutrition_version_id, p_quantity_amount, p_quantity_unit
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

create or replace function public.delete_user_private_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_authored_recipe_ids uuid[] := '{}'::uuid[];
  v_saved_recipe_ids uuid[] := '{}'::uuid[];
  v_liked_recipe_ids uuid[] := '{}'::uuid[];
  v_legacy_private_product_ids uuid[] := '{}'::uuid[];
  v_legacy_private_profile_ids uuid[] := '{}'::uuid[];
  v_deleted_user_count integer := 0;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'cannot delete another user private data' using errcode = '42501';
  end if;
  perform set_config('homecook.account_delete_user_id', p_user_id::text, true);

  select coalesce(array_agg(id), '{}'::uuid[]) into v_authored_recipe_ids
  from public.recipes where created_by = p_user_id;
  select coalesce(array_agg(distinct recipe_id), '{}'::uuid[]) into v_liked_recipe_ids
  from public.recipe_likes where user_id = p_user_id;
  select coalesce(array_agg(distinct rbi.recipe_id), '{}'::uuid[]) into v_saved_recipe_ids
  from public.recipe_book_items rbi
  join public.recipe_books rb on rb.id = rbi.book_id
  where rb.user_id = p_user_id;

  select coalesce(array_agg(product.id), '{}'::uuid[])
  into v_legacy_private_product_ids
  from public.food_products product
  where product.owner_user_id = p_user_id
    and product.visibility = 'private'
    and product.source_type = 'manual';

  select coalesce(array_agg(version.nutrition_profile_id), '{}'::uuid[])
  into v_legacy_private_profile_ids
  from public.food_product_nutrition_versions version
  where version.product_id = any(v_legacy_private_product_ids);
  perform set_config(
    'homecook.account_delete_profile_ids',
    array_to_string(v_legacy_private_profile_ids, ','),
    true
  );

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

  update public.food_product_nutrition_versions version
  set created_by = null
  from public.food_products product
  where product.id = version.product_id
    and product.owner_user_id is null
    and product.visibility = 'public'
    and product.source_type = 'manual'
    and version.created_by = p_user_id;

  update public.nutrition_profiles profile
  set created_by = null
  from public.food_product_nutrition_versions version
  join public.food_products product on product.id = version.product_id
  where profile.id = version.nutrition_profile_id
    and product.owner_user_id is null
    and product.visibility = 'public'
    and product.source_type = 'manual'
    and profile.created_by = p_user_id;

  delete from public.users where id = p_user_id;
  get diagnostics v_deleted_user_count = row_count;

  if cardinality(v_saved_recipe_ids) > 0 then
    update public.recipes recipe
    set save_count = (
      select count(*)::integer from public.recipe_book_items item where item.recipe_id = recipe.id
    ) where recipe.id = any(v_saved_recipe_ids);
  end if;
  if cardinality(v_liked_recipe_ids) > 0 then
    update public.recipes recipe
    set like_count = (
      select count(*)::integer from public.recipe_likes like_row where like_row.recipe_id = recipe.id
    ) where recipe.id = any(v_liked_recipe_ids);
  end if;

  return jsonb_build_object(
    'deleted', true,
    'user_deleted', v_deleted_user_count > 0,
    'preserved_recipe_count', cardinality(v_authored_recipe_ids)
  );
end;
$$;

alter table public.food_product_reports enable row level security;

drop policy if exists food_products_select_visible on public.food_products;
create policy food_products_select_visible on public.food_products
for select to authenticated
using (
  deleted_at is null
  and moderation_status = 'visible'
  and (
    visibility = 'public'
    or (visibility = 'private' and owner_user_id = auth.uid())
  )
);

drop policy if exists food_products_update_private_owner on public.food_products;
drop policy if exists food_products_update_visible_manual_owner on public.food_products;
create policy food_products_update_visible_manual_owner on public.food_products
for update to authenticated
using (
  source_type = 'manual'
  and owner_user_id = auth.uid()
  and moderation_status = 'visible'
)
with check (
  source_type = 'manual'
  and owner_user_id = auth.uid()
  and moderation_status = 'visible'
);

drop policy if exists food_product_versions_select_visible on public.food_product_nutrition_versions;
create policy food_product_versions_select_visible on public.food_product_nutrition_versions
for select to authenticated
using (exists (
  select 1 from public.food_products product
  where product.id = product_id
    and product.deleted_at is null
    and product.moderation_status = 'visible'
    and (
      product.visibility = 'public'
      or (product.visibility = 'private' and product.owner_user_id = auth.uid())
    )
));

create policy food_product_reports_insert_own on public.food_product_reports
for insert to authenticated
with check (
  reporter_user_id = auth.uid()
  and report_status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
  and exists (
    select 1 from public.food_products product
    where product.id = product_id
      and product.visibility = 'public'
      and product.source_type = 'manual'
      and product.moderation_status = 'visible'
      and product.deleted_at is null
      and product.owner_user_id is distinct from auth.uid()
  )
);

revoke all on table public.food_product_reports from anon, authenticated, service_role;
grant insert (product_id, reporter_user_id, reason_code, detail_text)
  on table public.food_product_reports to authenticated;
grant all on table public.food_product_reports to service_role;
revoke truncate on table public.food_product_reports from service_role;
grant update (moderation_status, updated_at) on table public.food_products to service_role;

revoke all on function public.report_food_product(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.report_food_product(uuid, uuid, text, text)
  to authenticated, service_role;

revoke all on function public.list_food_products(uuid, text, text, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_food_products(uuid, text, text, timestamptz, uuid, integer)
  to authenticated, service_role;

revoke all on function public.list_food_products(uuid, text, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_food_products(uuid, text, timestamptz, uuid, integer)
  to authenticated, service_role;

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
revoke all on function public.create_product_planner_entry(uuid, uuid, date, uuid, numeric, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.create_product_planner_entry(uuid, uuid, date, uuid, numeric, text, uuid)
  to authenticated, service_role;
grant execute on function public.delete_user_private_data(uuid) to authenticated, service_role;
