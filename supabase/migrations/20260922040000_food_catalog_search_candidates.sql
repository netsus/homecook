begin;

-- The bigram overlap branch can read thousands of irrelevant products before
-- evaluating word_similarity. Keep that exact predicate and additionally expose
-- its indexable commutator to the existing compact-document trigram GIN index.
-- No candidate cap, ordering, visibility, actor, cursor or nutrition rule changes.
do $migration$
declare
  v_function regprocedure := 'public.search_food_catalog_ranked(uuid,text,text[],text,integer,jsonb,text,integer)'::regprocedure;
  v_definition text;
  v_source text;
  v_owner oid;
  v_acl aclitem[];
  v_config text[];
  v_old text := $old$              and public.word_similarity(
                v_compact_query,
                public.normalize_food_search_text(
                  coalesce(product.brand::text || ' ', '') || product.name::text,
                  true
                )
              ) > 0.3$old$;
  v_new text;
begin
  select prosrc, proowner, proacl, proconfig
    into strict v_source, v_owner, v_acl, v_config
  from pg_proc where oid = v_function;

  if md5(v_source) not in (
    '82e7fb8d12952d0986c6d87ed0b5efc4',
    'cef89a4949132c4a297fbb733549e4ef'
  ) or not exists (
    select 1 from pg_proc where oid = v_function and prosecdef and provolatile = 's'
  ) then
    raise exception 'FOOD_SEARCH_CANDIDATE_DEFINITION_DRIFT';
  end if;

  if md5(v_source) = '82e7fb8d12952d0986c6d87ed0b5efc4' then
    if (length(v_source) - length(replace(v_source, v_old, ''))) / length(v_old) <> 2 then
      raise exception 'FOOD_SEARCH_CANDIDATE_PREDICATE_DRIFT';
    end if;
    v_new := v_old || $new$
              and public.normalize_food_search_text(
                coalesce(product.brand::text || ' ', '') || product.name::text,
                true
              ) OPERATOR(public.%>) v_compact_query$new$;
    v_definition := replace(pg_get_functiondef(v_function), v_old, v_new);
    execute v_definition;
  end if;

  -- Scope the index operator threshold to this function. The original strict
  -- word_similarity > 0.3 check still decides admission, including boundaries.
  -- A fresh non-superuser backend must load pg_trgm before DDL validates its
  -- custom GUC. Runtime function settings use PostgreSQL's normal save/restore.
  perform public.word_similarity('word', 'two words');
  if not exists (select 1 from pg_settings
    where name = 'pg_trgm.word_similarity_threshold' and context = 'user') then
    raise exception 'FOOD_SEARCH_THRESHOLD_NOT_USERSET';
  end if;
  alter function public.search_food_catalog_ranked(
    uuid,text,text[],text,integer,jsonb,text,integer
  ) set pg_trgm.word_similarity_threshold = '0.3';

  if not exists (
    select 1 from pg_proc p where p.oid = v_function
      and md5(p.prosrc) = 'cef89a4949132c4a297fbb733549e4ef'
      and p.proowner = v_owner
      and p.proacl is not distinct from v_acl
      and p.prosecdef and p.provolatile = 's'
      and 'pg_trgm.word_similarity_threshold=0.3' = any(p.proconfig)
      and array(select setting from unnest(p.proconfig) setting
        where setting not like 'pg_trgm.word_similarity_threshold=%' order by setting)
        is not distinct from array(select setting from unnest(v_config) setting
          where setting not like 'pg_trgm.word_similarity_threshold=%' order by setting)
  ) then
    raise exception 'FOOD_SEARCH_CANDIDATE_POSTCONDITION_FAILED';
  end if;
end;
$migration$;

commit;
