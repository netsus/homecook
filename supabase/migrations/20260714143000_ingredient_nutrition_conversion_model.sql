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

create function public.apply_ingredient_nutrition_model(p_model jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
  v_evidence_id uuid;
  v_conversion_profile_id uuid;
  v_assignment_id uuid;
  v_item jsonb;
  v_value record;
  v_decision jsonb;
  v_evidence jsonb;
  v_writes integer := 0;
  v_basis_amount numeric;
  v_basis_unit text;
  v_value_status text;
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
  then
    raise exception 'INVALID_MODEL_IMPORT';
  end if;
  if p_model::text ~* '"(raw_payload|raw_row|credential_name|secret_value|servicekey|api_key)"'
    or coalesce(v_attribution ->> 'source_url', '') ~* '[?&](servicekey|api_key|authorization|access_token)='
  then
    raise exception 'SECRET_OR_RAW_DATA_LEAK';
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
    return jsonb_build_object(
      'source_id', v_source_id,
      'status', 'applied',
      'freshness_status', 'current',
      'affected_row_ids', v_affected_row_ids,
      'writes_committed', 0,
      'replayed', true
    );
  elsif v_source_id is not null and v_source_status = 'needs_source_check' then
    v_affected_row_ids := jsonb_set(
      v_affected_row_ids,
      '{nutrition_source_ids}',
      jsonb_build_array(v_source_id)
    );
    if v_source_decision is null or v_source_decision ->> 'status' <> 'supersede' then
      return jsonb_build_object(
        'source_id', v_source_id,
        'status', 'needs_source_check',
        'freshness_status', 'drifted',
        'reason_codes', jsonb_build_array('SOURCE_NOT_CURRENT'),
        'affected_row_ids', v_affected_row_ids,
        'writes_committed', 0,
        'replayed', true
      );
    end if;
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
  elsif v_source_id is not null then
    return jsonb_build_object(
      'source_id', v_source_id,
      'status', v_source_status,
      'freshness_status', 'unknown',
      'reason_codes', jsonb_build_array('SOURCE_NOT_CURRENT'),
      'affected_row_ids', v_affected_row_ids,
      'writes_committed', 0,
      'replayed', true
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
    v_affected_row_ids := jsonb_set(
      v_affected_row_ids,
      '{nutrition_source_ids}',
      jsonb_build_array(v_source_id)
    );
    return jsonb_build_object(
      'source_id', v_source_id,
      'status', 'needs_source_check',
      'freshness_status', 'drifted',
      'reason_codes', jsonb_build_array('SOURCE_NOT_CURRENT'),
      'affected_row_ids', v_affected_row_ids,
      'writes_committed', 1,
      'replayed', false
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

  for v_item in select value from jsonb_array_elements(v_bundle -> 'approved_items')
  loop
    v_basis_amount := (v_item -> 'basis' ->> 'amount')::numeric;
    v_basis_unit := lower(v_item -> 'basis' ->> 'unit');
    if v_basis_amount <= 0 or v_basis_unit not in ('g', 'ml') then
      raise exception 'UNSAFE_NUTRITION_BASIS';
    end if;

    insert into public.nutrition_source_items (
      source_id, external_item_key, external_name, preparation_state,
      source_basis_text, source_basis_amount, source_basis_unit, stable_fingerprint,
      review_status, decision_reason, reviewed_by, reviewed_at, provenance_json
    ) values (
      v_source_id, v_item ->> 'external_item_key', v_item ->> 'external_name',
      nullif(v_item ->> 'preparation_state', ''), v_item -> 'basis' ->> 'source_text',
      v_basis_amount, v_basis_unit, v_item ->> 'fingerprint', 'approved', v_reason,
      v_actor, v_reviewed_at, jsonb_build_object('content_hash', v_item ->> 'content_hash')
    ) returning id into v_source_item_id;
    v_writes := v_writes + 1;
    v_affected_row_ids := jsonb_set(
      v_affected_row_ids,
      '{nutrition_source_item_ids}',
      (v_affected_row_ids -> 'nutrition_source_item_ids') || to_jsonb(v_source_item_id)
    );

    insert into public.nutrition_profiles (
      source_item_id, profile_kind, normalization_method, basis_amount, basis_unit,
      version, review_status, decision_reason, reviewed_by, reviewed_at, is_active
    ) values (
      v_source_item_id, 'ingredient_source',
      case when v_basis_unit = 'g' then 'mass_100g' else 'volume_100ml' end,
      100, v_basis_unit, 1, 'approved', v_reason, v_actor, v_reviewed_at, true
    ) returning id into v_profile_id;
    v_writes := v_writes + 1;
    v_affected_row_ids := jsonb_set(
      v_affected_row_ids,
      '{nutrition_profile_ids}',
      (v_affected_row_ids -> 'nutrition_profile_ids') || to_jsonb(v_profile_id)
    );

    for v_value in select key, value from jsonb_each(v_item -> 'values') order by key
    loop
      v_value_status := case
        when v_value.value ->> 'amount' is not null then 'observed'
        when v_value.value ->> 'missing_reason' = 'trace' then 'trace'
        when v_value.value ->> 'missing_reason' in ('malformed', 'parse_error') then 'parse_error'
        else 'missing'
      end;
      insert into public.nutrition_values (
        profile_id, nutrient_code, source_unit, amount, value_status, source_token
      ) values (
        v_profile_id, v_value.key, v_value.value ->> 'unit',
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
      insert into public.ingredient_nutrition_profiles (
        ingredient_id, nutrition_profile_id, preparation_state, match_method,
        candidate_rank, is_primary, review_status, decision_reason, reviewed_by,
        reviewed_at, version, is_active
      ) values (
        (v_decision ->> 'ingredient_id')::uuid, v_profile_id,
        v_decision ->> 'preparation_state', 'manual',
        (select priority_rank from public.nutrition_sources where id = v_source_id),
        v_decision ->> 'status' = 'approved', v_decision ->> 'status',
        v_decision ->> 'reason', v_actor, v_reviewed_at, 1,
        v_decision ->> 'status' = 'approved'
      ) returning id into v_link_id;
      v_writes := v_writes + 1;
      v_affected_row_ids := jsonb_set(
        v_affected_row_ids,
        '{nutrition_link_ids}',
        (v_affected_row_ids -> 'nutrition_link_ids') || to_jsonb(v_link_id)
      );
    end if;
    v_decision := null;
  end loop;

  if jsonb_array_length(v_bundle -> 'measurement_evidence') > 0 then
    select max(value ->> 'accessed_at') into v_measurement_source_version
    from jsonb_array_elements(v_bundle -> 'measurement_evidence');
    v_measurement_manifest_sha := encode(
      digest((v_bundle -> 'measurement_evidence')::text, 'sha256'),
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
    select value into v_decision
    from jsonb_array_elements(v_approval -> 'conversion_decisions')
    where value ->> 'evidence_key' = v_evidence ->> 'ingredient_or_category_id'
    limit 1;
    if v_decision is null then
      continue;
    end if;
    insert into public.measurement_source_evidence (
      source_id, evidence_kind, source_subject, preparation_state,
      source_observed_unit, source_observed_amount, observed_volume_ml,
      observed_weight_g, normalized_g_per_15ml, source_url, source_accessed_at,
      evidence_fingerprint, review_status, decision_reason, reviewed_by,
      reviewed_at, version, is_active
    ) values (
      v_measurement_source_id, 'volume_weight', v_evidence ->> 'ingredient_or_category_id',
      v_decision ->> 'preparation_state', v_evidence ->> 'source_observed_unit', 1,
      15, (v_evidence ->> 'observed_g_per_15ml')::numeric,
      (v_evidence ->> 'observed_g_per_15ml')::numeric, v_evidence ->> 'source_url',
      (v_evidence ->> 'accessed_at')::date,
      encode(digest(v_evidence::text, 'sha256'), 'hex'), v_decision ->> 'status',
      v_decision ->> 'reason', v_actor, v_reviewed_at, 1,
      v_decision ->> 'status' = 'approved'
    ) returning id into v_evidence_id;
    v_writes := v_writes + 1;
    v_affected_row_ids := jsonb_set(
      v_affected_row_ids,
      '{measurement_evidence_ids}',
      (v_affected_row_ids -> 'measurement_evidence_ids') || to_jsonb(v_evidence_id)
    );

    select id into v_conversion_profile_id
    from public.measurement_conversion_profiles
    where code = v_decision ->> 'conversion_profile_code' and is_active;
    insert into public.ingredient_conversion_assignments (
      ingredient_id, conversion_profile_id, evidence_id, preparation_state,
      distance_g_per_15ml, candidate_rank, assignment_reason, review_status,
      reviewed_by, reviewed_at, version, is_active
    ) values (
      (v_decision ->> 'ingredient_id')::uuid, v_conversion_profile_id, v_evidence_id,
      v_decision ->> 'preparation_state',
      abs((v_evidence ->> 'observed_g_per_15ml')::numeric -
        (select representative_weight_g from public.measurement_conversion_profiles where id = v_conversion_profile_id)),
      1, v_decision ->> 'reason', v_decision ->> 'status', v_actor,
      v_reviewed_at, 1, v_decision ->> 'status' = 'approved'
    ) returning id into v_assignment_id;
    v_writes := v_writes + 1;
    v_affected_row_ids := jsonb_set(
      v_affected_row_ids,
      '{conversion_assignment_ids}',
      (v_affected_row_ids -> 'conversion_assignment_ids') || to_jsonb(v_assignment_id)
    );
    v_decision := null;
  end loop;

  return jsonb_build_object(
    'source_id', v_source_id,
    'status', 'applied',
    'freshness_status', 'current',
    'affected_row_ids', v_affected_row_ids,
    'writes_committed', v_writes,
    'replayed', false
  );
end;
$$;

create function public.disable_ingredient_nutrition_model(
  p_source_id uuid,
  p_actor uuid,
  p_reason text,
  p_reviewed_at timestamptz,
  p_affected_row_ids jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_links integer := 0;
  v_assignments integer := 0;
  v_pieces integer := 0;
begin
  if nullif(btrim(p_reason), '') is null or p_actor is null or p_reviewed_at is null
    or not exists (select 1 from public.users where id = p_actor)
    or not exists (select 1 from public.nutrition_sources where id = p_source_id)
  then
    raise exception 'INVALID_DISABLE_DECISION';
  end if;

  update public.ingredient_nutrition_profiles link
  set review_status = 'revoked', is_active = false, is_primary = false,
      decision_reason = p_reason, reviewed_by = p_actor, reviewed_at = p_reviewed_at
  where exists (
    select 1
    from jsonb_array_elements_text(
      coalesce(p_affected_row_ids -> 'nutrition_link_ids', '[]'::jsonb)
    ) affected(id)
    where affected.id::uuid = link.id
    )
    and link.review_status = 'approved' and link.is_active;
  get diagnostics v_links = row_count;

  update public.ingredient_conversion_assignments assignment
  set review_status = 'revoked', is_active = false, assignment_reason = p_reason,
      reviewed_by = p_actor, reviewed_at = p_reviewed_at
  where exists (
    select 1
    from jsonb_array_elements_text(
      coalesce(p_affected_row_ids -> 'conversion_assignment_ids', '[]'::jsonb)
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
      coalesce(p_affected_row_ids -> 'piece_weight_ids', '[]'::jsonb)
    ) affected(id)
    where affected.id::uuid = piece.id
    )
    and piece.review_status = 'approved' and piece.is_active;
  get diagnostics v_pieces = row_count;

  return jsonb_build_object(
    'writes_committed', v_links + v_assignments + v_pieces,
    'revoked_count', v_links + v_assignments + v_pieces,
    'payload_deleted', 0
  );
end;
$$;

revoke all on function public.apply_ingredient_nutrition_model(jsonb) from public, anon, authenticated;
grant execute on function public.apply_ingredient_nutrition_model(jsonb) to service_role;
revoke all on function public.disable_ingredient_nutrition_model(uuid, uuid, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.disable_ingredient_nutrition_model(uuid, uuid, text, timestamptz, jsonb) to service_role;

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
