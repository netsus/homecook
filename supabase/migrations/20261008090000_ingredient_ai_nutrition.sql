-- Automatic estimates are an explicitly labelled last resort, never observed
-- laboratory values. Default off until every deployed consumer understands them.
begin;

alter table public.nutrition_values
  drop constraint nutrition_values_value_status_check,
  drop constraint nutrition_values_check,
  add constraint nutrition_values_value_status_check
    check (value_status in ('observed', 'estimated', 'missing', 'trace', 'parse_error')),
  add constraint nutrition_values_check check (
    (value_status in ('observed', 'estimated') and amount is not null
      and amount >= 0 and amount <= 99999999.999999)
    or (value_status not in ('observed', 'estimated') and amount is null)
  );

create function private.validate_ai_nutrition_value_source()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
declare v_provider text;
begin
  select source.provider_code into v_provider
  from public.nutrition_profiles profile
  join public.nutrition_source_items item on item.id = profile.source_item_id
  join public.nutrition_sources source on source.id = item.source_id
  where profile.id = new.profile_id;
  if (new.value_status = 'estimated' and v_provider is distinct from 'HOMECOOK_AI_ESTIMATE')
    or (v_provider = 'HOMECOOK_AI_ESTIMATE' and new.amount is not null
      and new.value_status <> 'estimated') then
    raise exception 'AI_NUTRITION_VALUE_SOURCE_MISMATCH' using errcode = '23514';
  end if;
  return new;
end;
$function$;
create trigger validate_ai_nutrition_value_source
before insert on public.nutrition_values
for each row execute function private.validate_ai_nutrition_value_source();

create table private.ingredient_ai_nutrition_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  policy_version text not null default 'ingredient-ai-v1'
    check (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  prompt_version text not null default 'ingredient-ai-prompt-v1'
    check (prompt_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  model_id text check (model_id ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$'),
  reviewed_by uuid references public.users(id) on delete restrict,
  daily_limit integer not null default 50 check (daily_limit between 1 and 1000),
  budget_date date,
  claims_today integer not null default 0 check (claims_today >= 0),
  check (not enabled or (model_id is not null and reviewed_by is not null))
);
insert into private.ingredient_ai_nutrition_settings (singleton) values (true);

create table private.ingredient_ai_nutrition_jobs (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  policy_version text not null,
  prompt_version text,
  model_id text,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'succeeded', 'skipped', 'failed')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts between 1 and 3),
  worker_id text,
  lease_token uuid,
  lease_expires_at timestamptz,
  completion_token uuid,
  context_hash text,
  ingredient_name text,
  last_error_code text,
  pending_recipe_ids uuid[] not null default '{}'::uuid[],
  result jsonb,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ingredient_id, policy_version),
  check (attempt_count between 0 and max_attempts),
  check ((status = 'processing' and lease_token is not null and lease_expires_at is not null)
    or (status <> 'processing' and lease_token is null and lease_expires_at is null)),
  check (context_hash is null or context_hash ~ '^[0-9a-f]{64}$')
);
create index ingredient_ai_nutrition_jobs_ready_idx
  on private.ingredient_ai_nutrition_jobs (available_at, created_at, id)
  where status in ('queued', 'processing');
create index ingredient_ai_nutrition_jobs_refresh_idx
  on private.ingredient_ai_nutrition_jobs (updated_at, id)
  where status = 'succeeded' and cardinality(pending_recipe_ids) > 0;
alter table private.ingredient_ai_nutrition_settings owner to postgres;
alter table private.ingredient_ai_nutrition_jobs owner to postgres;
alter table private.ingredient_ai_nutrition_settings enable row level security;
alter table private.ingredient_ai_nutrition_jobs enable row level security;
revoke all on private.ingredient_ai_nutrition_settings, private.ingredient_ai_nutrition_jobs
  from public, anon, authenticated, service_role;

create function private.require_ingredient_ai_scope(p_rpc_name text)
returns void language plpgsql security invoker
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if auth.role() is distinct from 'service_role'
    or coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb
      ->> 'x-homecook-internal-scope' is distinct from 'ingredient-ai-nutrition'
    or upper(coalesce(current_setting('request.method', true), '')) <> 'POST'
    or current_setting('request.path', true) is distinct from '/rpc/' || p_rpc_name then
    raise exception 'AI_NUTRITION_UNAUTHORIZED' using errcode = '42501';
  end if;
  perform private.verify_full_local_internal_scope();
end;
$function$;

create function private.ingredient_ai_nutrition_context(p_ingredient_id uuid)
returns jsonb language sql stable security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
  select jsonb_build_object(
    'ingredient_id', ingredient.id, 'ingredient_name', ingredient.standard_name,
    'category', ingredient.category, 'category_code', ingredient.category_code,
    'definition', entry.definition,
    'presentation', coalesce(entry.presentation, 'base'),
    'retain_dimensions', coalesce(entry.retain_dimensions, '[]'::jsonb)
  ) from public.ingredients ingredient
  left join public.ingredient_catalog_entries entry on entry.ingredient_id = ingredient.id
  where ingredient.id = p_ingredient_id;
$function$;

create function private.ingredient_ai_nutrition_skip_reason(p_ingredient_id uuid)
returns text language plpgsql volatile security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
begin
  if not exists (select 1 from public.ingredients where id = p_ingredient_id) then
    return 'INGREDIENT_NOT_FOUND';
  end if;
  if not public.is_selectable_catalog_ingredient(p_ingredient_id)
    or exists (select 1 from public.ingredient_catalog_entries
      where ingredient_id = p_ingredient_id
        and presentation in ('excluded', 'alias', 'umbrella', 'prepared_food')) then
    return 'CATALOG_SCOPE_EXCLUDED';
  end if;
  if exists (select 1 from public.ingredient_representative_links
    where source_ingredient_id = p_ingredient_id) then
    return 'APPROVED_REPRESENTATIVE_EXISTS';
  end if;
  -- Even incomplete approved official profiles take precedence. This path does
  -- not splice AI values into measured profiles or replace an official primary.
  if exists (
    select 1 from public.ingredient_nutrition_profiles link
    join public.nutrition_profiles profile on profile.id = link.nutrition_profile_id
    left join public.nutrition_source_items item on item.id = profile.source_item_id
    left join public.nutrition_sources source on source.id = item.source_id
    where link.ingredient_id = p_ingredient_id and link.is_active and link.is_primary
      and link.review_status = 'approved'
      and source.provider_code is distinct from 'HOMECOOK_AI_ESTIMATE'
  ) then return 'NON_AI_PRIMARY_EXISTS'; end if;
  if exists (
    select 1 from public.food_product_ingredient_links link
    join public.food_products product on product.id = link.product_id
      and product.deleted_at is null and product.moderation_status = 'visible'
    join public.food_product_nutrition_versions version
      on version.id = product.current_nutrition_version_id
    join public.nutrition_profiles profile on profile.id = version.nutrition_profile_id
      and profile.review_status = 'approved'
    where link.ingredient_id = p_ingredient_id and link.relation = 'represents'
      and link.is_active and link.is_primary and link.review_status = 'approved'
  ) then return 'APPROVED_PRODUCT_EXISTS'; end if;
  return null;
end;
$function$;

create function private.enqueue_ingredient_ai_nutrition_id(p_ingredient_id uuid)
returns text language plpgsql security invoker
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare v_policy text; v_count integer; v_reason text;
begin
  v_reason := private.ingredient_ai_nutrition_skip_reason(p_ingredient_id);
  if v_reason is not null then return 'skipped'; end if;
  select policy_version into strict v_policy
    from private.ingredient_ai_nutrition_settings where singleton;
  -- Queueing is allowed while disabled; claim and completion remain gated.
  insert into private.ingredient_ai_nutrition_jobs (ingredient_id, policy_version)
  values (p_ingredient_id, v_policy) on conflict (ingredient_id, policy_version) do nothing;
  get diagnostics v_count = row_count;
  return case when v_count = 1 then 'queued' else 'existing' end;
end;
$function$;

create function private.enqueue_new_ingredient_ai_nutrition()
returns trigger language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  perform private.enqueue_ingredient_ai_nutrition_id(new.id);
  return new;
end;
$function$;
create trigger enqueue_new_ingredient_ai_nutrition
  after insert on public.ingredients
  for each row execute function private.enqueue_new_ingredient_ai_nutrition();

create function public.enqueue_ingredient_ai_nutrition(p_ingredient_ids uuid[])
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare v_id uuid; v_status text; v_queued integer := 0; v_skipped integer := 0; v_existing integer := 0;
begin
  perform private.require_ingredient_ai_scope('enqueue_ingredient_ai_nutrition');
  if p_ingredient_ids is null or cardinality(p_ingredient_ids) not between 1 and 100
    or array_position(p_ingredient_ids, null) is not null then
    raise exception 'AI_NUTRITION_INVALID_IDS' using errcode = '22023';
  end if;
  for v_id in select distinct id from unnest(p_ingredient_ids) ids(id) order by id loop
    v_status := private.enqueue_ingredient_ai_nutrition_id(v_id);
    if v_status = 'queued' then v_queued := v_queued + 1;
    elsif v_status = 'skipped' then v_skipped := v_skipped + 1;
    else v_existing := v_existing + 1; end if;
  end loop;
  return jsonb_build_object('queued', v_queued, 'skipped', v_skipped, 'existing', v_existing);
end;
$function$;

create function public.claim_ingredient_ai_nutrition_job(p_worker_id text, p_lease_seconds integer default 180)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_settings private.ingredient_ai_nutrition_settings%rowtype;
  v_job private.ingredient_ai_nutrition_jobs%rowtype;
  v_context jsonb; v_reason text; v_day date := (clock_timestamp() at time zone 'Asia/Seoul')::date;
begin
  perform private.require_ingredient_ai_scope('claim_ingredient_ai_nutrition_job');
  if p_worker_id is null or p_worker_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    or p_lease_seconds is null or p_lease_seconds not between 15 and 300 then
    raise exception 'AI_NUTRITION_INVALID_CLAIM' using errcode = '22023';
  end if;
  select * into strict v_settings from private.ingredient_ai_nutrition_settings where singleton for update;
  if not v_settings.enabled then return jsonb_build_object('status', 'disabled'); end if;
  if v_settings.budget_date is distinct from v_day then
    update private.ingredient_ai_nutrition_settings set budget_date = v_day, claims_today = 0 where singleton;
    v_settings.claims_today := 0;
  end if;
  if v_settings.claims_today >= v_settings.daily_limit then
    return jsonb_build_object('status', 'budget_exhausted');
  end if;
  -- Reap/reclaim at most one job per call; repeated leases still consume attempts.
  select * into v_job from private.ingredient_ai_nutrition_jobs
  where (status = 'queued' and available_at <= clock_timestamp())
    or (status = 'processing' and lease_expires_at <= clock_timestamp())
  order by available_at, created_at, id for update skip locked limit 1;
  if not found then return jsonb_build_object('status', 'empty'); end if;
  if v_job.attempt_count >= v_job.max_attempts then v_reason := 'ATTEMPTS_EXHAUSTED';
  elsif v_job.policy_version <> v_settings.policy_version then v_reason := 'POLICY_CHANGED';
  else v_reason := private.ingredient_ai_nutrition_skip_reason(v_job.ingredient_id); end if;
  if v_reason is not null then
    update private.ingredient_ai_nutrition_jobs set
      status = case when v_reason = 'ATTEMPTS_EXHAUSTED' then 'failed' else 'skipped' end,
      last_error_code = v_reason, lease_token = null, lease_expires_at = null,
      worker_id = null, updated_at = clock_timestamp() where id = v_job.id;
    return jsonb_build_object('status', 'skipped', 'job_id', v_job.id, 'reason', v_reason);
  end if;
  v_context := private.ingredient_ai_nutrition_context(v_job.ingredient_id);
  update private.ingredient_ai_nutrition_jobs set status = 'processing',
    attempt_count = attempt_count + 1, worker_id = p_worker_id,
    lease_token = gen_random_uuid(), lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
    context_hash = encode(extensions.digest(v_context::text, 'sha256'), 'hex'),
    ingredient_name = v_context ->> 'ingredient_name',
    prompt_version = v_settings.prompt_version, model_id = v_settings.model_id,
    last_error_code = null, updated_at = clock_timestamp()
  where id = v_job.id returning * into v_job;
  update private.ingredient_ai_nutrition_settings set claims_today = claims_today + 1 where singleton;
  return jsonb_build_object('status', 'claimed', 'job_id', v_job.id,
    'ingredient_id', v_job.ingredient_id, 'lease_token', v_job.lease_token,
    'lease_expires_at', v_job.lease_expires_at, 'policy_version', v_job.policy_version,
    'prompt_version', v_job.prompt_version, 'model', v_job.model_id);
end;
$function$;

create function public.get_ingredient_ai_nutrition_context(p_job_id uuid, p_lease_token uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare v_job private.ingredient_ai_nutrition_jobs%rowtype; v_context jsonb;
begin
  perform private.require_ingredient_ai_scope('get_ingredient_ai_nutrition_context');
  if not (select enabled from private.ingredient_ai_nutrition_settings where singleton) then
    return jsonb_build_object('status', 'disabled');
  end if;
  select * into v_job from private.ingredient_ai_nutrition_jobs where id = p_job_id;
  if not found or v_job.status <> 'processing' or v_job.lease_token is distinct from p_lease_token
    or v_job.lease_expires_at <= clock_timestamp() then
    raise exception 'AI_NUTRITION_STALE_LEASE' using errcode = '40001';
  end if;
  v_context := private.ingredient_ai_nutrition_context(v_job.ingredient_id);
  if encode(extensions.digest(v_context::text, 'sha256'), 'hex') is distinct from v_job.context_hash then
    raise exception 'AI_NUTRITION_CONTEXT_CHANGED' using errcode = '40001';
  end if;
  return jsonb_build_object('status', 'ready', 'job_id', v_job.id,
    'ingredient_id', v_job.ingredient_id, 'standard_name', v_context ->> 'ingredient_name',
    'category', v_context ->> 'category', 'definition', v_context ->> 'definition',
    'context_hash', v_job.context_hash, 'model', v_job.model_id,
    'policy_version', v_job.policy_version, 'prompt_version', v_job.prompt_version,
    'basis', jsonb_build_object('amount', 100, 'unit', 'g'));
end;
$function$;

create function public.complete_ingredient_ai_nutrition_job(p_job_id uuid, p_lease_token uuid, p_result jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_settings private.ingredient_ai_nutrition_settings%rowtype;
  v_job private.ingredient_ai_nutrition_jobs%rowtype;
  v_context jsonb; v_reason text; v_generated_at timestamptz;
  v_count integer; v_core_known integer := 0; v_code text; v_value jsonb; v_amount numeric;
  v_carbs numeric; v_protein numeric; v_fat numeric; v_sugars numeric; v_fiber numeric; v_saturated numeric;
  v_manifest text; v_source_id uuid; v_item_id uuid; v_profile_id uuid;
  v_previous_id uuid; v_link_id uuid; v_version integer;
  v_recipe_ids uuid[]; v_output jsonb;
begin
  perform private.require_ingredient_ai_scope('complete_ingredient_ai_nutrition_job');
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'AI_NUTRITION_READ_COMMITTED_REQUIRED' using errcode = '25000';
  end if;
  select * into strict v_settings from private.ingredient_ai_nutrition_settings where singleton for share;
  if not v_settings.enabled then return jsonb_build_object('status', 'disabled'); end if;
  select * into v_job from private.ingredient_ai_nutrition_jobs where id = p_job_id for update;
  if found and v_job.status in ('succeeded', 'skipped') and v_job.completion_token = p_lease_token then
    return v_job.result || jsonb_build_object('replayed', true);
  end if;
  if not found or v_job.status <> 'processing' or v_job.lease_token is distinct from p_lease_token
    or v_job.lease_expires_at <= clock_timestamp() then
    raise exception 'AI_NUTRITION_STALE_LEASE' using errcode = '40001';
  end if;
  -- Freeze catalog/representative identity, including an entry inserted after
  -- claiming, before acquiring the shared nutrition predecessor lock contract.
  perform pg_advisory_xact_lock(hashtextextended('homecook:ingredient-representative-links', 0));
  perform public.lock_recipe_nutrition_ingredient_ids(array[v_job.ingredient_id], false);
  perform 1 from public.ingredients where id = v_job.ingredient_id for share;
  if v_job.lease_expires_at <= clock_timestamp() then
    raise exception 'AI_NUTRITION_STALE_LEASE' using errcode = '40001';
  end if;
  v_context := private.ingredient_ai_nutrition_context(v_job.ingredient_id);
  if v_settings.policy_version <> v_job.policy_version
    or v_settings.prompt_version is distinct from v_job.prompt_version
    or v_settings.model_id is distinct from v_job.model_id then v_reason := 'POLICY_CHANGED';
  elsif encode(extensions.digest(v_context::text, 'sha256'), 'hex') is distinct from v_job.context_hash then
    v_reason := 'CONTEXT_CHANGED';
  else v_reason := private.ingredient_ai_nutrition_skip_reason(v_job.ingredient_id); end if;
  if v_reason is not null then
    v_output := jsonb_build_object('status', 'skipped', 'job_id', v_job.id, 'reason', v_reason);
    update private.ingredient_ai_nutrition_jobs set status = 'skipped', last_error_code = v_reason,
      completion_token = lease_token, lease_token = null, lease_expires_at = null,
      worker_id = null, result = v_output, updated_at = clock_timestamp() where id = v_job.id;
    return v_output;
  end if;
  -- Exact envelope: neither provider/display names nor raw prompts/responses
  -- are accepted. Server-controlled identity fields must match the claimed job.
  if jsonb_typeof(p_result) is distinct from 'object' then
    raise exception 'AI_NUTRITION_INVALID_OUTPUT' using errcode = '22023';
  end if;
  select count(*) into v_count from jsonb_object_keys(p_result);
  if v_count <> 9 or exists (select 1 from jsonb_object_keys(p_result) keys(key)
      where key not in ('model', 'policy_version', 'prompt_version', 'context_hash',
        'generated_at', 'basis', 'assumptions', 'uncertainty', 'values'))
    or p_result ->> 'model' is distinct from v_job.model_id
    or p_result ->> 'policy_version' is distinct from v_job.policy_version
    or p_result ->> 'prompt_version' is distinct from v_job.prompt_version
    or p_result ->> 'context_hash' is distinct from v_job.context_hash
    or p_result -> 'basis' is distinct from jsonb_build_object('amount', 100, 'unit', 'g')
    or jsonb_typeof(p_result -> 'generated_at') is distinct from 'string'
    or jsonb_typeof(p_result -> 'values') is distinct from 'object'
    or jsonb_typeof(p_result -> 'assumptions') is distinct from 'array'
    or coalesce(p_result ->> 'uncertainty', '') not in ('low', 'medium', 'high') then
    raise exception 'AI_NUTRITION_INVALID_OUTPUT' using errcode = '22023';
  end if;
  if jsonb_array_length(p_result -> 'assumptions') not between 1 and 8 or exists (
    select 1 from jsonb_array_elements(p_result -> 'assumptions') assumptions(value)
    where jsonb_typeof(value) <> 'string' or char_length(btrim(value #>> '{}')) not between 1 and 500
      or value::text ~* '(api[_-]?key|authorization|bearer[[:space:]]|password|secret|sk-[a-z0-9]{8})'
  ) then raise exception 'AI_NUTRITION_INVALID_ASSUMPTIONS' using errcode = '22023'; end if;
  begin v_generated_at := (p_result ->> 'generated_at')::timestamptz;
  exception when others then raise exception 'AI_NUTRITION_INVALID_TIMESTAMP' using errcode = '22023'; end;
  if v_generated_at < v_job.updated_at - interval '5 minutes'
    or v_generated_at > clock_timestamp() + interval '5 minutes' then
    raise exception 'AI_NUTRITION_INVALID_TIMESTAMP' using errcode = '22023';
  end if;
  select count(*) into v_count from jsonb_each(p_result -> 'values');
  if v_count <> 8 then raise exception 'AI_NUTRITION_INVALID_VALUES' using errcode = '22023'; end if;
  for v_code, v_value in select key, value from jsonb_each(p_result -> 'values') loop
    if v_code not in ('energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g',
      'saturated_fat_g', 'sugars_g', 'fiber_g', 'sodium_mg')
      or jsonb_typeof(v_value) not in ('number', 'null') then
      raise exception 'AI_NUTRITION_INVALID_VALUES' using errcode = '22023';
    end if;
    if jsonb_typeof(v_value) = 'number' then
      v_amount := v_value::text::numeric;
      if v_amount < 0 or v_amount > (case v_code
          when 'energy_kcal' then 900 when 'sodium_mg' then 40000 else 100 end) then
        raise exception 'AI_NUTRITION_VALUE_OUT_OF_RANGE' using errcode = '22023';
      end if;
      if v_code in ('energy_kcal', 'carbohydrate_g', 'protein_g', 'fat_g', 'sodium_mg') then
        v_core_known := v_core_known + 1;
      end if;
    end if;
  end loop;
  if v_core_known = 0 then
    raise exception 'AI_NUTRITION_NO_CORE_ESTIMATE' using errcode = '22023';
  end if;
  v_carbs := (p_result -> 'values' ->> 'carbohydrate_g')::numeric;
  v_protein := (p_result -> 'values' ->> 'protein_g')::numeric;
  v_fat := (p_result -> 'values' ->> 'fat_g')::numeric;
  v_sugars := (p_result -> 'values' ->> 'sugars_g')::numeric;
  v_fiber := (p_result -> 'values' ->> 'fiber_g')::numeric;
  v_saturated := (p_result -> 'values' ->> 'saturated_fat_g')::numeric;
  if coalesce(v_carbs, 0) + coalesce(v_protein, 0) + coalesce(v_fat, 0) > 100.5
    or ((p_result -> 'values' ->> 'energy_kcal')::numeric = 0
      and coalesce(v_carbs, 0) + coalesce(v_protein, 0) + coalesce(v_fat, 0) > 0.1)
    or (v_carbs is not null and v_sugars > v_carbs + 0.05)
    or (v_carbs is not null and v_fiber > v_carbs + 0.05)
    or (v_fat is not null and v_saturated > v_fat + 0.05) then
    raise exception 'AI_NUTRITION_INCONSISTENT_VALUES' using errcode = '22023';
  end if;
  if not exists (select 1 from public.users where id = v_settings.reviewed_by and deleted_at is null) then
    raise exception 'AI_NUTRITION_POLICY_ACTOR_UNAVAILABLE' using errcode = '55000';
  end if;
  -- Serialize creation of the one source for this immutable policy/model tuple.
  perform pg_advisory_xact_lock(hashtextextended('homecook:ai-nutrition-source:' || v_job.policy_version, 0));
  v_manifest := encode(extensions.digest(jsonb_build_object(
    'policy', v_job.policy_version, 'prompt', v_job.prompt_version, 'model', v_job.model_id
  )::text, 'sha256'), 'hex');
  select id into v_source_id from public.nutrition_sources
    where provider_code = 'HOMECOOK_AI_ESTIMATE'
      and dataset_name = 'Homecook AI nutrition / ' || v_job.policy_version
      and source_version = v_job.policy_version and manifest_sha256 = v_manifest
      and review_status = 'approved' and is_active and freshness_status = 'current';
  if v_source_id is null then
    if exists (select 1 from public.nutrition_sources
      where provider_code = 'HOMECOOK_AI_ESTIMATE'
        and dataset_name = 'Homecook AI nutrition / ' || v_job.policy_version) then
      raise exception 'AI_NUTRITION_POLICY_REUSE' using errcode = '23514';
    end if;
    insert into public.nutrition_sources (provider_code, dataset_name, source_kind, source_version,
      fetched_at, freshness_checked_at, freshness_status, priority_rank, source_url, license_name,
      manifest_sha256, review_status, decision_reason, reviewed_by, reviewed_at, is_active)
    values ('HOMECOOK_AI_ESTIMATE', 'Homecook AI nutrition / ' || v_job.policy_version,
      'nutrition_dataset', v_job.policy_version, clock_timestamp(), clock_timestamp(), 'current', 32767,
      'https://app.mumeok.kr/about/ai-nutrition',
      'AI-generated estimate; not official analytical data', v_manifest, 'approved',
      'Automatic estimate permitted by configured policy; no human review of each model value',
      v_settings.reviewed_by, clock_timestamp(), true) returning id into v_source_id;
  end if;
  select coalesce(max(version), 0) + 1 into v_version
    from public.ingredient_nutrition_profiles
    where ingredient_id = v_job.ingredient_id and preparation_state = 'as_published';
  insert into public.nutrition_source_items (source_id, external_item_key, external_name,
    preparation_state, source_basis_text, source_basis_amount, source_basis_unit, edible_portion_text,
    stable_fingerprint, review_status, decision_reason, reviewed_by, reviewed_at, provenance_json)
  values (v_source_id, v_job.id::text, v_job.ingredient_name, 'as_published',
    'AI estimate per 100 g edible portion', 100, 'g', '100 g edible portion',
    encode(extensions.digest(v_job.id::text || ':' || p_result::text, 'sha256'), 'hex'),
    'approved', 'AI_NUTRITION_ESTIMATE_USED; automatically accepted under configured policy',
    v_settings.reviewed_by, clock_timestamp(), jsonb_build_object(
      'provider', 'HOMECOOK_AI_ESTIMATE', 'model', v_job.model_id,
      'policy_version', v_job.policy_version, 'prompt_version', v_job.prompt_version,
      'generated_at', v_generated_at, 'basis', jsonb_build_object('amount', 100, 'unit', 'g'),
      'assumptions', p_result -> 'assumptions', 'uncertainty', p_result ->> 'uncertainty',
      'warning', 'AI_NUTRITION_ESTIMATE_USED', 'job_id', v_job.id,
      'context_hash', v_job.context_hash
    )) returning id into v_item_id;
  insert into public.nutrition_profiles (source_item_id, profile_kind, normalization_method,
    basis_amount, basis_unit, version, review_status, decision_reason, reviewed_by, reviewed_at, is_active)
  values (v_item_id, 'ingredient_source', 'mass_100g', 100, 'g', v_version, 'approved',
    'AI_NUTRITION_ESTIMATE_USED; not observed values', v_settings.reviewed_by, clock_timestamp(), true)
    returning id into v_profile_id;
  for v_code, v_value in select key, value from jsonb_each(p_result -> 'values') order by key loop
    insert into public.nutrition_values (profile_id, nutrient_code, source_nutrient_code, source_unit,
      amount, value_status, source_token)
    values (v_profile_id, v_code, v_code,
      case v_code when 'energy_kcal' then 'kcal' when 'sodium_mg' then 'mg' else 'g' end,
      case when jsonb_typeof(v_value) = 'number' then round(v_value::text::numeric, 6) else null end,
      case when jsonb_typeof(v_value) = 'number' then 'estimated' else 'missing' end,
      case when jsonb_typeof(v_value) = 'number' then v_value::text else null end);
  end loop;
  select link.id into v_previous_id from public.ingredient_nutrition_profiles link
    where link.ingredient_id = v_job.ingredient_id and link.preparation_state = 'as_published'
      and link.is_primary and link.is_active and link.review_status = 'approved' for update;
  if v_previous_id is not null and not exists (
    select 1 from public.ingredient_nutrition_profiles link
    join public.nutrition_profiles profile on profile.id = link.nutrition_profile_id
    join public.nutrition_source_items item on item.id = profile.source_item_id
    join public.nutrition_sources source on source.id = item.source_id
    where link.id = v_previous_id and source.provider_code = 'HOMECOOK_AI_ESTIMATE'
  ) then raise exception 'AI_NUTRITION_OFFICIAL_SOURCE_RACE' using errcode = '40001'; end if;
  insert into public.ingredient_nutrition_profiles (ingredient_id, nutrition_profile_id,
    preparation_state, match_method, confidence_score, candidate_rank, is_primary, review_status,
    decision_reason, reviewed_by, reviewed_at, version, is_active)
  values (v_job.ingredient_id, v_profile_id, 'as_published', 'ai_estimate', null, 32767, false,
    'pending', 'AI_NUTRITION_ESTIMATE_USED', v_settings.reviewed_by, clock_timestamp(), v_version, false)
    returning id into v_link_id;
  if v_previous_id is not null then
    update public.ingredient_nutrition_profiles set review_status = 'superseded',
      is_active = false, is_primary = false, superseded_by_id = v_link_id,
      decision_reason = 'Replaced by a newer AI policy estimate; historical values preserved',
      reviewed_by = v_settings.reviewed_by, reviewed_at = clock_timestamp() where id = v_previous_id;
  end if;
  update public.ingredient_nutrition_profiles set review_status = 'approved', is_active = true,
    is_primary = true, decision_reason = 'AI_NUTRITION_ESTIMATE_USED',
    reviewed_by = v_settings.reviewed_by, reviewed_at = clock_timestamp() where id = v_link_id;
  select coalesce(array_agg(recipe_id order by recipe_id), '{}'::uuid[]) into v_recipe_ids
  from (select distinct ingredient.recipe_id from public.recipe_ingredients ingredient
    join public.recipes recipe on recipe.id = ingredient.recipe_id and recipe.deleted_at is null
    where ingredient.ingredient_id = v_job.ingredient_id) affected;
  v_output := jsonb_build_object('status', 'applied', 'job_id', v_job.id,
    'ingredient_id', v_job.ingredient_id, 'profile_id', v_profile_id, 'link_id', v_link_id,
    'warning', 'AI_NUTRITION_ESTIMATE_USED', 'affected_recipe_ids', to_jsonb(v_recipe_ids), 'replayed', false);
  update private.ingredient_ai_nutrition_jobs set status = 'succeeded', result = v_output,
    pending_recipe_ids = v_recipe_ids, completion_token = lease_token, lease_token = null,
    lease_expires_at = null, worker_id = null, last_error_code = null, updated_at = clock_timestamp()
    where id = v_job.id;
  insert into public.operational_events (event_type, severity, source, actor_user_id, message_summary, metadata_json)
  values ('ingredient_ai_nutrition_estimated', 'info', 'ingredient-ai-nutrition', v_settings.reviewed_by,
    'AI nutrition estimate created', jsonb_build_object('job_id', v_job.id,
      'ingredient_id', v_job.ingredient_id, 'nutrition_profile_id', v_profile_id,
      'policy_version', v_job.policy_version, 'warning', 'AI_NUTRITION_ESTIMATE_USED'));
  return v_output;
end;
$function$;

create function public.fail_ingredient_ai_nutrition_job(
  p_job_id uuid, p_lease_token uuid, p_error_code text, p_retryable boolean default true
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare v_job private.ingredient_ai_nutrition_jobs%rowtype; v_code text; v_retry boolean;
begin
  perform private.require_ingredient_ai_scope('fail_ingredient_ai_nutrition_job');
  select * into v_job from private.ingredient_ai_nutrition_jobs where id = p_job_id for update;
  if not found or v_job.status <> 'processing' or v_job.lease_token is distinct from p_lease_token
    or v_job.lease_expires_at <= clock_timestamp() then
    raise exception 'AI_NUTRITION_STALE_LEASE' using errcode = '40001';
  end if;
  v_code := case when p_error_code in ('MODEL_TIMEOUT', 'MODEL_UNAVAILABLE', 'MODEL_OUTPUT_INVALID',
    'MODEL_REQUEST_FAILED', 'CONFIGURATION_ERROR', 'CONTEXT_CHANGED', 'NO_ESTIMATE', 'INTERNAL_ERROR')
    then p_error_code else 'INTERNAL_ERROR' end;
  v_retry := coalesce(p_retryable, false) and v_job.attempt_count < v_job.max_attempts;
  update private.ingredient_ai_nutrition_jobs set status = case when v_retry then 'queued' else 'failed' end,
    available_at = clock_timestamp() + make_interval(secs => 30 * (2 ^ v_job.attempt_count)::integer),
    last_error_code = v_code, worker_id = null, lease_token = null, lease_expires_at = null,
    updated_at = clock_timestamp() where id = v_job.id;
  return jsonb_build_object('status', case when v_retry then 'queued' else 'failed' end, 'job_id', v_job.id);
end;
$function$;

create function public.list_ingredient_ai_nutrition_refresh_jobs(p_limit integer default 20)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_job private.ingredient_ai_nutrition_jobs%rowtype;
  v_live uuid[]; v_rotated uuid[]; v_jobs jsonb := '[]'::jsonb;
begin
  perform private.require_ingredient_ai_scope('list_ingredient_ai_nutrition_refresh_jobs');
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'AI_NUTRITION_INVALID_LIMIT' using errcode = '22023';
  end if;
  for v_job in select * from private.ingredient_ai_nutrition_jobs
    where status = 'succeeded' and cardinality(pending_recipe_ids) > 0
    order by updated_at, id for update skip locked limit p_limit
  loop
    -- Delete only obsolete queue references, never a recipe or historical row.
    select coalesce(array_agg(pending.id order by pending.ordinality), '{}'::uuid[]) into v_live
    from unnest(v_job.pending_recipe_ids) with ordinality pending(id, ordinality)
    join public.recipes recipe on recipe.id = pending.id and recipe.deleted_at is null;
    if cardinality(v_live) > 0 then
      v_jobs := v_jobs || jsonb_build_array(jsonb_build_object('job_id', v_job.id,
        'ingredient_id', v_job.ingredient_id, 'pending_recipe_ids', to_jsonb(v_live)));
    end if;
    -- Return the original order, then rotate the worker's first ten IDs. Failed
    -- live IDs remain retryable without starving the tail or subsequent jobs.
    if cardinality(v_live) > 10 then
      v_rotated := v_live[11:cardinality(v_live)] || v_live[1:10];
    else v_rotated := v_live; end if;
    update private.ingredient_ai_nutrition_jobs set pending_recipe_ids = v_rotated,
      updated_at = clock_timestamp() where id = v_job.id;
  end loop;
  return jsonb_build_object('jobs', v_jobs);
end;
$function$;

create function public.acknowledge_ingredient_ai_nutrition_refresh(p_job_id uuid, p_recipe_ids uuid[])
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare v_job private.ingredient_ai_nutrition_jobs%rowtype; v_pending uuid[];
begin
  perform private.require_ingredient_ai_scope('acknowledge_ingredient_ai_nutrition_refresh');
  if p_recipe_ids is null or cardinality(p_recipe_ids) not between 1 and 1000
    or array_position(p_recipe_ids, null) is not null then
    raise exception 'AI_NUTRITION_INVALID_IDS' using errcode = '22023';
  end if;
  select * into v_job from private.ingredient_ai_nutrition_jobs where id = p_job_id for update;
  if not found or v_job.status <> 'succeeded' then
    raise exception 'AI_NUTRITION_REFRESH_JOB_INVALID' using errcode = '22023';
  end if;
  -- Completed result retains the original permitted set for idempotent ACKs.
  if exists (select 1 from unnest(p_recipe_ids) requested(id)
    where not exists (select 1 from jsonb_array_elements_text(v_job.result -> 'affected_recipe_ids') allowed(id)
      where allowed.id = requested.id::text)) then
    raise exception 'AI_NUTRITION_REFRESH_RECIPE_NOT_ALLOWED' using errcode = '42501';
  end if;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_pending
    from unnest(v_job.pending_recipe_ids) pending(id) where not id = any(p_recipe_ids);
  update private.ingredient_ai_nutrition_jobs set pending_recipe_ids = v_pending,
    updated_at = clock_timestamp() where id = v_job.id;
  return jsonb_build_object('status', 'acknowledged', 'remaining', cardinality(v_pending));
end;
$function$;

-- Add one scope with only these RPC paths; preserve every existing scope rule.
alter function private.verify_full_local_internal_scope()
  rename to verify_scope_pre_ingredient_ai_20261008;
create function private.verify_full_local_internal_scope()
returns void language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb
    ->> 'x-homecook-internal-scope' = 'ingredient-ai-nutrition' then
    if upper(coalesce(current_setting('request.method', true), '')) = 'POST'
      and current_setting('request.path', true) = any(array[
        '/rpc/enqueue_ingredient_ai_nutrition',
        '/rpc/claim_ingredient_ai_nutrition_job',
        '/rpc/get_ingredient_ai_nutrition_context',
        '/rpc/complete_ingredient_ai_nutrition_job',
        '/rpc/fail_ingredient_ai_nutrition_job',
        '/rpc/list_ingredient_ai_nutrition_refresh_jobs',
        '/rpc/acknowledge_ingredient_ai_nutrition_refresh'
      ]) then return; end if;
    raise exception 'AI_NUTRITION_SCOPE_DENIED' using errcode = '42501';
  end if;
  perform private.verify_scope_pre_ingredient_ai_20261008();
end;
$function$;

alter function private.validate_ai_nutrition_value_source() owner to postgres;
alter function private.require_ingredient_ai_scope(text) owner to postgres;
alter function private.ingredient_ai_nutrition_context(uuid) owner to postgres;
alter function private.ingredient_ai_nutrition_skip_reason(uuid) owner to postgres;
alter function private.enqueue_ingredient_ai_nutrition_id(uuid) owner to postgres;
alter function private.enqueue_new_ingredient_ai_nutrition() owner to postgres;
alter function private.verify_scope_pre_ingredient_ai_20261008() owner to postgres;
alter function private.verify_full_local_internal_scope() owner to postgres;
revoke all on function
  private.validate_ai_nutrition_value_source(),
  private.require_ingredient_ai_scope(text),
  private.ingredient_ai_nutrition_context(uuid),
  private.ingredient_ai_nutrition_skip_reason(uuid),
  private.enqueue_ingredient_ai_nutrition_id(uuid),
  private.enqueue_new_ingredient_ai_nutrition(),
  private.verify_scope_pre_ingredient_ai_20261008(),
  private.verify_full_local_internal_scope()
  from public, anon, authenticated, service_role;

alter function public.enqueue_ingredient_ai_nutrition(uuid[]) owner to postgres;
alter function public.claim_ingredient_ai_nutrition_job(text, integer) owner to postgres;
alter function public.get_ingredient_ai_nutrition_context(uuid, uuid) owner to postgres;
alter function public.complete_ingredient_ai_nutrition_job(uuid, uuid, jsonb) owner to postgres;
alter function public.fail_ingredient_ai_nutrition_job(uuid, uuid, text, boolean) owner to postgres;
alter function public.list_ingredient_ai_nutrition_refresh_jobs(integer) owner to postgres;
alter function public.acknowledge_ingredient_ai_nutrition_refresh(uuid, uuid[]) owner to postgres;
revoke all on function
  public.enqueue_ingredient_ai_nutrition(uuid[]),
  public.claim_ingredient_ai_nutrition_job(text, integer),
  public.get_ingredient_ai_nutrition_context(uuid, uuid),
  public.complete_ingredient_ai_nutrition_job(uuid, uuid, jsonb),
  public.fail_ingredient_ai_nutrition_job(uuid, uuid, text, boolean),
  public.list_ingredient_ai_nutrition_refresh_jobs(integer),
  public.acknowledge_ingredient_ai_nutrition_refresh(uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function
  public.enqueue_ingredient_ai_nutrition(uuid[]),
  public.claim_ingredient_ai_nutrition_job(text, integer),
  public.get_ingredient_ai_nutrition_context(uuid, uuid),
  public.complete_ingredient_ai_nutrition_job(uuid, uuid, jsonb),
  public.fail_ingredient_ai_nutrition_job(uuid, uuid, text, boolean),
  public.list_ingredient_ai_nutrition_refresh_jobs(integer),
  public.acknowledge_ingredient_ai_nutrition_refresh(uuid, uuid[])
  to service_role;

comment on table private.ingredient_ai_nutrition_settings is
  'Operator-controlled rollout gate. Disabled by default until API/UI consumers label AI estimates. Model and policy actor are required before enabling.';
comment on table private.ingredient_ai_nutrition_jobs is
  'Transactional ingredient estimate queue and durable current-recipe refresh IDs. No provider credentials, raw prompts or model responses.';
notify pgrst, 'reload schema';
commit;
