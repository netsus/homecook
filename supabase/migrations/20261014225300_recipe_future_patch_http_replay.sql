begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Exact owned-229 predecessor identities; do not adopt unknown scope/writer bodies.
do $preimage$
declare observed jsonb;
begin
  select jsonb_build_object('definition_sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'source_md5',md5(p.prosrc),
    'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'configuration',p.proconfig,'security_definer',p.prosecdef,
    'volatility',p.provolatile,'arguments',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid)) into observed
    from pg_proc p where p.oid='private.verify_full_local_internal_scope()'::regprocedure;
  if observed is distinct from '{"acl":["postgres=X/postgres"],"owner":"postgres","result":"void","arguments":"","source_md5":"37d2082768e9ba6f8634211706b7fd24","volatility":"v","configuration":["search_path=pg_catalog, public, private, pg_temp"],"security_definer":true,"definition_sha256":"45f513ec806fa57dfde08db696ad4794f84a42bd69ca798f833434ec060ef77c"}'::jsonb then
    raise exception 'RECIPE_FUTURE_HTTP_PREIMAGE_MISMATCH';
  end if;
  select jsonb_build_object('definition_sha256',encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'source_md5',md5(p.prosrc),
    'owner',pg_get_userbyid(p.proowner),'acl',p.proacl,'configuration',p.proconfig,'security_definer',p.prosecdef,
    'volatility',p.provolatile,'arguments',pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid)) into observed
    from pg_proc p where p.oid='write_recipe_future_plan_change(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,bigint,jsonb,jsonb,jsonb,text,text,uuid,uuid,timestamp with time zone)'::regprocedure;
  if observed is distinct from '{"acl":["postgres=X/postgres","service_role=X/postgres"],"owner":"postgres","result":"jsonb","arguments":"p_owner_uuid uuid, p_auth_identity_created_at_snapshot timestamp with time zone, p_session_key_hash text, p_hmac_key_version integer, p_session_issued_at timestamp with time zone, p_recipe_id uuid, p_base_recipe_revision bigint, p_draft jsonb, p_nutrition_snapshot jsonb, p_nutrition_predecessor_guard jsonb, p_future_plan_strategy text, p_impact_token text, p_image_object_id uuid, p_idempotency_key uuid, p_now timestamp with time zone","source_md5":"1ed9cd56a0099c74bfb8ff488c66aabb","volatility":"v","configuration":["search_path=pg_catalog, public, extensions, pg_temp"],"security_definer":true,"definition_sha256":"141ddfcf66a750dbe98682cc3c2647c6f72fc62a66a9aaef1645dc9bbf73ed9d"}'::jsonb then
    raise exception 'RECIPE_FUTURE_HTTP_PREIMAGE_MISMATCH';
  end if;
end;
$preimage$;

alter table public.mutation_idempotency_keys
  add column recipe_future_http_request_fingerprint text;
alter table public.mutation_idempotency_keys
  add constraint mutation_recipe_future_http_request_fingerprint_check check (
    recipe_future_http_request_fingerprint is null or (
      operation_scope = 'recipe_future_patch'
      and recipe_future_http_request_fingerprint ~ '^recipe-future-patch-http-v1:[0-9a-f]{64}$'
    )
  );

create function private.recipe_future_http_request_fingerprint(
  p_recipe_id uuid, p_request_body jsonb, p_quantity_contract text
) returns text language plpgsql immutable security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  request_body jsonb;
  draft jsonb;
  part record;
begin
  if p_recipe_id is null or jsonb_typeof(p_request_body) is distinct from 'object'
    or (p_quantity_contract is not null and p_quantity_contract <> 'quantity-v4') then
    raise exception 'VALIDATION_ERROR' using errcode='22023';
  end if;
  draft := p_request_body->'draft';
  if jsonb_typeof(draft) is distinct from 'object' then
    raise exception 'VALIDATION_ERROR' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(p_request_body) k where k not in
      ('base_recipe_revision','draft','future_plan_strategy','impact_token','image_object_id'))
    or exists(select 1 from jsonb_object_keys(draft) k where k not in
      ('title','description','base_servings','ingredients','steps'))
    or jsonb_typeof(p_request_body->'base_recipe_revision') is distinct from 'number'
    or jsonb_typeof(p_request_body->'future_plan_strategy') is distinct from 'string'
    or p_request_body->>'future_plan_strategy' not in ('keep','replace_all')
    or jsonb_typeof(p_request_body->'impact_token') is distinct from 'string'
    or nullif(btrim(p_request_body->>'impact_token'),'') is null
    or jsonb_typeof(draft->'title') is distinct from 'string'
    or nullif(btrim(draft->>'title'),'') is null or length(btrim(draft->>'title')) > 200
    or jsonb_typeof(draft->'base_servings') is distinct from 'number'
    or jsonb_typeof(draft->'ingredients') is distinct from 'array'
    or jsonb_typeof(draft->'steps') is distinct from 'array'
    or (draft ? 'description' and jsonb_typeof(draft->'description') not in ('null','string'))
    or (p_request_body ? 'image_object_id' and jsonb_typeof(p_request_body->'image_object_id') not in ('null','string')) then
    raise exception 'VALIDATION_ERROR' using errcode='22023';
  end if;
  if (p_request_body->>'base_recipe_revision')::numeric <= 0
    or (p_request_body->>'base_recipe_revision')::numeric > 9007199254740991
    or trunc((p_request_body->>'base_recipe_revision')::numeric) <> (p_request_body->>'base_recipe_revision')::numeric
    or (draft->>'base_servings')::numeric <= 0 or (draft->>'base_servings')::numeric > 9007199254740991
    or trunc((draft->>'base_servings')::numeric) <> (draft->>'base_servings')::numeric
    or jsonb_array_length(draft->'ingredients') = 0 or jsonb_array_length(draft->'steps') = 0
    or exists(select 1 from jsonb_array_elements(draft->'ingredients') x where jsonb_typeof(x) <> 'object')
    or exists(select 1 from jsonb_array_elements(draft->'steps') x where jsonb_typeof(x) <> 'object')
    or (p_request_body->>'image_object_id' is not null and p_request_body->>'image_object_id'
      !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') then
    raise exception 'VALIDATION_ERROR' using errcode='22023';
  end if;
  request_body := jsonb_set(p_request_body,'{draft,description}',coalesce(draft->'description','null'::jsonb),true);
  request_body := jsonb_set(request_body,'{image_object_id}',coalesce(p_request_body->'image_object_id','null'::jsonb),true);
  -- JSONB numeric equality ignores scale; normalize numbers without projecting
  -- away any ingredient/step property or changing array order/raw strings.
  for part in
    with recursive walk(path,value) as (
      select array[]::text[], request_body
      union all
      select w.path || child.key, child.value from walk w cross join lateral (
        select key,value from jsonb_each(case when jsonb_typeof(w.value)='object' then w.value else '{}'::jsonb end)
        union all
        select (ordinality-1)::text,value from jsonb_array_elements(case when jsonb_typeof(w.value)='array' then w.value else '[]'::jsonb end) with ordinality
      ) child
    ) select path,value from walk where jsonb_typeof(value)='number'
  loop
    request_body := jsonb_set(request_body,part.path,to_jsonb(trim_scale((part.value#>>'{}')::numeric)),false);
  end loop;
  return 'recipe-future-patch-http-v1:' || encode(extensions.digest(convert_to(jsonb_build_object(
    'schema','recipe-future-patch-http-v1','method','PATCH','recipe_id',p_recipe_id,
    'quantity_contract',p_quantity_contract,'request',request_body)::text,'UTF8'),'sha256'),'hex');
end;
$function$;

create function public.read_recipe_future_patch_result(
  p_owner_uuid uuid, p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text, p_hmac_key_version integer, p_session_issued_at timestamptz,
  p_recipe_id uuid, p_request_body jsonb, p_quantity_contract text, p_idempotency_key uuid
) returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  authority jsonb;
  recipe public.recipes%rowtype;
  receipt public.mutation_idempotency_keys%rowtype;
  fingerprint text;
  result jsonb;
  revision numeric;
begin
  authority := public.assert_recipe_future_session_authority(p_owner_uuid,
    p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  if coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-homecook-internal-scope'
      is distinct from 'recipe-future-propagation'
    or current_setting('request.method',true) is distinct from 'POST'
    or current_setting('request.path',true) is null or current_setting('request.path',true) not in
      ('/rpc/read_recipe_future_patch_result','/rpc/write_recipe_future_plan_change_recoverable') then
    raise exception 'FORBIDDEN' using errcode='42501';
  end if;
  perform private.verify_full_local_internal_scope();
  if p_recipe_id is null or p_idempotency_key is null then raise exception 'VALIDATION_ERROR' using errcode='22023';end if;
  perform public.lock_personal_recipe_ids(array[p_recipe_id]);
  select r.* into recipe from public.recipes r where r.id=p_recipe_id for update;
  if recipe.id is null or recipe.created_by is distinct from p_owner_uuid
    or recipe.visibility is distinct from 'private' or recipe.deleted_at is not null then
    raise exception 'RESOURCE_NOT_FOUND' using errcode='P0002';
  end if;
  fingerprint := private.recipe_future_http_request_fingerprint(p_recipe_id,p_request_body,p_quantity_contract);
  select r.* into receipt from public.mutation_idempotency_keys r
    where r.owner_uuid=p_owner_uuid and r.account_generation=(authority->>'account_generation')::bigint
      and r.operation_scope='recipe_future_patch'
      and r.key_hash=encode(extensions.digest(convert_to(p_idempotency_key::text,'UTF8'),'sha256'),'hex') for update;
  if not found then return jsonb_build_object('state','absent','result',null);end if;
  if receipt.recipe_future_http_request_fingerprint is distinct from fingerprint
    or receipt.state is distinct from 'succeeded' or receipt.terminal_result is distinct from 'succeeded'
    or receipt.attempt_token is not null or receipt.lease_expires_at is not null
    or receipt.result_reference is distinct from p_recipe_id
    or jsonb_typeof(receipt.durable_result) is distinct from 'object' then
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='23505';
  end if;
  result := receipt.durable_result;
  if (select count(*) from jsonb_object_keys(result)) <> 3 or result->'success' is distinct from 'true'::jsonb
    or result->'error' is distinct from 'null'::jsonb or jsonb_typeof(result->'data') is distinct from 'object' then
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='23505';
  end if;
  if (select count(*) from jsonb_object_keys(result->'data')) <> 2
    or result#>'{data,id}' is distinct from to_jsonb(p_recipe_id::text)
    or jsonb_typeof(result#>'{data,revision}') is distinct from 'number' then
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='23505';
  end if;
  revision := (result#>>'{data,revision}')::numeric;
  if revision <= 0 or revision > 9007199254740991 or trunc(revision) <> revision then
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='23505';
  end if;
  return jsonb_build_object('state','succeeded','result',result);
end;
$function$;

create function public.write_recipe_future_plan_change_recoverable(
  p_owner_uuid uuid, p_auth_identity_created_at_snapshot timestamptz,
  p_session_key_hash text, p_hmac_key_version integer, p_session_issued_at timestamptz,
  p_recipe_id uuid, p_request_body jsonb, p_quantity_contract text, p_idempotency_key uuid,
  p_nutrition_snapshot jsonb, p_nutrition_predecessor_guard jsonb,
  p_now timestamptz default clock_timestamp()
) returns jsonb language plpgsql volatile security definer
set search_path = pg_catalog, public, private, extensions, pg_temp
as $function$
declare
  authority jsonb;
  previous jsonb;
  result jsonb;
  fingerprint text;
  bound_fingerprint text;
  changed integer;
begin
  authority := public.assert_recipe_future_session_authority(p_owner_uuid,
    p_auth_identity_created_at_snapshot,p_session_key_hash,p_hmac_key_version,p_session_issued_at);
  previous := public.read_recipe_future_patch_result(p_owner_uuid,p_auth_identity_created_at_snapshot,
    p_session_key_hash,p_hmac_key_version,p_session_issued_at,p_recipe_id,p_request_body,p_quantity_contract,p_idempotency_key);
  if previous->>'state'='succeeded' then return previous->'result';end if;
  if previous->>'state' is distinct from 'absent' then raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='23505';end if;
  fingerprint := private.recipe_future_http_request_fingerprint(p_recipe_id,p_request_body,p_quantity_contract);
  result := public.write_recipe_future_plan_change(p_owner_uuid,p_auth_identity_created_at_snapshot,
    p_session_key_hash,p_hmac_key_version,p_session_issued_at,p_recipe_id,
    (p_request_body->>'base_recipe_revision')::bigint,p_request_body->'draft',p_nutrition_snapshot,
    p_nutrition_predecessor_guard,p_request_body->>'future_plan_strategy',p_request_body->>'impact_token',
    (p_request_body->>'image_object_id')::uuid,p_idempotency_key,p_now);
  update public.mutation_idempotency_keys r set recipe_future_http_request_fingerprint=fingerprint
    where r.owner_uuid=p_owner_uuid and r.account_generation=(authority->>'account_generation')::bigint
      and r.operation_scope='recipe_future_patch'
      and r.key_hash=encode(extensions.digest(convert_to(p_idempotency_key::text,'UTF8'),'sha256'),'hex')
      and r.state='succeeded' and r.terminal_result='succeeded' and r.result_reference=p_recipe_id
      and r.attempt_token is null and r.lease_expires_at is null
      and r.durable_result=result and r.recipe_future_http_request_fingerprint is null
    returning r.recipe_future_http_request_fingerprint into bound_fingerprint;
  get diagnostics changed = row_count;
  if changed <> 1 or bound_fingerprint is distinct from fingerprint then
    raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode='23505';
  end if;
  return result;
end;
$function$;

alter function private.verify_full_local_internal_scope()
  rename to verify_scope_pre_recipe_future_http_replay_20261014;
create function private.verify_full_local_internal_scope() returns void language plpgsql volatile security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if current_setting('request.jwt.claim.role',true)='service_role'
    and coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-homecook-internal-scope'='recipe-future-propagation'
    and current_setting('request.method',true)='POST' and current_setting('request.path',true) in
      ('/rpc/read_recipe_future_patch_result','/rpc/write_recipe_future_plan_change_recoverable') then return;end if;
  perform private.verify_scope_pre_recipe_future_http_replay_20261014();
end;
$function$;

alter function private.recipe_future_http_request_fingerprint(uuid,jsonb,text) owner to postgres;
alter function public.read_recipe_future_patch_result(uuid,timestamptz,text,integer,timestamptz,uuid,jsonb,text,uuid) owner to postgres;
alter function public.write_recipe_future_plan_change_recoverable(uuid,timestamptz,text,integer,timestamptz,uuid,jsonb,text,uuid,jsonb,jsonb,timestamptz) owner to postgres;
alter function private.verify_full_local_internal_scope() owner to postgres;
revoke all on function private.recipe_future_http_request_fingerprint(uuid,jsonb,text),private.verify_full_local_internal_scope() from public,anon,authenticated,service_role;
revoke all on function public.read_recipe_future_patch_result(uuid,timestamptz,text,integer,timestamptz,uuid,jsonb,text,uuid),
  public.write_recipe_future_plan_change_recoverable(uuid,timestamptz,text,integer,timestamptz,uuid,jsonb,text,uuid,jsonb,jsonb,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.read_recipe_future_patch_result(uuid,timestamptz,text,integer,timestamptz,uuid,jsonb,text,uuid),
  public.write_recipe_future_plan_change_recoverable(uuid,timestamptz,text,integer,timestamptz,uuid,jsonb,text,uuid,jsonb,jsonb,timestamptz) to service_role;

notify pgrst, 'reload schema';
commit;
