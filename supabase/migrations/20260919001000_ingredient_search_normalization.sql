-- Formatting differences must not create ingredient identities. Preserve cuts,
-- cooking states and punctuation; aliases remain explicit catalog records.
begin;

create or replace function public.normalize_ingredient_search_name(p_value text)
returns text
language sql
immutable
parallel safe
returns null on null input
set search_path = pg_catalog, pg_temp
as $function$
  select regexp_replace(lower(normalize(p_value, NFKC)), '[[:space:]' || chr(65279) || ']+', '', 'g')
$function$;

revoke all on function public.normalize_ingredient_search_name(text) from public;
grant execute on function public.normalize_ingredient_search_name(text) to anon, authenticated, service_role;

alter table public.ingredients
  add column if not exists search_name text
    generated always as (public.normalize_ingredient_search_name(standard_name)) stored;
alter table public.ingredient_synonyms
  add column if not exists search_name text
    generated always as (public.normalize_ingredient_search_name(synonym)) stored;

create index if not exists ingredients_search_name_idx on public.ingredients (search_name);
create index if not exists ingredient_synonyms_search_name_idx on public.ingredient_synonyms (search_name, ingredient_id);
create index if not exists ingredients_search_name_trgm_idx on public.ingredients using gin (search_name gin_trgm_ops);
create index if not exists ingredient_synonyms_search_name_trgm_idx on public.ingredient_synonyms using gin (search_name gin_trgm_ops);

-- Only the reviewed catalog correction uses the existing internal writer
-- authority. Ordinary account mutation guards and their triggers remain active.
do $reviewed_catalog_correction$
declare
  v_cutover_attempt_id uuid;
begin
  -- Fresh schemas without the reviewed data need no data correction authority.
  if not exists (
    select 1 from public.ingredients
    where id = 'd60f539f-d3ad-4f15-ab44-27c2d7e9cf20'::uuid
  ) then
    return;
  end if;

  select capability.current_cutover_attempt_id
    into v_cutover_attempt_id
  from public.account_generation_capability_state capability
  join public.account_generation_cutover_attempts attempt
    on attempt.id = capability.current_cutover_attempt_id
  where capability.singleton and capability.state = 'generation_active'
  for key share of capability, attempt;

  if v_cutover_attempt_id is null then
    raise exception 'INGREDIENT_CATALOG_CORRECTION_AUTHORITY_UNAVAILABLE'
      using errcode = '55000';
  end if;

  perform public.set_account_generation_internal_writer_marker(v_cutover_attempt_id, true);

  -- Correct the verified classification only; do not alter nutrition assignments,
  -- source profiles, historical recipe references or the other pork-cut identity.
  update public.ingredients
  set category = '육류', category_code = 'pork_beef_lamb'
  where id = 'd60f539f-d3ad-4f15-ab44-27c2d7e9cf20'::uuid
    and standard_name = '돼지 앞다리살'
    and category = '양념'
    and category_code = 'paste_sauce';

  -- Do not merge existing identities or their nutrition provenance. Only attach
  -- the explicitly reviewed pork-cut wording if it does not conflict elsewhere.
  insert into public.ingredient_synonyms (ingredient_id, synonym)
  select ingredient.id, alias.synonym
  from public.ingredients ingredient
  cross join (values ('돼지 앞다리'), ('돼지고기 앞다리살')) alias(synonym)
  where ingredient.id = 'd60f539f-d3ad-4f15-ab44-27c2d7e9cf20'::uuid
    and ingredient.search_name = public.normalize_ingredient_search_name('돼지 앞다리살')
    and not exists (
      select 1 from public.ingredients other
      where other.id <> ingredient.id
        and other.search_name = public.normalize_ingredient_search_name(alias.synonym)
    )
    and not exists (
      select 1 from public.ingredient_synonyms other
      where other.ingredient_id <> ingredient.id
        and other.search_name = public.normalize_ingredient_search_name(alias.synonym)
    )
  on conflict (ingredient_id, synonym) do nothing;

  perform public.set_account_generation_internal_writer_marker(v_cutover_attempt_id, false);
end;
$reviewed_catalog_correction$;

-- Keep this selection policy aligned with lib/ingredient-catalog-policy.ts.
create or replace function public.is_selectable_catalog_ingredient(p_id uuid)
returns boolean
language sql
immutable
parallel safe
security invoker
set search_path = pg_catalog, pg_temp
as $function$
  select p_id <> all (array[
    'b530cbdf-7d78-4dca-b43e-7b43a9114084', 'bfc4f826-5d6b-426d-9e26-9177eb89b086',
    '6752fedc-101f-484f-97dd-da34f1954980', 'ae9befb4-ba46-4761-922d-cef4dbad93e1',
    'c3b23d90-0cf1-4820-8be4-531eede986f1', 'fa597781-a191-45f7-a3e8-3a19931858b2',
    '3bc3fefb-c280-46fe-83fa-937ddb14f06b', '167bda6c-abdf-4057-84c1-d013ce38312f',
    'ecf31d7f-dcf9-4e02-87aa-3d41cc54f582', 'ccddaf85-4700-47f6-97cd-7c1c1b4d6b30',
    '0a128a83-b012-4197-83a2-1895b77fd882', '07694d02-8cd7-4047-ac4d-4078739c3c73',
    'dfa26343-0d41-4750-9e8f-b6cea850e188', '49488a14-bcce-41c0-8a4f-24a4691b273d',
    '5363ddb9-ee58-4b8a-884d-a84b80fd064c', '99a58a07-e130-4299-a058-3cb424edeb89',
    'fd75d45d-0d54-48c8-9b1b-04b750666c99', 'cdf20482-adc3-48dc-a48f-a7658fed61d2',
    '47528b57-dc5b-4391-878a-1ded89521a60', '319d0dce-12d7-45ef-b8db-2ff521d9f89b',
    '31eac531-4b86-4c91-86ae-cc62e1f36984', '9361798b-6518-43e6-a19a-ef3328e1ab3f',
    '5a3c50a9-3c3e-4aa6-a59e-1786f4877f13', '49587faf-2b79-441a-b6da-6112381ebc6b',
    '9f094241-b1da-4481-b140-8dedcf80563a', 'cfaabb5e-482d-481b-8016-45bac54d1a01'
  ]::uuid[])
$function$;
revoke all on function public.is_selectable_catalog_ingredient(uuid) from public, anon, authenticated, service_role;

-- This helper is SECURITY INVOKER: it cannot bypass catalog RLS. Canonical exact
-- names take precedence; synonyms apply only without an active canonical match.
-- Multiple identities within the chosen set still require a user choice.
create or replace function public.match_ingredient_name_exact(p_name text)
returns table (id uuid, standard_name text)
language sql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
  with canonical_matches as materialized (
    select ingredient.id from public.ingredients ingredient
    where ingredient.search_name = public.normalize_ingredient_search_name(p_name)
      and public.is_selectable_catalog_ingredient(ingredient.id)
  ), matches as (
    select canonical_matches.id from canonical_matches
    union
    select synonym.ingredient_id from public.ingredient_synonyms synonym
    where synonym.search_name = public.normalize_ingredient_search_name(p_name)
      and not exists (select 1 from canonical_matches)
  )
  select ingredient.id, ingredient.standard_name::text
  from matches
  join public.ingredients ingredient on ingredient.id = matches.id
  where public.is_selectable_catalog_ingredient(ingredient.id)
$function$;

revoke all on function public.match_ingredient_name_exact(text) from public, anon, authenticated, service_role;

-- Keep helper privileges restricted to owners of the existing entrypoints.
do $grants$
declare
  v_owner text;
begin
  for v_owner in
    select distinct pg_catalog.pg_get_userbyid(proowner)
    from pg_catalog.pg_proc
    where oid in (
      'public.resolve_youtube_extraction_job_draft(uuid,text,bigint,bigint,text,jsonb)'::regprocedure,
      'public.register_youtube_ingredient(text,text,text,text,text)'::regprocedure,
      'public.search_food_catalog_ranked(uuid,text,text[],text,integer,jsonb,text,integer)'::regprocedure
    )
  loop
    execute format('grant execute on function public.normalize_ingredient_search_name(text) to %I', v_owner);
    execute format('grant execute on function public.match_ingredient_name_exact(text) to %I', v_owner);
    execute format('grant execute on function public.is_selectable_catalog_ingredient(uuid) to %I', v_owner);
  end loop;
end;
$grants$;

-- Preserve the job's lease, authority, quantities and immutable draft identity;
-- replace only dictionary lookup, including ambiguity handling.
do $youtube_lookup$
declare
  v_definition text := pg_get_functiondef('public.resolve_youtube_extraction_job_draft(uuid,text,bigint,bigint,text,jsonb)'::regprocedure);
  v_start text := E'    select ingredient.id, ingredient.standard_name\n      into v_ingredient_id, v_ingredient_standard_name\n';
  v_end text := E'    v_resolution_status := case\n';
  v_start_at integer;
  v_end_at integer;
  v_replacement text := $lookup$
    select count(*)::integer,
           coalesce(jsonb_agg(jsonb_build_object(
             'ingredient_id', candidate.id,
             'standard_name', candidate.standard_name,
             'confidence', 0.9
           ) order by candidate.standard_name, candidate.id), '[]'::jsonb)
      into v_ingredient_match_count, v_ingredient_candidates
    from public.match_ingredient_name_exact(v_ingredient_name) candidate;

    if v_ingredient_match_count = 1 then
      v_ingredient_id := (v_ingredient_candidates -> 0 ->> 'ingredient_id')::uuid;
      v_ingredient_standard_name := v_ingredient_candidates -> 0 ->> 'standard_name';
    end if;

$lookup$;
begin
  if position('public.match_ingredient_name_exact(v_ingredient_name)' in v_definition) = 0 then
    v_start_at := strpos(v_definition, v_start);
    v_end_at := strpos(v_definition, v_end);
    if v_start_at = 0 or v_end_at <= v_start_at then
      raise exception 'INGREDIENT_SEARCH_YOUTUBE_LOOKUP_SHAPE_CHANGED';
    end if;
    v_definition := substr(v_definition, 1, v_start_at - 1) || v_replacement || substr(v_definition, v_end_at);
    execute v_definition;
  end if;
end;
$youtube_lookup$;

-- Existing registration may reuse a unique normalized identity but must not
-- pick among multiple identities. Serialize equivalent spellings before insert.
do $registration$
declare
  v_definition text := pg_get_functiondef('public.register_youtube_ingredient(text,text,text,text,text)'::regprocedure);
  v_start text := '  insert into public.ingredients (standard_name, category, category_code, default_unit)';
  v_end text := E'  if not found then\n    raise exception ''ingredient registration failed'';';
  v_start_at integer;
  v_end_at integer;
  v_replacement text := $registration_lookup$
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'ingredient-name:' || public.normalize_ingredient_search_name(v_standard_name), 0
  ));
  if (select count(*) from public.match_ingredient_name_exact(v_standard_name)) > 1 then
    raise exception 'INGREDIENT_NAME_AMBIGUOUS' using errcode = '22023';
  end if;
  select ingredient.* into v_ingredient
  from public.ingredients ingredient
  join public.match_ingredient_name_exact(v_standard_name) matched on matched.id = ingredient.id;
  if not found then
    insert into public.ingredients (standard_name, category, category_code, default_unit)
    values (v_standard_name, v_category, v_category_code, v_default_unit)
    on conflict (standard_name) do nothing;
    select * into v_ingredient from public.ingredients
    where standard_name = v_standard_name and public.is_selectable_catalog_ingredient(id);
  end if;

$registration_lookup$;
begin
  if position('INGREDIENT_NAME_AMBIGUOUS' in v_definition) = 0 then
    v_start_at := strpos(v_definition, v_start);
    v_end_at := strpos(v_definition, v_end);
    if v_start_at = 0 or v_end_at <= v_start_at then
      raise exception 'INGREDIENT_SEARCH_REGISTRATION_SHAPE_CHANGED';
    end if;
    v_definition := substr(v_definition, 1, v_start_at - 1) || v_replacement || substr(v_definition, v_end_at);
    v_definition := replace(v_definition,
      'lower(trim(v_synonym)) = lower(trim(v_ingredient.standard_name))',
      'public.normalize_ingredient_search_name(v_synonym) = public.normalize_ingredient_search_name(v_ingredient.standard_name)');
    v_definition := replace(v_definition,
      E'    from public.ingredient_synonyms\n    where synonym = v_synonym\n      and ingredient_id <> v_ingredient.id',
      E'    from public.match_ingredient_name_exact(v_synonym) other\n    where other.id <> v_ingredient.id');
    execute v_definition;
  end if;
end;
$registration$;

-- Food-log search uses a separate ranked catalog entrypoint. Retain its product
-- ranking, actor check and cursors; include explicit aliases in ingredient text.
do $food_search$
declare
  v_definition text := pg_get_functiondef('public.search_food_catalog_ranked(uuid,text,text[],text,integer,jsonb,text,integer)'::regprocedure);
  v_start text := '  ingredient_candidates as materialized (';
  v_end text := '  public_product_index_candidates as materialized (';
  v_start_at integer;
  v_end_at integer;
  v_original text;
  v_updated text;
  v_join text := $alias_join$
    from public.ingredients ingredient
    left join lateral (
      select synonym.synonym
      from public.ingredient_synonyms synonym
      where synonym.ingredient_id = ingredient.id
        and public.normalize_ingredient_search_name(p_query) <> ''
        and ingredient.search_name <> public.normalize_ingredient_search_name(p_query)
        and position(public.normalize_ingredient_search_name(p_query) in synonym.search_name) > 0
      order by
        (synonym.search_name = public.normalize_ingredient_search_name(p_query)) desc,
        char_length(synonym.search_name), synonym.synonym, synonym.id
      limit 1
    ) matched_alias on true
$alias_join$;
begin
  if position('matched_alias.synonym' in v_definition) = 0 then
    v_start_at := strpos(v_definition, v_start);
    v_end_at := strpos(v_definition, v_end);
    if v_start_at = 0 or v_end_at <= v_start_at then
      raise exception 'INGREDIENT_SEARCH_FOOD_CATALOG_SHAPE_CHANGED';
    end if;
    v_original := substr(v_definition, v_start_at, v_end_at - v_start_at);
    v_updated := replace(v_original, E'    from public.ingredients ingredient\n', v_join);
    v_updated := replace(v_updated,
      'public.normalize_food_search_text(ingredient.standard_name::text, false)',
      'public.normalize_food_search_text(coalesce(matched_alias.synonym, ingredient.standard_name)::text, false)');
    v_updated := replace(v_updated,
      E'public.normalize_food_search_text(ingredient.standard_name::text, true)\n        as compact_document',
      E'public.normalize_food_search_text(coalesce(matched_alias.synonym, ingredient.standard_name)::text, true)\n        as compact_document');
    v_updated := replace(v_updated,
      E'    where ''ingredient'' = any(p_types)',
      E'    where public.is_selectable_catalog_ingredient(ingredient.id)\n      and ''ingredient'' = any(p_types)');
    v_updated := replace(v_updated,
      E'        v_query = ''''\n        or (',
      E'        v_query = ''''\n        or matched_alias.synonym is not null\n        or (');
    v_updated := replace(v_updated,
      E'    order by\n      case when v_query = '''' then ingredient.created_at end desc,',
      E'    order by\n      case when v_query <> '''' then (ingredient.search_name = public.normalize_ingredient_search_name(p_query) or public.normalize_ingredient_search_name(matched_alias.synonym) = public.normalize_ingredient_search_name(p_query)) end desc nulls last,\n      case when v_query = '''' then ingredient.created_at end desc,');
    if v_updated = v_original or position('or matched_alias.synonym is not null' in v_updated) = 0 then
      raise exception 'INGREDIENT_SEARCH_FOOD_CATALOG_REPLACEMENT_FAILED';
    end if;
    v_definition := substr(v_definition, 1, v_start_at - 1) || v_updated || substr(v_definition, v_end_at);
    execute v_definition;
  end if;
end;
$food_search$;

notify pgrst, 'reload schema';

commit;
