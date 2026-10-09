-- Canonicalize new lookups, not stored ingredient references or nutrition.
begin;

create or replace function public.normalize_ingredient_search_name(p_value text)
returns text language sql immutable parallel safe returns null on null input
set search_path = pg_catalog, pg_temp
as $function$
  select normalize(regexp_replace(lower(normalize(p_value, NFKC)),
    '[[:space:]' || chr(65279) || chr(8203) || chr(8204) || chr(8205) || chr(8288) || ']+', '', 'g'), NFKC);
$function$;

-- Existing columns stay in exactly the same order; append only public metadata.
-- CREATE OR REPLACE preserves the view owner, grants and invoker behavior.
create or replace view public.ingredient_catalog_aliases
with (security_invoker = true)
as
select item.*,
  representative.standard_name as representative_standard_name,
  representative.category as representative_category,
  representative.category_code as representative_category_code
from public.ingredient_catalog_items item
join public.ingredients representative on representative.id = item.representative_ingredient_id
where item.presentation = 'alias';

-- A new IMMUTABLE implementation does not recompute STORED generated columns.
-- Refresh only rows whose keys actually changed; preserve the raw spellings.
-- The reviewed deployment has zero changed keys and twenty aliases (seventeen
-- new canonical-name synonyms, three already present). Empty replays are valid.
do $catalog_keys$
declare
  v_cutover uuid; v_already_marked boolean := false; v_work boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('homecook:ingredient-representative-links', 0));
  lock table public.ingredients, public.ingredient_synonyms in share row exclusive mode;
  v_work := exists (select 1 from public.ingredients
      where search_name is distinct from public.normalize_ingredient_search_name(standard_name))
    or exists (select 1 from public.ingredient_synonyms
      where search_name is distinct from public.normalize_ingredient_search_name(synonym))
    or exists (
      select 1 from public.ingredient_catalog_entries alias
      join public.ingredients source on source.id = alias.ingredient_id
      join public.ingredients representative on representative.id = alias.representative_ingredient_id
      where alias.presentation = 'alias'
        and public.normalize_ingredient_search_name(source.standard_name) <> representative.search_name
        and not exists (select 1 from public.ingredient_synonyms existing
          where existing.ingredient_id = representative.id
            and existing.search_name = public.normalize_ingredient_search_name(source.standard_name))
    );
  if not v_work then return; end if;
  select capability.current_cutover_attempt_id,
    attempt.result_json ->> '_internal_generation_writer_txid' = txid_current()::text
  into v_cutover, v_already_marked
  from public.account_generation_capability_state capability
  join public.account_generation_cutover_attempts attempt on attempt.id = capability.current_cutover_attempt_id
  where capability.singleton and capability.state = 'generation_active'
  for key share of capability;
  if v_cutover is null then
    raise exception 'INGREDIENT_CANONICAL_SEARCH_WRITER_UNAVAILABLE' using errcode = '55000';
  end if;
  if not coalesce(v_already_marked, false) then
    perform public.set_account_generation_internal_writer_marker(v_cutover, true);
  end if;

  update public.ingredients set standard_name = standard_name
    where search_name is distinct from public.normalize_ingredient_search_name(standard_name);
  update public.ingredient_synonyms set synonym = synonym
    where search_name is distinct from public.normalize_ingredient_search_name(synonym);

  -- Copy only the source's actual standard name, not every attached alias.
  -- Broad existing terms such as "bread" or "wing" retain their ambiguity.
  insert into public.ingredient_synonyms (ingredient_id, synonym)
  select distinct alias.representative_ingredient_id, source.standard_name
  from public.ingredient_catalog_entries alias
  join public.ingredients source on source.id = alias.ingredient_id
  join public.ingredients representative on representative.id = alias.representative_ingredient_id
  where alias.presentation = 'alias'
    and public.normalize_ingredient_search_name(source.standard_name) <> representative.search_name
    and not exists (select 1 from public.ingredient_synonyms existing
      where existing.ingredient_id = representative.id
        and existing.search_name = public.normalize_ingredient_search_name(source.standard_name))
  on conflict (ingredient_id, synonym) do nothing;

  if exists (select 1 from public.ingredients
      where search_name is distinct from public.normalize_ingredient_search_name(standard_name))
    or exists (select 1 from public.ingredient_synonyms
      where search_name is distinct from public.normalize_ingredient_search_name(synonym)) then
    raise exception 'INGREDIENT_CANONICAL_SEARCH_KEY_DRIFT';
  end if;
  if not coalesce(v_already_marked, false) then
    perform public.set_account_generation_internal_writer_marker(v_cutover, false);
  end if;
end;
$catalog_keys$;

-- The async resolver runs under its existing NOINHERIT/NOBYPASSRLS owner.
-- It needs only the public alias edge, not the remaining review metadata.
grant select (ingredient_id, presentation, representative_ingredient_id)
  on public.ingredient_catalog_entries to youtube_extraction_worker_rpc_owner;
do $worker_alias_read$
begin
  if not exists (select 1 from pg_policy
    where polrelid = 'public.ingredient_catalog_entries'::regclass
      and polname = 'ingredient_catalog_alias_worker_read') then
    create policy ingredient_catalog_alias_worker_read
      on public.ingredient_catalog_entries for select
      to youtube_extraction_worker_rpc_owner
      using (presentation = 'alias');
  end if;
end;
$worker_alias_read$;

-- Exact canonical names beat aliases. Multiple genuinely different canonical
-- identities remain multiple results; never select the first spelling match.
create or replace function public.match_ingredient_name_exact(p_name text)
returns table (id uuid, standard_name text)
language sql stable security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
  with canonical_raw as materialized (
    select coalesce(alias.representative_ingredient_id, ingredient.id) as resolved_id,
      alias.ingredient_id is not null as is_alias
    from public.ingredients ingredient
    left join public.ingredient_catalog_entries alias
      on alias.ingredient_id = ingredient.id and alias.presentation = 'alias'
    where ingredient.search_name = public.normalize_ingredient_search_name(p_name)
      and public.is_selectable_catalog_ingredient(ingredient.id)
  ), canonical_matches as materialized (
    select distinct resolved_id from canonical_raw where not is_alias
  ), matches as (
    select resolved_id from canonical_matches
    union
    select resolved_id from canonical_raw
    where is_alias and not exists (select 1 from canonical_matches)
    union
    select coalesce(alias.representative_ingredient_id, synonym.ingredient_id)
    from public.ingredient_synonyms synonym
    left join public.ingredient_catalog_entries alias
      on alias.ingredient_id = synonym.ingredient_id and alias.presentation = 'alias'
    where synonym.search_name = public.normalize_ingredient_search_name(p_name)
      and public.is_selectable_catalog_ingredient(synonym.ingredient_id)
      and not exists (select 1 from canonical_matches)
  )
  select ingredient.id, ingredient.standard_name::text
  from matches join public.ingredients ingredient on ingredient.id = matches.resolved_id
  where public.is_selectable_catalog_ingredient(ingredient.id);
$function$;

-- Preserve product candidates, ownership, scoring/cursor fields and authority.
-- Ingredient candidates use each representative once, before the 400-row cap.
do $ranked_search$
declare
  v_definition text := pg_get_functiondef('public.search_food_catalog_ranked(uuid,text,text[],text,integer,jsonb,text,integer)'::regprocedure);
  v_start text := '  ingredient_candidates as materialized (';
  v_end text := '  public_product_index_candidates as materialized (';
  v_start_at integer; v_end_at integer; v_original text; v_updated text;
  v_clean_query text := $clean$regexp_replace(normalize(coalesce(p_query, ''), NFKC),
      '[' || chr(65279) || chr(8203) || chr(8204) || chr(8205) || chr(8288) || ']', '', 'g')$clean$;
begin
  if position('canonical_alias_source' in v_definition) = 0 then
    v_start_at := strpos(v_definition, v_start);
    v_end_at := strpos(v_definition, v_end);
    if v_start_at = 0 or v_end_at <= v_start_at then
      raise exception 'INGREDIENT_CANONICAL_SEARCH_RANKED_SHAPE_CHANGED';
    end if;
    v_original := substr(v_definition, v_start_at, v_end_at - v_start_at);
    if strpos(v_original, 'where synonym.ingredient_id = ingredient.id') = 0
      or strpos(v_original, 'where public.is_selectable_catalog_ingredient(ingredient.id)') = 0 then
      raise exception 'INGREDIENT_CANONICAL_SEARCH_ALIAS_SHAPE_CHANGED';
    end if;
    v_updated := replace(v_original, 'where synonym.ingredient_id = ingredient.id',
      $alias$where (synonym.ingredient_id = ingredient.id or exists (
        select 1 from public.ingredient_catalog_entries canonical_alias_source
        where canonical_alias_source.presentation = 'alias'
          and canonical_alias_source.representative_ingredient_id = ingredient.id
          and canonical_alias_source.ingredient_id = synonym.ingredient_id
      ))$alias$);
    v_updated := replace(v_updated, 'where public.is_selectable_catalog_ingredient(ingredient.id)',
      $filter$where public.is_selectable_catalog_ingredient(ingredient.id)
      and not exists (select 1 from public.ingredient_catalog_entries canonical_alias_candidate
        where canonical_alias_candidate.ingredient_id = ingredient.id
          and canonical_alias_candidate.presentation = 'alias')$filter$);
    if v_updated = v_original then raise exception 'INGREDIENT_CANONICAL_SEARCH_PATCH_FAILED'; end if;
    v_definition := substr(v_definition, 1, v_start_at - 1) || v_updated || substr(v_definition, v_end_at);
    -- Clean only query input: do not redefine product document/index functions.
    if strpos(v_definition, 'public.normalize_food_search_text(coalesce(p_query, ''''), false)') = 0
      or strpos(v_definition, 'public.normalize_food_search_text(coalesce(p_query, ''''), true)') = 0 then
      raise exception 'INGREDIENT_CANONICAL_SEARCH_QUERY_SHAPE_CHANGED';
    end if;
    v_definition := replace(v_definition,
      'public.normalize_food_search_text(coalesce(p_query, ''''), false)',
      'public.normalize_food_search_text(' || v_clean_query || ', false)');
    v_definition := replace(v_definition,
      'public.normalize_food_search_text(coalesce(p_query, ''''), true)',
      'public.normalize_food_search_text(' || v_clean_query || ', true)');
    execute v_definition;
  end if;
end;
$ranked_search$;

-- SQL pre-request routing sees scope/method/path, not the select query string.
-- The application public-read gate permits only its exact five-column projection.
-- No grant or private representative-evidence access is added here.
do $scope_backup$
begin
  if to_regprocedure('private.verify_anonymous_pre_canonical_search_20261009()') is null then
    alter function private.verify_full_local_anonymous_authority()
      rename to verify_anonymous_pre_canonical_search_20261009;
  end if;
end;
$scope_backup$;
create or replace function private.verify_full_local_anonymous_authority()
returns void language plpgsql security definer
set search_path = pg_catalog, public, private, pg_temp
as $function$
begin
  if coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb
      ->> 'x-homecook-public-read-scope' = 'ingredients'
    and upper(coalesce(current_setting('request.method', true), '')) = 'GET'
    and current_setting('request.path', true) = '/ingredient_catalog_aliases' then
    return;
  end if;
  perform private.verify_anonymous_pre_canonical_search_20261009();
end;
$function$;
alter function private.verify_full_local_anonymous_authority() owner to postgres;
alter function private.verify_anonymous_pre_canonical_search_20261009() owner to postgres;
revoke all on function private.verify_full_local_anonymous_authority(),
  private.verify_anonymous_pre_canonical_search_20261009()
  from public, anon, authenticated, service_role;

-- Restate the existing API-role privileges without changing helper ownership
-- or the grants of their existing internal RPC-owner callers.
revoke all on function public.normalize_ingredient_search_name(text) from public;
grant execute on function public.normalize_ingredient_search_name(text)
  to anon, authenticated, service_role;
revoke all on function public.match_ingredient_name_exact(text)
  from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
