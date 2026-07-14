create table public.nutrient_definitions (
  code varchar(50) primary key,
  label varchar(50) not null,
  unit varchar(10) not null check (unit in ('kcal', 'g', 'mg')),
  display_order integer not null,
  is_core boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.nutrition_sources (
  id uuid primary key default gen_random_uuid(),
  provider_code varchar(50) not null,
  dataset_name text not null,
  source_kind varchar(30) not null check (source_kind in ('nutrition_dataset', 'measurement_reference')),
  source_version text not null,
  data_basis_date date,
  fetched_at timestamptz not null,
  freshness_checked_at timestamptz not null,
  freshness_status varchar(20) not null check (freshness_status in ('current', 'stale', 'drifted', 'unknown')),
  priority_rank smallint check (priority_rank is null or priority_rank > 0),
  source_url text not null,
  license_name text not null,
  license_url text,
  manifest_sha256 text not null,
  review_status varchar(20) not null check (review_status in ('pending', 'approved', 'rejected', 'needs_source_check', 'superseded')),
  decision_reason text,
  reviewed_by uuid references public.users(id) on delete restrict,
  reviewed_at timestamptz,
  is_active boolean not null default false,
  superseded_by_id uuid references public.nutrition_sources(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (provider_code, dataset_name, source_version, manifest_sha256),
  check (review_status not in ('approved', 'rejected', 'superseded') or (nullif(btrim(decision_reason), '') is not null and reviewed_by is not null and reviewed_at is not null)),
  check (not is_active or (review_status = 'approved' and freshness_status = 'current'))
);

create unique index nutrition_sources_active_provider_dataset_idx
  on public.nutrition_sources (provider_code, dataset_name) where is_active;

create table public.nutrition_source_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.nutrition_sources(id) on delete restrict,
  external_item_key text not null,
  external_name text not null,
  preparation_state text,
  source_basis_text text,
  source_basis_amount numeric(12,4),
  source_basis_unit varchar(20),
  source_serving_amount numeric(12,4),
  source_serving_unit varchar(20),
  source_serving_text text,
  source_total_content_amount numeric(12,4),
  source_total_content_unit varchar(20),
  source_total_content_text text,
  edible_portion_percent numeric(6,3) check (edible_portion_percent is null or (edible_portion_percent > 0 and edible_portion_percent <= 100)),
  edible_portion_text text,
  stable_fingerprint text not null,
  review_status varchar(20) not null check (review_status in ('pending', 'approved', 'rejected', 'needs_review', 'needs_source_check', 'superseded')),
  decision_reason text,
  reviewed_by uuid references public.users(id) on delete restrict,
  reviewed_at timestamptz,
  provenance_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_id, external_item_key),
  unique (source_id, stable_fingerprint),
  check (review_status not in ('approved', 'rejected', 'superseded') or (nullif(btrim(decision_reason), '') is not null and reviewed_by is not null and reviewed_at is not null))
);

create table public.nutrition_profiles (
  id uuid primary key default gen_random_uuid(),
  source_item_id uuid references public.nutrition_source_items(id) on delete restrict,
  profile_kind varchar(30) not null check (profile_kind in ('ingredient_source', 'product_label', 'recipe_calculation')),
  normalization_method varchar(30) not null check (normalization_method in ('mass_100g', 'volume_100ml', 'as_labeled', 'recipe_calculation')),
  basis_amount numeric(12,4) not null check (basis_amount > 0),
  basis_unit varchar(20) not null check (basis_unit in ('g', 'ml', 'serving', 'package', 'recipe')),
  version integer not null default 1,
  review_status varchar(20) not null check (review_status in ('pending', 'approved', 'rejected', 'revoked', 'superseded', 'self_reported')),
  decision_reason text,
  reviewed_by uuid references public.users(id) on delete restrict,
  reviewed_at timestamptz,
  is_active boolean not null default false,
  superseded_by_id uuid references public.nutrition_profiles(id) on delete restrict,
  created_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (review_status not in ('approved', 'rejected', 'revoked', 'superseded') or (nullif(btrim(decision_reason), '') is not null and reviewed_by is not null and reviewed_at is not null)),
  check (not is_active or review_status in ('approved', 'self_reported'))
);

create unique index nutrition_profiles_source_version_idx
  on public.nutrition_profiles (source_item_id, profile_kind, version) where source_item_id is not null;
create unique index nutrition_profiles_active_source_idx
  on public.nutrition_profiles (source_item_id, profile_kind) where source_item_id is not null and is_active;

create table public.nutrition_values (
  profile_id uuid not null references public.nutrition_profiles(id) on delete restrict,
  nutrient_code varchar(50) not null references public.nutrient_definitions(code) on delete restrict,
  source_nutrient_code text,
  source_unit varchar(20),
  amount numeric(14,6),
  value_status varchar(20) not null check (value_status in ('observed', 'missing', 'trace', 'parse_error')),
  source_token text,
  created_at timestamptz not null default now(),
  primary key (profile_id, nutrient_code),
  check ((value_status = 'observed' and amount is not null and amount >= 0) or (value_status <> 'observed' and amount is null))
);

create table public.ingredient_nutrition_profiles (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  nutrition_profile_id uuid not null references public.nutrition_profiles(id) on delete restrict,
  preparation_state text not null,
  match_method varchar(30) not null,
  confidence_score numeric(5,4) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  candidate_rank integer,
  is_primary boolean not null default false,
  review_status varchar(20) not null check (review_status in ('pending', 'needs_review', 'approved', 'rejected', 'revoked', 'superseded')),
  decision_reason text,
  reviewed_by uuid references public.users(id) on delete restrict,
  reviewed_at timestamptz,
  version integer not null,
  is_active boolean not null default false,
  superseded_by_id uuid references public.ingredient_nutrition_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (ingredient_id, nutrition_profile_id, preparation_state, version),
  check (review_status not in ('approved', 'rejected', 'revoked', 'superseded') or (nullif(btrim(decision_reason), '') is not null and reviewed_by is not null and reviewed_at is not null)),
  check (not is_active or (is_primary and review_status = 'approved'))
);

create unique index ingredient_nutrition_profiles_active_primary_idx
  on public.ingredient_nutrition_profiles (ingredient_id, preparation_state)
  where is_primary and is_active and review_status = 'approved';

create table public.measurement_conversion_profiles (
  id uuid primary key default gen_random_uuid(),
  code varchar(30) not null check (code in ('VOLUME_G6', 'VOLUME_G10', 'VOLUME_G15', 'VOLUME_G20', 'VOLUME_G25')),
  basis_volume_ml numeric(8,3) not null default 15 check (basis_volume_ml = 15),
  representative_weight_g numeric(8,3) not null check (representative_weight_g in (6, 10, 15, 20, 25)),
  display_rounding_g numeric(8,3) not null default 1,
  display_qualifier varchar(20) not null default 'approximate' check (display_qualifier = 'approximate'),
  version integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (code, version),
  check ((code = 'VOLUME_G6' and representative_weight_g = 6)
    or (code = 'VOLUME_G10' and representative_weight_g = 10)
    or (code = 'VOLUME_G15' and representative_weight_g = 15)
    or (code = 'VOLUME_G20' and representative_weight_g = 20)
    or (code = 'VOLUME_G25' and representative_weight_g = 25))
);

create unique index measurement_conversion_profiles_active_code_idx
  on public.measurement_conversion_profiles (code) where is_active;

create table public.measurement_source_evidence (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.nutrition_sources(id) on delete restrict,
  source_item_id uuid references public.nutrition_source_items(id) on delete restrict,
  evidence_kind varchar(20) not null check (evidence_kind in ('volume_weight', 'piece_weight')),
  source_subject text not null,
  preparation_state text not null,
  size_code varchar(20),
  source_observed_unit text not null,
  source_observed_amount numeric(12,4) not null,
  observed_volume_ml numeric(12,4),
  observed_weight_g numeric(12,4) not null,
  normalized_g_per_15ml numeric(12,4),
  source_url text not null,
  source_accessed_at date not null,
  evidence_fingerprint text not null,
  review_status varchar(20) not null check (review_status in ('pending', 'approved', 'rejected', 'needs_source_check', 'superseded')),
  decision_reason text,
  reviewed_by uuid references public.users(id) on delete restrict,
  reviewed_at timestamptz,
  version integer not null,
  is_active boolean not null default false,
  superseded_by_id uuid references public.measurement_source_evidence(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (source_id, evidence_fingerprint, version),
  check (source_observed_amount > 0 and observed_weight_g > 0),
  check ((evidence_kind = 'volume_weight' and observed_volume_ml > 0 and normalized_g_per_15ml > 0 and size_code is null) or (evidence_kind = 'piece_weight' and observed_volume_ml is null and normalized_g_per_15ml is null and size_code is not null)),
  check (review_status not in ('approved', 'rejected', 'superseded') or (nullif(btrim(decision_reason), '') is not null and reviewed_by is not null and reviewed_at is not null)),
  check (not is_active or review_status = 'approved')
);

create table public.ingredient_conversion_assignments (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  conversion_profile_id uuid not null references public.measurement_conversion_profiles(id) on delete restrict,
  evidence_id uuid not null references public.measurement_source_evidence(id) on delete restrict,
  preparation_state text not null,
  distance_g_per_15ml numeric(8,4) not null check (distance_g_per_15ml >= 0 and distance_g_per_15ml <= 2.5),
  candidate_rank integer not null,
  confidence_score numeric(5,4) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  assignment_reason text,
  review_status varchar(20) not null check (review_status in ('pending', 'needs_review', 'approved', 'rejected', 'revoked', 'superseded')),
  reviewed_by uuid references public.users(id) on delete restrict,
  reviewed_at timestamptz,
  version integer not null,
  is_active boolean not null default false,
  superseded_by_id uuid references public.ingredient_conversion_assignments(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (ingredient_id, evidence_id, conversion_profile_id, version),
  check (review_status not in ('approved', 'rejected', 'revoked', 'superseded') or (nullif(btrim(assignment_reason), '') is not null and reviewed_by is not null and reviewed_at is not null)),
  check (not is_active or review_status = 'approved')
);

create unique index ingredient_conversion_assignments_active_idx
  on public.ingredient_conversion_assignments (ingredient_id, preparation_state)
  where is_active and review_status = 'approved';

create table public.piece_unit_weights (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  evidence_id uuid not null references public.measurement_source_evidence(id) on delete restrict,
  size_code varchar(20) not null,
  preparation_state text not null,
  weight_g numeric(10,3) not null check (weight_g > 0),
  review_status varchar(20) not null check (review_status in ('pending', 'needs_review', 'approved', 'rejected', 'revoked', 'superseded')),
  decision_reason text,
  reviewed_by uuid references public.users(id) on delete restrict,
  reviewed_at timestamptz,
  version integer not null,
  is_active boolean not null default false,
  superseded_by_id uuid references public.piece_unit_weights(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (ingredient_id, evidence_id, size_code, preparation_state, version),
  check (review_status not in ('approved', 'rejected', 'revoked', 'superseded') or (nullif(btrim(decision_reason), '') is not null and reviewed_by is not null and reviewed_at is not null)),
  check (not is_active or review_status = 'approved')
);

create unique index piece_unit_weights_active_idx
  on public.piece_unit_weights (ingredient_id, size_code, preparation_state)
  where is_active and review_status = 'approved';

insert into public.nutrient_definitions (code, label, unit, display_order, is_core) values
  ('energy_kcal', '열량', 'kcal', 1, true),
  ('carbohydrate_g', '탄수화물', 'g', 2, true),
  ('protein_g', '단백질', 'g', 3, true),
  ('fat_g', '지방', 'g', 4, true),
  ('sodium_mg', '나트륨', 'mg', 5, true),
  ('sugars_g', '당류', 'g', 6, false),
  ('saturated_fat_g', '포화지방', 'g', 7, false),
  ('fiber_g', '식이섬유', 'g', 8, false);

insert into public.measurement_conversion_profiles
  (id, code, basis_volume_ml, representative_weight_g, display_rounding_g, display_qualifier, version, is_active)
values
  ('71000000-0000-4000-8000-000000000006', 'VOLUME_G6', 15, 6, 1, 'approximate', 1, true),
  ('71000000-0000-4000-8000-000000000010', 'VOLUME_G10', 15, 10, 1, 'approximate', 1, true),
  ('71000000-0000-4000-8000-000000000015', 'VOLUME_G15', 15, 15, 1, 'approximate', 1, true),
  ('71000000-0000-4000-8000-000000000020', 'VOLUME_G20', 15, 20, 1, 'approximate', 1, true),
  ('71000000-0000-4000-8000-000000000025', 'VOLUME_G25', 15, 25, 1, 'approximate', 1, true);

create unique index ingredient_nutrition_run_registry_idempotency_idx
  on public.operational_events ((metadata_json ->> 'idempotency_key'))
  where source = 'ingredient-nutrition-model';
create unique index ingredient_nutrition_run_registry_run_id_idx
  on public.operational_events ((metadata_json ->> 'run_id'))
  where source = 'ingredient-nutrition-model';

create function public.protect_ingredient_nutrition_run_registry()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.source = 'ingredient-nutrition-model' then
    raise exception 'IMMUTABLE_INGREDIENT_NUTRITION_RUN';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger protect_ingredient_nutrition_run_registry
before update or delete on public.operational_events
for each row execute function public.protect_ingredient_nutrition_run_registry();

create function public.protect_nutrition_model_row()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_payload jsonb;
  new_payload jsonb;
  allowed_transition boolean := false;
begin
  if tg_op = 'DELETE' then
    raise exception 'DELETE_NOT_ALLOWED';
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

create trigger protect_nutrient_definitions before update or delete on public.nutrient_definitions for each row execute function public.protect_nutrition_model_row();
create trigger protect_nutrition_sources before update or delete on public.nutrition_sources for each row execute function public.protect_nutrition_model_row();
create trigger protect_nutrition_source_items before update or delete on public.nutrition_source_items for each row execute function public.protect_nutrition_model_row();
create trigger protect_nutrition_profiles before update or delete on public.nutrition_profiles for each row execute function public.protect_nutrition_model_row();
create trigger protect_nutrition_values before update or delete on public.nutrition_values for each row execute function public.protect_nutrition_model_row();
create trigger protect_ingredient_nutrition_profiles before update or delete on public.ingredient_nutrition_profiles for each row execute function public.protect_nutrition_model_row();
create trigger protect_measurement_conversion_profiles before update or delete on public.measurement_conversion_profiles for each row execute function public.protect_nutrition_model_row();
create trigger protect_measurement_source_evidence before update or delete on public.measurement_source_evidence for each row execute function public.protect_nutrition_model_row();
create trigger protect_ingredient_conversion_assignments before update or delete on public.ingredient_conversion_assignments for each row execute function public.protect_nutrition_model_row();
create trigger protect_piece_unit_weights before update or delete on public.piece_unit_weights for each row execute function public.protect_nutrition_model_row();

create function public.validate_ingredient_nutrition_model_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_source public.nutrition_sources%rowtype;
  v_source_item public.nutrition_source_items%rowtype;
  v_evidence public.measurement_source_evidence%rowtype;
  v_profile public.measurement_conversion_profiles%rowtype;
  v_ingredient_name text;
  v_raw_distance numeric;
  v_nearest_distance numeric;
  v_nearest_count integer;
begin
  if tg_table_name = 'nutrition_source_items' then
    select * into v_source from public.nutrition_sources where id = new.source_id;
    if v_source.id is null or v_source.freshness_status <> 'current'
      or v_source.review_status <> 'approved' or not v_source.is_active
      or new.provenance_json::text ~* '"(raw_payload|raw_row|provider_response|servicekey|api_key|secret)"'
    then
      raise exception 'INVALID_NUTRITION_SOURCE_ITEM_CONTEXT';
    end if;
  elsif tg_table_name = 'nutrition_profiles' then
    if new.source_item_id is not null then
      select item.* into v_source_item
      from public.nutrition_source_items item
      join public.nutrition_sources source on source.id = item.source_id
      where item.id = new.source_item_id
        and item.review_status = 'approved'
        and source.freshness_status = 'current'
        and source.review_status = 'approved'
        and source.is_active;
      if v_source_item.id is null
        or (new.normalization_method = 'mass_100g' and
            (new.basis_amount <> 100 or new.basis_unit <> 'g' or v_source_item.source_basis_unit <> 'g'))
        or (new.normalization_method = 'volume_100ml' and
            (new.basis_amount <> 100 or new.basis_unit <> 'ml' or v_source_item.source_basis_unit <> 'ml'))
      then
        raise exception 'INVALID_NUTRITION_PROFILE_CONTEXT';
      end if;
    end if;
  elsif tg_table_name = 'nutrition_values' then
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
  elsif tg_table_name = 'ingredient_nutrition_profiles' then
    select item.* into v_source_item
    from public.nutrition_profiles profile
    join public.nutrition_source_items item on item.id = profile.source_item_id
    join public.nutrition_sources source on source.id = item.source_id
    where profile.id = new.nutrition_profile_id
      and profile.review_status = 'approved' and profile.is_active
      and item.review_status = 'approved'
      and source.freshness_status = 'current'
      and source.review_status = 'approved' and source.is_active;
    select standard_name into v_ingredient_name
    from public.ingredients where id = new.ingredient_id;
    if v_source_item.id is null
      or v_source_item.preparation_state is distinct from new.preparation_state
      or (v_source_item.edible_portion_percent is null and
          nullif(btrim(v_source_item.edible_portion_text), '') is null)
      or not (
        lower(btrim(v_source_item.external_name)) = lower(btrim(v_ingredient_name))
        or exists (
          select 1 from public.ingredient_synonyms synonym
          where synonym.ingredient_id = new.ingredient_id
            and lower(btrim(synonym.synonym)) = lower(btrim(v_source_item.external_name))
        )
      )
    then
      raise exception 'INVALID_NUTRITION_LINK_CONTEXT';
    end if;
  elsif tg_table_name = 'measurement_source_evidence' then
    select * into v_source from public.nutrition_sources where id = new.source_id;
    if v_source.id is null or v_source.source_kind <> 'measurement_reference'
      or v_source.freshness_status <> 'current'
      or v_source.review_status <> 'approved' or not v_source.is_active
    then
      raise exception 'INVALID_MEASUREMENT_EVIDENCE_CONTEXT';
    end if;
  elsif tg_table_name = 'ingredient_conversion_assignments' then
    select evidence.* into v_evidence
    from public.measurement_source_evidence evidence
    join public.nutrition_sources source on source.id = evidence.source_id
    where evidence.id = new.evidence_id
      and evidence.evidence_kind = 'volume_weight'
      and evidence.review_status = 'approved' and evidence.is_active
      and source.freshness_status = 'current'
      and source.review_status = 'approved' and source.is_active;
    select standard_name into v_ingredient_name
    from public.ingredients where id = new.ingredient_id;
    select * into v_profile from public.measurement_conversion_profiles
    where id = new.conversion_profile_id and is_active;
    select min(abs(v_evidence.normalized_g_per_15ml - representative_weight_g))
      into v_nearest_distance
    from public.measurement_conversion_profiles where is_active;
    select count(*) into v_nearest_count
    from public.measurement_conversion_profiles
    where is_active
      and abs(v_evidence.normalized_g_per_15ml - representative_weight_g) = v_nearest_distance;
    v_raw_distance := abs(v_evidence.normalized_g_per_15ml - v_profile.representative_weight_g);
    if v_evidence.id is null or v_profile.id is null
      or v_evidence.preparation_state <> new.preparation_state
      or not (
        regexp_replace(lower(btrim(v_evidence.source_subject)), '[[:space:]]+', '', 'g') =
          regexp_replace(lower(btrim(v_ingredient_name)), '[[:space:]]+', '', 'g')
        or exists (
          select 1 from public.ingredient_synonyms synonym
          where synonym.ingredient_id = new.ingredient_id
            and regexp_replace(lower(btrim(synonym.synonym)), '[[:space:]]+', '', 'g') =
              regexp_replace(lower(btrim(v_evidence.source_subject)), '[[:space:]]+', '', 'g')
        )
      )
      or v_raw_distance > 2.5 or v_raw_distance <> v_nearest_distance
      or new.distance_g_per_15ml <> v_raw_distance
      or (new.review_status = 'approved' and v_nearest_count <> 1)
    then
      raise exception 'INVALID_CONVERSION_ASSIGNMENT_CONTEXT';
    end if;
  elsif tg_table_name = 'piece_unit_weights' then
    select evidence.* into v_evidence
    from public.measurement_source_evidence evidence
    join public.nutrition_sources source on source.id = evidence.source_id
    join public.ingredients ingredient on ingredient.id = new.ingredient_id
    where evidence.id = new.evidence_id
      and evidence.evidence_kind = 'piece_weight'
      and evidence.review_status = 'approved' and evidence.is_active
      and source.freshness_status = 'current'
      and source.review_status = 'approved' and source.is_active
      and evidence.preparation_state = new.preparation_state
      and evidence.size_code = new.size_code
      and evidence.observed_weight_g = new.weight_g
      and (
        lower(btrim(evidence.source_subject)) = lower(btrim(ingredient.standard_name))
        or exists (
          select 1 from public.ingredient_synonyms synonym
          where synonym.ingredient_id = new.ingredient_id
            and lower(btrim(synonym.synonym)) = lower(btrim(evidence.source_subject))
        )
      );
    if v_evidence.id is null then
      raise exception 'INVALID_PIECE_WEIGHT_CONTEXT';
    end if;
  end if;
  return new;
end;
$$;

create trigger validate_nutrition_source_item_insert before insert on public.nutrition_source_items for each row execute function public.validate_ingredient_nutrition_model_insert();
create trigger validate_nutrition_profile_insert before insert on public.nutrition_profiles for each row execute function public.validate_ingredient_nutrition_model_insert();
create trigger validate_nutrition_value_insert before insert on public.nutrition_values for each row execute function public.validate_ingredient_nutrition_model_insert();
create trigger validate_ingredient_nutrition_profile_insert before insert on public.ingredient_nutrition_profiles for each row execute function public.validate_ingredient_nutrition_model_insert();
create trigger validate_measurement_evidence_insert before insert on public.measurement_source_evidence for each row execute function public.validate_ingredient_nutrition_model_insert();
create trigger validate_conversion_assignment_insert before insert on public.ingredient_conversion_assignments for each row execute function public.validate_ingredient_nutrition_model_insert();
create trigger validate_piece_weight_insert before insert on public.piece_unit_weights for each row execute function public.validate_ingredient_nutrition_model_insert();

create function public.apply_ingredient_nutrition_model(p_model jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_bundle jsonb := p_model -> 'bundle';
  v_approval jsonb := p_model -> 'approval';
  v_manifest jsonb := v_bundle -> 'approved_manifest';
  v_attribution jsonb := v_bundle -> 'public_attribution' -> 0;
  v_actor uuid := (v_approval ->> 'reviewed_by')::uuid;
  v_reviewed_at timestamptz := (v_approval ->> 'reviewed_at')::timestamptz;
  v_reason text := v_approval ->> 'decision_reason';
  v_source_decision jsonb := v_approval -> 'source_decision';
  v_source_id uuid;
  v_measurement_source_id uuid;
  v_measurement_source_version text;
  v_measurement_manifest_sha text;
  v_existing_active_source_id uuid;
  v_source_status text;
  v_source_item_id uuid;
  v_profile_id uuid;
  v_link_id uuid;
  v_previous_link_id uuid;
  v_evidence_id uuid;
  v_conversion_profile_id uuid;
  v_assignment_id uuid;
  v_previous_assignment_id uuid;
  v_piece_weight_id uuid;
  v_previous_piece_weight_id uuid;
  v_item jsonb;
  v_value record;
  v_decision jsonb;
  v_evidence jsonb;
  v_writes integer := 0;
  v_basis_amount numeric;
  v_basis_unit text;
  v_value_status text;
  v_next_version integer;
  v_superseded_count integer := 0;
  v_run_id text := p_model ->> 'run_id';
  v_idempotency_key text := p_model ->> 'idempotency_key';
  v_source_payload_identity text := p_model ->> 'source_payload_identity';
  v_decision_checksum text := p_model ->> 'decision_checksum';
  v_content_hash text := p_model ->> 'content_hash';
  v_registry_metadata jsonb;
  v_result jsonb;
  v_affected_row_ids jsonb := jsonb_build_object(
    'nutrition_source_ids', '[]'::jsonb,
    'nutrition_source_item_ids', '[]'::jsonb,
    'nutrition_profile_ids', '[]'::jsonb,
    'nutrition_value_keys', '[]'::jsonb,
    'nutrition_link_ids', '[]'::jsonb,
    'measurement_evidence_ids', '[]'::jsonb,
    'conversion_assignment_ids', '[]'::jsonb,
    'piece_weight_ids', '[]'::jsonb
  );
begin
  if v_bundle ->> 'status' <> 'approved_pinned'
    or coalesce(v_reason, '') = ''
    or v_actor is null
    or v_reviewed_at is null
    or not exists (select 1 from public.users where id = v_actor)
    or nullif(v_run_id, '') is null
    or nullif(v_idempotency_key, '') is null
    or nullif(v_source_payload_identity, '') is null
    or nullif(v_decision_checksum, '') is null
    or nullif(v_content_hash, '') is null
  then
    raise exception 'INVALID_MODEL_IMPORT';
  end if;
  if p_model::text ~* '"(raw_payload|raw_row|credential_name|secret_value|servicekey|api_key)"'
    or coalesce(v_attribution ->> 'source_url', '') ~* '[?&](servicekey|api_key|authorization|access_token)='
  then
    raise exception 'SECRET_OR_RAW_DATA_LEAK';
  end if;

  select metadata_json into v_registry_metadata
  from public.operational_events
  where source = 'ingredient-nutrition-model'
    and event_type = 'ingredient_nutrition_model_applied'
    and metadata_json ->> 'idempotency_key' = v_idempotency_key;
  if v_registry_metadata is not null then
    if v_registry_metadata ->> 'source_payload_identity' <> v_source_payload_identity
      or v_registry_metadata ->> 'decision_checksum' <> v_decision_checksum
      or v_registry_metadata ->> 'content_hash' <> v_content_hash
    then
      raise exception 'DECISION_RUN_IDENTITY_CONFLICT';
    end if;
    return (v_registry_metadata -> 'result') ||
      jsonb_build_object('writes_committed', 0, 'replayed', true);
  end if;

  select id, review_status into v_source_id, v_source_status
  from public.nutrition_sources
  where provider_code = v_manifest ->> 'provider'
    and dataset_name = v_manifest ->> 'dataset'
    and source_version = v_manifest ->> 'source_version'
    and manifest_sha256 = v_manifest ->> 'raw_sha256';

  if v_source_id is not null and v_source_status = 'approved' then
    v_affected_row_ids := jsonb_set(
      v_affected_row_ids,
      '{nutrition_source_ids}',
      jsonb_build_array(v_source_id)
    );
  elsif v_source_id is not null and v_source_status = 'needs_source_check' then
    v_affected_row_ids := jsonb_set(
      v_affected_row_ids,
      '{nutrition_source_ids}',
      jsonb_build_array(v_source_id)
    );
    if v_source_decision is null or v_source_decision ->> 'status' <> 'supersede' then
      v_result := jsonb_build_object(
        'source_id', v_source_id,
        'status', 'needs_source_check',
        'freshness_status', 'drifted',
        'reason_codes', jsonb_build_array('SOURCE_NOT_CURRENT'),
        'affected_row_ids', v_affected_row_ids
      );
    else
      select id into v_existing_active_source_id
      from public.nutrition_sources
      where provider_code = v_manifest ->> 'provider'
        and dataset_name = v_manifest ->> 'dataset'
        and is_active
        and id <> v_source_id;
      if v_existing_active_source_id is null
        or v_source_decision ->> 'previous_source_id' <> v_existing_active_source_id::text
        or nullif(btrim(v_source_decision ->> 'reason'), '') is null
      then
        raise exception 'INVALID_SOURCE_SUPERSEDE_DECISION';
      end if;
      update public.nutrition_sources
      set review_status = 'superseded', is_active = false, superseded_by_id = v_source_id,
          decision_reason = v_source_decision ->> 'reason', reviewed_by = v_actor,
          reviewed_at = v_reviewed_at
      where id = v_existing_active_source_id;
      v_writes := v_writes + 1;
      v_affected_row_ids := jsonb_set(
        v_affected_row_ids,
        '{nutrition_source_ids}',
        jsonb_build_array(v_existing_active_source_id, v_source_id)
      );
      update public.nutrition_sources
      set freshness_status = 'current', freshness_checked_at = v_reviewed_at,
          review_status = 'approved', is_active = true,
          decision_reason = v_source_decision ->> 'reason', reviewed_by = v_actor,
          reviewed_at = v_reviewed_at
      where id = v_source_id;
      v_writes := v_writes + 1;
    end if;
  elsif v_source_id is not null then
    v_result := jsonb_build_object(
      'source_id', v_source_id,
      'status', v_source_status,
      'freshness_status', 'unknown',
      'reason_codes', jsonb_build_array('SOURCE_NOT_CURRENT'),
      'affected_row_ids', v_affected_row_ids
    );
  end if;

  if v_source_id is null then
    select id into v_existing_active_source_id
    from public.nutrition_sources
    where provider_code = v_manifest ->> 'provider'
      and dataset_name = v_manifest ->> 'dataset'
      and is_active;
  end if;

  if v_source_id is null and v_existing_active_source_id is not null then
    insert into public.nutrition_sources (
      provider_code, dataset_name, source_kind, source_version, data_basis_date,
      fetched_at, freshness_checked_at, freshness_status, priority_rank, source_url,
      license_name, license_url, manifest_sha256, review_status, decision_reason,
      reviewed_by, reviewed_at, is_active
    ) values (
      v_manifest ->> 'provider', v_manifest ->> 'dataset', 'nutrition_dataset',
      v_manifest ->> 'source_version', nullif(v_manifest ->> 'data_basis_date', '')::date,
      v_reviewed_at, v_reviewed_at, 'drifted',
      case when upper(v_manifest ->> 'provider') like '%MFDS%' or v_manifest ->> 'provider' like '%식품의약품안전처%' then 1
           when upper(v_manifest ->> 'provider') like '%RDA%' or v_manifest ->> 'provider' like '%농촌진흥청%' then 2
           else null end,
      v_attribution ->> 'source_url', v_manifest ->> 'license', v_manifest ->> 'license_url',
      v_manifest ->> 'raw_sha256', 'needs_source_check', 'SOURCE_DRIFT_REQUIRES_REVIEW',
      null, null, false
    ) returning id into v_source_id;
    v_writes := v_writes + 1;
    v_affected_row_ids := jsonb_set(
      v_affected_row_ids,
      '{nutrition_source_ids}',
      jsonb_build_array(v_source_id)
    );
    v_result := jsonb_build_object(
      'source_id', v_source_id,
      'status', 'needs_source_check',
      'freshness_status', 'drifted',
      'reason_codes', jsonb_build_array('SOURCE_NOT_CURRENT'),
      'affected_row_ids', v_affected_row_ids
    );
  elsif v_source_id is null then
    insert into public.nutrition_sources (
    provider_code, dataset_name, source_kind, source_version, data_basis_date,
    fetched_at, freshness_checked_at, freshness_status, priority_rank, source_url,
    license_name, license_url, manifest_sha256, review_status, decision_reason,
    reviewed_by, reviewed_at, is_active
  ) values (
    v_manifest ->> 'provider', v_manifest ->> 'dataset', 'nutrition_dataset',
    v_manifest ->> 'source_version', nullif(v_manifest ->> 'data_basis_date', '')::date,
    v_reviewed_at, v_reviewed_at, 'current',
    case when upper(v_manifest ->> 'provider') like '%MFDS%' or v_manifest ->> 'provider' like '%식품의약품안전처%' then 1
         when upper(v_manifest ->> 'provider') like '%RDA%' or v_manifest ->> 'provider' like '%농촌진흥청%' then 2
         else null end,
    v_attribution ->> 'source_url', v_manifest ->> 'license', v_manifest ->> 'license_url',
    v_manifest ->> 'raw_sha256', 'approved', v_reason, v_actor, v_reviewed_at, true
    ) returning id into v_source_id;
    v_writes := v_writes + 1;
    v_affected_row_ids := jsonb_set(
      v_affected_row_ids,
      '{nutrition_source_ids}',
      jsonb_build_array(v_source_id)
    );
  end if;

  if v_result is not null then
    v_writes := v_writes + 1;
    v_result := v_result || jsonb_build_object(
      'writes_committed', v_writes,
      'replayed', false
    );
    v_registry_metadata := jsonb_build_object(
      'run_id', v_run_id,
      'idempotency_key', v_idempotency_key,
      'source_payload_identity', v_source_payload_identity,
      'decision_checksum', v_decision_checksum,
      'content_hash', v_content_hash,
      'affected_source_id', v_source_id,
      'affected_row_ids', v_affected_row_ids,
      'writes_committed', v_writes,
      'summary', coalesce(p_model -> 'run_summary', '{}'::jsonb) || v_result ||
        jsonb_build_object(
          'affected_source_id', v_source_id,
          'affected_row_ids', v_affected_row_ids,
          'writes_attempted', v_writes,
          'writes_committed', v_writes
        ),
      'result', v_result
    );
    v_registry_metadata := v_registry_metadata || jsonb_build_object(
      'registry_checksum', encode(extensions.digest(v_registry_metadata::text, 'sha256'), 'hex')
    );
    insert into public.operational_events (
      event_type, severity, source, actor_user_id, message_summary, metadata_json
    ) values (
      'ingredient_nutrition_model_applied', 'warn', 'ingredient-nutrition-model',
      v_actor, 'ingredient nutrition model review registry', v_registry_metadata
    );
    return v_result;
  end if;

  for v_item in select value from jsonb_array_elements(v_bundle -> 'approved_items')
  loop
    v_basis_amount := (v_item -> 'basis' ->> 'amount')::numeric;
    v_basis_unit := lower(v_item -> 'basis' ->> 'unit');
    if v_basis_amount <= 0 or v_basis_unit not in ('g', 'ml') then
      raise exception 'UNSAFE_NUTRITION_BASIS';
    end if;

    v_source_item_id := null;
    v_profile_id := null;
    select id into v_source_item_id
    from public.nutrition_source_items
    where source_id = v_source_id
      and external_item_key = v_item ->> 'external_item_key'
      and stable_fingerprint = v_item ->> 'fingerprint';
    if v_source_item_id is null then
      insert into public.nutrition_source_items (
        source_id, external_item_key, external_name, preparation_state,
        source_basis_text, source_basis_amount, source_basis_unit,
        source_serving_text, source_serving_amount, source_serving_unit,
        source_total_content_text, source_total_content_amount, source_total_content_unit,
        edible_portion_text, edible_portion_percent, stable_fingerprint,
        review_status, decision_reason, reviewed_by, reviewed_at, provenance_json
      ) values (
        v_source_id, v_item ->> 'external_item_key', v_item ->> 'external_name',
        nullif(v_item ->> 'preparation_state', ''), v_item -> 'basis' ->> 'source_text',
        v_basis_amount, v_basis_unit, v_item -> 'serving' ->> 'source_text',
        nullif(v_item -> 'serving' ->> 'amount', '')::numeric,
        nullif(lower(v_item -> 'serving' ->> 'unit'), ''),
        v_item -> 'total_content' ->> 'source_text',
        nullif(v_item -> 'total_content' ->> 'amount', '')::numeric,
        nullif(lower(v_item -> 'total_content' ->> 'unit'), ''),
        coalesce(v_item -> 'edible_portion' ->> 'text', nullif(v_item ->> 'edible_portion', '')),
        nullif(v_item -> 'edible_portion' ->> 'percent', '')::numeric,
        v_item ->> 'fingerprint', 'approved', v_reason,
        v_actor, v_reviewed_at, jsonb_build_object(
          'content_hash', v_item ->> 'content_hash',
          'handoff_schema_checksum', v_bundle ->> 'handoff_schema_checksum'
        )
      ) returning id into v_source_item_id;
      v_writes := v_writes + 1;
    end if;
    v_affected_row_ids := jsonb_set(
      v_affected_row_ids,
      '{nutrition_source_item_ids}',
      (v_affected_row_ids -> 'nutrition_source_item_ids') || to_jsonb(v_source_item_id)
    );

    select id into v_profile_id
    from public.nutrition_profiles
    where source_item_id = v_source_item_id
      and profile_kind = 'ingredient_source'
      and is_active and review_status = 'approved';
    if v_profile_id is null then
      insert into public.nutrition_profiles (
        source_item_id, profile_kind, normalization_method, basis_amount, basis_unit,
        version, review_status, decision_reason, reviewed_by, reviewed_at, is_active
      ) values (
        v_source_item_id, 'ingredient_source',
        case when v_basis_unit = 'g' then 'mass_100g' else 'volume_100ml' end,
        100, v_basis_unit, 1, 'approved', v_reason, v_actor, v_reviewed_at, true
      ) returning id into v_profile_id;
      v_writes := v_writes + 1;
    end if;
    v_affected_row_ids := jsonb_set(
      v_affected_row_ids,
      '{nutrition_profile_ids}',
      (v_affected_row_ids -> 'nutrition_profile_ids') || to_jsonb(v_profile_id)
    );

    for v_value in
      select key, value from jsonb_each(v_item -> 'values') value_row
      where not exists (
        select 1 from public.nutrition_values existing
        where existing.profile_id = v_profile_id and existing.nutrient_code = value_row.key
      )
      order by key
    loop
      v_value_status := case
        when v_value.value ->> 'amount' is not null then 'observed'
        when v_value.value ->> 'missing_reason' = 'trace' then 'trace'
        when v_value.value ->> 'missing_reason' in ('malformed', 'parse_error') then 'parse_error'
        else 'missing'
      end;
      insert into public.nutrition_values (
        profile_id, nutrient_code, source_nutrient_code, source_unit,
        amount, value_status, source_token
      ) values (
        v_profile_id, v_value.key, v_value.value ->> 'source_nutrient_code',
        v_value.value ->> 'unit',
        case when v_value_status = 'observed'
          then ((v_value.value ->> 'amount')::numeric * 100 / v_basis_amount)
          else null end,
        v_value_status, v_value.value ->> 'source_token'
      );
      v_writes := v_writes + 1;
      v_affected_row_ids := jsonb_set(
        v_affected_row_ids,
        '{nutrition_value_keys}',
        (v_affected_row_ids -> 'nutrition_value_keys') ||
          to_jsonb(v_profile_id::text || ':' || v_value.key)
      );
    end loop;

    select value into v_decision
    from jsonb_array_elements(v_approval -> 'nutrition_decisions')
    where value ->> 'fingerprint' = v_item ->> 'fingerprint'
    limit 1;
    if v_decision is not null then
      if not exists (
        select 1
        from jsonb_array_elements(p_model -> 'candidate_plan' -> 'nutrition_candidates') candidate
        where candidate ->> 'fingerprint' = v_decision ->> 'fingerprint'
          and candidate ->> 'ingredient_id' = v_decision ->> 'ingredient_id'
          and candidate ->> 'preparation_state' = v_decision ->> 'preparation_state'
          and candidate ->> 'candidate_identity' = v_decision ->> 'candidate_identity'
          and candidate ->> 'candidate_checksum' = v_decision ->> 'candidate_checksum'
          and candidate ->> 'review_status' = 'pending'
      ) then
        raise exception 'INVALID_NUTRITION_CANDIDATE_IDENTITY';
      end if;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        'ingredient_nutrition_profiles|' || (v_decision ->> 'ingredient_id') ||
          '|' || (v_decision ->> 'preparation_state'),
        0
      ));
      v_previous_link_id := null;
      select id into v_previous_link_id
      from public.ingredient_nutrition_profiles
      where ingredient_id = (v_decision ->> 'ingredient_id')::uuid
        and preparation_state = v_decision ->> 'preparation_state'
        and review_status = 'approved' and is_active and is_primary
      for update;
      select coalesce(max(existing.version), 0) + 1 into v_next_version
      from public.ingredient_nutrition_profiles existing
      where existing.ingredient_id = (v_decision ->> 'ingredient_id')::uuid
        and existing.preparation_state = v_decision ->> 'preparation_state';
      insert into public.ingredient_nutrition_profiles (
        ingredient_id, nutrition_profile_id, preparation_state, match_method,
        candidate_rank, is_primary, review_status, decision_reason, reviewed_by,
        reviewed_at, version, is_active
      ) values (
        (v_decision ->> 'ingredient_id')::uuid, v_profile_id,
        v_decision ->> 'preparation_state', 'manual',
        (select priority_rank from public.nutrition_sources where id = v_source_id),
        v_decision ->> 'status' = 'approved' and v_previous_link_id is null,
        case when v_previous_link_id is not null and v_decision ->> 'status' = 'approved'
          then 'pending' else v_decision ->> 'status' end,
        v_decision ->> 'reason', v_actor, v_reviewed_at,
        v_next_version,
        v_decision ->> 'status' = 'approved' and v_previous_link_id is null
      ) returning id into v_link_id;
      v_writes := v_writes + 1;
      if v_previous_link_id is not null and v_decision ->> 'status' = 'approved' then
        update public.ingredient_nutrition_profiles
        set review_status = 'superseded', is_active = false, is_primary = false,
            superseded_by_id = v_link_id, decision_reason = v_decision ->> 'reason',
            reviewed_by = v_actor, reviewed_at = v_reviewed_at
        where id = v_previous_link_id;
        v_writes := v_writes + 1;
        v_superseded_count := v_superseded_count + 1;
        update public.ingredient_nutrition_profiles
        set review_status = 'approved', is_active = true, is_primary = true,
            decision_reason = v_decision ->> 'reason', reviewed_by = v_actor,
            reviewed_at = v_reviewed_at
        where id = v_link_id;
        v_writes := v_writes + 1;
      end if;
      v_affected_row_ids := jsonb_set(
        v_affected_row_ids,
        '{nutrition_link_ids}',
        (v_affected_row_ids -> 'nutrition_link_ids') ||
          case when v_previous_link_id is null then '[]'::jsonb
            else jsonb_build_array(v_previous_link_id) end ||
          to_jsonb(v_link_id)
      );
    end if;
    v_decision := null;
  end loop;

  if jsonb_array_length(v_bundle -> 'measurement_evidence') > 0
    and (
      jsonb_array_length(v_approval -> 'conversion_decisions') > 0
      or jsonb_array_length(v_approval -> 'piece_decisions') > 0
    )
  then
    select max(value ->> 'accessed_at') into v_measurement_source_version
    from jsonb_array_elements(v_bundle -> 'measurement_evidence');
    v_measurement_manifest_sha := encode(
      extensions.digest((v_bundle -> 'measurement_evidence')::text, 'sha256'),
      'hex'
    );

    select id into v_measurement_source_id
    from public.nutrition_sources
    where provider_code = 'RDA_10_4'
      and dataset_name = 'RDA limited measurement evidence'
      and source_version = v_measurement_source_version
      and manifest_sha256 = v_measurement_manifest_sha
      and source_kind = 'measurement_reference'
      and freshness_status = 'current'
      and review_status = 'approved'
      and is_active;

    if v_measurement_source_id is null and exists (
      select 1 from public.nutrition_sources
      where provider_code = 'RDA_10_4'
        and dataset_name = 'RDA limited measurement evidence'
        and is_active
    ) then
      raise exception 'MEASUREMENT_SOURCE_DRIFT_REQUIRES_REVIEW';
    elsif v_measurement_source_id is null then
      insert into public.nutrition_sources (
        provider_code, dataset_name, source_kind, source_version, fetched_at,
        freshness_checked_at, freshness_status, priority_rank, source_url,
        license_name, license_url, manifest_sha256, review_status,
        decision_reason, reviewed_by, reviewed_at, is_active
      ) values (
        'RDA_10_4', 'RDA limited measurement evidence', 'measurement_reference',
        v_measurement_source_version, v_reviewed_at, v_reviewed_at, 'current', 2,
        v_bundle -> 'measurement_evidence' -> 0 ->> 'source_url',
        'human_review_required',
        v_bundle -> 'measurement_evidence' -> 0 ->> 'license_evidence_url',
        v_measurement_manifest_sha, 'approved', v_reason, v_actor,
        v_reviewed_at, true
      ) returning id into v_measurement_source_id;
      v_writes := v_writes + 1;
      v_affected_row_ids := jsonb_set(
        v_affected_row_ids,
        '{nutrition_source_ids}',
        (v_affected_row_ids -> 'nutrition_source_ids') || to_jsonb(v_measurement_source_id)
      );
    end if;
  end if;

  for v_evidence in select value from jsonb_array_elements(v_bundle -> 'measurement_evidence')
  loop
    v_decision := null;
    select value into v_decision
    from jsonb_array_elements(v_approval -> 'conversion_decisions')
    where value ->> 'evidence_key' = v_evidence ->> 'ingredient_or_category_id'
    limit 1;
    if v_decision is null then
      select value into v_decision
      from jsonb_array_elements(v_approval -> 'piece_decisions')
      where value ->> 'evidence_key' = v_evidence ->> 'ingredient_or_category_id'
        and value ->> 'size_code' = v_evidence ->> 'size_code'
      limit 1;
    end if;
    if v_decision is null then
      continue;
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(
        case when v_evidence ->> 'evidence_kind' = 'volume_weight'
          then p_model -> 'candidate_plan' -> 'conversion_candidates'
          else p_model -> 'candidate_plan' -> 'piece_candidates' end
      ) candidate
      where candidate ->> 'candidate_identity' = v_decision ->> 'candidate_identity'
        and candidate ->> 'candidate_checksum' = v_decision ->> 'candidate_checksum'
        and candidate ->> 'evidence_checksum' = v_evidence ->> 'evidence_checksum'
        and candidate ->> 'review_status' = 'pending'
    ) then
      raise exception 'INVALID_MEASUREMENT_CANDIDATE_IDENTITY';
    end if;
    v_evidence_id := null;
    select id into v_evidence_id
    from public.measurement_source_evidence
    where source_id = v_measurement_source_id
      and evidence_fingerprint = v_evidence ->> 'evidence_checksum'
    order by version desc
    limit 1;
    if v_evidence_id is not null and not exists (
      select 1
      from public.measurement_source_evidence existing
      where existing.id = v_evidence_id
        and existing.evidence_kind = v_evidence ->> 'evidence_kind'
        and existing.source_subject = coalesce(
          v_evidence ->> 'source_subject',
          v_evidence ->> 'ingredient_or_category_id'
        )
        and existing.preparation_state = v_decision ->> 'preparation_state'
        and existing.size_code is not distinct from nullif(v_evidence ->> 'size_code', '')
        and existing.source_observed_unit = v_evidence ->> 'source_observed_unit'
        and existing.source_observed_amount = coalesce(
          nullif(v_evidence ->> 'source_observed_amount', '')::numeric,
          1
        )
        and existing.observed_volume_ml is not distinct from
          case when v_evidence ->> 'evidence_kind' = 'volume_weight' then 15 else null end
        and existing.observed_weight_g = coalesce(
          nullif(v_evidence ->> 'observed_g_per_15ml', '')::numeric,
          nullif(v_evidence ->> 'observed_g', '')::numeric
        )
        and existing.normalized_g_per_15ml is not distinct from
          case when v_evidence ->> 'evidence_kind' = 'volume_weight'
            then (v_evidence ->> 'observed_g_per_15ml')::numeric else null end
        and existing.source_url = v_evidence ->> 'source_url'
        and existing.source_accessed_at = (v_evidence ->> 'accessed_at')::date
        and existing.review_status = 'approved' and existing.is_active
    ) then
      raise exception 'EVIDENCE_FINGERPRINT_CONFLICT';
    end if;
    if v_evidence_id is null then
      insert into public.measurement_source_evidence (
        source_id, evidence_kind, source_subject, preparation_state, size_code,
        source_observed_unit, source_observed_amount, observed_volume_ml,
        observed_weight_g, normalized_g_per_15ml, source_url, source_accessed_at,
        evidence_fingerprint, review_status, decision_reason, reviewed_by,
        reviewed_at, version, is_active
      ) values (
        v_measurement_source_id, v_evidence ->> 'evidence_kind',
        coalesce(v_evidence ->> 'source_subject', v_evidence ->> 'ingredient_or_category_id'),
        v_decision ->> 'preparation_state', nullif(v_evidence ->> 'size_code', ''),
        v_evidence ->> 'source_observed_unit',
        coalesce(nullif(v_evidence ->> 'source_observed_amount', '')::numeric, 1),
        case when v_evidence ->> 'evidence_kind' = 'volume_weight' then 15 else null end,
        coalesce(nullif(v_evidence ->> 'observed_g_per_15ml', '')::numeric,
          nullif(v_evidence ->> 'observed_g', '')::numeric),
        case when v_evidence ->> 'evidence_kind' = 'volume_weight'
          then (v_evidence ->> 'observed_g_per_15ml')::numeric else null end,
        v_evidence ->> 'source_url',
        (v_evidence ->> 'accessed_at')::date,
        v_evidence ->> 'evidence_checksum', 'approved',
        v_reason, v_actor, v_reviewed_at, 1, true
      ) returning id into v_evidence_id;
      v_writes := v_writes + 1;
    end if;
    v_affected_row_ids := jsonb_set(
      v_affected_row_ids,
      '{measurement_evidence_ids}',
      (v_affected_row_ids -> 'measurement_evidence_ids') || to_jsonb(v_evidence_id)
    );

    if v_evidence ->> 'evidence_kind' = 'volume_weight' then
      select id into v_conversion_profile_id
      from public.measurement_conversion_profiles
      where code = v_decision ->> 'conversion_profile_code' and is_active;
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        'ingredient_conversion_assignments|' || (v_decision ->> 'ingredient_id') ||
          '|' || (v_decision ->> 'preparation_state'),
        0
      ));
      v_previous_assignment_id := null;
      select id into v_previous_assignment_id
      from public.ingredient_conversion_assignments
      where ingredient_id = (v_decision ->> 'ingredient_id')::uuid
        and preparation_state = v_decision ->> 'preparation_state'
        and review_status = 'approved' and is_active
      for update;
      select coalesce(max(existing.version), 0) + 1 into v_next_version
      from public.ingredient_conversion_assignments existing
      where existing.ingredient_id = (v_decision ->> 'ingredient_id')::uuid
        and existing.preparation_state = v_decision ->> 'preparation_state';
      insert into public.ingredient_conversion_assignments (
        ingredient_id, conversion_profile_id, evidence_id, preparation_state,
        distance_g_per_15ml, candidate_rank, assignment_reason, review_status,
        reviewed_by, reviewed_at, version, is_active
      ) values (
        (v_decision ->> 'ingredient_id')::uuid, v_conversion_profile_id, v_evidence_id,
        v_decision ->> 'preparation_state',
        abs((v_evidence ->> 'observed_g_per_15ml')::numeric -
          (select representative_weight_g from public.measurement_conversion_profiles where id = v_conversion_profile_id)),
        1, v_decision ->> 'reason',
        case when v_previous_assignment_id is not null and v_decision ->> 'status' = 'approved'
          then 'pending' else v_decision ->> 'status' end,
        v_actor, v_reviewed_at, v_next_version,
        v_decision ->> 'status' = 'approved' and v_previous_assignment_id is null
      ) returning id into v_assignment_id;
      v_writes := v_writes + 1;
      if v_previous_assignment_id is not null and v_decision ->> 'status' = 'approved' then
        update public.ingredient_conversion_assignments
        set review_status = 'superseded', is_active = false,
            superseded_by_id = v_assignment_id,
            assignment_reason = v_decision ->> 'reason', reviewed_by = v_actor,
            reviewed_at = v_reviewed_at
        where id = v_previous_assignment_id;
        v_writes := v_writes + 1;
        v_superseded_count := v_superseded_count + 1;
        update public.ingredient_conversion_assignments
        set review_status = 'approved', is_active = true,
            assignment_reason = v_decision ->> 'reason', reviewed_by = v_actor,
            reviewed_at = v_reviewed_at
        where id = v_assignment_id;
        v_writes := v_writes + 1;
      end if;
      v_affected_row_ids := jsonb_set(
        v_affected_row_ids,
        '{conversion_assignment_ids}',
        (v_affected_row_ids -> 'conversion_assignment_ids') ||
          case when v_previous_assignment_id is null then '[]'::jsonb
            else jsonb_build_array(v_previous_assignment_id) end ||
          to_jsonb(v_assignment_id)
      );
    else
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        'piece_unit_weights|' || (v_decision ->> 'ingredient_id') ||
          '|' || (v_decision ->> 'size_code') ||
          '|' || (v_decision ->> 'preparation_state'),
        0
      ));
      v_previous_piece_weight_id := null;
      select id into v_previous_piece_weight_id
      from public.piece_unit_weights
      where ingredient_id = (v_decision ->> 'ingredient_id')::uuid
        and size_code = v_decision ->> 'size_code'
        and preparation_state = v_decision ->> 'preparation_state'
        and review_status = 'approved' and is_active
      for update;
      select coalesce(max(existing.version), 0) + 1 into v_next_version
      from public.piece_unit_weights existing
      where existing.ingredient_id = (v_decision ->> 'ingredient_id')::uuid
        and existing.size_code = v_decision ->> 'size_code'
        and existing.preparation_state = v_decision ->> 'preparation_state';
      insert into public.piece_unit_weights (
        ingredient_id, evidence_id, size_code, preparation_state, weight_g,
        review_status, decision_reason, reviewed_by, reviewed_at, version, is_active
      ) values (
        (v_decision ->> 'ingredient_id')::uuid, v_evidence_id,
        v_decision ->> 'size_code', v_decision ->> 'preparation_state',
        (v_evidence ->> 'observed_g')::numeric,
        case when v_previous_piece_weight_id is not null and v_decision ->> 'status' = 'approved'
          then 'pending' else v_decision ->> 'status' end,
        v_decision ->> 'reason', v_actor, v_reviewed_at, v_next_version,
        v_decision ->> 'status' = 'approved' and v_previous_piece_weight_id is null
      ) returning id into v_piece_weight_id;
      v_writes := v_writes + 1;
      if v_previous_piece_weight_id is not null and v_decision ->> 'status' = 'approved' then
        update public.piece_unit_weights
        set review_status = 'superseded', is_active = false,
            superseded_by_id = v_piece_weight_id,
            decision_reason = v_decision ->> 'reason', reviewed_by = v_actor,
            reviewed_at = v_reviewed_at
        where id = v_previous_piece_weight_id;
        v_writes := v_writes + 1;
        v_superseded_count := v_superseded_count + 1;
        update public.piece_unit_weights
        set review_status = 'approved', is_active = true,
            decision_reason = v_decision ->> 'reason', reviewed_by = v_actor,
            reviewed_at = v_reviewed_at
        where id = v_piece_weight_id;
        v_writes := v_writes + 1;
      end if;
      v_affected_row_ids := jsonb_set(
        v_affected_row_ids,
        '{piece_weight_ids}',
        (v_affected_row_ids -> 'piece_weight_ids') ||
          case when v_previous_piece_weight_id is null then '[]'::jsonb
            else jsonb_build_array(v_previous_piece_weight_id) end ||
          to_jsonb(v_piece_weight_id)
      );
    end if;
    v_decision := null;
  end loop;

  v_writes := v_writes + 1;
  v_result := jsonb_build_object(
    'source_id', v_source_id,
    'status', 'applied',
    'freshness_status', 'current',
    'affected_row_ids', v_affected_row_ids,
    'superseded_count', v_superseded_count,
    'writes_committed', v_writes,
    'replayed', false
  );
  v_registry_metadata := jsonb_build_object(
    'run_id', v_run_id,
    'idempotency_key', v_idempotency_key,
    'source_payload_identity', v_source_payload_identity,
    'decision_checksum', v_decision_checksum,
    'content_hash', v_content_hash,
    'affected_source_id', v_source_id,
    'affected_row_ids', v_affected_row_ids,
    'writes_committed', v_writes,
    'summary', coalesce(p_model -> 'run_summary', '{}'::jsonb) || v_result ||
      jsonb_build_object(
        'affected_source_id', v_source_id,
        'affected_row_ids', v_affected_row_ids,
        'writes_attempted', v_writes,
        'writes_committed', v_writes
      ),
    'result', v_result
  );
  v_registry_metadata := v_registry_metadata || jsonb_build_object(
    'registry_checksum', encode(extensions.digest(v_registry_metadata::text, 'sha256'), 'hex')
  );
  insert into public.operational_events (
    event_type, severity, source, actor_user_id, message_summary, metadata_json
  ) values (
    'ingredient_nutrition_model_applied', 'info', 'ingredient-nutrition-model',
    v_actor, 'ingredient nutrition model apply registry', v_registry_metadata
  );
  return v_result;
end;
$$;

create function public.disable_ingredient_nutrition_model(
  p_model_run_key text,
  p_disable_key text,
  p_actor uuid,
  p_reason text,
  p_reviewed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, extensions, public
as $$
declare
  v_links integer := 0;
  v_assignments integer := 0;
  v_pieces integer := 0;
  v_registry jsonb;
  v_affected_row_ids jsonb;
  v_source_id uuid;
  v_result jsonb;
  v_disable_registry jsonb;
begin
  select metadata_json into v_registry
  from public.operational_events
  where source = 'ingredient-nutrition-model'
    and event_type = 'ingredient_nutrition_model_disabled'
    and metadata_json ->> 'idempotency_key' = p_disable_key;
  if v_registry is not null then
    return (v_registry -> 'result') ||
      jsonb_build_object('writes_committed', 0, 'replayed', true);
  end if;

  select metadata_json into v_registry
  from public.operational_events
  where source = 'ingredient-nutrition-model'
    and event_type = 'ingredient_nutrition_model_applied'
    and metadata_json ->> 'idempotency_key' = p_model_run_key;
  v_affected_row_ids := v_registry -> 'affected_row_ids';
  v_source_id := (v_registry ->> 'affected_source_id')::uuid;
  if nullif(btrim(p_reason), '') is null or p_actor is null or p_reviewed_at is null
    or not exists (select 1 from public.users where id = p_actor)
    or v_registry is null
    or not exists (select 1 from public.nutrition_sources where id = v_source_id)
  then
    raise exception 'INVALID_DISABLE_DECISION';
  end if;

  update public.ingredient_nutrition_profiles link
  set review_status = 'revoked', is_active = false, is_primary = false,
      decision_reason = p_reason, reviewed_by = p_actor, reviewed_at = p_reviewed_at
  where exists (
    select 1
    from jsonb_array_elements_text(
      coalesce(v_affected_row_ids -> 'nutrition_link_ids', '[]'::jsonb)
    ) affected(id)
    where affected.id::uuid = link.id
    )
    and link.review_status = 'approved' and link.is_active
    and exists (
      select 1 from public.nutrition_profiles profile
      join public.nutrition_source_items item on item.id = profile.source_item_id
      where profile.id = link.nutrition_profile_id and item.source_id = v_source_id
    );
  get diagnostics v_links = row_count;

  update public.ingredient_conversion_assignments assignment
  set review_status = 'revoked', is_active = false, assignment_reason = p_reason,
      reviewed_by = p_actor, reviewed_at = p_reviewed_at
  where exists (
    select 1
    from jsonb_array_elements_text(
      coalesce(v_affected_row_ids -> 'conversion_assignment_ids', '[]'::jsonb)
    ) affected(id)
    where affected.id::uuid = assignment.id
    )
    and assignment.review_status = 'approved' and assignment.is_active;
  get diagnostics v_assignments = row_count;

  update public.piece_unit_weights piece
  set review_status = 'revoked', is_active = false, decision_reason = p_reason,
      reviewed_by = p_actor, reviewed_at = p_reviewed_at
  where exists (
    select 1
    from jsonb_array_elements_text(
      coalesce(v_affected_row_ids -> 'piece_weight_ids', '[]'::jsonb)
    ) affected(id)
    where affected.id::uuid = piece.id
    )
    and piece.review_status = 'approved' and piece.is_active;
  get diagnostics v_pieces = row_count;

  v_result := jsonb_build_object(
    'writes_committed', v_links + v_assignments + v_pieces + 1,
    'revoked_count', v_links + v_assignments + v_pieces,
    'payload_deleted', 0,
    'replayed', false
  );
  v_disable_registry := jsonb_build_object(
      'run_id', 'disable-' || left(p_disable_key, 24),
      'idempotency_key', p_disable_key,
      'model_run_key', p_model_run_key,
      'source_payload_identity', v_registry ->> 'source_payload_identity',
      'decision_checksum', p_disable_key,
      'content_hash', v_registry ->> 'content_hash',
      'affected_source_id', v_source_id,
      'affected_row_ids', v_affected_row_ids,
      'writes_committed', v_links + v_assignments + v_pieces + 1,
      'summary', jsonb_build_object(
        'schema_version', 'ingredient-nutrition-model-run-v1',
        'mode', 'disable',
        'status', 'disabled',
        'run_id', 'disable-' || left(p_disable_key, 24),
        'idempotency_key', p_disable_key,
        'model_run_key', p_model_run_key,
        'source_payload_identity', v_registry ->> 'source_payload_identity',
        'decision_checksum', p_disable_key,
        'content_hash', v_registry ->> 'content_hash',
        'affected_source_id', v_source_id,
        'affected_row_ids', v_affected_row_ids,
        'writes_attempted', v_links + v_assignments + v_pieces + 1,
        'writes_committed', v_links + v_assignments + v_pieces + 1,
        'payload_deleted', 0,
        'production_db_writes', 0,
        'provider_requests', 0,
        'secret_leak_count', 0
      ),
      'result', v_result
    );
  v_disable_registry := v_disable_registry || jsonb_build_object(
    'registry_checksum', encode(extensions.digest(v_disable_registry::text, 'sha256'), 'hex')
  );
  insert into public.operational_events (
    event_type, severity, source, actor_user_id, message_summary, metadata_json
  ) values (
    'ingredient_nutrition_model_disabled', 'info', 'ingredient-nutrition-model',
    p_actor, 'ingredient nutrition model disable registry', v_disable_registry
  );
  return v_result;
end;
$$;

create function public.get_ingredient_nutrition_model_run(p_run_identifier text)
returns jsonb
language sql
security definer
set search_path = pg_catalog, extensions, public
stable
as $$
  select registry.metadata_json
  from (
    (
      select event.metadata_json, 1 as lookup_priority
      from public.operational_events event
      where event.source = 'ingredient-nutrition-model'
        and event.metadata_json ->> 'idempotency_key' = p_run_identifier
      limit 1
    )
    union all
    (
      select event.metadata_json, 2 as lookup_priority
      from public.operational_events event
      where event.source = 'ingredient-nutrition-model'
        and event.metadata_json ->> 'run_id' = p_run_identifier
      limit 1
    )
  ) registry
  where registry.metadata_json ->> 'registry_checksum' = encode(
    extensions.digest((registry.metadata_json - 'registry_checksum')::text, 'sha256'),
    'hex'
  )
  order by registry.lookup_priority
  limit 1
$$;

revoke all on function public.apply_ingredient_nutrition_model(jsonb) from public, anon, authenticated;
grant execute on function public.apply_ingredient_nutrition_model(jsonb) to service_role;
revoke all on function public.disable_ingredient_nutrition_model(text, text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.disable_ingredient_nutrition_model(text, text, uuid, text, timestamptz) to service_role;
revoke all on function public.get_ingredient_nutrition_model_run(text) from public, anon, authenticated;
grant execute on function public.get_ingredient_nutrition_model_run(text) to service_role;

alter table public.nutrient_definitions enable row level security;
revoke all on table public.nutrient_definitions from anon, authenticated;
grant all privileges on table public.nutrient_definitions to service_role;
alter table public.nutrition_sources enable row level security;
revoke all on table public.nutrition_sources from anon, authenticated;
grant all privileges on table public.nutrition_sources to service_role;
alter table public.nutrition_source_items enable row level security;
revoke all on table public.nutrition_source_items from anon, authenticated;
grant all privileges on table public.nutrition_source_items to service_role;
alter table public.nutrition_profiles enable row level security;
revoke all on table public.nutrition_profiles from anon, authenticated;
grant all privileges on table public.nutrition_profiles to service_role;
alter table public.nutrition_values enable row level security;
revoke all on table public.nutrition_values from anon, authenticated;
grant all privileges on table public.nutrition_values to service_role;
alter table public.ingredient_nutrition_profiles enable row level security;
revoke all on table public.ingredient_nutrition_profiles from anon, authenticated;
grant all privileges on table public.ingredient_nutrition_profiles to service_role;
alter table public.measurement_conversion_profiles enable row level security;
revoke all on table public.measurement_conversion_profiles from anon, authenticated;
grant all privileges on table public.measurement_conversion_profiles to service_role;
alter table public.measurement_source_evidence enable row level security;
revoke all on table public.measurement_source_evidence from anon, authenticated;
grant all privileges on table public.measurement_source_evidence to service_role;
alter table public.ingredient_conversion_assignments enable row level security;
revoke all on table public.ingredient_conversion_assignments from anon, authenticated;
grant all privileges on table public.ingredient_conversion_assignments to service_role;
alter table public.piece_unit_weights enable row level security;
revoke all on table public.piece_unit_weights from anon, authenticated;
grant all privileges on table public.piece_unit_weights to service_role;
