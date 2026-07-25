-- The canonical migration stays transaction-compatible for fresh/replay
-- databases. The merged-exact-SHA production gate prebuilds these same index
-- definitions concurrently before the migration runner records this version.

create or replace function public.food_search_short_ngrams(p_value text)
returns text[]
language sql
immutable
parallel safe
returns null on null input
set search_path = pg_catalog, pg_temp
as $$
  with normalized as (
    select public.normalize_food_search_text(p_value, true) as value
  ),
  grams as (
    select substr(normalized.value, position.start_at, width.size) as gram
    from normalized
    cross join lateral generate_series(1, 2) as width(size)
    cross join lateral generate_series(
      1,
      char_length(normalized.value) - width.size + 1
    ) as position(start_at)
    where char_length(normalized.value) >= width.size
  )
  select coalesce(
    array_agg(distinct grams.gram order by grams.gram),
    array[]::text[]
  )
  from grams
$$;

revoke all on function public.food_search_short_ngrams(text)
  from public, anon, authenticated, service_role;

do $$
declare
  v_invalid_index text;
begin
  select index_class.relname
  into v_invalid_index
  from pg_catalog.pg_class index_class
  join pg_catalog.pg_index index_state
    on index_state.indexrelid = index_class.oid
  join pg_catalog.pg_namespace index_namespace
    on index_namespace.oid = index_class.relnamespace
  where index_namespace.nspname = 'public'
    and index_class.relname = any (array[
      'ingredients_search_prefix_idx',
      'ingredients_search_compact_trgm_idx',
      'ingredients_search_short_ngram_idx',
      'food_products_public_search_prefix_idx',
      'food_products_public_search_compact_trgm_idx',
      'food_products_public_search_short_ngram_idx',
      'food_products_private_search_prefix_idx',
      'food_products_private_search_compact_trgm_idx',
      'food_products_private_search_short_ngram_idx'
    ])
    and not index_state.indisvalid
  order by index_class.relname
  limit 1;

  if v_invalid_index is not null then
    raise exception 'INVALID_SEARCH_INDEX_REQUIRES_CONCURRENT_REPAIR: %',
      v_invalid_index;
  end if;
end
$$;

create index if not exists ingredients_search_prefix_idx
  on public.ingredients (
    public.normalize_food_search_text(standard_name::text, false) text_pattern_ops
  );

create index if not exists ingredients_search_compact_trgm_idx
  on public.ingredients
  using gin (
    public.normalize_food_search_text(standard_name::text, true) gin_trgm_ops
  );

create index if not exists ingredients_search_short_ngram_idx
  on public.ingredients
  using gin (public.food_search_short_ngrams(standard_name::text));

create index if not exists food_products_public_search_prefix_idx
  on public.food_products (
    public.normalize_food_search_text(
      coalesce(brand::text || ' ', '') || name::text,
      false
    ) text_pattern_ops
  )
  where visibility = 'public'
    and moderation_status = 'visible'
    and deleted_at is null;

create index if not exists food_products_public_search_compact_trgm_idx
  on public.food_products
  using gin (
    public.normalize_food_search_text(
      coalesce(brand::text || ' ', '') || name::text,
      true
    ) gin_trgm_ops
  )
  where visibility = 'public'
    and moderation_status = 'visible'
    and deleted_at is null;

create index if not exists food_products_public_search_short_ngram_idx
  on public.food_products
  using gin (
    public.food_search_short_ngrams(
      coalesce(brand::text || ' ', '') || name::text
    )
  )
  where visibility = 'public'
    and moderation_status = 'visible'
    and deleted_at is null;

create index if not exists food_products_private_search_prefix_idx
  on public.food_products (
    owner_user_id,
    public.normalize_food_search_text(
      coalesce(brand::text || ' ', '') || name::text,
      false
    ) text_pattern_ops
  )
  where visibility = 'private'
    and moderation_status = 'visible'
    and deleted_at is null;

create index if not exists food_products_private_search_compact_trgm_idx
  on public.food_products
  using gin (
    public.normalize_food_search_text(
      coalesce(brand::text || ' ', '') || name::text,
      true
    ) gin_trgm_ops
  )
  where visibility = 'private'
    and moderation_status = 'visible'
    and deleted_at is null;

create index if not exists food_products_private_search_short_ngram_idx
  on public.food_products
  using gin (
    public.food_search_short_ngrams(
      coalesce(brand::text || ' ', '') || name::text
    )
  )
  where visibility = 'private'
    and moderation_status = 'visible'
    and deleted_at is null;
