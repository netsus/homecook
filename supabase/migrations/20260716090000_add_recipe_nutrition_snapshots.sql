create table public.recipe_nutrition_snapshots (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete restrict,
  base_servings numeric(8,2) not null check (base_servings > 0),
  input_hash text not null,
  calculation_version varchar(50) not null,
  scalable_values_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(scalable_values_json) = 'object'),
  fixed_values_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(fixed_values_json) = 'object'),
  nutrient_status_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(nutrient_status_json) = 'object'),
  calculation_status varchar(20) not null
    check (calculation_status in ('complete', 'partial', 'unavailable')),
  calculation_quality varchar(20)
    check (calculation_quality is null or calculation_quality in ('direct', 'estimated', 'mixed')),
  reflected_ingredient_count integer not null check (reflected_ingredient_count >= 0),
  target_ingredient_count integer not null
    check (target_ingredient_count >= reflected_ingredient_count),
  missing_reasons text[] not null default '{}'::text[],
  warnings_json jsonb not null default '[]'::jsonb
    check (jsonb_typeof(warnings_json) = 'array'),
  sources_json jsonb not null default '[]'::jsonb
    check (jsonb_typeof(sources_json) = 'array'),
  is_current boolean not null default true,
  calculated_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (recipe_id, input_hash, calculation_version),
  check (
    (calculation_status = 'unavailable' and calculation_quality is null)
    or
    (calculation_status in ('complete', 'partial') and calculation_quality is not null)
  )
);

create unique index recipe_nutrition_snapshots_current_idx
  on public.recipe_nutrition_snapshots (recipe_id) where is_current;
create index recipe_nutrition_snapshots_recipe_history_idx
  on public.recipe_nutrition_snapshots (recipe_id, calculated_at desc, id desc);

alter table public.meals
  add column recipe_nutrition_snapshot_id uuid
    references public.recipe_nutrition_snapshots(id) on delete restrict,
  add column nutrition_snapshot_origin varchar(20),
  add constraint meals_recipe_nutrition_snapshot_origin_check check (
    (recipe_nutrition_snapshot_id is null and nutrition_snapshot_origin is null)
    or
    (recipe_nutrition_snapshot_id is not null and nutrition_snapshot_origin in ('created', 'backfill'))
  );

create index meals_recipe_nutrition_snapshot_idx
  on public.meals (recipe_nutrition_snapshot_id);

create function public.validate_recipe_nutrition_snapshot_payload(p_snapshot jsonb)
returns void
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_required_top_keys text[] := array[
    'base_servings', 'calculated_at', 'calculation_quality', 'calculation_status',
    'calculation_version', 'fixed_values', 'input_hash', 'missing_reasons',
    'nutrient_status', 'reflected_ingredient_count', 'scalable_values',
    'sources', 'target_ingredient_count', 'warnings'
  ];
  v_actual_keys text[];
  v_source jsonb;
  v_source_keys text[];
  v_canonical_sources jsonb;
  v_value record;
  v_value_keys text[];
  v_status text;
  v_scalable numeric;
  v_fixed numeric;
  v_expected numeric;
  v_core_code text;
  v_allowed_nutrient_codes text[] := array[
    'energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g', 'sodium_mg',
    'sugars_g', 'saturated_fat_g', 'fiber_g'
  ];
  v_allowed_warnings text[] := array[
    'PREDECESSOR_NOT_APPROVED', 'NUTRITION_PROFILE_MISSING', 'INVALID_QUANTITY',
    'UNIT_CONVERSION_MISSING', 'PIECE_WEIGHT_REQUIRED', 'TO_TASTE_EXCLUDED',
    'REPRESENTATIVE_VOLUME_CONVERSION_USED', 'PIECE_WEIGHT_CONVERSION_USED'
  ];
  v_core_complete integer := 0;
  v_core_available integer := 0;
begin
  if jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'INVALID_SNAPSHOT_PAYLOAD';
  end if;

  select array_agg(key order by key collate "C")
    into v_actual_keys
    from jsonb_object_keys(p_snapshot) as keys(key);
  if v_actual_keys is distinct from v_required_top_keys then
    raise exception 'INVALID_SNAPSHOT_PAYLOAD';
  end if;

  if jsonb_typeof(p_snapshot -> 'scalable_values') <> 'object'
    or jsonb_typeof(p_snapshot -> 'fixed_values') <> 'object'
    or jsonb_typeof(p_snapshot -> 'nutrient_status') <> 'object'
    or jsonb_typeof(p_snapshot -> 'warnings') <> 'array'
    or jsonb_typeof(p_snapshot -> 'sources') <> 'array'
    or jsonb_typeof(p_snapshot -> 'missing_reasons') <> 'array'
    or coalesce((p_snapshot ->> 'base_servings')::numeric, 0) <= 0
    or coalesce(p_snapshot ->> 'input_hash', '') !~ '^[0-9a-fA-F]{64}$'
    or nullif(btrim(p_snapshot ->> 'calculation_version'), '') is null
    or coalesce((p_snapshot ->> 'reflected_ingredient_count')::integer, -1) < 0
    or coalesce((p_snapshot ->> 'target_ingredient_count')::integer, -1)
      < coalesce((p_snapshot ->> 'reflected_ingredient_count')::integer, 0)
  then
    raise exception 'INVALID_SNAPSHOT_PAYLOAD';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_snapshot -> 'warnings') item
    where jsonb_typeof(item) <> 'string'
      or item #>> '{}' <> all(v_allowed_warnings)
  ) or exists (
    select 1 from jsonb_array_elements(p_snapshot -> 'missing_reasons') item
    where jsonb_typeof(item) <> 'string'
      or item #>> '{}' !~ '^(TO_TASTE_EXCLUDED|PREDECESSOR_NOT_APPROVED|NUTRITION_PROFILE_MISSING|INVALID_QUANTITY|UNIT_CONVERSION_MISSING|PIECE_WEIGHT_REQUIRED):[0-9A-Za-z-]+$|^NUTRIENT_VALUE_MISSING:[0-9A-Za-z-]+:(energy_kcal|carbohydrate_g|protein_g|fat_g|sodium_mg|sugars_g|saturated_fat_g|fiber_g)$'
  ) or jsonb_array_length(p_snapshot -> 'warnings') <> (
    select count(distinct item) from jsonb_array_elements(p_snapshot -> 'warnings') item
  ) or jsonb_array_length(p_snapshot -> 'missing_reasons') <> (
    select count(distinct item) from jsonb_array_elements(p_snapshot -> 'missing_reasons') item
  ) then
    raise exception 'INVALID_SNAPSHOT_PAYLOAD';
  end if;

  for v_source in select value from jsonb_array_elements(p_snapshot -> 'sources')
  loop
    if jsonb_typeof(v_source) <> 'object' then
      raise exception 'UNSAFE_SNAPSHOT_SOURCE';
    end if;
    select array_agg(key order by key collate "C")
      into v_source_keys
      from jsonb_object_keys(v_source) as source_keys(key);
    if v_source_keys is distinct from array[
      'data_basis_date', 'dataset', 'license', 'provider', 'source_url', 'source_version'
    ] then
      raise exception 'UNSAFE_SNAPSHOT_SOURCE';
    end if;
    if nullif(btrim(v_source ->> 'provider'), '') is null
      or nullif(btrim(v_source ->> 'dataset'), '') is null
      or nullif(btrim(v_source ->> 'source_version'), '') is null
      or nullif(btrim(v_source ->> 'license'), '') is null
      or nullif(btrim(v_source ->> 'source_url'), '') is null
      or jsonb_typeof(v_source -> 'data_basis_date') not in ('string', 'null')
      or (v_source ->> 'source_url') !~ '^https?://'
      or (v_source ->> 'source_url') ~* '^https?://[^/?#]*@'
      or (v_source ->> 'source_url') ~ '#'
      or (v_source ->> 'source_url') ~* '[?&](servicekey|api[_-]?key|key|token|access[_-]?token|authorization|auth|secret|cookie|signature|credential|x-amz-signature|x-amz-credential|x-amz-security-token)='
      or v_source::text ~* '(raw[_-]?(payload|row|provider|response)|api[_-]?key|servicekey|secret|cookie|authorization|access[_-]?token|manifest[_-]?(sha|path)|(^|/)private(/|$)|(^|/)internal(/|$))'
      or not exists (
        select 1
        from public.nutrition_sources source
        where source.provider_code = v_source ->> 'provider'
          and source.dataset_name = v_source ->> 'dataset'
          and source.source_version = v_source ->> 'source_version'
          and source.data_basis_date is not distinct from nullif(v_source ->> 'data_basis_date', '')::date
          and source.license_name = v_source ->> 'license'
          and source.source_url = v_source ->> 'source_url'
          and source.review_status = 'approved'
          and source.freshness_status = 'current'
          and source.is_active
      )
    then
      raise exception 'UNSAFE_SNAPSHOT_SOURCE';
    end if;
  end loop;

  select coalesce(jsonb_agg(source order by
      source ->> 'provider' collate "C" asc nulls first,
      source ->> 'dataset' collate "C" asc nulls first,
      source ->> 'source_version' collate "C" asc nulls first,
      source ->> 'data_basis_date' collate "C" asc nulls first,
      source ->> 'license' collate "C" asc nulls first,
      source ->> 'source_url' collate "C" asc nulls first
    ), '[]'::jsonb)
    into v_canonical_sources
    from (
      select distinct value as source
      from jsonb_array_elements(p_snapshot -> 'sources')
    ) deduplicated;
  if v_canonical_sources <> p_snapshot -> 'sources' then
    raise exception 'NON_CANONICAL_SNAPSHOT_SOURCES';
  end if;

  foreach v_core_code in array array[
    'energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g', 'sodium_mg'
  ]
  loop
    if not (p_snapshot -> 'nutrient_status' ? v_core_code) then
      raise exception 'INVALID_SNAPSHOT_NUTRIENT_STATUS';
    end if;
  end loop;

  for v_value in select key, value from jsonb_each(p_snapshot -> 'nutrient_status')
  loop
    if v_value.key <> all(v_allowed_nutrient_codes)
      or jsonb_typeof(v_value.value) <> 'object'
    then
      raise exception 'INVALID_SNAPSHOT_NUTRIENT_STATUS';
    end if;
    select array_agg(key order by key collate "C")
      into v_value_keys
      from jsonb_object_keys(v_value.value) as value_keys(key);
    if v_value_keys is distinct from array['amount', 'display_mode', 'known_amount', 'status'] then
      raise exception 'INVALID_SNAPSHOT_NUTRIENT_STATUS';
    end if;

    v_status := v_value.value ->> 'status';
    if v_status = 'complete' then
      if jsonb_typeof(v_value.value -> 'amount') <> 'number'
        or (v_value.value ->> 'amount')::numeric < 0
        or jsonb_typeof(v_value.value -> 'known_amount') <> 'null'
        or v_value.value ->> 'display_mode' <> 'total'
      then
        raise exception 'INVALID_SNAPSHOT_NUTRIENT_STATUS';
      end if;
      v_expected := (v_value.value ->> 'amount')::numeric;
    elsif v_status = 'partial' then
      if jsonb_typeof(v_value.value -> 'amount') <> 'null'
        or jsonb_typeof(v_value.value -> 'known_amount') <> 'number'
        or (v_value.value ->> 'known_amount')::numeric < 0
        or v_value.value ->> 'display_mode' <> 'minimum'
      then
        raise exception 'INVALID_SNAPSHOT_NUTRIENT_STATUS';
      end if;
      v_expected := (v_value.value ->> 'known_amount')::numeric;
    elsif v_status = 'unavailable' then
      if jsonb_typeof(v_value.value -> 'amount') <> 'null'
        or jsonb_typeof(v_value.value -> 'known_amount') <> 'null'
        or jsonb_typeof(v_value.value -> 'display_mode') <> 'null'
        or p_snapshot -> 'scalable_values' ? v_value.key
        or p_snapshot -> 'fixed_values' ? v_value.key
      then
        raise exception 'INVALID_SNAPSHOT_NUTRIENT_STATUS';
      end if;
      v_expected := null;
    else
      raise exception 'INVALID_SNAPSHOT_NUTRIENT_STATUS';
    end if;

    if v_status <> 'unavailable' then
      if jsonb_typeof(p_snapshot -> 'scalable_values' -> v_value.key) <> 'number'
        or jsonb_typeof(p_snapshot -> 'fixed_values' -> v_value.key) <> 'number'
      then
        raise exception 'INVALID_SNAPSHOT_VECTOR';
      end if;
      v_scalable := (p_snapshot -> 'scalable_values' ->> v_value.key)::numeric;
      v_fixed := (p_snapshot -> 'fixed_values' ->> v_value.key)::numeric;
      if v_scalable < 0 or v_fixed < 0 or abs(v_scalable + v_fixed - v_expected) > 0.000000001 then
        raise exception 'SNAPSHOT_VECTOR_SUM_MISMATCH';
      end if;
    end if;

    if v_value.key = any(array[
      'energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g', 'sodium_mg'
    ]) then
      if v_status = 'complete' then v_core_complete := v_core_complete + 1; end if;
      if v_status <> 'unavailable' then v_core_available := v_core_available + 1; end if;
    end if;
  end loop;

  if exists (
    select 1 from jsonb_object_keys(p_snapshot -> 'scalable_values') vector_key
    where not (p_snapshot -> 'nutrient_status' ? vector_key)
  ) or exists (
    select 1 from jsonb_object_keys(p_snapshot -> 'fixed_values') vector_key
    where not (p_snapshot -> 'nutrient_status' ? vector_key)
  ) then
    raise exception 'INVALID_SNAPSHOT_VECTOR';
  end if;

  if (p_snapshot ->> 'calculation_status' = 'complete' and v_core_complete <> 5)
    or (p_snapshot ->> 'calculation_status' = 'unavailable' and v_core_available <> 0)
    or (p_snapshot ->> 'calculation_status' = 'partial' and (v_core_available = 0 or v_core_complete = 5))
    or (p_snapshot ->> 'calculation_status' = 'unavailable' and jsonb_typeof(p_snapshot -> 'calculation_quality') <> 'null')
    or (p_snapshot ->> 'calculation_status' = 'unavailable' and jsonb_array_length(p_snapshot -> 'sources') <> 0)
    or (p_snapshot ->> 'calculation_status' <> 'unavailable' and coalesce(p_snapshot ->> 'calculation_quality', '') not in ('direct', 'estimated', 'mixed'))
    or (p_snapshot ->> 'calculation_status' <> 'unavailable' and jsonb_array_length(p_snapshot -> 'sources') = 0)
    or (p_snapshot ->> 'calculation_quality' = 'direct' and (p_snapshot -> 'warnings') ?| array['REPRESENTATIVE_VOLUME_CONVERSION_USED', 'PIECE_WEIGHT_CONVERSION_USED'])
    or (p_snapshot ->> 'calculation_quality' in ('estimated', 'mixed') and not ((p_snapshot -> 'warnings') ?| array['REPRESENTATIVE_VOLUME_CONVERSION_USED', 'PIECE_WEIGHT_CONVERSION_USED']))
  then
    raise exception 'INVALID_SNAPSHOT_STATUS';
  end if;
end;
$$;

create function public.protect_recipe_nutrition_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE'
    or current_setting('homecook.recipe_nutrition_writer', true) is distinct from 'on'
    or (to_jsonb(old) - 'is_current') is distinct from (to_jsonb(new) - 'is_current')
  then
    raise exception 'IMMUTABLE_RECIPE_NUTRITION_SNAPSHOT';
  end if;
  return new;
end;
$$;

create trigger protect_recipe_nutrition_snapshot
before update or delete on public.recipe_nutrition_snapshots
for each row execute function public.protect_recipe_nutrition_snapshot();

create function public.write_recipe_nutrition_snapshot(
  p_recipe_id uuid,
  p_snapshot jsonb,
  p_expected_recipe_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_snapshot_id uuid;
  v_deterministic_snapshot_id uuid;
  v_snapshot_hex text;
  v_created boolean := false;
  v_existing public.recipe_nutrition_snapshots%rowtype;
  v_recipe_updated_at timestamptz;
begin
  perform public.validate_recipe_nutrition_snapshot_payload(p_snapshot);
  perform pg_advisory_xact_lock(hashtextextended(p_recipe_id::text, 0));
  v_snapshot_hex := md5(
    p_recipe_id::text || chr(31) || (p_snapshot ->> 'input_hash') || chr(31) ||
    (p_snapshot ->> 'calculation_version')
  );
  v_deterministic_snapshot_id := (
    substr(v_snapshot_hex, 1, 8) || '-' || substr(v_snapshot_hex, 9, 4) || '-' ||
    substr(v_snapshot_hex, 13, 4) || '-' || substr(v_snapshot_hex, 17, 4) || '-' ||
    substr(v_snapshot_hex, 21, 12)
  )::uuid;
  select updated_at into v_recipe_updated_at
  from public.recipes
  where id = p_recipe_id
  for share;
  if v_recipe_updated_at is null then
    raise exception 'RECIPE_NOT_FOUND';
  end if;
  if v_recipe_updated_at is distinct from p_expected_recipe_updated_at then
    raise exception 'RECIPE_NUTRITION_INPUT_STALE';
  end if;
  perform set_config('homecook.recipe_nutrition_writer', 'on', true);

  insert into public.recipe_nutrition_snapshots (
    id, recipe_id, base_servings, input_hash, calculation_version,
    scalable_values_json, fixed_values_json, nutrient_status_json,
    calculation_status, calculation_quality, reflected_ingredient_count,
    target_ingredient_count, missing_reasons, warnings_json, sources_json,
    is_current, calculated_at
  ) values (
    v_deterministic_snapshot_id,
    p_recipe_id,
    (p_snapshot ->> 'base_servings')::numeric,
    p_snapshot ->> 'input_hash',
    p_snapshot ->> 'calculation_version',
    p_snapshot -> 'scalable_values',
    p_snapshot -> 'fixed_values',
    p_snapshot -> 'nutrient_status',
    p_snapshot ->> 'calculation_status',
    nullif(p_snapshot ->> 'calculation_quality', ''),
    (p_snapshot ->> 'reflected_ingredient_count')::integer,
    (p_snapshot ->> 'target_ingredient_count')::integer,
    array(select jsonb_array_elements_text(p_snapshot -> 'missing_reasons')),
    p_snapshot -> 'warnings',
    p_snapshot -> 'sources',
    false,
    (p_snapshot ->> 'calculated_at')::timestamptz
  )
  on conflict (recipe_id, input_hash, calculation_version) do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is null then
    select * into v_existing
    from public.recipe_nutrition_snapshots
    where recipe_id = p_recipe_id
      and input_hash = p_snapshot ->> 'input_hash'
      and calculation_version = p_snapshot ->> 'calculation_version'
    for update;
    if v_existing.id is null
      or v_existing.base_servings <> (p_snapshot ->> 'base_servings')::numeric
      or v_existing.scalable_values_json <> p_snapshot -> 'scalable_values'
      or v_existing.fixed_values_json <> p_snapshot -> 'fixed_values'
      or v_existing.nutrient_status_json <> p_snapshot -> 'nutrient_status'
      or v_existing.calculation_status <> p_snapshot ->> 'calculation_status'
      or v_existing.calculation_quality is distinct from nullif(p_snapshot ->> 'calculation_quality', '')
      or v_existing.reflected_ingredient_count <> (p_snapshot ->> 'reflected_ingredient_count')::integer
      or v_existing.target_ingredient_count <> (p_snapshot ->> 'target_ingredient_count')::integer
      or v_existing.missing_reasons <> array(select jsonb_array_elements_text(p_snapshot -> 'missing_reasons'))
      or v_existing.warnings_json <> p_snapshot -> 'warnings'
      or v_existing.sources_json <> p_snapshot -> 'sources'
    then
      raise exception 'SNAPSHOT_IDENTITY_COLLISION';
    end if;
    v_snapshot_id := v_existing.id;
  else
    v_created := true;
  end if;

  update public.recipe_nutrition_snapshots
    set is_current = false
    where recipe_id = p_recipe_id and is_current and id <> v_snapshot_id;
  update public.recipe_nutrition_snapshots
    set is_current = true
    where id = v_snapshot_id and not is_current;

  return jsonb_build_object(
    'snapshot_id', v_snapshot_id,
    'created', v_created,
    'is_current', true
  );
end;
$$;

create function public.restore_recipe_nutrition_snapshot_current(
  p_recipe_id uuid,
  p_snapshot_id uuid,
  p_expected_current_snapshot_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_current_snapshot_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_recipe_id::text, 0));
  select id into v_current_snapshot_id
  from public.recipe_nutrition_snapshots
  where recipe_id = p_recipe_id and is_current;
  if v_current_snapshot_id is distinct from p_expected_current_snapshot_id then
    raise exception 'BACKFILL_CURRENT_DRIFT';
  end if;
  if p_snapshot_id is not null and not exists (
    select 1 from public.recipe_nutrition_snapshots
    where id = p_snapshot_id and recipe_id = p_recipe_id
  ) then
    raise exception 'SNAPSHOT_NOT_FOUND';
  end if;
  perform set_config('homecook.recipe_nutrition_writer', 'on', true);
  update public.recipe_nutrition_snapshots
    set is_current = false
    where recipe_id = p_recipe_id
      and is_current
      and (p_snapshot_id is null or id <> p_snapshot_id);
  update public.recipe_nutrition_snapshots
    set is_current = true
    where p_snapshot_id is not null and id = p_snapshot_id and not is_current;
  return jsonb_build_object(
    'snapshot_id', p_snapshot_id,
    'is_current', p_snapshot_id is not null
  );
end;
$$;

create function public.pin_current_recipe_nutrition_snapshot_on_meal_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.recipe_nutrition_snapshot_id is not null or new.nutrition_snapshot_origin is not null then
    raise exception 'CLIENT_SELECTED_NUTRITION_SNAPSHOT_NOT_ALLOWED';
  end if;
  select snapshot.id
    into new.recipe_nutrition_snapshot_id
    from public.recipe_nutrition_snapshots snapshot
    where snapshot.recipe_id = new.recipe_id and snapshot.is_current
    limit 1;
  if new.recipe_nutrition_snapshot_id is not null then
    new.nutrition_snapshot_origin := 'created';
  end if;
  return new;
end;
$$;

create trigger pin_current_recipe_nutrition_snapshot_on_meal_insert
before insert on public.meals
for each row execute function public.pin_current_recipe_nutrition_snapshot_on_meal_insert();

create function public.protect_meal_recipe_nutrition_pin()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.recipe_id is not distinct from new.recipe_id
    and old.recipe_nutrition_snapshot_id is not distinct from new.recipe_nutrition_snapshot_id
    and old.nutrition_snapshot_origin is not distinct from new.nutrition_snapshot_origin
  then
    return new;
  end if;
  if current_setting('homecook.recipe_nutrition_backfill', true) is distinct from 'on'
    or old.recipe_nutrition_snapshot_id is not null
    or old.nutrition_snapshot_origin is not null
    or new.recipe_nutrition_snapshot_id is null
    or new.nutrition_snapshot_origin <> 'backfill'
    or not exists (
      select 1 from public.recipe_nutrition_snapshots snapshot
      where snapshot.id = new.recipe_nutrition_snapshot_id
        and snapshot.recipe_id = new.recipe_id
    )
  then
    raise exception 'IMMUTABLE_MEAL_NUTRITION_SNAPSHOT_PIN';
  end if;
  return new;
end;
$$;

create trigger protect_meal_recipe_nutrition_pin
before update of recipe_id, recipe_nutrition_snapshot_id, nutrition_snapshot_origin on public.meals
for each row execute function public.protect_meal_recipe_nutrition_pin();

create function public.backfill_foodsafety_recipe_nutrition_meal_pins(
  p_dry_run boolean default true,
  p_after_meal_id uuid default null,
  p_batch_size integer default 250
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_count integer := 0;
  v_next_cursor uuid;
  v_scope_count integer;
begin
  if p_batch_size < 1 or p_batch_size > 1000 then
    raise exception 'INVALID_BACKFILL_BATCH_SIZE';
  end if;
  select count(distinct source.recipe_id)
    into v_scope_count
    from public.recipe_sources source
    where source.extraction_meta_json ->> 'reviewed_scope' in (
        'pilot_30_quality_corrected',
        'pilot_30_quality_corrected_replacement'
      )
      and source.extraction_meta_json ->> 'source_provider' = 'foodsafety-cookrcp';
  if v_scope_count <> 30 then
    raise exception 'INVALID_BACKFILL_SCOPE';
  end if;
  perform set_config('homecook.recipe_nutrition_backfill', 'on', true);

  if p_dry_run then
    select count(*), (array_agg(candidate.id order by candidate.id desc))[1]
      into v_count, v_next_cursor
      from (
        select meal.id
        from public.meals meal
        join public.recipe_sources source on source.recipe_id = meal.recipe_id
        join public.recipe_nutrition_snapshots snapshot
          on snapshot.recipe_id = meal.recipe_id and snapshot.is_current
        where source.extraction_meta_json ->> 'reviewed_scope' in (
            'pilot_30_quality_corrected',
            'pilot_30_quality_corrected_replacement'
          )
          and source.extraction_meta_json ->> 'source_provider' = 'foodsafety-cookrcp'
          and meal.recipe_nutrition_snapshot_id is null
          and (p_after_meal_id is null or meal.id > p_after_meal_id)
        order by meal.id
        limit p_batch_size
      ) candidate;
  else
    with candidate as (
      select meal.id, snapshot.id as snapshot_id
      from public.meals meal
      join public.recipe_sources source on source.recipe_id = meal.recipe_id
      join public.recipe_nutrition_snapshots snapshot
        on snapshot.recipe_id = meal.recipe_id and snapshot.is_current
      where source.extraction_meta_json ->> 'reviewed_scope' in (
          'pilot_30_quality_corrected',
          'pilot_30_quality_corrected_replacement'
        )
        and source.extraction_meta_json ->> 'source_provider' = 'foodsafety-cookrcp'
        and meal.recipe_nutrition_snapshot_id is null
        and (p_after_meal_id is null or meal.id > p_after_meal_id)
      order by meal.id
      limit p_batch_size
      for update of meal
    ), updated as (
      update public.meals meal
      set recipe_nutrition_snapshot_id = candidate.snapshot_id,
          nutrition_snapshot_origin = 'backfill'
      from candidate
      where meal.id = candidate.id and meal.recipe_nutrition_snapshot_id is null
      returning meal.id
    )
    select count(*), (array_agg(id order by id desc))[1]
      into v_count, v_next_cursor
      from updated;
  end if;

  return jsonb_build_object(
    'scope', 'foodsafety-30',
    'dry_run', p_dry_run,
    'processed_count', v_count,
    'next_cursor', v_next_cursor
  );
end;
$$;

alter table public.recipe_nutrition_snapshots enable row level security;
revoke all on table public.recipe_nutrition_snapshots from anon, authenticated;
revoke insert, update, delete on table public.recipe_nutrition_snapshots from service_role;
grant select on table public.recipe_nutrition_snapshots to service_role;

revoke all on function public.protect_recipe_nutrition_snapshot()
  from public, anon, authenticated, service_role;
revoke all on function public.pin_current_recipe_nutrition_snapshot_on_meal_insert()
  from public, anon, authenticated, service_role;
revoke all on function public.protect_meal_recipe_nutrition_pin()
  from public, anon, authenticated, service_role;
revoke all on function public.validate_recipe_nutrition_snapshot_payload(jsonb)
  from public, anon, authenticated;
revoke all on function public.write_recipe_nutrition_snapshot(uuid, jsonb, timestamptz)
  from public, anon, authenticated;
revoke all on function public.restore_recipe_nutrition_snapshot_current(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.backfill_foodsafety_recipe_nutrition_meal_pins(boolean, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.validate_recipe_nutrition_snapshot_payload(jsonb) to service_role;
grant execute on function public.write_recipe_nutrition_snapshot(uuid, jsonb, timestamptz) to service_role;
grant execute on function public.restore_recipe_nutrition_snapshot_current(uuid, uuid, uuid) to service_role;
grant execute on function public.backfill_foodsafety_recipe_nutrition_meal_pins(boolean, uuid, integer)
  to service_role;
