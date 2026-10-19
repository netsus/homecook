import { createHash } from 'node:crypto';
export const COOKING_CATALOG_SOURCE_URL = import.meta.url;

// Only these existing fixed catalog queries can use this cooking-only view.
// Their original bytes and all global/historical fences remain untouched.
const queries = new Set([
  '2e7deb2361f3311aab30aea9687af3b296780c9543b273ec71526ef9c524c399',
  '0cdb7eb817e3977a5e9b3bbefdbea7b9205d82a6045d7676a8c3faae4c4bfa65',
  '017e7b65aecc350ff69ccfc816150a9f44999c93f34b7025c0af67f126f2448a',
]);
// Entire pg_get_constraintdef values from the hash-pinned current232 dump and
// its verified restore. No substring rewriting, other table or unknown CHECK.
const checks = [
  [
    "cooking_sessions",
    "cooking_sessions_contract_namespace_check",
    "CHECK (((((contract_version)::text = 'legacy_v1'::text) AND (session_kind IS NULL) AND (recipe_id IS NULL) AND (recipe_content_snapshot_id IS NULL) AND (cooking_servings IS NULL) AND (base_recipe_revision IS NULL)) OR (((contract_version)::text = 'snapshot_v2'::text) AND ((session_kind)::text = ANY ((ARRAY['planner'::character varying, 'standalone'::character varying])::text[])) AND (recipe_id IS NOT NULL) AND (recipe_content_snapshot_id IS NOT NULL) AND (cooking_servings > 0) AND ((((session_kind)::text = 'planner'::text) AND (base_recipe_revision IS NULL)) OR (((session_kind)::text = 'standalone'::text) AND (base_recipe_revision > 0))))))",
    "CHECK (((((contract_version)::text = 'legacy_v1'::text) AND (session_kind IS NULL) AND (recipe_id IS NULL) AND (recipe_content_snapshot_id IS NULL) AND (cooking_servings IS NULL) AND (base_recipe_revision IS NULL)) OR (((contract_version)::text = 'snapshot_v2'::text) AND ((session_kind)::text = ANY (ARRAY[('planner'::character varying)::text, ('standalone'::character varying)::text])) AND (recipe_id IS NOT NULL) AND (recipe_content_snapshot_id IS NOT NULL) AND (cooking_servings > 0) AND ((((session_kind)::text = 'planner'::text) AND (base_recipe_revision IS NULL)) OR (((session_kind)::text = 'standalone'::text) AND (base_recipe_revision > 0))))))"
  ],
  [
    "cooking_sessions",
    "cooking_sessions_contract_version_check",
    "CHECK (((contract_version)::text = ANY ((ARRAY['legacy_v1'::character varying, 'snapshot_v2'::character varying])::text[])))",
    "CHECK (((contract_version)::text = ANY (ARRAY[('legacy_v1'::character varying)::text, ('snapshot_v2'::character varying)::text])))"
  ],
  [
    "meals",
    "meals_recipe_content_snapshot_origin_check",
    "CHECK ((((recipe_content_snapshot_id IS NULL) AND (recipe_content_snapshot_origin IS NULL)) OR ((recipe_content_snapshot_id IS NOT NULL) AND ((recipe_content_snapshot_origin)::text = ANY ((ARRAY['created'::character varying, 'legacy_backfill'::character varying])::text[])))))",
    "CHECK ((((recipe_content_snapshot_id IS NULL) AND (recipe_content_snapshot_origin IS NULL)) OR ((recipe_content_snapshot_id IS NOT NULL) AND ((recipe_content_snapshot_origin)::text = ANY (ARRAY[('created'::character varying)::text, ('legacy_backfill'::character varying)::text])))))"
  ],
  [
    "nutrition_values",
    "nutrition_values_check",
    "CHECK (((((value_status)::text = ANY ((ARRAY['observed'::character varying, 'estimated'::character varying])::text[])) AND (amount IS NOT NULL) AND (amount >= (0)::numeric) AND (amount <= 99999999.999999)) OR (((value_status)::text <> ALL ((ARRAY['observed'::character varying, 'estimated'::character varying])::text[])) AND (amount IS NULL))))",
    "CHECK (((((value_status)::text = ANY (ARRAY[('observed'::character varying)::text, ('estimated'::character varying)::text])) AND (amount IS NOT NULL) AND (amount >= (0)::numeric) AND (amount <= 99999999.999999)) OR (((value_status)::text <> ALL (ARRAY[('observed'::character varying)::text, ('estimated'::character varying)::text])) AND (amount IS NULL))))"
  ],
  [
    "nutrition_values",
    "nutrition_values_value_status_check",
    "CHECK (((value_status)::text = ANY ((ARRAY['observed'::character varying, 'estimated'::character varying, 'missing'::character varying, 'trace'::character varying, 'parse_error'::character varying])::text[])))",
    "CHECK (((value_status)::text = ANY (ARRAY[('observed'::character varying)::text, ('estimated'::character varying)::text, ('missing'::character varying)::text, ('trace'::character varying)::text, ('parse_error'::character varying)::text])))"
  ]
];
// Exact restore-only representation differences observed in the immutable
// current232 metadata pair. Effective defaults are substituted only here.
const defaultRelations = [
  'homecook_deploy.migrations', 'marketing_round2_deploy.receipt',
  'private.auth_flow_attempts', 'private.cooked_batch_weight_evidence',
  'private.cooked_batch_weight_evidence_control', 'private.cooked_weight_user_attestation_control',
  'private.cooked_weight_user_attestations', 'private.full_local_auth_control',
  'private.full_local_session_observability', 'private.ingredient_ai_nutrition_jobs',
  'private.ingredient_ai_nutrition_settings', 'private.manual_recipe_create_receipts',
  'private.manual_recipe_publication_images', 'private.quantity_input_v4_policy',
  'private.recipe_product_only_write_control', 'private.remote_auth_identity_epochs',
  'private.youtube_extraction_progress_stage_events', 'private.youtube_saved_recipe_result_mutations',
  'public.action_notifications', 'public.marketing_round2_events',
  'public.marketing_round2_lead_requests', 'public.marketing_round2_participations', 'public.meal_log_entries',
];
const visibleOrdinalRelations = ['auth.oauth_clients', 'auth.saml_relay_states', 'public.ingredient_synonyms'];
const literal = value => `'${value.replaceAll("'", "''")}'`;

export function canonicalCookingCatalogSql(sql) {
  if (typeof sql !== 'string' || !queries.has(createHash('sha256').update(sql).digest('hex'))) {
    throw new Error('Only the three fixed cooking catalog queries can be canonicalized');
  }
  const definition = 'pg_get_constraintdef(k.oid)';
  const cases = checks.map(([table, name, before, after]) =>
    `WHEN n.nspname='public' AND c.relname=${literal(table)} AND k.conname=${literal(name)} AND ${definition}=${literal(before)} THEN ${literal(after)}`);
  let result = sql.replaceAll(definition, `(CASE ${cases.join(' ')} ELSE ${definition} END)`);
  // Sort first so inserted default expressions are never recursively rewritten.
  for (const field of ['p.proacl', 'c.relacl', 'a.attacl', 'nspacl']) {
    const source = field === 'c.relacl'
      ? `(CASE WHEN n.nspname||'.'||c.relname IN (${defaultRelations.map(literal).join(',')}) THEN coalesce(c.relacl,acldefault('r',c.relowner)) ELSE c.relacl END)`
      : field === 'nspacl'
        ? `(CASE WHEN nspname IN ('homecook_deploy','marketing_round2_deploy') THEN coalesce(nspacl,acldefault('n',nspowner)) ELSE nspacl END)` : field;
    result = result.replaceAll(field,
      `(CASE WHEN ${source} IS NULL THEN NULL ELSE ARRAY(SELECT entry FROM unnest(${source}) entry ORDER BY entry::text COLLATE "C") END)`);
  }
  // pg_dump omits dropped columns. Preserve visible order and every visible
  // column field. The separate raw remainder still requires native attnum exact.
  const ordinal = `(CASE WHEN n.nspname||'.'||c.relname IN (${visibleOrdinalRelations.map(literal).join(',')}) THEN (SELECT count(*) FROM pg_attribute visible WHERE visible.attrelid=c.oid AND visible.attnum>0 AND NOT visible.attisdropped AND visible.attnum<=a.attnum) ELSE a.attnum END)`;
  result = result.replaceAll('jsonb_build_array(a.attnum,a.attname', `jsonb_build_array(${ordinal},a.attname`);
  return result;
}

// This separate view never canonicalizes native catalog bytes. Only the ten
// authorized function identities and the one new table may change; all other
// metadata, roles, ACL representation/order and physical column numbers remain.
const unchangedAllowedSignatures = Object.freeze([
  'private.assert_execution_completion_revision(uuid,uuid)',
  'private.record_cooked_weight_evidence(uuid,uuid,bigint,bigint,text,timestamp with time zone)',
  'private.resolve_cooked_batch_nutrition(uuid,uuid)',
  'private.resolve_execution_batch_nutrition(uuid,uuid)',
  'private.verify_full_local_internal_scope()',
  'private.verify_scope_pre_cooking_execution_20261017()',
  'public.complete_cooking_execution(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,uuid,uuid[],text,numeric,text,jsonb,boolean,bigint,timestamp with time zone)',
  'public.complete_snapshot_v2_cooking_session(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,uuid,uuid[],text,numeric,timestamp with time zone)',
  'public.read_cooking_execution_quantities(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,timestamp with time zone)',
  'public.save_cooking_execution_quantities(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,uuid,bigint,uuid,jsonb,jsonb,jsonb,jsonb,timestamp with time zone)',
]);
export function unchangedCookingCatalogSql(sql) {
  if (createHash('sha256').update(sql).digest('hex') !== '2e7deb2361f3311aab30aea9687af3b296780c9543b273ec71526ef9c524c399') {
    throw new Error('Only the fixed complete catalog query has a cooking remainder');
  }
  const omit = unchangedAllowedSignatures.map(value => `to_regprocedure(${literal(value)})`).join(',');
  return sql.replace("AND n.nspname IN ('public','private','auth'))", `AND n.nspname IN ('public','private','auth') AND NOT EXISTS (SELECT 1 FROM unnest(ARRAY[${omit}]::oid[]) allowed(oid) WHERE allowed.oid=p.oid))`)
    .replace("AND n.nspname IN ('public','private','auth','homecook_deploy','marketing_round2_deploy'))", "AND n.nspname IN ('public','private','auth','homecook_deploy','marketing_round2_deploy') AND NOT (n.nspname='private' AND c.relname='cooking_execution_quantities'))");
}
