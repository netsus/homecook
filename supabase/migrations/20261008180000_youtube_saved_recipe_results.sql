begin;

create table public.youtube_saved_recipe_results (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  account_generation bigint not null check (account_generation > 0),
  -- Keep the source identity after transient extraction-session retention ends.
  -- The create RPC validates and snapshots the live row before writing this id.
  extraction_session_id uuid not null,
  source_snapshot_json jsonb not null check (jsonb_typeof(source_snapshot_json) = 'object'),
  editable_content_json jsonb not null check (jsonb_typeof(editable_content_json) = 'object'),
  editable_content_hash text not null check (editable_content_hash ~ '^[0-9a-f]{64}$'),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (owner_user_id, account_generation, extraction_session_id)
);

create index youtube_saved_recipe_results_owner_updated_idx
  on public.youtube_saved_recipe_results (owner_user_id, account_generation, updated_at desc, id);

alter table public.youtube_saved_recipe_results enable row level security;
revoke all on table public.youtube_saved_recipe_results from public, anon, authenticated, service_role;

create table private.youtube_saved_recipe_result_mutations (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  account_generation bigint not null check (account_generation > 0),
  operation text not null check (operation in ('create', 'update')),
  idempotency_key uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  durable_result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique (owner_user_id, account_generation, operation, idempotency_key)
);

revoke all on table private.youtube_saved_recipe_result_mutations
  from public, anon, authenticated, service_role;

create or replace function private.guard_youtube_saved_recipe_source_snapshot()
returns trigger
language plpgsql
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if new.owner_user_id is distinct from old.owner_user_id
    or new.account_generation is distinct from old.account_generation
    or new.extraction_session_id is distinct from old.extraction_session_id
    or new.source_snapshot_json is distinct from old.source_snapshot_json
    or new.created_at is distinct from old.created_at then
    raise exception 'youtube saved recipe source snapshot is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

create trigger youtube_saved_recipe_source_snapshot_guard
before update on public.youtube_saved_recipe_results
for each row execute function private.guard_youtube_saved_recipe_source_snapshot();

create or replace function private.project_youtube_saved_recipe_result(
  p_result public.youtube_saved_recipe_results
)
returns jsonb
language sql
stable
set search_path = pg_catalog, public, private, pg_temp
as $function$
  select jsonb_build_object(
    'draft_id', p_result.id,
    'revision', p_result.revision,
    'created_at', p_result.created_at,
    'updated_at', p_result.updated_at,
    'content', p_result.editable_content_json,
    'source', jsonb_build_object(
      'extraction_id', p_result.extraction_session_id,
      'youtube_url', p_result.source_snapshot_json ->> 'youtube_url',
      'youtube_video_id', p_result.source_snapshot_json ->> 'youtube_video_id',
      'thumbnail_url', p_result.source_snapshot_json -> 'thumbnail_url'
    )
  );
$function$;

create or replace function private.validate_youtube_saved_recipe_editable_content(
  p_content jsonb,
  p_source_snapshot jsonb
)
returns jsonb
language plpgsql
stable
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_content jsonb;
begin
  if jsonb_typeof(p_content) <> 'object'
    or exists (
      select 1 from jsonb_object_keys(p_content) as key
      where key not in ('title','base_servings','tags','ingredients','steps')
    )
    or (select count(*) from jsonb_object_keys(p_content)) <> 5
    or nullif(btrim(p_content ->> 'title'), '') is null
    or length(btrim(p_content ->> 'title')) > 200
    or coalesce((p_content ->> 'base_servings')::integer, 0) <= 0
    or jsonb_typeof(p_content -> 'tags') <> 'array'
    or jsonb_typeof(p_content -> 'ingredients') <> 'array'
    or jsonb_typeof(p_content -> 'steps') <> 'array'
    or jsonb_array_length(p_content -> 'tags') > 20
    or jsonb_array_length(p_content -> 'ingredients') > 200
    or jsonb_array_length(p_content -> 'steps') > 200 then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_content -> 'tags') as tag
    where jsonb_typeof(tag) <> 'string'
      or nullif(btrim(tag #>> '{}'), '') is null
      or length(btrim(tag #>> '{}')) > 50
  ) or exists (
    select 1 from jsonb_array_elements(p_content -> 'ingredients') as item
    where jsonb_typeof(item) <> 'object'
      or (select count(*) from jsonb_object_keys(item)) <> 8
      or exists (
        select 1 from jsonb_object_keys(item) as key
        where key not in ('row_id','source_draft_ingredient_id','standard_name','quantity_mode','amount','unit','display_text','component_label')
      )
      or nullif(item ->> 'row_id', '')::uuid is null
      or nullif(btrim(item ->> 'standard_name'), '') is null
      or length(btrim(item ->> 'standard_name')) > 100
      or coalesce(item ->> 'quantity_mode','') not in ('unknown','to_taste','quantity')
      or (item -> 'amount' <> 'null'::jsonb and coalesce((item ->> 'amount')::numeric, 0) <= 0)
      or (item -> 'unit' <> 'null'::jsonb and length(item ->> 'unit') > 20)
      or (item -> 'display_text' <> 'null'::jsonb and length(item ->> 'display_text') > 200)
      or (item -> 'component_label' <> 'null'::jsonb and length(item ->> 'component_label') > 100)
      or (item ->> 'quantity_mode' = 'to_taste' and (item -> 'amount' <> 'null'::jsonb or item -> 'unit' <> 'null'::jsonb))
      or (item ->> 'quantity_mode' = 'quantity' and (item -> 'amount' = 'null'::jsonb or item -> 'unit' = 'null'::jsonb or nullif(btrim(item ->> 'unit'),'') is null))
  ) or exists (
    select 1 from jsonb_array_elements(p_content -> 'steps') as item
    where jsonb_typeof(item) <> 'object'
      or (select count(*) from jsonb_object_keys(item)) <> 5
      or exists (
        select 1 from jsonb_object_keys(item) as key
        where key not in ('row_id','source_step_index','instruction','component_label','duration_text')
      )
      or nullif(item ->> 'row_id', '')::uuid is null
      or nullif(btrim(item ->> 'instruction'), '') is null
      or length(btrim(item ->> 'instruction')) > 10000
      or (item -> 'source_step_index' <> 'null'::jsonb and (item ->> 'source_step_index')::integer < 0)
      or (item -> 'component_label' <> 'null'::jsonb and length(item ->> 'component_label') > 100)
      or (item -> 'duration_text' <> 'null'::jsonb and length(item ->> 'duration_text') > 100)
  ) then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  if exists (
    select item ->> 'row_id' from jsonb_array_elements(p_content -> 'ingredients') item
    group by item ->> 'row_id' having count(*) > 1
  ) or exists (
    select item ->> 'source_draft_ingredient_id'
    from jsonb_array_elements(p_content -> 'ingredients') item
    where item -> 'source_draft_ingredient_id' <> 'null'::jsonb
    group by item ->> 'source_draft_ingredient_id' having count(*) > 1
  ) or exists (
    select item ->> 'row_id' from jsonb_array_elements(p_content -> 'steps') item
    group by item ->> 'row_id' having count(*) > 1
  ) or exists (
    select item ->> 'source_step_index'
    from jsonb_array_elements(p_content -> 'steps') item
    where item -> 'source_step_index' <> 'null'::jsonb
    group by item ->> 'source_step_index' having count(*) > 1
  ) then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  -- Source links are provenance pointers only. Added rows use null; linked rows
  -- must point into the immutable server-read extraction snapshot.
  if exists (
    select 1
    from jsonb_array_elements(p_content -> 'ingredients') item
    where item -> 'source_draft_ingredient_id' <> 'null'::jsonb
      and not exists (
        select 1 from jsonb_array_elements(coalesce(p_source_snapshot -> 'draft_json' -> 'ingredients', '[]'::jsonb)) source_item
        where source_item ->> 'draft_ingredient_id' = item ->> 'source_draft_ingredient_id'
      )
  ) or exists (
    select 1
    from jsonb_array_elements(p_content -> 'steps') item
    where item -> 'source_step_index' <> 'null'::jsonb
      and (
        (item ->> 'source_step_index')::integer >= jsonb_array_length(coalesce(p_source_snapshot -> 'draft_json' -> 'steps', '[]'::jsonb))
      )
  ) then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'title', btrim(p_content ->> 'title'),
    'base_servings', (p_content ->> 'base_servings')::integer,
    'tags', coalesce((select jsonb_agg(btrim(tag #>> '{}') order by ordinality)
      from jsonb_array_elements(p_content -> 'tags') with ordinality as rows(tag, ordinality)), '[]'::jsonb),
    'ingredients', coalesce((select jsonb_agg(jsonb_build_object(
      'row_id', item ->> 'row_id',
      'source_draft_ingredient_id', item -> 'source_draft_ingredient_id',
      'standard_name', btrim(item ->> 'standard_name'),
      'quantity_mode', item ->> 'quantity_mode',
      'amount', item -> 'amount',
      'unit', case when item -> 'unit' = 'null'::jsonb then 'null'::jsonb else to_jsonb(nullif(btrim(item ->> 'unit'),'')) end,
      'display_text', case when item -> 'display_text' = 'null'::jsonb then 'null'::jsonb else to_jsonb(nullif(btrim(item ->> 'display_text'),'')) end,
      'component_label', case when item -> 'component_label' = 'null'::jsonb then 'null'::jsonb else to_jsonb(nullif(btrim(item ->> 'component_label'),'')) end
    ) order by ordinality) from jsonb_array_elements(p_content -> 'ingredients') with ordinality rows(item, ordinality)), '[]'::jsonb),
    'steps', coalesce((select jsonb_agg(jsonb_build_object(
      'row_id', item ->> 'row_id',
      'source_step_index', item -> 'source_step_index',
      'instruction', btrim(item ->> 'instruction'),
      'component_label', case when item -> 'component_label' = 'null'::jsonb then 'null'::jsonb else to_jsonb(nullif(btrim(item ->> 'component_label'),'')) end,
      'duration_text', case when item -> 'duration_text' = 'null'::jsonb then 'null'::jsonb else to_jsonb(nullif(btrim(item ->> 'duration_text'),'')) end
    ) order by ordinality) from jsonb_array_elements(p_content -> 'steps') with ordinality rows(item, ordinality)), '[]'::jsonb)
  ) into v_content;
  return v_content;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'VALIDATION_ERROR' using errcode = '22023';
end;
$function$;

create or replace function private.build_youtube_saved_recipe_content_from_source(
  p_draft jsonb
)
returns jsonb
language plpgsql
volatile
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_content jsonb;
begin
  if jsonb_typeof(p_draft) <> 'object'
    or nullif(btrim(p_draft ->> 'title'),'') is null
    or jsonb_typeof(p_draft -> 'ingredients') <> 'array'
    or jsonb_typeof(p_draft -> 'steps') <> 'array' then
    raise exception 'VALIDATION_ERROR' using errcode='22023';
  end if;

  select jsonb_build_object(
    'title', btrim(p_draft ->> 'title'),
    'base_servings', case
      when (p_draft ->> 'base_servings') ~ '^[1-9][0-9]*$' then (p_draft ->> 'base_servings')::integer
      else 1
    end,
    'tags', case when jsonb_typeof(p_draft -> 'tags')='array' then p_draft -> 'tags' else '[]'::jsonb end,
    'ingredients', coalesce((select jsonb_agg(jsonb_build_object(
      -- A valid source UUID is stable provenance and can safely double as the
      -- editable row id. Invalid/missing legacy ids receive a UUID only here,
      -- during the single durable creation.
      'row_id', case when coalesce(item ->> 'draft_ingredient_id','')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then item ->> 'draft_ingredient_id' else extensions.gen_random_uuid()::text end,
      'source_draft_ingredient_id', case when coalesce(item ->> 'draft_ingredient_id','')
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then to_jsonb(item ->> 'draft_ingredient_id') else 'null'::jsonb end,
      'standard_name', btrim(coalesce(nullif(item ->> 'standard_name',''),nullif(item ->> 'raw_text',''),'재료')),
      'quantity_mode', case
        when coalesce((item ->> 'quantity_review_required')::boolean,false)
          and not coalesce((item ->> 'quantity_user_confirmed')::boolean,false) then 'unknown'
        when item ->> 'quantity_confirmation_status' = 'cleared_to_taste' then 'to_taste'
        when item ->> 'ingredient_type' = 'TO_TASTE'
          and not coalesce((item ->> 'quantity_review_required')::boolean,false)
          and item ->> 'quantity_source' in ('text_explicit','visual_explicit','user_entered')
          then 'to_taste'
        when item -> 'amount' <> 'null'::jsonb and nullif(btrim(item ->> 'unit'),'') is not null then 'quantity'
        else 'unknown' end,
      -- Keep the extracted values even when review is still required. The
      -- quantity_mode carries trust/review state without destroying source
      -- text or turning an inferred quantity into an asserted one.
      'amount', coalesce(item -> 'amount','null'::jsonb),
      'unit', coalesce(item -> 'unit','null'::jsonb),
      'display_text', coalesce(item -> 'display_text',item -> 'quantity_raw_text','null'::jsonb),
      'component_label', coalesce(item -> 'component_label','null'::jsonb)
    ) order by ordinality)
      from jsonb_array_elements(p_draft -> 'ingredients') with ordinality rows(item,ordinality)), '[]'::jsonb),
    'steps', coalesce((select jsonb_agg(jsonb_build_object(
      'row_id', extensions.gen_random_uuid()::text,
      'source_step_index', ordinality - 1,
      'instruction', btrim(item ->> 'instruction'),
      'component_label', coalesce(item -> 'component_label','null'::jsonb),
      'duration_text', coalesce(item -> 'duration_text','null'::jsonb)
    ) order by ordinality)
      from jsonb_array_elements(p_draft -> 'steps') with ordinality rows(item,ordinality)), '[]'::jsonb)
  ) into v_content;
  return v_content;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'VALIDATION_ERROR' using errcode='22023';
end;
$function$;

create or replace function public.ensure_youtube_saved_recipe_result(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_extraction_id uuid,
  p_idempotency_key uuid,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_authority jsonb;
  v_generation bigint;
  v_session public.youtube_extraction_sessions%rowtype;
  v_result public.youtube_saved_recipe_results%rowtype;
  v_source jsonb;
  v_content jsonb;
begin
  if p_extraction_id is null or p_idempotency_key is null then
    raise exception 'VALIDATION_ERROR' using errcode='22023';
  end if;
  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,
    p_hmac_key_version,p_session_issued_at
  );
  v_generation := (v_authority ->> 'account_generation')::bigint;

  -- Returning the durable row first makes ensure safe after transient source
  -- expiry and always exposes the latest PATCHed revision/content.
  select * into v_result from public.youtube_saved_recipe_results
  where owner_user_id=p_owner_uuid and account_generation=v_generation
    and extraction_session_id=p_extraction_id;
  if v_result.id is not null then
    return jsonb_build_object('success',true,'data',private.project_youtube_saved_recipe_result(v_result),'error',null);
  end if;

  -- The owned source row is the concurrency lock for first creation.
  select * into v_session from public.youtube_extraction_sessions
  where id=p_extraction_id and user_id=p_owner_uuid for update;
  if v_session.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;

  select * into v_result from public.youtube_saved_recipe_results
  where owner_user_id=p_owner_uuid and account_generation=v_generation
    and extraction_session_id=p_extraction_id;
  if v_result.id is not null then
    return jsonb_build_object('success',true,'data',private.project_youtube_saved_recipe_result(v_result),'error',null);
  end if;
  if v_session.expires_at <= p_now or v_session.status='expired' then
    raise exception 'EXTRACTION_EXPIRED' using errcode='22023';
  end if;
  if v_session.status <> 'draft' or v_session.session_kind='multi_parent' then
    raise exception 'CONFLICT' using errcode='40001';
  end if;

  v_source := jsonb_build_object(
    'extraction_id',v_session.id,'youtube_url',v_session.youtube_url,
    'youtube_video_id',v_session.youtube_video_id,'thumbnail_url',v_session.thumbnail_url,
    'draft_json',v_session.draft_json,'extraction_meta_json',v_session.extraction_meta_json,
    'extraction_methods',v_session.extraction_methods,'provider_version',v_session.provider_version
  );
  v_content := private.validate_youtube_saved_recipe_editable_content(
    private.build_youtube_saved_recipe_content_from_source(v_session.draft_json),v_source
  );
  insert into public.youtube_saved_recipe_results(
    owner_user_id,account_generation,extraction_session_id,source_snapshot_json,
    editable_content_json,editable_content_hash,created_at,updated_at
  ) values (
    p_owner_uuid,v_generation,p_extraction_id,v_source,v_content,
    encode(extensions.digest(convert_to(v_content::text,'UTF8'),'sha256'),'hex'),p_now,p_now
  ) returning * into v_result;
  return jsonb_build_object('success',true,'data',private.project_youtube_saved_recipe_result(v_result),'error',null);
end;
$function$;

create or replace function public.write_youtube_saved_recipe_result(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_action text,
  p_result_id uuid,
  p_extraction_id uuid,
  p_expected_revision bigint,
  p_editable_content jsonb,
  p_idempotency_key uuid,
  p_now timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  v_authority jsonb;
  v_generation bigint;
  v_session public.youtube_extraction_sessions%rowtype;
  v_result public.youtube_saved_recipe_results%rowtype;
  v_content jsonb;
  v_source jsonb;
  v_content_hash text;
  v_payload_hash text;
  v_receipt private.youtube_saved_recipe_result_mutations%rowtype;
  v_projection jsonb;
begin
  if p_action not in ('create','update') or p_idempotency_key is null or p_editable_content is null
    or (p_action = 'create' and (p_extraction_id is null or p_result_id is not null or p_expected_revision is not null))
    or (p_action = 'update' and (p_result_id is null or p_extraction_id is not null or coalesce(p_expected_revision,0) <= 0)) then
    raise exception 'VALIDATION_ERROR' using errcode = '22023';
  end if;
  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid, p_auth_identity_created_at_snapshot, p_session_key_hash,
    p_hmac_key_version, p_session_issued_at
  );
  v_generation := (v_authority ->> 'account_generation')::bigint;

  if p_action = 'create' then
    -- A completed save is durable even after its editable copy changes or the
    -- transient extraction expires. Read without locking first so an exact
    -- idempotency receipt can replay the original response.
    select * into v_result from public.youtube_saved_recipe_results
    where owner_user_id=p_owner_uuid and account_generation=v_generation
      and extraction_session_id=p_extraction_id;
    if v_result.id is not null then
      v_content := private.validate_youtube_saved_recipe_editable_content(p_editable_content, v_result.source_snapshot_json);
      v_content_hash := encode(extensions.digest(convert_to(v_content::text,'UTF8'),'sha256'),'hex');
    else
      -- This row lock serializes different idempotency keys racing to save the
      -- same extraction. Re-read the durable result after acquiring it.
      select * into v_session from public.youtube_extraction_sessions
      where id=p_extraction_id and user_id=p_owner_uuid for update;
      if v_session.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
      if v_session.expires_at <= p_now or v_session.status='expired' then
        raise exception 'EXTRACTION_EXPIRED' using errcode='22023';
      end if;
      if v_session.status <> 'draft' or v_session.session_kind='multi_parent' then
        raise exception 'CONFLICT' using errcode='40001';
      end if;
      v_source := jsonb_build_object(
        'extraction_id',v_session.id,'youtube_url',v_session.youtube_url,
        'youtube_video_id',v_session.youtube_video_id,'thumbnail_url',v_session.thumbnail_url,
        'draft_json',v_session.draft_json,'extraction_meta_json',v_session.extraction_meta_json,
        'extraction_methods',v_session.extraction_methods,'provider_version',v_session.provider_version
      );
      v_content := private.validate_youtube_saved_recipe_editable_content(p_editable_content,v_source);
      v_content_hash := encode(extensions.digest(convert_to(v_content::text,'UTF8'),'sha256'),'hex');
      select * into v_result from public.youtube_saved_recipe_results
      where owner_user_id=p_owner_uuid and account_generation=v_generation
        and extraction_session_id=p_extraction_id for update;
    end if;
    v_payload_hash := encode(extensions.digest(convert_to(jsonb_build_object(
      'extraction_id',p_extraction_id,'content',v_content
    )::text,'UTF8'),'sha256'),'hex');
  else
    select * into v_result from public.youtube_saved_recipe_results
    where id=p_result_id and owner_user_id=p_owner_uuid and account_generation=v_generation for update;
    if v_result.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
    v_content := private.validate_youtube_saved_recipe_editable_content(p_editable_content,v_result.source_snapshot_json);
    v_payload_hash := encode(extensions.digest(convert_to(jsonb_build_object(
      'result_id',p_result_id,'expected_revision',p_expected_revision,'content',v_content
    )::text,'UTF8'),'sha256'),'hex');
  end if;

  -- Replay before comparing against the current editable copy. A later PATCH
  -- must not invalidate the durable response of the original create request.
  select * into v_receipt from private.youtube_saved_recipe_result_mutations
  where owner_user_id=p_owner_uuid and account_generation=v_generation
    and operation=p_action and idempotency_key=p_idempotency_key for update;
  if v_receipt.id is not null then
    if v_receipt.payload_hash is distinct from v_payload_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='23505';
    end if;
    if v_receipt.durable_result is not null then return v_receipt.durable_result; end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='23505';
  end if;

  if p_action='create' and v_result.id is not null
    and v_content_hash is distinct from v_result.editable_content_hash then
    raise exception 'CONFLICT' using errcode='40001';
  end if;

  insert into private.youtube_saved_recipe_result_mutations(
    owner_user_id,account_generation,operation,idempotency_key,payload_hash
  ) values (p_owner_uuid,v_generation,p_action,p_idempotency_key,v_payload_hash)
  on conflict do nothing returning * into v_receipt;
  if v_receipt.id is null then
    select * into v_receipt from private.youtube_saved_recipe_result_mutations
    where owner_user_id=p_owner_uuid and account_generation=v_generation
      and operation=p_action and idempotency_key=p_idempotency_key for update;
    if v_receipt.payload_hash is distinct from v_payload_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='23505';
    end if;
    if v_receipt.durable_result is not null then return v_receipt.durable_result; end if;
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='23505';
  end if;

  if p_action='create' and v_result.id is null then
    insert into public.youtube_saved_recipe_results(
      owner_user_id,account_generation,extraction_session_id,source_snapshot_json,
      editable_content_json,editable_content_hash,created_at,updated_at
    ) values (p_owner_uuid,v_generation,p_extraction_id,v_source,v_content,v_content_hash,p_now,p_now)
    returning * into v_result;
  elsif p_action='update' then
    if v_result.revision is distinct from p_expected_revision then
      raise exception 'CONFLICT' using errcode='40001';
    end if;
    update public.youtube_saved_recipe_results set
      editable_content_json=v_content,
      editable_content_hash=encode(extensions.digest(convert_to(v_content::text,'UTF8'),'sha256'),'hex'),
      revision=revision+1,updated_at=p_now
    where id=v_result.id returning * into v_result;
  end if;
  v_projection := jsonb_build_object('success',true,'data',private.project_youtube_saved_recipe_result(v_result),'error',null);
  update private.youtube_saved_recipe_result_mutations set durable_result=v_projection where id=v_receipt.id;
  return v_projection;
end;
$function$;

create or replace function public.read_youtube_saved_recipe_results(
  p_owner_uuid uuid,
  p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text,
  p_hmac_key_version integer,
  p_session_issued_at timestamptz,
  p_result_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_authority jsonb;
  v_generation bigint;
  v_result public.youtube_saved_recipe_results%rowtype;
begin
  v_authority := public.assert_recipe_future_session_authority(
    p_owner_uuid,p_auth_identity_created_at_snapshot,p_session_key_hash,
    p_hmac_key_version,p_session_issued_at
  );
  v_generation := (v_authority ->> 'account_generation')::bigint;
  if p_result_id is not null then
    select * into v_result from public.youtube_saved_recipe_results
    where id=p_result_id and owner_user_id=p_owner_uuid and account_generation=v_generation;
    if v_result.id is null then raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002'; end if;
    return jsonb_build_object('success',true,'data',private.project_youtube_saved_recipe_result(v_result),'error',null);
  end if;
  return jsonb_build_object('success',true,'data',jsonb_build_object('drafts',coalesce((
    select jsonb_agg(jsonb_build_object(
      'draft_id',result.id,'revision',result.revision,
      'title',result.editable_content_json ->> 'title',
      'thumbnail_url',result.source_snapshot_json -> 'thumbnail_url',
      'created_at',result.created_at,'updated_at',result.updated_at
    ) order by result.updated_at desc,result.id)
    from public.youtube_saved_recipe_results result
    where result.owner_user_id=p_owner_uuid and result.account_generation=v_generation
  ),'[]'::jsonb)),'error',null);
end;
$function$;

alter function private.guard_youtube_saved_recipe_source_snapshot() owner to postgres;
alter function private.project_youtube_saved_recipe_result(public.youtube_saved_recipe_results) owner to postgres;
alter function private.validate_youtube_saved_recipe_editable_content(jsonb,jsonb) owner to postgres;
alter function private.build_youtube_saved_recipe_content_from_source(jsonb) owner to postgres;
alter function public.ensure_youtube_saved_recipe_result(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,timestamptz) owner to postgres;
alter function public.write_youtube_saved_recipe_result(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,uuid,timestamptz) owner to postgres;
alter function public.read_youtube_saved_recipe_results(uuid,timestamptz,text,integer,timestamptz,uuid) owner to postgres;

revoke all on function private.guard_youtube_saved_recipe_source_snapshot() from public,anon,authenticated,service_role;
revoke all on function private.project_youtube_saved_recipe_result(public.youtube_saved_recipe_results) from public,anon,authenticated,service_role;
revoke all on function private.validate_youtube_saved_recipe_editable_content(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function private.build_youtube_saved_recipe_content_from_source(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.ensure_youtube_saved_recipe_result(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.write_youtube_saved_recipe_result(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,uuid,timestamptz) from public,anon,authenticated;
revoke all on function public.read_youtube_saved_recipe_results(uuid,timestamptz,text,integer,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.write_youtube_saved_recipe_result(uuid,timestamptz,text,integer,timestamptz,text,uuid,uuid,bigint,jsonb,uuid,timestamptz) to service_role;
grant execute on function public.read_youtube_saved_recipe_results(uuid,timestamptz,text,integer,timestamptz,uuid) to service_role;
grant execute on function public.ensure_youtube_saved_recipe_result(uuid,timestamptz,text,integer,timestamptz,uuid,uuid,timestamptz) to service_role;

do $scope_wrapper$
begin
  if to_regprocedure('private.verify_internal_scope_before_saved_results_20261008()') is null then
    alter function private.verify_full_local_internal_scope()
      rename to verify_internal_scope_before_saved_results_20261008;
  end if;
end;
$scope_wrapper$;

create or replace function private.verify_full_local_internal_scope()
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
  v_headers jsonb := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  v_scope text := v_headers ->> 'x-homecook-internal-scope';
  v_method text := upper(coalesce(current_setting('request.method',true),''));
  v_path text := coalesce(current_setting('request.path',true),'');
begin
  if v_scope='recipe-future-propagation' and v_method='POST' and v_path in (
    '/rpc/write_youtube_saved_recipe_result','/rpc/read_youtube_saved_recipe_results',
    '/rpc/ensure_youtube_saved_recipe_result'
  ) then return; end if;
  perform private.verify_internal_scope_before_saved_results_20261008();
end;
$function$;

alter function private.verify_full_local_internal_scope() owner to postgres;
revoke all on function private.verify_full_local_internal_scope() from public,anon,authenticated,service_role;

commit;
