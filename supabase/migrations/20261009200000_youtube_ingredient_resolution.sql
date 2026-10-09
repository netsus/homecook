-- Keep extracted source text intact while adding reviewed, bounded lookup candidates.
begin;

do $reviewed_synonym$
declare
  v_ingredient_id uuid := 'd8e4b087-3629-4f58-8ccd-2185a07d3da5';
  v_cutover uuid;
  v_already_marked boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended('homecook:youtube-ingredient-resolution', 0));
  lock table public.ingredient_synonyms in share row exclusive mode;

  -- A clean historical replay carries a different synthetic catalog identity.
  -- Apply this reviewed alias only to the pinned current-catalog identity.
  if not exists (
    select 1 from public.ingredients
    where id = v_ingredient_id and standard_name = '맛술'
      and public.is_selectable_catalog_ingredient(id)
  ) then
    return;
  end if;
  if exists (
    select 1 from public.ingredient_synonyms
    where search_name = public.normalize_ingredient_search_name('맛술(미림)')
      and ingredient_id <> v_ingredient_id
  ) or exists (
    select 1 from public.ingredients
    where search_name = public.normalize_ingredient_search_name('맛술(미림)')
      and id <> v_ingredient_id
  ) then
    raise exception 'YOUTUBE_INGREDIENT_RESOLUTION_SYNONYM_CONFLICT' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.ingredient_synonyms
    where search_name = public.normalize_ingredient_search_name('맛술(미림)')
      and ingredient_id = v_ingredient_id
  ) then
    return;
  end if;

  select capability.current_cutover_attempt_id,
    attempt.result_json ->> '_internal_generation_writer_txid' = txid_current()::text
  into v_cutover, v_already_marked
  from public.account_generation_capability_state capability
  join public.account_generation_cutover_attempts attempt
    on attempt.id = capability.current_cutover_attempt_id
  where capability.singleton and capability.state = 'generation_active'
  for key share of capability;
  if v_cutover is null then
    raise exception 'YOUTUBE_INGREDIENT_RESOLUTION_WRITER_UNAVAILABLE' using errcode = '55000';
  end if;
  if not coalesce(v_already_marked, false) then
    perform public.set_account_generation_internal_writer_marker(v_cutover, true);
  end if;

  insert into public.ingredient_synonyms (ingredient_id, synonym)
  select v_ingredient_id, reviewed.synonym
  from (values ('맛술', '맛술(미림)')) as reviewed(standard_name, synonym)
  where reviewed.standard_name = '맛술'
  on conflict (ingredient_id, synonym) do nothing;

  if not coalesce(v_already_marked, false) then
    perform public.set_account_generation_internal_writer_marker(v_cutover, false);
  end if;
end;
$reviewed_synonym$;

create or replace function public.ingredient_lookup_name_candidates(
  p_name text,
  p_unit text default null,
  p_raw_text text default null
)
returns table (search_name text, candidate_rank integer)
language sql immutable parallel safe security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
  with input as (
    select btrim(regexp_replace(normalize(regexp_replace(coalesce(p_name, ''),
        '[' || chr(65279) || chr(8203) || chr(8204) || chr(8205) || chr(8288) || ']', '', 'g'), NFKC),
        '[[:space:]]+', ' ', 'g')) as display_name,
      public.normalize_ingredient_search_name(p_name) as exact_key,
      public.normalize_ingredient_search_name(coalesce(p_unit, '')) as unit_key,
      normalize(regexp_replace(coalesce(p_raw_text, ''),
        '[' || chr(65279) || chr(8203) || chr(8204) || chr(8205) || chr(8288) || ']', '', 'g'), NFKC) as raw_text
  ), candidates as (
    select exact_key as search_name, 0 as candidate_rank
    from input where exact_key <> ''
    union all
    select public.normalize_ingredient_search_name(regexp_replace(display_name,
        '^(큰|작은)[[:space:]]+사이즈[[:space:]]+', '')),
      1
    from input
    where display_name ~ '^(큰|작은)[[:space:]]+사이즈[[:space:]]+.+$'
    union all
    select public.normalize_ingredient_search_name('스파게티면'), 1
    from input
    where exact_key = public.normalize_ingredient_search_name('스파게티')
      and (
        (unit_key = any (array['g', '그램'])
          and btrim(raw_text) ~* '^spaghetti[[:space:]]+[0-9]+([.,][0-9]+)?[[:space:]]*(g|그램)$')
        or
        (unit_key = any (array['kg', '킬로그램'])
          and btrim(raw_text) ~* '^spaghetti[[:space:]]+[0-9]+([.,][0-9]+)?[[:space:]]*(kg|킬로그램)$')
      )
  )
  select candidates.search_name, min(candidates.candidate_rank)::integer
  from candidates
  where candidates.search_name <> ''
  group by candidates.search_name;
$function$;

create or replace function public.match_ingredient_name_exact_with_context(
  p_name text,
  p_unit text,
  p_raw_text text
)
returns table (id uuid, standard_name text)
language sql stable security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
  with candidate_keys as materialized (
    select candidate.search_name, candidate.candidate_rank
    from public.ingredient_lookup_name_candidates(p_name, p_unit, p_raw_text) candidate
  ), canonical_raw as materialized (
    select candidate.candidate_rank,
      coalesce(alias.representative_ingredient_id, ingredient.id) as resolved_id,
      alias.ingredient_id is not null as is_alias
    from candidate_keys candidate
    join public.ingredients ingredient on ingredient.search_name = candidate.search_name
    left join public.ingredient_catalog_entries alias
      on alias.ingredient_id = ingredient.id and alias.presentation = 'alias'
    where public.is_selectable_catalog_ingredient(ingredient.id)
  ), canonical_matches as materialized (
    select distinct candidate_rank, resolved_id from canonical_raw where not is_alias
  ), matches as materialized (
    select candidate_rank, resolved_id from canonical_matches
    union
    select candidate_rank, resolved_id from canonical_raw alias_match
    where is_alias and not exists (
      select 1 from canonical_matches canonical
      where canonical.candidate_rank = alias_match.candidate_rank
    )
    union
    select candidate.candidate_rank,
      coalesce(alias.representative_ingredient_id, synonym.ingredient_id)
    from candidate_keys candidate
    join public.ingredient_synonyms synonym on synonym.search_name = candidate.search_name
    left join public.ingredient_catalog_entries alias
      on alias.ingredient_id = synonym.ingredient_id and alias.presentation = 'alias'
    where public.is_selectable_catalog_ingredient(synonym.ingredient_id)
      and not exists (
        select 1 from canonical_matches canonical
        where canonical.candidate_rank = candidate.candidate_rank
      )
  ), winning_rank as (
    select min(candidate_rank) as candidate_rank from matches
  )
  select distinct ingredient.id, ingredient.standard_name::text
  from matches
  join winning_rank on winning_rank.candidate_rank = matches.candidate_rank
  join public.ingredients ingredient on ingredient.id = matches.resolved_id
  where public.is_selectable_catalog_ingredient(ingredient.id);
$function$;

create or replace function public.match_ingredient_name_exact(p_name text)
returns table (id uuid, standard_name text)
language sql stable security invoker
set search_path = pg_catalog, public, pg_temp
as $function$
  select matched.id, matched.standard_name
  from public.match_ingredient_name_exact_with_context(p_name, null, null) matched;
$function$;

revoke all on function public.ingredient_lookup_name_candidates(text,text,text),
  public.match_ingredient_name_exact_with_context(text,text,text),
  public.match_ingredient_name_exact(text)
  from public, anon, authenticated, service_role;

do $resolver_grants$
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
    execute format('grant execute on function public.ingredient_lookup_name_candidates(text,text,text) to %I', v_owner);
    execute format('grant execute on function public.match_ingredient_name_exact_with_context(text,text,text) to %I', v_owner);
    execute format('grant execute on function public.match_ingredient_name_exact(text) to %I', v_owner);
  end loop;
end;
$resolver_grants$;

-- These helpers carry result-affecting resolver policy but do not use a
-- youtube_extraction_* name, so the main RPC inventory does not see them.
-- Add their exact definitions and authority shape to the already-attested
-- shared-dependency contract rather than broadening the public RPC surface.
do $resolver_helper_attestation$
declare
  v_contract regprocedure :=
    'private.youtube_extraction_shared_dependency_contract_v1()'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_contract);
  v_old text := $old$    'contract_definition',$old$;
  v_new text := $new$    'ingredient_resolution_helpers',
    coalesce((
      select pg_catalog.string_agg(
        helper.signature
          || '|owner=' || case
            when pg_catalog.pg_get_userbyid(procedure.proowner)
              in ('postgres', 'supabase_admin') then 'platform_admin'
            else pg_catalog.pg_get_userbyid(procedure.proowner)
          end
          || '|security_definer=' || procedure.prosecdef::text
          || '|volatility=' || procedure.provolatile::text
          || '|parallel=' || procedure.proparallel::text
          || '|config=' || coalesce((
            select pg_catalog.string_agg(setting, ',' order by setting)
            from pg_catalog.unnest(procedure.proconfig) setting
          ), '')
          || '|acl=' || coalesce((
            select pg_catalog.string_agg(
              case
                when privilege.grantee = procedure.proowner then 'OWNER'
                when grantee.rolname in ('postgres', 'supabase_admin') then 'platform_admin'
                else coalesce(grantee.rolname, 'PUBLIC')
              end || ':' || privilege.privilege_type || ':' || privilege.is_grantable::text,
              ',' order by
                case
                  when privilege.grantee = procedure.proowner then 'OWNER'
                  when grantee.rolname in ('postgres', 'supabase_admin') then 'platform_admin'
                  else coalesce(grantee.rolname, 'PUBLIC')
                end,
                privilege.privilege_type
            )
            from pg_catalog.aclexplode(coalesce(
              procedure.proacl,
              pg_catalog.acldefault('f', procedure.proowner)
            )) privilege
            left join pg_catalog.pg_roles grantee on grantee.oid = privilege.grantee
          ), '')
          || '|definition_sha256=' || pg_catalog.encode(
            extensions.digest(
              pg_catalog.convert_to(pg_catalog.pg_get_functiondef(procedure.oid), 'UTF8'),
              'sha256'
            ),
            'hex'
          ),
        E'\n' order by helper.ordinality
      )
      from pg_catalog.unnest(array[
        'public.ingredient_lookup_name_candidates(text,text,text)',
        'public.match_ingredient_name_exact_with_context(text,text,text)',
        'public.match_ingredient_name_exact(text)'
      ]) with ordinality helper(signature, ordinality)
      join pg_catalog.pg_proc procedure
        on procedure.oid = helper.signature::pg_catalog.regprocedure
    ), ''),
    'contract_definition',$new$;
begin
  if pg_catalog.strpos(v_definition, '''ingredient_resolution_helpers''') = 0 then
    if (pg_catalog.length(v_definition) - pg_catalog.length(
        pg_catalog.replace(v_definition, v_old, ''))
      ) / pg_catalog.length(v_old) <> 1 then
      raise exception 'YOUTUBE_INGREDIENT_RESOLUTION_SHARED_CONTRACT_SHAPE_CHANGED'
        using errcode = '55000';
    end if;
    execute pg_catalog.replace(v_definition, v_old, v_new);
  end if;
end;
$resolver_helper_attestation$;

do $membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format('grant youtube_extraction_worker_rpc_owner to %I with inherit false, set true granted by %I', current_user, current_user);
  else
    execute format('grant youtube_extraction_worker_rpc_owner to %I', current_user);
  end if;
end;
$membership$;

grant create on schema public to youtube_extraction_worker_rpc_owner;
set local role youtube_extraction_worker_rpc_owner;

do $youtube_context_lookup$
declare
  v_signature regprocedure := 'public.resolve_youtube_extraction_job_draft(uuid,text,bigint,bigint,text,jsonb)'::regprocedure;
  v_definition text := pg_catalog.pg_get_functiondef(v_signature);
  v_old text := 'from public.match_ingredient_name_exact(v_ingredient_name) candidate;';
  v_new text := $lookup$from public.match_ingredient_name_exact_with_context(
      v_ingredient_name,
      v_unit,
      btrim(v_original_name || ' ' || coalesce(v_amount_text, '') || coalesce(v_unit, ''))
    ) candidate;$lookup$;
begin
  if strpos(v_definition, 'public.match_ingredient_name_exact_with_context(') = 0 then
    if (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 then
      raise exception 'YOUTUBE_INGREDIENT_RESOLUTION_LOOKUP_SHAPE_CHANGED' using errcode = '55000';
    end if;
    execute replace(v_definition, v_old, v_new);
  end if;
end;
$youtube_context_lookup$;

reset role;
revoke create on schema public from youtube_extraction_worker_rpc_owner;

do $membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'revoke youtube_extraction_worker_rpc_owner from %I granted by %I',
      current_user,
      current_user
    );
  else
    execute format('revoke youtube_extraction_worker_rpc_owner from %I', current_user);
  end if;
end;
$membership$;

do $verify_resolver_catalog$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_fingerprint text;
begin
  perform set_config('request.jwt.claims', '{"role":"youtube_extraction_worker"}', true);
  v_fingerprint := public.read_youtube_extraction_enqueue_readiness()->>'catalog_fingerprint';
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  if v_fingerprint is distinct from
    '81362d758b5138a95b6cbe1d8d7c1f064653b467907a42a7335c00d97dc59ba9' then
    raise exception 'YouTube ingredient resolver catalog drifted: %', v_fingerprint
      using errcode = '55000';
  end if;
end;
$verify_resolver_catalog$;

do $membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'grant youtube_extraction_credential_manager_rpc_owner to %I with inherit false, set true granted by %I',
      current_user,
      current_user
    );
  else
    execute format('grant youtube_extraction_credential_manager_rpc_owner to %I', current_user);
  end if;
end;
$membership$;

grant create on schema public, private to youtube_extraction_credential_manager_rpc_owner;
set local role youtube_extraction_credential_manager_rpc_owner;

do $replace_fingerprint$
declare
  v_previous constant text :=
    'fb53256a0f5cb3c2690ecbc070718d2bbfaeafab4c23710dab0584f4cbc5d7c8';
  v_current constant text :=
    '81362d758b5138a95b6cbe1d8d7c1f064653b467907a42a7335c00d97dc59ba9';
  v_signature regprocedure;
  v_definition text;
begin
  foreach v_signature in array array[
    'public.read_youtube_extraction_enqueue_readiness()'::regprocedure,
    'private.assert_youtube_extraction_catalog_ready()'::regprocedure
  ] loop
    v_definition := pg_catalog.pg_get_functiondef(v_signature);
    if strpos(v_definition, v_current) <> 0 then
      if strpos(v_definition, v_previous) <> 0 then
        raise exception 'YouTube ingredient resolver fingerprint source mixed: %', v_signature
          using errcode = '55000';
      end if;
      continue;
    end if;
    if (length(v_definition) - length(replace(v_definition, v_previous, ''))) / length(v_previous) <> 1 then
      raise exception 'YouTube ingredient resolver fingerprint source drifted: %', v_signature
        using errcode = '55000';
    end if;
    execute replace(v_definition, v_previous, v_current);
  end loop;
end;
$replace_fingerprint$;

reset role;
revoke create on schema public, private from youtube_extraction_credential_manager_rpc_owner;

do $membership$
begin
  if current_setting('server_version_num')::integer >= 160000 then
    execute format(
      'revoke youtube_extraction_credential_manager_rpc_owner from %I granted by %I',
      current_user,
      current_user
    );
  else
    execute format('revoke youtube_extraction_credential_manager_rpc_owner from %I', current_user);
  end if;
end;
$membership$;

do $verify_attested_catalog$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_fingerprint text;
begin
  perform set_config('request.jwt.claims', '{"role":"youtube_extraction_worker"}', true);
  v_fingerprint := public.read_youtube_extraction_enqueue_readiness()->>'catalog_fingerprint';
  if v_fingerprint is distinct from
      '81362d758b5138a95b6cbe1d8d7c1f064653b467907a42a7335c00d97dc59ba9' then
    raise exception 'YouTube ingredient resolver post-attestation drifted: %', v_fingerprint
      using errcode = '55000';
  end if;
  perform private.assert_youtube_extraction_catalog_ready();
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
end;
$verify_attested_catalog$;

notify pgrst, 'reload schema';
commit;
