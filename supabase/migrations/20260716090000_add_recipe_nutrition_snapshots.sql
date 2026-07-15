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

create function public.decode_recipe_nutrition_query_key(p_key text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog
as $$
declare
  v_decoded text := p_key;
  v_next text;
  v_result text;
  v_hex text;
  v_byte integer;
  v_index integer;
  v_depth integer;
begin
  for v_depth in 1..8
  loop
    exit when position('%' in v_decoded) = 0;
    v_result := '';
    v_index := 1;
    while v_index <= length(v_decoded)
    loop
      if substr(v_decoded, v_index, 1) = '%' then
        v_hex := substr(v_decoded, v_index + 1, 2);
        if length(v_hex) <> 2 or v_hex !~ '^[0-9A-Fa-f]{2}$' then
          return null;
        end if;
        v_byte := ('x' || v_hex)::bit(8)::integer;
        if v_byte > 127 then
          return null;
        end if;
        v_result := v_result || chr(v_byte);
        v_index := v_index + 3;
      else
        v_result := v_result || substr(v_decoded, v_index, 1);
        v_index := v_index + 1;
      end if;
    end loop;
    v_next := v_result;
    if v_next = v_decoded then
      return null;
    end if;
    v_decoded := v_next;
  end loop;
  if position('%' in v_decoded) > 0 then
    return null;
  end if;
  return v_decoded;
end;
$$;

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
  v_query_key text;
  v_decoded_query_key text;
  v_normalized_query_key text;
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
  v_any_available integer := 0;
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
    for v_query_key in
      select match[1]
      from regexp_matches(v_source ->> 'source_url', '[?&]([^=&#]+)=', 'g') match
    loop
      v_decoded_query_key := public.decode_recipe_nutrition_query_key(v_query_key);
      if v_decoded_query_key is null then
        raise exception 'UNSAFE_SNAPSHOT_SOURCE';
      end if;
      v_normalized_query_key := regexp_replace(
        lower(v_decoded_query_key),
        '[^a-z0-9]',
        '',
        'g'
      );
      if v_normalized_query_key in ('key', 'pass', 'auth', 'authorization')
        or v_normalized_query_key ~ '(password|passwd|passphrase|secret|token|credential|apikey|accesskey|subscriptionkey|servicekey|signature|cookie)'
      then
        raise exception 'UNSAFE_SNAPSHOT_SOURCE';
      end if;
    end loop;
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
      v_any_available := v_any_available + 1;
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
    or (p_snapshot ->> 'calculation_status' = 'unavailable' and v_any_available <> 0)
    or (p_snapshot ->> 'calculation_status' = 'partial' and (v_any_available = 0 or v_core_complete = 5))
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

create function public.recipe_nutrition_recipe_lock_key(p_recipe_id uuid)
returns bigint
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select hashtextextended('homecook:recipe-nutrition:recipe:' || p_recipe_id::text, 0);
$$;

create function public.recipe_nutrition_ingredient_lock_key(p_ingredient_id uuid)
returns bigint
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select hashtextextended('homecook:recipe-nutrition:ingredient:' || p_ingredient_id::text, 0);
$$;

create function public.lock_recipe_nutrition_recipe_ids(p_recipe_ids uuid[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_recipe_id uuid;
begin
  for v_recipe_id in
    select recipe_id
    from (
      select distinct recipe_id
      from unnest(coalesce(p_recipe_ids, '{}'::uuid[])) recipe_ids(recipe_id)
      where recipe_id is not null
    ) ids
    order by recipe_id::text collate "C"
  loop
    perform pg_advisory_xact_lock(public.recipe_nutrition_recipe_lock_key(v_recipe_id));
  end loop;
end;
$$;

create function public.lock_recipe_nutrition_ingredient_ids(
  p_ingredient_ids uuid[],
  p_shared boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ingredient_id uuid;
begin
  for v_ingredient_id in
    select ingredient_id
    from (
      select distinct ingredient_id
      from unnest(coalesce(p_ingredient_ids, '{}'::uuid[])) ingredient_ids(ingredient_id)
      where ingredient_id is not null
    ) ids
    order by ingredient_id::text collate "C"
  loop
    if p_shared then
      perform pg_advisory_xact_lock_shared(
        public.recipe_nutrition_ingredient_lock_key(v_ingredient_id)
      );
    else
      perform pg_advisory_xact_lock(
        public.recipe_nutrition_ingredient_lock_key(v_ingredient_id)
      );
    end if;
  end loop;
end;
$$;

create function public.lock_recipe_nutrition_recipe_ingredient_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_transition_sql text;
  v_recipe_ids uuid[];
  v_ingredient_ids uuid[];
begin
  v_transition_sql := case tg_op
    when 'INSERT' then 'select recipe_id, ingredient_id from new_rows'
    when 'UPDATE' then
      'select recipe_id, ingredient_id from old_rows union all ' ||
      'select recipe_id, ingredient_id from new_rows'
    when 'DELETE' then 'select recipe_id, ingredient_id from old_rows'
  end;

  execute format(
    'select array_agg(recipe_id order by recipe_id::text collate "C") ' ||
    'from (select distinct recipe_id from (%s) changed where recipe_id is not null) ids',
    v_transition_sql
  ) into v_recipe_ids;
  execute format(
    'select array_agg(ingredient_id order by ingredient_id::text collate "C") ' ||
    'from (select distinct ingredient_id from (%s) changed where ingredient_id is not null) ids',
    v_transition_sql
  ) into v_ingredient_ids;

  perform public.lock_recipe_nutrition_recipe_ids(v_recipe_ids);
  perform public.lock_recipe_nutrition_ingredient_ids(v_ingredient_ids, false);
  return null;
end;
$$;

create trigger lock_recipe_nutrition_recipe_ingredient_insert
after insert on public.recipe_ingredients
referencing new table as new_rows
for each statement execute function public.lock_recipe_nutrition_recipe_ingredient_mutation();
create trigger lock_recipe_nutrition_recipe_ingredient_update
after update on public.recipe_ingredients
referencing old table as old_rows new table as new_rows
for each statement execute function public.lock_recipe_nutrition_recipe_ingredient_mutation();
create trigger lock_recipe_nutrition_recipe_ingredient_delete
after delete on public.recipe_ingredients
referencing old table as old_rows
for each statement execute function public.lock_recipe_nutrition_recipe_ingredient_mutation();

create function public.lock_recipe_nutrition_predecessor_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_key_column text;
  v_transition_sql text;
  v_changed_ids uuid[];
  v_ingredient_ids uuid[];
begin
  v_key_column := case tg_table_name
    when 'nutrition_values' then 'profile_id'
    when 'ingredient_nutrition_profiles' then 'ingredient_id'
    when 'ingredient_conversion_assignments' then 'ingredient_id'
    when 'piece_unit_weights' then 'ingredient_id'
    else 'id'
  end;
  v_transition_sql := case tg_op
    when 'INSERT' then format('select %I as changed_id from new_rows', v_key_column)
    when 'UPDATE' then
      format('select %I as changed_id from old_rows union all ', v_key_column) ||
      format('select %I as changed_id from new_rows', v_key_column)
    when 'DELETE' then format('select %I as changed_id from old_rows', v_key_column)
  end;
  execute format(
    'select array_agg(changed_id order by changed_id::text collate "C") ' ||
    'from (select distinct changed_id from (%s) changed where changed_id is not null) ids',
    v_transition_sql
  ) into v_changed_ids;

  if tg_table_name = 'nutrition_sources' then
    select array_agg(ingredient_id order by ingredient_id::text collate "C")
      into v_ingredient_ids
      from (
        select distinct link.ingredient_id
        from public.ingredient_nutrition_profiles link
        join public.nutrition_profiles profile on profile.id = link.nutrition_profile_id
        join public.nutrition_source_items source_item on source_item.id = profile.source_item_id
        where source_item.source_id = any(v_changed_ids)
        union
        select assignment.ingredient_id
        from public.ingredient_conversion_assignments assignment
        join public.measurement_source_evidence evidence on evidence.id = assignment.evidence_id
        where evidence.source_id = any(v_changed_ids)
        union
        select piece.ingredient_id
        from public.piece_unit_weights piece
        join public.measurement_source_evidence evidence on evidence.id = piece.evidence_id
        where evidence.source_id = any(v_changed_ids)
      ) affected;
  elsif tg_table_name = 'nutrition_source_items' then
    select array_agg(ingredient_id order by ingredient_id::text collate "C")
      into v_ingredient_ids
      from (
        select distinct link.ingredient_id
        from public.ingredient_nutrition_profiles link
        join public.nutrition_profiles profile on profile.id = link.nutrition_profile_id
        where profile.source_item_id = any(v_changed_ids)
      ) affected;
  elsif tg_table_name in ('nutrition_profiles', 'nutrition_values') then
    select array_agg(ingredient_id order by ingredient_id::text collate "C")
      into v_ingredient_ids
      from (
        select distinct link.ingredient_id
        from public.ingredient_nutrition_profiles link
        where link.nutrition_profile_id = any(v_changed_ids)
      ) affected;
  elsif tg_table_name = 'ingredient_nutrition_profiles' then
    v_ingredient_ids := v_changed_ids;
  elsif tg_table_name = 'measurement_conversion_profiles' then
    select array_agg(ingredient_id order by ingredient_id::text collate "C")
      into v_ingredient_ids
      from (
        select distinct assignment.ingredient_id
        from public.ingredient_conversion_assignments assignment
        where assignment.conversion_profile_id = any(v_changed_ids)
      ) affected;
  elsif tg_table_name = 'measurement_source_evidence' then
    select array_agg(ingredient_id order by ingredient_id::text collate "C")
      into v_ingredient_ids
      from (
        select distinct assignment.ingredient_id
        from public.ingredient_conversion_assignments assignment
        where assignment.evidence_id = any(v_changed_ids)
        union
        select piece.ingredient_id
        from public.piece_unit_weights piece
        where piece.evidence_id = any(v_changed_ids)
      ) affected;
  elsif tg_table_name in ('ingredient_conversion_assignments', 'piece_unit_weights') then
    v_ingredient_ids := v_changed_ids;
  end if;

  perform public.lock_recipe_nutrition_ingredient_ids(v_ingredient_ids, false);
  return null;
end;
$$;

create trigger lock_recipe_nutrition_sources_insert after insert on public.nutrition_sources
referencing new table as new_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_sources_update after update on public.nutrition_sources
referencing old table as old_rows new table as new_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_sources_delete after delete on public.nutrition_sources
referencing old table as old_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_source_items_insert after insert on public.nutrition_source_items
referencing new table as new_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_source_items_update after update on public.nutrition_source_items
referencing old table as old_rows new table as new_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_source_items_delete after delete on public.nutrition_source_items
referencing old table as old_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_profiles_insert after insert on public.nutrition_profiles
referencing new table as new_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_profiles_update after update on public.nutrition_profiles
referencing old table as old_rows new table as new_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_profiles_delete after delete on public.nutrition_profiles
referencing old table as old_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_values_insert after insert on public.nutrition_values
referencing new table as new_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_values_update after update on public.nutrition_values
referencing old table as old_rows new table as new_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_values_delete after delete on public.nutrition_values
referencing old table as old_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_links_insert after insert on public.ingredient_nutrition_profiles
referencing new table as new_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_links_update after update on public.ingredient_nutrition_profiles
referencing old table as old_rows new table as new_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_links_delete after delete on public.ingredient_nutrition_profiles
referencing old table as old_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_conversion_profiles_insert after insert on public.measurement_conversion_profiles
referencing new table as new_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_conversion_profiles_update after update on public.measurement_conversion_profiles
referencing old table as old_rows new table as new_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_conversion_profiles_delete after delete on public.measurement_conversion_profiles
referencing old table as old_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_evidence_insert after insert on public.measurement_source_evidence
referencing new table as new_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_evidence_update after update on public.measurement_source_evidence
referencing old table as old_rows new table as new_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_evidence_delete after delete on public.measurement_source_evidence
referencing old table as old_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_assignments_insert after insert on public.ingredient_conversion_assignments
referencing new table as new_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_assignments_update after update on public.ingredient_conversion_assignments
referencing old table as old_rows new table as new_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_assignments_delete after delete on public.ingredient_conversion_assignments
referencing old table as old_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_piece_weights_insert after insert on public.piece_unit_weights
referencing new table as new_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_piece_weights_update after update on public.piece_unit_weights
referencing old table as old_rows new table as new_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();
create trigger lock_recipe_nutrition_piece_weights_delete after delete on public.piece_unit_weights
referencing old table as old_rows for each statement execute function public.lock_recipe_nutrition_predecessor_mutation();

create function public.build_recipe_nutrition_input_guard(p_recipe_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'recipe_ingredients',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', ingredient.id,
          'ingredient_id', ingredient.ingredient_id,
          'amount', ingredient.amount,
          'unit', ingredient.unit,
          'ingredient_type', ingredient.ingredient_type,
          'scalable', ingredient.scalable,
          'sort_order', ingredient.sort_order,
          'nutrition_candidates', nutrition.candidates,
          'conversion_candidates', conversion.candidates,
          'selected_nutrition_link_id', selected.link_id,
          'selected_conversion_assignment_id',
            case
              when selected.basis_unit = 'g'
                and selected.is_volume_input
                and conversion.candidate_count = 1
              then conversion.single_assignment_id
              else null
            end
        ) order by ingredient.id::text collate "C"
      ),
      '[]'::jsonb
    )
  )
  from public.recipe_ingredients ingredient
  left join lateral (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'link_id', link.id,
            'profile_id', profile.id,
            'source_item_id', source_item.id,
            'source_id', source.id,
            'preparation_state', link.preparation_state,
            'normalization_method', profile.normalization_method,
            'basis_amount', profile.basis_amount,
            'basis_unit', profile.basis_unit,
            'nutrition_values', (
              select coalesce(
                jsonb_agg(
                  jsonb_build_object(
                    'nutrient_code', value.nutrient_code,
                    'amount', value.amount,
                    'value_status', value.value_status
                  ) order by value.nutrient_code collate "C"
                ),
                '[]'::jsonb
              )
              from public.nutrition_values value
              where value.profile_id = profile.id
            ),
            'source', jsonb_build_object(
              'provider', source.provider_code,
              'dataset', source.dataset_name,
              'source_version', source.source_version,
              'data_basis_date', source.data_basis_date,
              'license', source.license_name,
              'source_url', source.source_url
            )
          ) order by link.id::text collate "C"
        ),
        '[]'::jsonb
      ) as candidates,
      count(*) filter (where profile.basis_unit = 'g') as mass_count,
      count(*) filter (where profile.basis_unit = 'ml') as volume_count,
      (array_agg(link.id order by link.id::text collate "C")
        filter (where profile.basis_unit = 'g'))[1] as single_mass_link_id,
      (array_agg(link.id order by link.id::text collate "C")
        filter (where profile.basis_unit = 'ml'))[1] as single_volume_link_id
    from public.ingredient_nutrition_profiles link
    join public.nutrition_profiles profile on profile.id = link.nutrition_profile_id
    join public.nutrition_source_items source_item on source_item.id = profile.source_item_id
    join public.nutrition_sources source on source.id = source_item.source_id
    where link.ingredient_id = ingredient.ingredient_id
      and link.review_status = 'approved'
      and link.is_active
      and link.is_primary
      and profile.profile_kind = 'ingredient_source'
      and profile.normalization_method in ('mass_100g', 'volume_100ml')
      and profile.review_status = 'approved'
      and profile.is_active
      and profile.basis_amount = 100
      and (
        (profile.normalization_method = 'mass_100g' and profile.basis_unit = 'g')
        or (profile.normalization_method = 'volume_100ml' and profile.basis_unit = 'ml')
      )
      and source_item.review_status = 'approved'
      and source.review_status = 'approved'
      and source.freshness_status = 'current'
      and source.is_active
      and not exists (
        select 1
        from public.nutrition_values value
        where value.profile_id = profile.id
          and value.nutrient_code <> all(array[
            'energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g', 'sodium_mg',
            'sugars_g', 'saturated_fat_g', 'fiber_g'
          ])
      )
  ) nutrition on true
  left join lateral (
    select
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'assignment_id', assignment.id,
            'profile_id', profile.id,
            'evidence_id', evidence.id,
            'source_id', source.id,
            'preparation_state', assignment.preparation_state,
            'profile_code', profile.code,
            'basis_volume_ml', profile.basis_volume_ml,
            'representative_weight_g', profile.representative_weight_g,
            'evidence_preparation_state', evidence.preparation_state,
            'source', jsonb_build_object(
              'provider', source.provider_code,
              'dataset', source.dataset_name,
              'source_version', source.source_version,
              'data_basis_date', source.data_basis_date,
              'license', source.license_name,
              'source_url', source.source_url
            )
          ) order by assignment.id::text collate "C"
        ),
        '[]'::jsonb
      ) as candidates,
      count(*) as candidate_count,
      (array_agg(assignment.id order by assignment.id::text collate "C"))[1]
        as single_assignment_id
    from public.ingredient_conversion_assignments assignment
    join public.measurement_conversion_profiles profile
      on profile.id = assignment.conversion_profile_id
    join public.measurement_source_evidence evidence on evidence.id = assignment.evidence_id
    join public.nutrition_sources source on source.id = evidence.source_id
    where assignment.ingredient_id = ingredient.ingredient_id
      and assignment.review_status = 'approved'
      and assignment.is_active
      and profile.is_active
      and profile.basis_volume_ml = 15
      and (
        (profile.code = 'VOLUME_G6' and profile.representative_weight_g = 6)
        or (profile.code = 'VOLUME_G10' and profile.representative_weight_g = 10)
        or (profile.code = 'VOLUME_G15' and profile.representative_weight_g = 15)
        or (profile.code = 'VOLUME_G20' and profile.representative_weight_g = 20)
        or (profile.code = 'VOLUME_G25' and profile.representative_weight_g = 25)
      )
      and evidence.evidence_kind = 'volume_weight'
      and evidence.preparation_state = assignment.preparation_state
      and evidence.review_status = 'approved'
      and evidence.is_active
      and source.review_status = 'approved'
      and source.freshness_status = 'current'
      and source.is_active
  ) conversion on true
  cross join lateral (
    select
      lower(btrim(coalesce(ingredient.unit, ''))) in ('ml', 'l', 'tbsp', 'tsp', 'cup')
        as is_volume_input,
      case
        when lower(btrim(coalesce(ingredient.unit, ''))) in ('ml', 'l', 'tbsp', 'tsp', 'cup')
          and nutrition.volume_count = 1
          then nutrition.single_volume_link_id
        when lower(btrim(coalesce(ingredient.unit, ''))) in ('ml', 'l', 'tbsp', 'tsp', 'cup')
          and nutrition.volume_count = 0
          and nutrition.mass_count = 1
          then nutrition.single_mass_link_id
        when lower(btrim(coalesce(ingredient.unit, ''))) not in ('ml', 'l', 'tbsp', 'tsp', 'cup')
          and nutrition.mass_count = 1
          then nutrition.single_mass_link_id
        else null
      end as link_id,
      case
        when lower(btrim(coalesce(ingredient.unit, ''))) in ('ml', 'l', 'tbsp', 'tsp', 'cup')
          and nutrition.volume_count = 1
          then 'ml'
        when lower(btrim(coalesce(ingredient.unit, ''))) in ('ml', 'l', 'tbsp', 'tsp', 'cup')
          and nutrition.volume_count = 0
          and nutrition.mass_count = 1
          then 'g'
        when lower(btrim(coalesce(ingredient.unit, ''))) not in ('ml', 'l', 'tbsp', 'tsp', 'cup')
          and nutrition.mass_count = 1
          then 'g'
        else null
      end as basis_unit
  ) selected
  where ingredient.recipe_id = p_recipe_id;
$$;

create function public.build_recipe_nutrition_contributing_sources(p_input_guard jsonb)
returns jsonb
language sql
immutable
strict
set search_path = pg_catalog
as $$
  with guard_ingredients as (
    select ingredient
    from jsonb_array_elements(
      coalesce(p_input_guard -> 'recipe_ingredients', '[]'::jsonb)
    ) ingredient
  ), selected as (
    select
      guard_ingredient.ingredient,
      nutrition.candidate as nutrition_candidate,
      conversion.candidate as conversion_candidate,
      lower(btrim(coalesce(guard_ingredient.ingredient ->> 'unit', ''))) as unit,
      coalesce((guard_ingredient.ingredient ->> 'amount')::numeric, 0) as amount
    from guard_ingredients guard_ingredient
    left join lateral (
      select candidates.candidate
      from jsonb_array_elements(
        coalesce(guard_ingredient.ingredient -> 'nutrition_candidates', '[]'::jsonb)
      ) as candidates(candidate)
      where (candidates.candidate ->> 'link_id') =
        (guard_ingredient.ingredient ->> 'selected_nutrition_link_id')
      limit 1
    ) nutrition on true
    left join lateral (
      select candidates.candidate
      from jsonb_array_elements(
        coalesce(guard_ingredient.ingredient -> 'conversion_candidates', '[]'::jsonb)
      ) as candidates(candidate)
      where (candidates.candidate ->> 'assignment_id') =
        (guard_ingredient.ingredient ->> 'selected_conversion_assignment_id')
      limit 1
    ) conversion on true
  ), contributing as (
    select
      selected.*,
      case
        when selected.unit in ('g', 'kg')
          and (selected.nutrition_candidate ->> 'basis_unit') = 'g'
          then 'direct'
        when selected.unit in ('ml', 'l', 'tbsp', 'tsp', 'cup')
          and (selected.nutrition_candidate ->> 'basis_unit') = 'ml'
          then 'direct'
        when selected.unit in ('ml', 'l', 'tbsp', 'tsp', 'cup')
          and (selected.nutrition_candidate ->> 'basis_unit') = 'g'
          and selected.conversion_candidate is not null
          and (selected.conversion_candidate ->> 'preparation_state') =
            (selected.nutrition_candidate ->> 'preparation_state')
          and (selected.conversion_candidate ->> 'evidence_preparation_state') =
            (selected.nutrition_candidate ->> 'preparation_state')
          then 'conversion'
        else null
      end as resolution_kind
    from selected
    where selected.ingredient ->> 'ingredient_type' = 'QUANT'
      and selected.amount > 0
      and selected.nutrition_candidate is not null
      and exists (
        select 1
        from jsonb_array_elements(
          coalesce(selected.nutrition_candidate -> 'nutrition_values', '[]'::jsonb)
        ) value
        where value ->> 'value_status' = 'observed'
          and value -> 'amount' <> 'null'::jsonb
      )
  ), source_rows as (
    select nutrition_candidate -> 'source' as source
    from contributing
    where resolution_kind is not null
    union all
    select conversion_candidate -> 'source' as source
    from contributing
    where resolution_kind = 'conversion'
  )
  select coalesce(
    jsonb_agg(source order by
      source ->> 'provider' collate "C" asc nulls first,
      source ->> 'dataset' collate "C" asc nulls first,
      source ->> 'source_version' collate "C" asc nulls first,
      source ->> 'data_basis_date' collate "C" asc nulls first,
      source ->> 'license' collate "C" asc nulls first,
      source ->> 'source_url' collate "C" asc nulls first
    ),
    '[]'::jsonb
  )
  from (select distinct source from source_rows where source is not null) canonical;
$$;

create function public.write_recipe_nutrition_snapshot(
  p_recipe_id uuid,
  p_snapshot jsonb,
  p_expected_recipe_updated_at timestamptz,
  p_input_guard jsonb
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
  v_recipe_base_servings numeric;
  v_ingredient_ids uuid[];
  v_actual_input_guard jsonb;
  v_actual_sources jsonb;
begin
  perform public.lock_recipe_nutrition_recipe_ids(array[p_recipe_id]);
  select updated_at, base_servings into v_recipe_updated_at, v_recipe_base_servings
  from public.recipes
  where id = p_recipe_id
  for share;
  if v_recipe_updated_at is null then
    raise exception 'RECIPE_NOT_FOUND';
  end if;
  if v_recipe_updated_at is distinct from p_expected_recipe_updated_at then
    raise exception 'RECIPE_NUTRITION_INPUT_STALE';
  end if;

  select array_agg(ingredient_id order by ingredient_id::text collate "C")
    into v_ingredient_ids
    from (
      select distinct ingredient_id
      from public.recipe_ingredients
      where recipe_id = p_recipe_id
    ) ingredients;
  perform public.lock_recipe_nutrition_ingredient_ids(v_ingredient_ids, true);

  perform public.validate_recipe_nutrition_snapshot_payload(p_snapshot);
  v_actual_input_guard := public.build_recipe_nutrition_input_guard(p_recipe_id);
  if v_recipe_base_servings is distinct from (p_snapshot ->> 'base_servings')::numeric
    or v_actual_input_guard is distinct from p_input_guard
  then
    raise exception 'RECIPE_NUTRITION_INPUT_STALE';
  end if;
  v_actual_sources := public.build_recipe_nutrition_contributing_sources(v_actual_input_guard);
  if v_actual_sources is distinct from p_snapshot -> 'sources' then
    raise exception 'SNAPSHOT_SOURCE_MISMATCH';
  end if;

  v_snapshot_hex := md5(
    p_recipe_id::text || chr(31) || (p_snapshot ->> 'input_hash') || chr(31) ||
    (p_snapshot ->> 'calculation_version')
  );
  v_deterministic_snapshot_id := (
    substr(v_snapshot_hex, 1, 8) || '-' || substr(v_snapshot_hex, 9, 4) || '-' ||
    substr(v_snapshot_hex, 13, 4) || '-' || substr(v_snapshot_hex, 17, 4) || '-' ||
    substr(v_snapshot_hex, 21, 12)
  )::uuid;
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
  perform public.lock_recipe_nutrition_recipe_ids(array[p_recipe_id]);
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

revoke truncate on table public.recipe_ingredients from anon, authenticated, service_role;
revoke truncate on table
  public.nutrition_sources,
  public.nutrition_source_items,
  public.nutrition_profiles,
  public.nutrition_values,
  public.ingredient_nutrition_profiles,
  public.measurement_conversion_profiles,
  public.measurement_source_evidence,
  public.ingredient_conversion_assignments,
  public.piece_unit_weights
from anon, authenticated, service_role;

revoke all on function public.protect_recipe_nutrition_snapshot()
  from public, anon, authenticated, service_role;
revoke all on function public.decode_recipe_nutrition_query_key(text)
  from public, anon, authenticated, service_role;
revoke all on function public.recipe_nutrition_recipe_lock_key(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.recipe_nutrition_ingredient_lock_key(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.lock_recipe_nutrition_recipe_ids(uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.lock_recipe_nutrition_ingredient_ids(uuid[], boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.lock_recipe_nutrition_recipe_ingredient_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.lock_recipe_nutrition_predecessor_mutation()
  from public, anon, authenticated, service_role;
revoke all on function public.pin_current_recipe_nutrition_snapshot_on_meal_insert()
  from public, anon, authenticated, service_role;
revoke all on function public.protect_meal_recipe_nutrition_pin()
  from public, anon, authenticated, service_role;
revoke all on function public.validate_recipe_nutrition_snapshot_payload(jsonb)
  from public, anon, authenticated;
revoke all on function public.build_recipe_nutrition_input_guard(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.build_recipe_nutrition_contributing_sources(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.write_recipe_nutrition_snapshot(uuid, jsonb, timestamptz, jsonb)
  from public, anon, authenticated;
revoke all on function public.restore_recipe_nutrition_snapshot_current(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.backfill_foodsafety_recipe_nutrition_meal_pins(boolean, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.validate_recipe_nutrition_snapshot_payload(jsonb) to service_role;
grant execute on function public.decode_recipe_nutrition_query_key(text) to service_role;
grant execute on function public.write_recipe_nutrition_snapshot(uuid, jsonb, timestamptz, jsonb)
  to service_role;
grant execute on function public.restore_recipe_nutrition_snapshot_current(uuid, uuid, uuid) to service_role;
grant execute on function public.backfill_foodsafety_recipe_nutrition_meal_pins(boolean, uuid, integer)
  to service_role;
