const EXPECTED_INDEX_NAMES = [
  "ingredients_search_prefix_idx",
  "ingredients_search_compact_trgm_idx",
  "ingredients_search_short_ngram_idx",
  "food_products_public_search_prefix_idx",
  "food_products_public_search_compact_trgm_idx",
  "food_products_public_search_short_ngram_idx",
  "food_products_private_search_prefix_idx",
  "food_products_private_search_compact_trgm_idx",
  "food_products_private_search_short_ngram_idx",
];

const RPC_SIGNATURE =
  "public.search_food_catalog_ranked(uuid,text,text[],text,integer,jsonb,text,integer)";

const POST_MERGE_READ_ONLY_SQL = String.raw`
with expected_indexes(index_name) as (
  values
    ('ingredients_search_prefix_idx'),
    ('ingredients_search_compact_trgm_idx'),
    ('ingredients_search_short_ngram_idx'),
    ('food_products_public_search_prefix_idx'),
    ('food_products_public_search_compact_trgm_idx'),
    ('food_products_public_search_short_ngram_idx'),
    ('food_products_private_search_prefix_idx'),
    ('food_products_private_search_compact_trgm_idx'),
    ('food_products_private_search_short_ngram_idx')
), index_inventory as (
  select
    expected.index_name,
    index_row.indexrelid is not null as present,
    coalesce(index_row.indisvalid and index_row.indisready, false) as valid
  from expected_indexes expected
  left join pg_catalog.pg_class index_class
    on index_class.relname = expected.index_name
  left join pg_catalog.pg_namespace index_namespace
    on index_namespace.oid = index_class.relnamespace
    and index_namespace.nspname = 'public'
  left join pg_catalog.pg_index index_row
    on index_row.indexrelid = index_class.oid
), rpc_inventory as (
  select
    procedure_row.oid,
    procedure_row.prosecdef,
    coalesce(procedure_row.proconfig, array[]::text[]) as configuration,
    pg_catalog.pg_get_functiondef(procedure_row.oid) as definition
  from pg_catalog.pg_proc procedure_row
  join pg_catalog.pg_namespace procedure_namespace
    on procedure_namespace.oid = procedure_row.pronamespace
  where procedure_row.oid =
    to_regprocedure('${RPC_SIGNATURE}')
), actor as (
  select nullif(
    current_setting('homecook.prepared_food_search_actor_id', true),
    ''
  )::uuid as actor_id
), eligible_public_catalog as (
  select
    product.id,
    left(concat_ws(' ', product.brand, product.name), 120) as query_text
  from public.food_products product
  join public.food_product_nutrition_versions version
    on version.id = product.current_nutrition_version_id
    and version.product_id = product.id
  join public.nutrition_profiles profile
    on profile.id = version.nutrition_profile_id
  join public.nutrition_source_items source_item
    on source_item.id = version.source_item_id
  join public.nutrition_sources source
    on source.id = source_item.source_id
  where product.visibility = 'public'
    and product.source_type = 'public_dataset'
    and product.moderation_status = 'visible'
    and product.deleted_at is null
    and profile.source_item_id = source_item.id
    and profile.profile_kind = 'product_label'
    and profile.normalization_method = 'as_labeled'
    and profile.review_status = 'approved'
    and profile.is_active
    and source_item.external_item_key = product.external_product_key
    and source_item.source_basis_amount is not null
    and source_item.source_basis_amount = profile.basis_amount
    and source_item.source_basis_unit = profile.basis_unit
    and source_item.review_status = 'approved'
    and source.review_status = 'approved'
    and source.freshness_status = 'current'
    and source.is_active
    and nullif(btrim(source.source_version), '') is not null
    and (
      select count(*)
      from public.nutrition_values nutrition_value
      where nutrition_value.profile_id = profile.id
        and nutrition_value.nutrient_code in (
          'energy_kcal',
          'carbohydrate_g',
          'protein_g',
          'fat_g',
          'sodium_mg'
        )
        and nutrition_value.value_status = 'observed'
        and nutrition_value.amount is not null
    ) = 5
  limit 1
), public_page as (
  select public.search_food_catalog_ranked(
    actor.actor_id,
    coalesce(
      (select query_text from eligible_public_catalog),
      ''
    ),
    array['food_product']::text[],
    'public',
    null,
    null,
    repeat('a', 64),
    1
  ) as payload
  from actor
), mine_page as (
  select public.search_food_catalog_ranked(
    actor.actor_id,
    '',
    array['food_product']::text[],
    'mine',
    null,
    null,
    repeat('b', 64),
    50
  ) as payload
  from actor
), community_page as (
  select public.search_food_catalog_ranked(
    actor.actor_id,
    '',
    array['food_product']::text[],
    'community',
    null,
    null,
    repeat('c', 64),
    1
  ) as payload
  from actor
), pagination_page as (
  select public.search_food_catalog_ranked(
    actor.actor_id,
    '',
    array['ingredient']::text[],
    null,
    null,
    null,
    repeat('e', 64),
    1
  ) as payload
  from actor
), pagination_next_page as (
  select public.search_food_catalog_ranked(
    actor.actor_id,
    '',
    array['ingredient']::text[],
    null,
    2,
    pagination_page.payload -> 'next_cursor_tuple',
    repeat('e', 64),
    1
  ) as payload
  from actor
  cross join pagination_page
  where jsonb_typeof(
    pagination_page.payload -> 'next_cursor_tuple'
  ) = 'object'
), legacy_page as (
  select public.list_food_products(
    actor.actor_id,
    null,
    'all',
    null,
    null,
    1
  ) as payload
  from actor
), compatible_page as (
  select public.search_food_catalog_ranked(
    actor.actor_id,
    '',
    array['food_product']::text[],
    null,
    null,
    null,
    repeat('d', 64),
    1
  ) as payload
  from actor
), returned_products as (
  select 'public'::text as requested_scope, item.value ->> 'id' as product_id
  from public_page
  cross join lateral jsonb_array_elements(public_page.payload -> 'items') item
  union all
  select 'community', item.value ->> 'id'
  from community_page
  cross join lateral jsonb_array_elements(community_page.payload -> 'items') item
  union all
  select 'mine', item.value ->> 'id'
  from mine_page
  cross join lateral jsonb_array_elements(mine_page.payload -> 'items') item
), returned_product_state as (
  select
    returned.requested_scope,
    product.id,
    product.owner_user_id,
    product.visibility,
    product.source_type,
    product.moderation_status,
    product.deleted_at,
    product.current_nutrition_version_id,
    version.id as admitted_version_id,
    actor.actor_id
  from returned_products returned
  join public.food_products product
    on product.id = returned.product_id::uuid
  left join public.food_product_nutrition_versions version
    on version.id = product.current_nutrition_version_id
    and version.product_id = product.id
  cross join actor
), rpc_definition as (
  select lower(coalesce((select definition from rpc_inventory), '')) as value
)
select jsonb_build_object(
  'fixture_ready',
    exists(
      select 1
      from returned_product_state
      where requested_scope = 'mine' and owner_user_id = actor_id
    )
    and coalesce(
      (
        select jsonb_typeof(payload -> 'next_cursor_tuple') = 'object'
        from pagination_page
      ),
      false
    )
    and coalesce(
      jsonb_array_length((select payload -> 'items' from legacy_page)),
      0
    ) > 0,
  'index_count', (
    select count(*) from index_inventory where present
  ),
  'invalid_index_count', (
    select count(*) from index_inventory where not valid
  ),
  'rpc_exists', exists(select 1 from rpc_inventory),
  'rpc_security_definer', coalesce(
    (select prosecdef from rpc_inventory),
    false
  ),
  'rpc_search_path_safe', coalesce(
    (select configuration @> array[
      'search_path=pg_catalog, public, pg_temp'
    ] from rpc_inventory),
    false
  ),
  'rpc_hosted_threshold_compatible', coalesce(
    (
      select
        not exists (
          select 1
          from unnest(configuration) setting
          where setting like 'pg_trgm.word_similarity_threshold=%'
        )
        and position('v_query_bigrams' in definition) > 0
        and position(' <%' in definition) = 0
        and (
          length(definition)
            - length(replace(definition, 'public.word_similarity(', ''))
        ) / length('public.word_similarity(') = 3
        and (
          length(definition)
            - length(replace(
              definition,
              'public.food_search_short_ngrams(',
              ''
            ))
        ) / length('public.food_search_short_ngrams(') = 6
      from rpc_inventory
    ),
    false
  ),
  'public_execute', coalesce(
    has_function_privilege('public', '${RPC_SIGNATURE}', 'EXECUTE'),
    false
  ),
  'anon_execute', coalesce(
    has_function_privilege('anon', '${RPC_SIGNATURE}', 'EXECUTE'),
    false
  ),
  'authenticated_execute', coalesce(
    has_function_privilege('authenticated', '${RPC_SIGNATURE}', 'EXECUTE'),
    false
  ),
  'service_role_execute', coalesce(
    has_function_privilege('service_role', '${RPC_SIGNATURE}', 'EXECUTE'),
    false
  ),
  'public_scope_ok',
    (
      (
        exists(select 1 from eligible_public_catalog)
        and exists(
          select 1
          from returned_product_state
          where requested_scope = 'public'
        )
      )
      or (
        not exists(select 1 from eligible_public_catalog)
      )
    )
    and not exists(
      select 1
      from returned_product_state
      where requested_scope = 'public'
        and not (
          visibility = 'public'
          and source_type = 'public_dataset'
          and moderation_status = 'visible'
          and deleted_at is null
        )
    ),
  'private_scope_ok',
    exists(select 1 from returned_product_state where requested_scope = 'mine')
    and not exists(
      select 1
      from returned_product_state
      where requested_scope = 'mine'
        and not (
          visibility = 'private'
          and source_type = 'manual'
          and owner_user_id = actor_id
          and moderation_status = 'visible'
          and deleted_at is null
        )
    ),
  'moderation_scope_ok', not exists(
    select 1
    from returned_product_state
    where moderation_status <> 'visible' or deleted_at is not null
  ),
  'current_nutrition_ok', not exists(
    select 1
    from returned_product_state
    where current_nutrition_version_id is null
      or admitted_version_id is distinct from current_nutrition_version_id
  ),
  'cursor_v2_ok',
    coalesce((select payload -> 'next_cursor_tuple' ->> 'algorithm_version'
      from pagination_page), '') = '2'
    and exists(select 1 from pagination_next_page)
    and coalesce(
      (select payload -> 'items' -> 0 ->> 'id' from pagination_page),
      ''
    )
      <> coalesce(
        (select payload -> 'items' -> 0 ->> 'id' from pagination_next_page),
        ''
      ),
  'legacy_compatibility_ok',
    coalesce((select payload -> 'items' -> 0 ->> 'id' from legacy_page), '')
      = coalesce(
        (select payload -> 'items' -> 0 ->> 'id' from compatible_page),
        ''
      )
    and coalesce((select value from rpc_definition), '') like
      '%p_cursor_version = 1%',
  'runtime_provider_requests', 0,
  'remote_writes', 0
);
`;

export function buildPreparedFoodSearchRemoteVerificationPlan({ mode }) {
  if (mode !== "post-merge-read-only") {
    throw new Error(
      `unsupported prepared food search remote verification mode: ${mode ?? "missing"}`,
    );
  }

  return {
    mode,
    readOnly: true,
    requiresMergedOriginMaster: true,
    requiresCleanTrackedTree: true,
    expectedIndexCount: EXPECTED_INDEX_NAMES.length,
    sql: POST_MERGE_READ_ONLY_SQL,
  };
}

export function buildPreparedFoodSearchPsqlRequest({
  actorId,
  databaseUrl,
  environment,
  planSql,
}) {
  const psqlEnvironment = { ...environment };
  delete psqlEnvironment.PGOPTIONS;

  return {
    args: [
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-v",
      ["actor_id", actorId].join("="),
    ],
    input: [
      "begin transaction read only;",
      "set local role service_role;",
      "set local homecook.prepared_food_search_actor_id = :'actor_id';",
      planSql,
      "commit;",
    ].join("\n"),
    environment: {
      ...psqlEnvironment,
      PGDATABASE: databaseUrl,
      PGSSLMODE: "require",
    },
  };
}

export function assertPreparedFoodSearchMergedExactSource({
  head,
  originMaster,
  trackedStatus,
}) {
  if (head !== originMaster) {
    throw new Error(
      "post-merge read-only verification requires HEAD to equal origin/master",
    );
  }
  if (trackedStatus !== "") {
    throw new Error(
      "post-merge read-only verification requires a clean tracked tree",
    );
  }
  return head;
}

export function assertPreparedFoodSearchRemoteVerificationResult(result) {
  if (
    !result
    || typeof result !== "object"
    || Array.isArray(result)
    || result.fixture_ready !== true
  ) {
    throw new Error(
      "remote prepared food search smoke fixture is missing for the approved actor",
    );
  }

  const valid =
    result.index_count === EXPECTED_INDEX_NAMES.length
    && result.invalid_index_count === 0
    && result.rpc_exists === true
    && result.rpc_security_definer === true
    && result.rpc_search_path_safe === true
    && result.rpc_hosted_threshold_compatible === true
    && result.public_execute === false
    && result.anon_execute === false
    && result.authenticated_execute === false
    && result.service_role_execute === true
    && result.public_scope_ok === true
    && result.private_scope_ok === true
    && result.moderation_scope_ok === true
    && result.current_nutrition_ok === true
    && result.cursor_v2_ok === true
    && result.legacy_compatibility_ok === true
    && result.runtime_provider_requests === 0
    && result.remote_writes === 0;

  if (!valid) {
    throw new Error("remote prepared food search verification failed");
  }
}
