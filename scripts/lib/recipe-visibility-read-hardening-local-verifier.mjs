const EXPECTED_POLICY_SHAPES = [
  {
    relation: "public.recipes",
    name: "recipes_public_and_owner_read",
    qualification:
      "((deleted_at IS NULL) AND recipe_visibility_guard.is_owner_publicly_visible(created_by) AND ((visibility = 'public') OR (auth.uid() = created_by)))",
  },
  {
    relation: "public.recipe_sources",
    name: "recipe_sources_parent_read",
    qualification:
      "(EXISTS (SELECT 1 FROM recipes recipe WHERE (recipe.id = recipe_sources.recipe_id)))",
  },
  {
    relation: "public.recipe_ingredients",
    name: "recipe_ingredients_parent_read",
    qualification:
      "(EXISTS (SELECT 1 FROM recipes recipe WHERE (recipe.id = recipe_ingredients.recipe_id)))",
  },
  {
    relation: "public.recipe_steps",
    name: "recipe_steps_parent_read",
    qualification:
      "(EXISTS (SELECT 1 FROM recipes recipe WHERE (recipe.id = recipe_steps.recipe_id)))",
  },
  {
    relation: "public.recipe_step_cooking_methods",
    name: "recipe_step_cooking_methods_parent_read",
    qualification:
      "(EXISTS (SELECT 1 FROM (recipe_steps step JOIN recipes recipe ON ((recipe.id = step.recipe_id))) WHERE (step.id = recipe_step_cooking_methods.step_id)))",
  },
  {
    relation: "public.recipe_tags",
    name: "recipe_tags_parent_read",
    qualification:
      "((visibility = 'public') AND (review_status = 'approved') AND (EXISTS (SELECT 1 FROM recipes recipe WHERE (recipe.id = recipe_tags.recipe_id))))",
  },
  {
    relation: "public.tags",
    name: "tags_public_read",
    qualification:
      "((is_system = true) OR (EXISTS (SELECT 1 FROM (recipe_tags recipe_tag JOIN recipes recipe ON ((recipe.id = recipe_tag.recipe_id))) WHERE ((recipe_tag.tag_id = tags.id) AND (recipe_tag.visibility = 'public') AND (recipe_tag.review_status = 'approved')))))",
  },
];

const EXPECTED_GUARD_FUNCTION_BODY = String.raw`
declare
  v_latest_status text;
begin
  if p_owner_uuid is null then
    return true;
  end if;

  select lifecycle.status
    into v_latest_status
  from public.user_account_lifecycles as lifecycle
  where lifecycle.owner_uuid = p_owner_uuid
  order by account_generation desc
  limit 1;

  return v_latest_status is null or v_latest_status = 'active';
end
`;

const LOCAL_READ_ONLY_SQL = String.raw`
with required_relations(relation_name) as (
  values
    ('public.recipes'),
    ('public.recipe_sources'),
    ('public.recipe_ingredients'),
    ('public.recipe_steps'),
    ('public.recipe_step_cooking_methods'),
    ('public.recipe_tags'),
    ('public.tags'),
    ('public.recipe_image_objects'),
    ('public.recipe_image_object_references'),
    ('public.storage_object_deletion_outbox'),
    ('public.image_upload_quota_counters'),
    ('public.account_generation_capability_state'),
    ('public.user_account_generation_watermarks'),
    ('public.user_account_lifecycles'),
    ('public.account_generation_cutover_attempts'),
    ('public.account_generation_cutover_staging'),
    ('storage.buckets'),
    ('storage.objects')
), required_routines(routine_name) as (
  values
    ('recipe_visibility_guard.is_owner_publicly_visible(uuid)'),
    ('public.inspect_recipe_image_expected_owner_signal(uuid,bigint)')
), protected_roles(grantee) as (
  values ('anon'), ('authenticated')
), reader_required_table_select_relations(relation_name) as (
  values
    ('public.recipes'),
    ('public.recipe_sources'),
    ('public.recipe_ingredients'),
    ('public.recipe_steps'),
    ('public.recipe_step_cooking_methods'),
    ('public.recipe_tags')
), reader_relations(relation_name) as (
  select relation_name from reader_required_table_select_relations
  union all values ('public.tags')
), expected_policies(relation_name, policy_name) as (
  values
    ('public.recipes', 'recipes_public_and_owner_read'),
    ('public.recipe_sources', 'recipe_sources_parent_read'),
    ('public.recipe_ingredients', 'recipe_ingredients_parent_read'),
    ('public.recipe_steps', 'recipe_steps_parent_read'),
    (
      'public.recipe_step_cooking_methods',
      'recipe_step_cooking_methods_parent_read'
    ),
    ('public.recipe_tags', 'recipe_tags_parent_read'),
    ('public.tags', 'tags_public_read')
), tag_allowed_columns(column_name) as (
  values
    ('id'),
    ('normalized_key'),
    ('label'),
    ('slug'),
    ('kind'),
    ('is_system'),
    ('theme_eligible')
), internal_relations(relation_name) as (
  values
    ('public.recipe_image_objects'),
    ('public.recipe_image_object_references'),
    ('public.storage_object_deletion_outbox'),
    ('public.image_upload_quota_counters'),
    ('public.account_generation_capability_state'),
    ('public.user_account_generation_watermarks'),
    ('public.user_account_lifecycles'),
    ('public.account_generation_cutover_attempts'),
    ('public.account_generation_cutover_staging')
), local_table_write_privileges(privilege_name) as (
  values
    ('IN' || 'SERT'),
    ('UP' || 'DATE'),
    ('DE' || 'LETE')
), local_column_write_privileges(privilege_name) as (
  values
    ('IN' || 'SERT'),
    ('UP' || 'DATE')
), reader_required_table_selects as (
  select count(*)::integer as value
  from protected_roles
  cross join reader_required_table_select_relations
  where pg_catalog.has_table_privilege(
    grantee,
    relation_name,
    'SELECT'
  )
), reader_tags_table_selects as (
  select count(*)::integer as value
  from protected_roles
  where pg_catalog.has_table_privilege(
    grantee,
    'public.tags',
    'SELECT'
  )
), reader_tags_allowed_column_selects as (
  select count(*)::integer as value
  from protected_roles
  cross join tag_allowed_columns
  where pg_catalog.has_column_privilege(
    grantee,
    'public.tags',
    column_name,
    'SELECT'
  )
), reader_tags_usage_count_selects as (
  select count(*)::integer as value
  from protected_roles
  where pg_catalog.has_column_privilege(
    grantee,
    'public.tags',
    'usage_count',
    'SELECT'
  )
), reader_table_writes as (
  select count(*)::integer as value
  from protected_roles
  cross join reader_relations
  cross join local_table_write_privileges
  where pg_catalog.has_table_privilege(
    grantee,
    relation_name,
    privilege_name
  )
), reader_column_writes as (
  select count(*)::integer as value
  from protected_roles
  cross join reader_relations
  cross join local_column_write_privileges
  where pg_catalog.has_any_column_privilege(
    grantee,
    relation_name,
    privilege_name
  )
), internal_table_privileges as (
  select count(*)::integer as value
  from internal_relations
  where pg_catalog.has_table_privilege(
    'anon',
    relation_name,
    'SELECT'
  )
  or pg_catalog.has_table_privilege(
    'authenticated',
    relation_name,
    'SELECT'
  )
), internal_column_privileges as (
  select count(*)::integer as value
  from internal_relations
  where pg_catalog.has_any_column_privilege(
    'anon',
    relation_name,
    'SELECT'
  )
  or pg_catalog.has_any_column_privilege(
    'authenticated',
    relation_name,
    'SELECT'
  )
), expected_rls_relations(relation_name) as (
  select relation_name from reader_relations
  union all
  select relation_name
  from internal_relations
  where relation_name in (
    'public.recipe_image_objects',
    'public.recipe_image_object_references',
    'public.storage_object_deletion_outbox',
    'public.image_upload_quota_counters'
  )
  union all
  values
    ('public.user_account_lifecycles'),
    ('storage.objects')
), rls_matrix as (
  select
    count(*)::integer as relation_count,
    count(*) filter (where relation.relrowsecurity)::integer
      as enabled_count
  from expected_rls_relations
  join pg_catalog.pg_class as relation
    on relation.oid = relation_name::pg_catalog.regclass
), policy_inventory as (
  select
    namespace.nspname || '.' || relation.relname as relation,
    policy.polname as name,
    policy.polpermissive as permissive,
    policy.polcmd as command,
    (
      select jsonb_agg(role.rolname order by role.rolname)
      from unnest(policy.polroles) as policy_role(role_oid)
      join pg_catalog.pg_roles as role
        on role.oid = policy_role.role_oid
    ) as roles,
    pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
      as qualification
  from pg_catalog.pg_policy as policy
  join pg_catalog.pg_class as relation
    on relation.oid = policy.polrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  join expected_policies as expected
    on expected.relation_name =
      namespace.nspname || '.' || relation.relname
   and expected.policy_name = policy.polname
), unexpected_reader_policies as (
  select count(*)::integer as value
  from pg_catalog.pg_policy as policy
  join pg_catalog.pg_class as relation
    on relation.oid = policy.polrelid
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  left join expected_policies as expected
    on expected.relation_name =
      namespace.nspname || '.' || relation.relname
   and expected.policy_name = policy.polname
  where namespace.nspname = 'public'
    and namespace.nspname || '.' || relation.relname in (
      select relation_name from reader_relations
    )
    and expected.policy_name is null
), guard_owner as (
  select
    role.oid,
    not role.rolcanlogin
      and not role.rolsuper
      and not role.rolcreatedb
      and not role.rolcreaterole
      and not role.rolinherit
      and not role.rolreplication
      and not role.rolbypassrls as safe_attributes
  from pg_catalog.pg_roles as role
  where role.rolname = 'homecook_recipe_visibility_guard_owner'
), guard_unexpected_memberships as (
  select count(*)::integer as value
  from pg_catalog.pg_auth_members as membership
  join guard_owner
    on guard_owner.oid = membership.roleid
  join pg_catalog.pg_roles as member_role
    on member_role.oid = membership.member
  join pg_catalog.pg_roles as grantor_role
    on grantor_role.oid = membership.grantor
  where not (
    member_role.rolname = 'postgres'
    and grantor_role.rolname = 'supabase_admin'
  )
), guard_lifecycle_boundary as (
  select
    pg_catalog.has_table_privilege(
      'homecook_recipe_visibility_guard_owner',
      'public.user_account_lifecycles',
      'SELECT'
    ) as can_select,
    (
      select count(*)::integer
      from local_table_write_privileges
      where pg_catalog.has_table_privilege(
        'homecook_recipe_visibility_guard_owner',
        'public.user_account_lifecycles',
        privilege_name
      )
    ) as table_mutation_count,
    (
      select count(*)::integer
      from local_column_write_privileges
      where pg_catalog.has_any_column_privilege(
        'homecook_recipe_visibility_guard_owner',
        'public.user_account_lifecycles',
        privilege_name
      )
    ) as column_mutation_count,
    lifecycle.relrowsecurity as rls_enabled
  from pg_catalog.pg_class as lifecycle
  where lifecycle.oid =
    'public.user_account_lifecycles'::pg_catalog.regclass
), guard_lifecycle_policy as (
  select
    policy.polpermissive as permissive,
    policy.polcmd as command,
    (
      select jsonb_agg(role.rolname order by role.rolname)
      from unnest(policy.polroles) as policy_role(role_oid)
      join pg_catalog.pg_roles as role
        on role.oid = policy_role.role_oid
    ) as roles,
    pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
      as qualification
  from pg_catalog.pg_policy as policy
  where policy.polrelid =
      'public.user_account_lifecycles'::pg_catalog.regclass
    and policy.polname = 'recipe_visibility_guard_lifecycle_select'
), lifecycle_policy_count as (
  select count(*)::integer as value
  from pg_catalog.pg_policy as policy
  where policy.polrelid =
    'public.user_account_lifecycles'::pg_catalog.regclass
), guard_function as (
  select
    procedure.prosecdef as security_definer,
    procedure.proowner = guard_owner.oid as owned_by_guard,
    procedure.provolatile as volatility,
    procedure.proisstrict as strict,
    language.lanname as language,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      as identity_arguments,
    pg_catalog.pg_get_function_result(procedure.oid) as result_type,
    procedure.prosrc as body,
    coalesce(procedure.proconfig, array[]::text[]) @> array[
      'search_path=pg_catalog, public, pg_temp'
    ] as search_path_safe
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_language as language
    on language.oid = procedure.prolang
  cross join guard_owner
  where procedure.oid = pg_catalog.to_regprocedure(
    'recipe_visibility_guard.is_owner_publicly_visible(uuid)'
  )
), capability as (
  select state, revision, current_cutover_attempt_id
  from public.account_generation_capability_state
  where singleton
), cleanup_candidates as (
  select count(*)::integer as value
  from public.user_account_lifecycles
  where status = 'cleanup_pending'
), private_bucket as (
  select
    not bucket.public
      and bucket.file_size_limit = 5242880
      and bucket.allowed_mime_types = array[
        'image/jpeg',
        'image/png',
        'image/webp'
      ]::text[] as exact
  from storage.buckets as bucket
  where bucket.id = 'recipe-images-private'
    and bucket.name = 'recipe-images-private'
), storage_select_policy as (
  select
    policy.polpermissive as permissive,
    policy.polcmd as command,
    policy.polroles = array[0::oid] as public_role,
    pg_catalog.pg_get_expr(policy.polqual, policy.polrelid)
      as qualification
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'storage.objects'::pg_catalog.regclass
    and policy.polname = 'recipe_images_public_read'
), storage_select_policy_count as (
  select count(*)::integer as value
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'storage.objects'::pg_catalog.regclass
    and policy.polcmd in ('r', '*')
), storage_write_policy_inventory as (
  select
    policy.polname as name,
    policy.polcmd as command,
    coalesce(
      (
        select jsonb_agg(role.rolname order by role.rolname)
        from unnest(policy.polroles) as policy_role(role_oid)
        join pg_catalog.pg_roles as role
          on role.oid = policy_role.role_oid
      ),
      '[]'::jsonb
    ) as roles,
    coalesce(
      pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
      ''
    ) as qualification,
    coalesce(
      pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
      ''
    ) as with_check
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'storage.objects'::pg_catalog.regclass
    and policy.polcmd in ('a', 'w', 'd', '*')
), expected_storage_write_policy(name, command) as (
  values
    ('recipe_images_insert_own', 'a'),
    ('recipe_images_update_own', 'w'),
    ('recipe_images_delete_own', 'd')
), exact_legacy_storage_write_policies as (
  select count(*)::integer as value
  from storage_write_policy_inventory as policy
  join expected_storage_write_policy as expected
    on expected.name = policy.name
   and expected.command = policy.command
  where policy.roles = '["authenticated"]'::jsonb
    and (
      policy.qualification || ' ' || policy.with_check
    ) like '%bucket_id = ''recipe-images''%'
    and (
      policy.qualification || ' ' || policy.with_check
    ) like '%storage.foldername(name%'
    and (
      policy.qualification || ' ' || policy.with_check
    ) like '%account_generation_storage_guard.allows_legacy_recipe_image_write()%'
), unexpected_storage_write_policies as (
  select count(*)::integer as value
  from storage_write_policy_inventory as policy
  left join expected_storage_write_policy as expected
    on expected.name = policy.name
   and expected.command = policy.command
  where expected.name is null
    or policy.roles <> '["authenticated"]'::jsonb
    or (
      policy.qualification || ' ' || policy.with_check
    ) not like '%bucket_id = ''recipe-images''%'
    or (
      policy.qualification || ' ' || policy.with_check
    ) not like '%storage.foldername(name%'
    or (
      policy.qualification || ' ' || policy.with_check
    ) not like '%account_generation_storage_guard.allows_legacy_recipe_image_write()%'
)
select jsonb_build_object(
  'schema_ready',
    not exists (
      select 1
      from required_relations
      where pg_catalog.to_regclass(relation_name) is null
    )
    and not exists (
      select 1
      from required_routines
      where pg_catalog.to_regprocedure(routine_name) is null
    ),
  'capability_state', (select state from capability),
  'capability_revision', (select revision from capability),
  'capability_current_cutover_attempt_id', (
    select current_cutover_attempt_id from capability
  ),
  'capability_count', (
    select count(*)::integer
    from public.account_generation_capability_state
  ),
  'watermark_count', (
    select count(*)::integer
    from public.user_account_generation_watermarks
  ),
  'lifecycle_count', (
    select count(*)::integer
    from public.user_account_lifecycles
  ),
  'cutover_attempt_count', (
    select count(*)::integer
    from public.account_generation_cutover_attempts
  ),
  'cutover_staging_count', (
    select count(*)::integer
    from public.account_generation_cutover_staging
  ),
  'reader_required_table_select_count', (
    select value from reader_required_table_selects
  ),
  'reader_tags_table_select_count', (
    select value from reader_tags_table_selects
  ),
  'reader_tags_allowed_column_select_count', (
    select value from reader_tags_allowed_column_selects
  ),
  'reader_tags_usage_count_select_count', (
    select value from reader_tags_usage_count_selects
  ),
  'reader_dml_mutation_count',
    (select value from reader_table_writes)
    + (select value from reader_column_writes),
  'internal_table_privilege_count', (
    select value from internal_table_privileges
  ),
  'internal_column_privilege_count', (
    select value from internal_column_privileges
  ),
  'local_role_matrix_ok',
    (select value = 12 from reader_required_table_selects)
    and (select value = 0 from reader_tags_table_selects)
    and (select value = 14 from reader_tags_allowed_column_selects)
    and (select value = 0 from reader_tags_usage_count_selects)
    and (
      (select value from reader_table_writes)
      + (select value from reader_column_writes)
    ) = 0
    and (select value = 0 from internal_table_privileges)
    and (select value = 0 from internal_column_privileges)
    and coalesce(
      (
        select safe_attributes from guard_owner
      ),
      false
    )
    and (select value = 0 from guard_unexpected_memberships)
    and not pg_catalog.has_schema_privilege(
      'homecook_recipe_visibility_guard_owner',
      'recipe_visibility_guard',
      'CRE' || 'ATE'
    )
    and coalesce(
      (
        select
          security_definer
          and owned_by_guard
          and search_path_safe
        from guard_function
      ),
      false
    )
    and coalesce(
      pg_catalog.has_function_privilege(
        'anon',
        'recipe_visibility_guard.is_owner_publicly_visible(uuid)',
        'EXECUTE'
      ),
      false
    )
    and coalesce(
      pg_catalog.has_function_privilege(
        'authenticated',
        'recipe_visibility_guard.is_owner_publicly_visible(uuid)',
        'EXECUTE'
      ),
      false
    )
    and not coalesce(
      pg_catalog.has_function_privilege(
        'service_role',
        'recipe_visibility_guard.is_owner_publicly_visible(uuid)',
        'EXECUTE'
      ),
      false
    ),
  'anon_direct_storage_write_count',
    (select value from unexpected_storage_write_policies),
  'authenticated_direct_storage_write_count',
    (select value from unexpected_storage_write_policies),
  'public_recipe_select', coalesce(
    pg_catalog.has_table_privilege('anon', 'public.recipes', 'SELECT'),
    false
  ),
  'rls_matrix_ok', (
    select relation_count = 13 and enabled_count = 13
    from rls_matrix
  ),
  'policy_inventory', coalesce(
    (
      select jsonb_agg(
        to_jsonb(policy_inventory)
        order by relation, name
      )
      from policy_inventory
    ),
    '[]'::jsonb
  ),
  'unexpected_reader_policy_count', (
    select value from unexpected_reader_policies
  ),
  'guard_function_volatility', (
    select volatility from guard_function
  ),
  'guard_function_strict', (
    select strict from guard_function
  ),
  'guard_function_language', (
    select language from guard_function
  ),
  'guard_function_identity_arguments', (
    select identity_arguments from guard_function
  ),
  'guard_function_result_type', (
    select result_type from guard_function
  ),
  'guard_function_body', (
    select body from guard_function
  ),
  'guard_lifecycle_select', (
    select can_select from guard_lifecycle_boundary
  ),
  'guard_unexpected_membership_count', (
    select value from guard_unexpected_memberships
  ),
  'guard_lifecycle_table_mutation_count', (
    select table_mutation_count from guard_lifecycle_boundary
  ),
  'guard_lifecycle_column_mutation_count', (
    select column_mutation_count from guard_lifecycle_boundary
  ),
  'guard_lifecycle_rls_enabled', (
    select rls_enabled from guard_lifecycle_boundary
  ),
  'guard_lifecycle_policy_count', (
    select value from lifecycle_policy_count
  ),
  'guard_lifecycle_policy', (
    select to_jsonb(guard_lifecycle_policy)
    from guard_lifecycle_policy
  ),
  'private_bucket_exact', coalesce(
    (select exact from private_bucket),
    false
  ),
  'storage_select_policy_count', (
    select value from storage_select_policy_count
  ),
  'storage_select_policy', (
    select to_jsonb(storage_select_policy)
    from storage_select_policy
  ),
  'storage_public_mutation_policy_count', (
    select value from unexpected_storage_write_policies
  ),
  'storage_legacy_write_policy_count', (
    select value from exact_legacy_storage_write_policies
  ),
  'union_zero_candidate_count', (select value from cleanup_candidates),
  'union_zero_ready_count', 0,
  'union_zero_blocked_count', (select value from cleanup_candidates),
  'local_writes', 0
);
`;

function normalizeSqlOutsideLiterals(value, { removeTextCasts = false } = {}) {
  if (typeof value !== "string") return "";

  let normalized = "";
  let inLiteral = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "'") {
      normalized += character;
      if (inLiteral && value[index + 1] === "'") {
        normalized += value[index + 1];
        index += 1;
      } else {
        inLiteral = !inLiteral;
      }
      continue;
    }
    if (!inLiteral && /\s/u.test(character)) continue;
    if (
      !inLiteral
      && removeTextCasts
      && value.startsWith("::text", index)
    ) {
      index += "::text".length - 1;
      continue;
    }
    normalized += character;
  }
  return normalized;
}

function normalizePolicyQualification(value) {
  return normalizeSqlOutsideLiterals(value, { removeTextCasts: true });
}

function normalizeFunctionBody(value) {
  return normalizeSqlOutsideLiterals(value);
}

function hasExactPolicyMatrix(policyInventory) {
  if (
    !Array.isArray(policyInventory)
    || policyInventory.length !== EXPECTED_POLICY_SHAPES.length
  ) {
    return false;
  }

  return EXPECTED_POLICY_SHAPES.every((expected) => {
    const policy = policyInventory.find(
      (candidate) =>
        candidate?.relation === expected.relation
        && candidate?.name === expected.name,
    );
    if (
      !policy
      || policy.permissive !== true
      || policy.command !== "r"
      || JSON.stringify(policy.roles) !== JSON.stringify([
        "anon",
        "authenticated",
      ])
    ) {
      return false;
    }

    return normalizePolicyQualification(policy.qualification)
      === normalizePolicyQualification(expected.qualification);
  });
}

function hasExactGuardLifecyclePolicy(policy) {
  return policy
    && policy.permissive === true
    && policy.command === "r"
    && JSON.stringify(policy.roles)
      === JSON.stringify(["homecook_recipe_visibility_guard_owner"])
    && normalizePolicyQualification(policy.qualification) === "true";
}

function hasExactStorageSelectPolicy(policy) {
  return policy
    && policy.permissive === true
    && policy.command === "r"
    && policy.public_role === true
    && normalizePolicyQualification(policy.qualification)
      === "(bucket_id='recipe-images')";
}

function parseStatusEnv(output) {
  const parsed = new Map();
  for (const line of output.split(/\r?\n/u)) {
    const match = line.match(/^([A-Z0-9_]+)="(.*)"$/u);
    if (match) parsed.set(match[1], match[2]);
  }
  return parsed;
}

function isLoopbackDatabaseHost(hostname) {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(hostname);
}

function assertLocalDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("local Supabase DB_URL is invalid");
  }

  if (
    !["postgresql:", "postgres:"].includes(url.protocol)
    || !isLoopbackDatabaseHost(url.hostname)
    || url.port.trim() === ""
  ) {
    throw new Error(
      "local Supabase DB_URL must be a loopback Postgres URL from supabase status",
    );
  }

  return url.toString();
}

export function buildRecipeVisibilityLocalVerificationPlan({ mode }) {
  if (mode !== "local-read-only") {
    throw new Error(
      `unsupported recipe visibility local verification mode: ${mode ?? "missing"}`,
    );
  }

  return {
    mode,
    readOnly: true,
    requiresLocalSupabase: true,
    requiresMergedOriginMaster: false,
    requiresCleanTrackedTree: false,
    sql: LOCAL_READ_ONLY_SQL,
  };
}

export function parseRecipeVisibilityLocalDatabaseEnvironment({ output }) {
  const parsed = parseStatusEnv(output);
  const databaseUrl = parsed.get("DB_URL");
  if (!databaseUrl) {
    throw new Error("local Supabase DB_URL is missing");
  }

  return {
    databaseUrl: assertLocalDatabaseUrl(databaseUrl),
  };
}

export function buildRecipeVisibilityLocalPsqlRequest({
  databaseUrl,
  planSql,
  baseEnvironment = process.env,
}) {
  const environment = {};
  for (const name of ["PATH", "LANG", "LC_ALL"]) {
    if (baseEnvironment[name]) environment[name] = baseEnvironment[name];
  }

  return {
    args: [
      assertLocalDatabaseUrl(databaseUrl),
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    input: [
      "begin transaction read only;",
      planSql,
      "commit;",
    ].join("\n"),
    environment,
  };
}

export function assertRecipeVisibilityLocalVerificationResult(result) {
  const valid =
    result
    && typeof result === "object"
    && !Array.isArray(result)
    && result.schema_ready === true
    && result.capability_state === "legacy"
    && Number.isInteger(result.capability_revision)
    && result.capability_revision > 0
    && result.capability_current_cutover_attempt_id === null
    && result.capability_count === 1
    && result.watermark_count === 0
    && result.lifecycle_count === 0
    && result.cutover_attempt_count === 0
    && result.cutover_staging_count === 0
    && result.local_role_matrix_ok === true
    && result.reader_required_table_select_count === 12
    && result.reader_tags_table_select_count === 0
    && result.reader_tags_allowed_column_select_count === 14
    && result.reader_tags_usage_count_select_count === 0
    && result.reader_dml_mutation_count === 0
    && result.internal_table_privilege_count === 0
    && result.internal_column_privilege_count === 0
    && result.anon_direct_storage_write_count === 0
    && result.authenticated_direct_storage_write_count === 0
    && result.public_recipe_select === true
    && result.rls_matrix_ok === true
    && result.unexpected_reader_policy_count === 0
    && hasExactPolicyMatrix(result.policy_inventory)
    && result.guard_function_volatility === "s"
    && result.guard_function_strict === false
    && result.guard_function_language === "plpgsql"
    && result.guard_function_identity_arguments === "p_owner_uuid uuid"
    && result.guard_function_result_type === "boolean"
    && normalizeFunctionBody(result.guard_function_body)
      === normalizeFunctionBody(EXPECTED_GUARD_FUNCTION_BODY)
    && result.guard_lifecycle_select === true
    && result.guard_unexpected_membership_count === 0
    && result.guard_lifecycle_table_mutation_count === 0
    && result.guard_lifecycle_column_mutation_count === 0
    && result.guard_lifecycle_rls_enabled === true
    && result.guard_lifecycle_policy_count === 1
    && hasExactGuardLifecyclePolicy(result.guard_lifecycle_policy)
    && result.private_bucket_exact === true
    && result.storage_select_policy_count === 1
    && hasExactStorageSelectPolicy(result.storage_select_policy)
    && result.storage_public_mutation_policy_count === 0
    && result.storage_legacy_write_policy_count === 3
    && result.union_zero_candidate_count === 0
    && result.union_zero_ready_count === 0
    && result.union_zero_blocked_count === 0
    && result.local_writes === 0;

  if (!valid) {
    throw new Error("local recipe visibility verification failed");
  }
}
