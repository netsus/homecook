begin;

create table public.food_product_ingredient_links (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.food_products(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete restrict,
  relation text not null
    check (relation in ('represents', 'contains', 'substitute')),
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected', 'revoked', 'superseded')),
  is_primary boolean not null default false,
  is_active boolean not null default false,
  source text not null
    check (nullif(btrim(source), '') is not null),
  provenance_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(provenance_json) = 'object'),
  decision_reason text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_active or review_status = 'approved'),
  check (not is_primary or relation = 'represents'),
  check (not is_primary or review_status = 'approved'),
  check (not is_primary or is_active),
  check (
    review_status not in ('approved', 'rejected', 'revoked', 'superseded')
    or (
      nullif(btrim(decision_reason), '') is not null
      and reviewed_at is not null
    )
  )
);

create index food_product_ingredient_links_product_idx
  on public.food_product_ingredient_links (product_id, created_at desc, id desc);

create index food_product_ingredient_links_ingredient_idx
  on public.food_product_ingredient_links (ingredient_id, created_at desc, id desc);

create unique index food_product_ingredient_links_primary_represents_idx
  on public.food_product_ingredient_links (product_id)
  where relation = 'represents'
    and review_status = 'approved'
    and is_primary
    and is_active;

alter table public.food_product_ingredient_links enable row level security;

revoke all on table public.food_product_ingredient_links
  from public, anon, authenticated, service_role;
revoke truncate on table public.food_product_ingredient_links
  from public, anon, authenticated, service_role;

create or replace function public.create_food_product_ingredient_link_candidate(
  p_product_id uuid,
  p_ingredient_id uuid,
  p_relation text,
  p_source text,
  p_provenance_json jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_candidate_id uuid;
  v_request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('role', true), ''),
    current_user
  );
begin
  if v_request_role <> 'service_role' then
    raise exception 'food product ingredient link candidate creation requires service_role'
      using errcode = '42501';
  end if;

  if p_product_id is null
    or p_ingredient_id is null
    or p_relation not in ('represents', 'contains', 'substitute')
    or nullif(btrim(p_source), '') is null
    or jsonb_typeof(p_provenance_json) is distinct from 'object'
  then
    raise exception 'invalid food product ingredient link candidate'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_provenance_json) as provenance_key
    where provenance_key not in (
      'algorithm_version',
      'candidate_rank',
      'evidence_codes'
    )
  )
  then
    raise exception 'food product ingredient link provenance contains an unsupported key or value'
      using errcode = '22023';
  end if;

  if p_provenance_json ? 'algorithm_version'
    and (
      jsonb_typeof(p_provenance_json -> 'algorithm_version') <> 'string'
      or (p_provenance_json ->> 'algorithm_version')
        !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
    )
  then
    raise exception 'food product ingredient link provenance contains an unsupported key or value'
      using errcode = '22023';
  end if;

  if p_provenance_json ? 'candidate_rank'
    and (
      jsonb_typeof(p_provenance_json -> 'candidate_rank') <> 'number'
      or (p_provenance_json ->> 'candidate_rank') !~ '^[0-9]{1,9}$'
    )
  then
    raise exception 'food product ingredient link provenance contains an unsupported key or value'
      using errcode = '22023';
  end if;

  if p_provenance_json ? 'evidence_codes'
    and jsonb_typeof(p_provenance_json -> 'evidence_codes') <> 'array'
  then
    raise exception 'food product ingredient link provenance contains an unsupported key or value'
      using errcode = '22023';
  end if;

  if p_provenance_json ? 'evidence_codes'
    and (
      jsonb_array_length(p_provenance_json -> 'evidence_codes') > 32
      or exists (
        select 1
        from jsonb_array_elements(
          p_provenance_json -> 'evidence_codes'
        ) as evidence_code
        where jsonb_typeof(evidence_code) <> 'string'
          or (evidence_code #>> '{}')
            !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
      )
    )
  then
    raise exception 'food product ingredient link provenance contains an unsupported key or value'
      using errcode = '22023';
  end if;

  insert into public.food_product_ingredient_links (
    product_id,
    ingredient_id,
    relation,
    review_status,
    is_primary,
    is_active,
    source,
    provenance_json
  ) values (
    p_product_id,
    p_ingredient_id,
    p_relation,
    'pending',
    false,
    false,
    btrim(p_source),
    p_provenance_json
  )
  returning id into v_candidate_id;

  return v_candidate_id;
end;
$function$;

create or replace function public.select_food_product_effective_ingredient(
  p_product_id uuid,
  p_requesting_user_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_ingredient_id uuid;
  v_request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('role', true), ''),
    current_user
  );
begin
  if v_request_role <> 'service_role' then
    raise exception 'food product ingredient link selection requires service_role'
      using errcode = '42501';
  end if;

  select link.ingredient_id
    into v_ingredient_id
  from public.food_product_ingredient_links as link
  join public.food_products as product on product.id = link.product_id
  where link.product_id = p_product_id
    and product.deleted_at is null
    and (
      product.visibility = 'public'
      or (
        product.visibility = 'private'
        and product.owner_user_id = p_requesting_user_id
      )
    )
    and link.relation = 'represents'
    and link.review_status = 'approved'
    and link.is_primary
    and link.is_active;

  return v_ingredient_id;
end;
$function$;

create or replace function public.promote_food_product_ingredient_link(
  p_candidate_link_id uuid,
  p_expected_current_link_id uuid,
  p_decision_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $function$
declare
  v_target public.food_product_ingredient_links%rowtype;
  v_current_link_id uuid;
  v_request_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('role', true), ''),
    current_user
  );
  v_reviewed_at timestamptz := now();
begin
  if v_request_role <> 'service_role' then
    raise exception 'food product ingredient link promotion requires service_role'
      using errcode = '42501';
  end if;

  if p_candidate_link_id is null then
    raise exception 'food product ingredient link id is required'
      using errcode = '22023';
  end if;

  if nullif(btrim(p_decision_reason), '') is null then
    raise exception 'food product ingredient link decision reason is required'
      using errcode = '22023';
  end if;

  select link.*
    into v_target
  from public.food_product_ingredient_links as link
  where link.id = p_candidate_link_id;

  if v_target.id is null then
    raise exception 'food product ingredient link candidate was not found'
      using errcode = 'P0002';
  end if;

  perform 1
  from public.food_products
  where id = v_target.product_id
  for update;

  select link.*
    into v_target
  from public.food_product_ingredient_links as link
  where link.id = p_candidate_link_id
  for update;

  if v_target.id is null then
    raise exception 'food product ingredient link candidate was not found'
      using errcode = 'P0002';
  end if;

  if v_target.review_status <> 'pending' then
    raise exception 'food product ingredient link candidate is not pending'
      using errcode = '22023';
  end if;

  if v_target.relation = 'represents' then
    select link.id
      into v_current_link_id
    from public.food_product_ingredient_links as link
    where link.product_id = v_target.product_id
      and link.id <> v_target.id
      and link.relation = 'represents'
      and link.review_status = 'approved'
      and link.is_primary
      and link.is_active
    for update;

    if v_current_link_id is distinct from p_expected_current_link_id then
      raise exception 'food product ingredient link authority changed during promotion'
        using errcode = '40001';
    end if;

    update public.food_product_ingredient_links
    set review_status = 'superseded',
        is_active = false,
        is_primary = false,
        decision_reason = 'superseded by later approved representative link',
        reviewed_at = v_reviewed_at,
        updated_at = v_reviewed_at
    where id = v_current_link_id;
  elsif p_expected_current_link_id is not null then
    raise exception 'non-representative promotion cannot replace representative authority'
      using errcode = '22023';
  end if;

  update public.food_product_ingredient_links
  set review_status = 'approved',
      is_active = true,
      is_primary = case when v_target.relation = 'represents' then true else false end,
      decision_reason = btrim(p_decision_reason),
      reviewed_at = v_reviewed_at,
      updated_at = v_reviewed_at
  where id = v_target.id;
end;
$function$;

revoke all on function public.create_food_product_ingredient_link_candidate(
  uuid, uuid, text, text, jsonb
)
  from public, anon, authenticated, service_role;
grant execute on function public.create_food_product_ingredient_link_candidate(
  uuid, uuid, text, text, jsonb
)
  to service_role;

revoke all on function public.select_food_product_effective_ingredient(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.select_food_product_effective_ingredient(uuid, uuid)
  to service_role;

revoke all on function public.promote_food_product_ingredient_link(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.promote_food_product_ingredient_link(uuid, uuid, text)
  to service_role;

commit;
