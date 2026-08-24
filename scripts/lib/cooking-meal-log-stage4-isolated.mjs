import { spawn as spawnChild } from "node:child_process";
import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, stat, symlink } from "node:fs/promises";
import { createServer, request as requestHttp } from "node:http";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  normalizeLocalSeedProviderCode,
  normalizeLocalSeedReasonCode,
} from "./local-seed-diagnostics.mjs";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ISO_UTC_TIMESTAMP_PATTERN
  = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const STAGE4_NEGATIVE_PROBE_MAX_BODY_BYTES = 4_096;
const STAGE4_GUARDED_JWKS_MAX_BODY_BYTES = 65_536;
const STAGE4_GUARDED_JWKS_TIMEOUT_MS = 5_000;
const STAGE4_NEGATIVE_PROBE_TRANSPORT_CODES = new Set([
  "connection_refused",
  "http_response",
  "invalid_json",
  "json_response",
  "network_error",
  "not_attempted",
  "pending",
  "timeout_aborted",
]);
export const STAGE4_RESERVED_AUTH_ISSUER =
  "https://auth.stage4.homecook.invalid/auth/v1";
export const STAGE4_RESERVED_AUTH_ORIGIN =
  new URL(STAGE4_RESERVED_AUTH_ISSUER).origin;
export const STAGE4_RESERVED_AUTH_JWKS_URL =
  `${STAGE4_RESERVED_AUTH_ISSUER}/.well-known/jwks.json`;
const STAGE4_CAPTURE_MODE = "1";

export const STAGE4_SUPABASE_CLI_VERSION = "2.109.1";
export const STAGE4_SUPABASE_CLI_PACKAGE =
  `supabase@${STAGE4_SUPABASE_CLI_VERSION}`;

const STAGE4_PRE_REQUEST_GUARD =
  "pgrst.db_pre_request=public.verify_hybrid_request_authority_pre_request";

export const STAGE4_PRIMARY_GUARD_VERIFY_SQL = [
  "SELECT config",
  "FROM pg_roles",
  "CROSS JOIN LATERAL unnest(rolconfig) AS config",
  "WHERE rolname = 'authenticator'",
  `  AND config = '${STAGE4_PRE_REQUEST_GUARD}';`,
].join("\n");

export const STAGE4_RUNTIME_AUTHORITY_VERIFY_SQL = [
  "SELECT concat_ws('|',",
  "  control.authority,",
  "  capability.state,",
  "  coalesce(control.local_issuer, '')",
  ")",
  "FROM private.full_local_auth_control AS control",
  "CROSS JOIN public.account_generation_capability_state AS capability",
  "WHERE control.singleton AND capability.singleton;",
].join("\n");

const STAGE4_PERSONAL_OWNER_SOURCE_SQL = [
  "select user_id from (",
  "  select owner_uuid::text as user_id from public.auth_identity_deletion_outbox where owner_uuid is not null",
  "  union",
  "  select owner_uuid::text as user_id from public.image_upload_quota_counters where owner_uuid is not null",
  "  union",
  "  select owner_uuid::text as user_id from public.mutation_idempotency_keys where owner_uuid is not null",
  "  union",
  "  select owner_uuid::text as user_id from public.recipe_image_legacy_positive_references where owner_uuid is not null",
  "  union",
  "  select owner_uuid::text as user_id from public.recipe_image_legacy_visibility_targets where owner_uuid is not null",
  "  union",
  "  select owner_uuid::text as user_id from public.recipe_image_objects where owner_uuid is not null",
  "  union",
  "  select owner_uuid::text as user_id from public.storage_object_deletion_outbox where owner_uuid is not null",
  "  union",
  "  select owner_uuid::text as user_id from public.user_account_generation_watermarks where owner_uuid is not null",
  "  union",
  "  select owner_uuid::text as user_id from public.user_account_lifecycles where owner_uuid is not null",
  "  union",
  "  select owner_uuid::text as user_id from public.user_session_generation_bindings where owner_uuid is not null",
  ") as personal_owner_union",
].join("\n");

export function buildStage4CanonicalActivationSql({
  localIssuer = STAGE4_RESERVED_AUTH_ISSUER,
} = {}) {
  if (localIssuer !== STAGE4_RESERVED_AUTH_ISSUER) {
    throw new Error("Stage 4 canonical activation must use the reserved issuer");
  }

  return [
    "begin;",
    "create temporary table pg_temp.stage4_canonical_activation_result (payload jsonb not null) on commit drop;",
    "do $stage4_rehearsal$",
    "declare",
    "  v_attempt_id uuid := gen_random_uuid();",
    "  v_capability_state_before text;",
    "  v_capability_revision_before bigint;",
    "  v_capability_state_after text;",
    "  v_capability_revision_after bigint;",
    "  v_generation_activated_at timestamptz;",
    "  v_auth_authority_before text;",
    "  v_auth_authority_after text;",
    "  v_auth_cutover_epoch_before bigint;",
    "  v_auth_cutover_epoch_after bigint;",
    "  v_hmac_key_version_before integer;",
    "  v_hmac_key_version_after integer;",
    "  v_auth_count bigint;",
    "  v_auth_digest text;",
    "  v_public_count bigint;",
    "  v_public_digest text;",
    "  v_staged_owner_count bigint;",
    "  v_staged_owner_digest text;",
    "  v_intersection_count bigint;",
    "  v_auth_only_count bigint;",
    "  v_public_only_count bigint;",
    "  v_unexpected_owner_signal_count bigint;",
    "  v_recipe_image_nonterminal_count bigint;",
    "  v_storage_delete_nonterminal_count bigint;",
    "  v_storage_terminal boolean;",
    "  v_cutover_started_at timestamptz;",
    "  v_expired_count bigint;",
    "  v_outstanding_count bigint;",
    "  v_start_cutover jsonb;",
    "  v_activate_authority jsonb;",
    "  v_new_hmac_key_version integer;",
    "  stage_owner record;",
    "begin",
    "  perform set_config('request.jwt.claims', '{\"role\":\"service_role\"}', true);",
    "",
    "  select capability.state, capability.revision",
    "    into v_capability_state_before, v_capability_revision_before",
    "  from public.account_generation_capability_state as capability",
    "  where capability.singleton;",
    "",
    "  select control.authority, control.cutover_epoch, control.hmac_key_version",
    "    into v_auth_authority_before, v_auth_cutover_epoch_before, v_hmac_key_version_before",
    "  from private.full_local_auth_control as control",
    "  where control.singleton;",
    "",
    "  if v_capability_state_before is distinct from 'legacy' then",
    "    raise exception 'STAGE4_REHEARSAL_BLOCKER unexpected account generation state: %', v_capability_state_before",
    "      using errcode = '55000';",
    "  end if;",
    "  if v_auth_authority_before is distinct from 'remote' then",
    "    raise exception 'STAGE4_REHEARSAL_BLOCKER unexpected full-local auth authority: %', v_auth_authority_before",
    "      using errcode = '55000';",
    "  end if;",
    "",
    "  with auth_users as (",
    "    select",
    "      auth_user.id::text as user_id,",
    "      to_char(",
    "        auth_user.created_at at time zone 'UTC',",
    "        'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"'",
    "      ) as created_at_snapshot",
    "    from auth.users as auth_user",
    "  ),",
    "  public_users as (",
    "    select public_user.id::text as user_id",
    "    from public.users as public_user",
    "  ),",
    "  staged_owner_union as (",
    "    select",
    "      coalesce(auth_users.user_id, public_users.user_id) as user_id,",
    "      auth_users.created_at_snapshot,",
    "      case",
    "        when auth_users.user_id is not null and public_users.user_id is not null",
    "          then 'activate'",
    "        when auth_users.user_id is not null",
    "          then 'quarantine'",
    "        when public_users.user_id is not null",
    "          then 'quarantine'",
    "        else null",
    "      end as proposed_action,",
    "      case",
    "        when auth_users.user_id is not null and public_users.user_id is not null",
    "          then 'active_candidate'",
    "        when auth_users.user_id is not null",
    "          then 'auth_without_profile_quarantined'",
    "        when public_users.user_id is not null",
    "          then 'public_without_auth_quarantined'",
    "        else 'classification_unresolved'",
    "      end as classification,",
    "      case",
    "        when auth_users.user_id is not null and public_users.user_id is not null",
    "          then 'auth_public_intersection'",
    "        else null",
    "      end as evidence_type",
    "    from auth_users",
    "    full join public_users using (user_id)",
    "  ),",
    `  personal_owner_union as (${STAGE4_PERSONAL_OWNER_SOURCE_SQL}),`,
    "  personal_owner_outside_union as (",
    "    select personal_owner.user_id",
    "    from personal_owner_union as personal_owner",
    "    left join staged_owner_union as staged_owner",
    "      on staged_owner.user_id = personal_owner.user_id",
    "    where staged_owner.user_id is null",
    "  )",
    "  select",
    "    (select count(*) from auth_users),",
    "    (select encode(",
    "      extensions.digest(",
    "        convert_to(",
    "          coalesce(",
    "            string_agg(",
    "              auth_users.user_id || ':' || auth_users.created_at_snapshot,",
    "              E'\\n'",
    "              order by auth_users.user_id",
    "            ),",
    "            ''",
    "          ),",
    "          'UTF8'",
    "        ),",
    "        'sha256'",
    "      ),",
    "      'hex'",
    "    ) from auth_users),",
    "    (select count(*) from public_users),",
    "    (select encode(",
    "      extensions.digest(",
    "        convert_to(",
    "          coalesce(",
    "            string_agg(public_users.user_id, E'\\n' order by public_users.user_id),",
    "            ''",
    "          ),",
    "          'UTF8'",
    "        ),",
    "        'sha256'",
    "      ),",
    "      'hex'",
    "    ) from public_users),",
    "    (select count(*) from staged_owner_union),",
    "    (select encode(",
    "      extensions.digest(",
    "        convert_to(",
    "          coalesce(",
    "            string_agg(staged_owner_union.user_id, E'\\n' order by staged_owner_union.user_id),",
    "            ''",
    "          ),",
    "          'UTF8'",
    "        ),",
    "        'sha256'",
    "      ),",
    "      'hex'",
    "    ) from staged_owner_union),",
    "    (select count(*) from staged_owner_union where classification = 'active_candidate'),",
    "    (select count(*) from staged_owner_union where classification = 'auth_without_profile_quarantined'),",
    "    (select count(*) from staged_owner_union where classification = 'public_without_auth_quarantined'),",
    "    (select count(*) from personal_owner_outside_union)",
    "  into",
    "    v_auth_count,",
    "    v_auth_digest,",
    "    v_public_count,",
    "    v_public_digest,",
    "    v_staged_owner_count,",
    "    v_staged_owner_digest,",
    "    v_intersection_count,",
    "    v_auth_only_count,",
    "    v_public_only_count,",
    "    v_unexpected_owner_signal_count;",
    "",
    "  select",
    "    count(*),",
    "    (",
    "      select count(*)",
    "      from public.storage_object_deletion_outbox as outbox",
    "      where outbox.state not in ('succeeded', 'dead_letter')",
    "    )",
    "  into v_recipe_image_nonterminal_count, v_storage_delete_nonterminal_count",
    "  from public.recipe_image_objects as registry",
    "  where registry.state in (",
    "    'pending_upload',",
    "    'uploaded_unlinked',",
    "    'cleanup_pending',",
    "    'not_found_observed'",
    "  );",
    "",
    "  v_storage_terminal := v_recipe_image_nonterminal_count = 0",
    "    and v_storage_delete_nonterminal_count = 0;",
    "",
    "  if v_unexpected_owner_signal_count <> 0 then",
    "    raise exception 'STAGE4_REHEARSAL_BLOCKER unexpected owner signal remains outside auth/public union (%)', v_unexpected_owner_signal_count",
    "      using errcode = '55000';",
    "  end if;",
    "  if not v_storage_terminal then",
    "    raise exception 'STAGE4_REHEARSAL_BLOCKER storage terminal evidence is incomplete'",
    "      using errcode = '55000';",
    "  end if;",
    "",
    "  v_start_cutover := public.begin_account_generation_cutover(",
    "    v_attempt_id,",
    "    v_capability_revision_before",
    "  );",
    "",
    "  for stage_owner in",
    "    with auth_users as (",
    "      select",
    "        auth_user.id::text as user_id,",
    "        auth_user.created_at as created_at_snapshot",
    "      from auth.users as auth_user",
    "    ),",
    "    public_users as (",
    "      select public_user.id::text as user_id",
    "      from public.users as public_user",
    "    )",
    "    select",
    "      coalesce(auth_users.user_id, public_users.user_id)::uuid as owner_uuid,",
    "      auth_users.created_at_snapshot as auth_identity_created_at_snapshot,",
    "      coalesce((",
    "        select watermark.last_account_generation",
    "        from public.user_account_generation_watermarks as watermark",
    "        where watermark.owner_uuid = coalesce(auth_users.user_id, public_users.user_id)::uuid",
    "      ), 0) + 1 as proposed_account_generation,",
    "      case",
    "        when auth_users.user_id is not null and public_users.user_id is not null",
    "          then 'activate'",
    "        else 'quarantine'",
    "      end as proposed_action,",
    "      case",
    "        when auth_users.user_id is not null and public_users.user_id is not null",
    "          then 'active_candidate'",
    "        when auth_users.user_id is not null",
    "          then 'auth_without_profile_quarantined'",
    "        else 'public_without_auth_quarantined'",
    "      end as classification,",
    "      case",
    "        when auth_users.user_id is not null and public_users.user_id is not null",
    "          then 'auth_public_intersection'",
    "        else null",
    "      end as evidence_type",
    "    from auth_users",
    "    full join public_users using (user_id)",
    "    order by coalesce(auth_users.user_id, public_users.user_id)",
    "  loop",
    "    perform public.stage_account_generation_cutover_owner(",
    "      v_attempt_id,",
    "      (v_start_cutover ->> 'revision')::bigint,",
    "      stage_owner.owner_uuid,",
    "      stage_owner.auth_identity_created_at_snapshot,",
    "      stage_owner.proposed_account_generation,",
    "      stage_owner.proposed_action,",
    "      stage_owner.classification,",
    "      stage_owner.evidence_type,",
    "      null,",
    "      'validated'",
    "    );",
    "  end loop;",
    "",
    "  perform public.set_account_generation_cutover_snapshot(",
    "    v_attempt_id,",
    "    (v_start_cutover ->> 'revision')::bigint,",
    "    v_auth_count,",
    "    v_auth_digest,",
    "    v_public_count,",
    "    v_public_digest,",
    "    v_staged_owner_count,",
    "    v_staged_owner_digest,",
    "    'auth_table_lock',",
    "    jsonb_build_object(",
    "      'verified', true,",
    "      'storage_terminal', v_storage_terminal,",
    "      'owner_signal_union_zero', v_unexpected_owner_signal_count = 0",
    "    )",
    "  );",
    "",
    "  perform public.promote_account_generation_cutover(",
    "    v_attempt_id,",
    "    (v_start_cutover ->> 'revision')::bigint,",
    "    v_auth_count,",
    "    v_auth_digest,",
    "    v_public_count,",
    "    v_public_digest,",
    "    v_staged_owner_count,",
    "    v_staged_owner_digest",
    "  );",
    "",
    "  perform public.start_full_local_auth_cutover(",
    "    v_auth_count,",
    "    v_auth_digest,",
    "    clock_timestamp()",
    "  );",
    "",
    "  select control.cutover_started_at",
    "    into v_cutover_started_at",
    "  from private.full_local_auth_control as control",
    "  where control.singleton;",
    "",
    "  select",
    "    coalesce((result ->> 'expired_count')::bigint, 0),",
    "    coalesce((result ->> 'outstanding_count')::bigint, 0)",
    "  into v_expired_count, v_outstanding_count",
    "  from (",
    "    select public.expire_and_count_remote_auth_flows(",
    "      v_cutover_started_at,",
    "      clock_timestamp()",
    "    ) as result",
    "  ) as auth_flow_drain;",
    "",
    "  if v_outstanding_count <> 0 then",
    "    raise exception 'STAGE4_REHEARSAL_BLOCKER remote auth flow drain left % outstanding flow(s)', v_outstanding_count",
    "      using errcode = '55000';",
    "  end if;",
    "",
    "  v_new_hmac_key_version := v_hmac_key_version_before + 1;",
    "  v_activate_authority := public.activate_full_local_auth_authority(",
    "    v_auth_cutover_epoch_before,",
    "    v_new_hmac_key_version,",
    `    '${STAGE4_RESERVED_AUTH_ISSUER}',`,
    "    clock_timestamp()",
    "  );",
    "",
    "  select",
    "    capability.state,",
    "    capability.revision,",
    "    capability.activated_at",
    "  into",
    "    v_capability_state_after,",
    "    v_capability_revision_after,",
    "    v_generation_activated_at",
    "  from public.account_generation_capability_state as capability",
    "  where capability.singleton;",
    "",
    "  select",
    "    control.authority,",
    "    control.cutover_epoch,",
    "    control.hmac_key_version",
    "  into",
    "    v_auth_authority_after,",
    "    v_auth_cutover_epoch_after,",
    "    v_hmac_key_version_after",
    "  from private.full_local_auth_control as control",
    "  where control.singleton;",
    "",
    "  insert into pg_temp.stage4_canonical_activation_result(payload)",
    "  values (jsonb_build_object(",
    "    'mode', 'rehearsal_only',",
    "    'account_generation_capability', v_capability_state_after,",
    "    'auth_authority', v_auth_authority_after,",
    "    'local_issuer', v_activate_authority ->> 'local_issuer',",
    "    'auth_counts', jsonb_build_object(",
    "      'intersection', v_intersection_count,",
    "      'auth_only', v_auth_only_count,",
    "      'public_only', v_public_only_count",
    "    ),",
    "    'owner_counts', jsonb_build_object(",
    "      'staged', v_staged_owner_count,",
    "      'unexpected_outside_union', v_unexpected_owner_signal_count",
    "    ),",
    "    'auth_flow_counts', jsonb_build_object(",
    "      'expired', v_expired_count,",
    "      'outstanding', v_outstanding_count",
    "    ),",
    "    'guard_evidence', jsonb_build_object(",
    "      'storage_terminal', v_storage_terminal,",
    "      'owner_signal_union_zero', v_unexpected_owner_signal_count = 0",
    "    ),",
    "    'verification', jsonb_build_object(",
    "      'auth_digest_verified', true,",
    "      'public_digest_verified', true,",
    "      'staged_owner_digest_verified', true",
    "    ),",
    "    'cutover', jsonb_build_object(",
    "      'capability_revision_before', v_capability_revision_before,",
    "      'capability_revision_after', v_capability_revision_after,",
    "      'auth_cutover_epoch_before', v_auth_cutover_epoch_before,",
    "      'auth_cutover_epoch_after', v_auth_cutover_epoch_after,",
    "      'hmac_key_version_before', v_hmac_key_version_before,",
    "      'hmac_key_version_after', v_hmac_key_version_after",
    "    )",
    "  ));",
    "",
    "  if v_generation_activated_at is null then",
    "    raise exception 'STAGE4_REHEARSAL_BLOCKER generation activation timestamp is missing'",
    "      using errcode = '55000';",
    "  end if;",
    "end;",
    "$stage4_rehearsal$;",
    "",
    "select payload from pg_temp.stage4_canonical_activation_result;",
    "commit;",
  ].join("\n");
}

export function assertStage4CanonicalActivationOutput(output) {
  let parsed;
  try {
    const jsonLines = typeof output === "string"
      ? output.split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("{") && line.endsWith("}"))
      : [];
    if (jsonLines.length !== 1) throw new Error("invalid activation output");
    parsed = JSON.parse(jsonLines[0]);
  } catch {
    const error = new Error(
      "Stage 4 canonical activation rehearsal did not return valid JSON",
    );
    error.code = "local_session_authority_unavailable";
    error.safeFailure = {
      code: "local_session_authority_unavailable",
      message: "Stage 4 local session authority is not active",
    };
    throw error;
  }

  const isExpectedInteger = (value) =>
    Number.isInteger(value) && value >= 0;
  const isTrue = (value) => value === true;

  const valid = parsed?.mode === "rehearsal_only"
    && parsed?.account_generation_capability === "generation_active"
    && parsed?.auth_authority === "local"
    && parsed?.local_issuer === STAGE4_RESERVED_AUTH_ISSUER
    && isExpectedInteger(parsed?.auth_counts?.intersection)
    && isExpectedInteger(parsed?.auth_counts?.auth_only)
    && isExpectedInteger(parsed?.auth_counts?.public_only)
    && isExpectedInteger(parsed?.owner_counts?.staged)
    && parsed?.owner_counts?.unexpected_outside_union === 0
    && isExpectedInteger(parsed?.auth_flow_counts?.expired)
    && parsed?.auth_flow_counts?.outstanding === 0
    && isTrue(parsed?.guard_evidence?.storage_terminal)
    && isTrue(parsed?.guard_evidence?.owner_signal_union_zero)
    && isTrue(parsed?.verification?.auth_digest_verified)
    && isTrue(parsed?.verification?.public_digest_verified)
    && isTrue(parsed?.verification?.staged_owner_digest_verified)
    && Number.isInteger(parsed?.cutover?.capability_revision_before)
    && Number.isInteger(parsed?.cutover?.capability_revision_after)
    && parsed.cutover.capability_revision_after
      > parsed.cutover.capability_revision_before
    && Number.isInteger(parsed?.cutover?.auth_cutover_epoch_before)
    && Number.isInteger(parsed?.cutover?.auth_cutover_epoch_after)
    && parsed.cutover.auth_cutover_epoch_after
      > parsed.cutover.auth_cutover_epoch_before
    && Number.isInteger(parsed?.cutover?.hmac_key_version_before)
    && Number.isInteger(parsed?.cutover?.hmac_key_version_after)
    && parsed.cutover.hmac_key_version_after
      > parsed.cutover.hmac_key_version_before;

  if (valid) return parsed;

  const message = parsed?.auth_flow_counts?.outstanding > 0
    ? "Stage 4 auth flow rehearsal left outstanding remote flows"
    : "Stage 4 canonical activation rehearsal did not reach the expected local authority state";
  const error = new Error(message);
  error.code = "local_session_authority_unavailable";
  error.safeFailure = {
    code: "local_session_authority_unavailable",
    message: "Stage 4 local session authority is not active",
  };
  throw error;
}

export function assertStage4RuntimeAuthorityOutput(output) {
  const [authAuthority, accountGenerationCapability, localIssuer, ...rest] =
    typeof output === "string" ? output.trim().split("|") : [];
  if (
    rest.length === 0
    && authAuthority === "local"
    && accountGenerationCapability === "generation_active"
    && localIssuer === STAGE4_RESERVED_AUTH_ISSUER
  ) {
    return {
      account_generation_capability: accountGenerationCapability,
      auth_authority: authAuthority,
      local_issuer_ready: true,
    };
  }

  const code = "local_session_authority_unavailable";
  const message = "Stage 4 local session authority is not active";
  const error = new Error(message);
  error.code = code;
  error.safeFailure = { code, message };
  throw error;
}

export const STAGE4_CACHED_DOCKER_IMAGES = Object.freeze({
  gotrue: "public.ecr.aws/supabase/gotrue:v2.192.0",
  imgproxy: "public.ecr.aws/supabase/imgproxy:v3.8.0",
  kong: "public.ecr.aws/supabase/kong:2.8.1",
  postgres: "public.ecr.aws/supabase/postgres:17.6.1.143",
  postgrest: "public.ecr.aws/supabase/postgrest:v14.14",
  storage: "public.ecr.aws/supabase/storage-api:v1.62.5",
});

const STAGE4_IMAGE_REQUIREMENT_ORDER = Object.freeze([
  ["postgres", null],
  ["gotrue", "gotrue"],
  ["postgrest", "postgrest"],
  ["kong", "kong"],
  ["storage", "storage-api"],
  ["imgproxy", "imgproxy"],
]);

const MISSING_IMAGE_FAILURE = Object.freeze({
  code: "missing_image",
  message: "required Stage 4 Docker image is not cached",
});

function buildStage4BrowserCaptureFailure(code) {
  const messages = {
    browser_capture_failed: "Stage 4 browser capture command failed",
    browser_capture_start_failed:
      "Stage 4 browser capture command failed to start",
    browser_capture_timeout: "Stage 4 browser capture command timed out",
  };
  const message = messages[code] ?? messages.browser_capture_failed;
  const error = new Error(message);
  error.code = code;
  error.safeFailure = { code, message };
  return error;
}

/**
 * @param {{
 *   args: string[],
 *   command: string,
 *   cwd: string,
 *   env: Record<string, string | undefined>,
 *   killGraceMs?: number,
 *   spawnImpl?: typeof spawnChild,
 *   timeoutMs: number,
 * }} options
 */
export function runStage4BrowserCaptureCommand({
  args,
  command,
  cwd,
  env,
  killGraceMs = 5_000,
  spawnImpl = spawnChild,
  timeoutMs,
}) {
  if (
    typeof command !== "string"
    || command.length === 0
    || !Array.isArray(args)
    || typeof cwd !== "string"
    || cwd.length === 0
    || !env
    || typeof env !== "object"
    || !Number.isInteger(timeoutMs)
    || timeoutMs < 1
    || !Number.isInteger(killGraceMs)
    || killGraceMs < 1
    || typeof spawnImpl !== "function"
  ) {
    throw new Error("Stage 4 browser capture command options are invalid");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let forceKillTimer = null;
    const child = spawnImpl(command, args, {
      cwd,
      env,
      stdio: "inherit",
    });
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(forceKillTimer);
      if (error) reject(error);
      else resolve();
    };
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, killGraceMs);
    }, timeoutMs);

    child.once("error", () => {
      finish(buildStage4BrowserCaptureFailure(
        "browser_capture_start_failed",
      ));
    });
    child.once("close", (code) => {
      if (timedOut) {
        finish(buildStage4BrowserCaptureFailure("browser_capture_timeout"));
        return;
      }
      if (code !== 0) {
        finish(buildStage4BrowserCaptureFailure("browser_capture_failed"));
        return;
      }
      finish();
    });
  });
}

export function buildStage4NavigationOptions() {
  return {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  };
}

const STAGE4_QA_FIXTURE_SCOPE = Object.freeze([
  "ACCOUNT_QUARANTINE:auth-absent",
]);

export function buildStage4QaFixtureScope() {
  return [...STAGE4_QA_FIXTURE_SCOPE];
}

export function buildStage4AccountQuarantineFixtureCookie(baseUrl) {
  const origin = assertExactLoopbackHttpOrigin(
    baseUrl,
    "Stage 4 account quarantine fixture origin",
  ).origin;
  return {
    name: "homecook.qa-account-quarantine-state",
    sameSite: "Lax",
    secure: false,
    url: origin,
    value: "auth-absent",
  };
}

export function parseStage4CaptureArgs(
  argv,
  {
    defaultBaseUrl = "http://127.0.0.1:3000",
    env = process.env,
  } = {},
) {
  const result = {
    attemptId: env.HOMECOOK_CML14_CAPTURE_ATTEMPT_ID ?? null,
    baseUrl: env.BASE_URL ?? defaultBaseUrl,
    targetAttestation: env.HOMECOOK_CML14_TARGET_ATTESTATION ?? null,
  };
  const optionTargets = new Map([
    ["--attempt-id", "attemptId"],
    ["--base-url", "baseUrl"],
    ["--target-attestation", "targetAttestation"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--") continue;

    const target = optionTargets.get(value);
    const next = argv[index + 1];
    if (target) {
      if (typeof next !== "string" || next.startsWith("--")) {
        throw new Error(`Stage 4 capture option requires a value: ${value}`);
      }
      result[target] = next;
      index += 1;
      continue;
    }
    if (
      typeof value === "string"
      && value.startsWith("--")
      && typeof next === "string"
      && !next.startsWith("--")
    ) {
      index += 1;
    }
  }
  return result;
}

function isSameOrDescendant(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === ""
    || (!relative.startsWith(`..${path.sep}`)
      && relative !== ".."
      && !path.isAbsolute(relative));
}

async function assertStage4Directory(source, label) {
  let metadata;
  try {
    metadata = await stat(source);
  } catch {
    throw new Error(`Stage 4 ${label} source directory is unavailable`);
  }
  if (!metadata.isDirectory()) {
    throw new Error(`Stage 4 ${label} source directory is unavailable`);
  }
}

async function assertStage4PathAbsent(target, label) {
  try {
    await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw new Error(`Stage 4 ${label} target could not be verified`);
  }
  throw new Error(`Stage 4 ${label} target must be absent`);
}

export async function linkStage4SeedInputs({
  isolatedRoot,
  repositoryRoot,
}) {
  if (
    typeof isolatedRoot !== "string"
    || typeof repositoryRoot !== "string"
    || !path.isAbsolute(isolatedRoot)
    || !path.isAbsolute(repositoryRoot)
    || isSameOrDescendant(repositoryRoot, isolatedRoot)
    || isSameOrDescendant(isolatedRoot, repositoryRoot)
  ) {
    throw new Error("Stage 4 seed input roots must be separate absolute paths");
  }

  const sourceScripts = path.join(repositoryRoot, "scripts");
  const sourceFixtures = path.join(repositoryRoot, "qa", "fixtures");
  const targetScripts = path.join(isolatedRoot, "scripts");
  const targetQa = path.join(isolatedRoot, "qa");
  const targetFixtures = path.join(targetQa, "fixtures");

  await Promise.all([
    assertStage4Directory(sourceScripts, "scripts"),
    assertStage4Directory(sourceFixtures, "QA fixtures"),
    assertStage4PathAbsent(targetScripts, "scripts"),
    assertStage4PathAbsent(targetQa, "QA"),
  ]);
  await mkdir(targetQa, { mode: 0o700 });
  await symlink(sourceFixtures, targetFixtures, "dir");
  await symlink(sourceScripts, targetScripts, "dir");

  return {
    fixtures: targetFixtures,
    scripts: targetScripts,
  };
}

export function assertStage4SupabaseCliVersion(output) {
  const actual = String(output ?? "").trim().replace(/^v/u, "");
  if (actual !== STAGE4_SUPABASE_CLI_VERSION) {
    throw new Error(
      `Stage 4 Supabase CLI must be ${STAGE4_SUPABASE_CLI_VERSION}, received ${actual || "unknown"}`,
    );
  }
  return actual;
}

const TARGET_ENV_KEYS = [
  "AUTH_SUPABASE_EXPECTED_ISSUER",
  "AUTH_SUPABASE_JWKS_URL",
  "HOMECOOK_DATA_AUTHORITY",
  "DATA_SUPABASE_URL",
  "DATA_SUPABASE_PUBLISHABLE_KEY",
  "DATA_SUPABASE_SECRET_KEY",
  "HOMECOOK_AUTH_AUTHORITY",
  "HOMECOOK_STAGE4_CAPTURE_MODE",
  "NEXT_PUBLIC_AUTH_SUPABASE_URL",
  "NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY",
  "LOCAL_SUPABASE_INTERNAL_URL",
  "LOCAL_SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
];
const STAGE4_SERVICE_PROFILES = Object.freeze({
  db: Object.freeze([]),
  auth: Object.freeze(["gotrue"]),
  rest: Object.freeze(["postgrest"]),
  "rest-auth": Object.freeze(["gotrue", "postgrest"]),
  gateway: Object.freeze(["kong", "postgrest"]),
  api: Object.freeze(["gotrue", "kong", "postgrest"]),
  storage: Object.freeze([
    "gotrue",
    "kong",
    "postgrest",
    "storage-api",
    "imgproxy",
  ]),
  full: Object.freeze([
    "gotrue",
    "kong",
    "postgrest",
    "storage-api",
    "imgproxy",
  ]),
});

const DOCKER_STATE_VALUES = new Set([
  "created",
  "running",
  "paused",
  "restarting",
  "removing",
  "exited",
  "dead",
]);
const DOCKER_HEALTH_VALUES = new Set([
  "starting",
  "healthy",
  "unhealthy",
  "missing",
]);

function safeDockerToken(value, allowed = null) {
  if (typeof value !== "string" || !/^[a-z0-9_-]{1,64}$/u.test(value)) {
    return "unknown";
  }
  if (allowed && !allowed.has(value)) return "unknown";
  return value;
}

export function buildStage4FailureResourceSnapshot({ projectId, resources }) {
  if (typeof projectId !== "string" || projectId.length === 0) {
    throw new Error("Stage 4 diagnostic project id is required");
  }
  if (!Array.isArray(resources)) {
    throw new Error("Stage 4 diagnostic container resources are required");
  }

  const containers = resources.map((resource) => {
    const labels = resource?.Config?.Labels ?? {};
    if (labels["com.docker.compose.project"] !== projectId) {
      throw new Error("Stage 4 diagnostic container belongs to another project");
    }
    const restartCount = Number.isInteger(resource?.RestartCount)
      && resource.RestartCount >= 0
      ? resource.RestartCount
      : 0;
    return {
      health: safeDockerToken(
        resource?.State?.Health?.Status ?? "missing",
        DOCKER_HEALTH_VALUES,
      ),
      oom_killed: resource?.State?.OOMKilled === true,
      restart_count: restartCount,
      service: safeDockerToken(
        labels["com.docker.compose.service"],
      ),
      state: safeDockerToken(
        resource?.State?.Status,
        DOCKER_STATE_VALUES,
      ),
    };
  }).sort((left, right) => left.service.localeCompare(right.service));

  return {
    collection_status: "passed",
    containers,
  };
}

export function assertStage4OwnedDatabaseContainer({ containers, projectId }) {
  const expectedName = `supabase_db_${projectId}`;
  const matches = Array.isArray(containers)
    ? containers.filter((container) =>
      container?.name === expectedName
      && container?.project === projectId
      && typeof container?.id === "string"
      && container.id.length > 0
    )
    : [];
  if (!/^hcg_[a-z0-9_]+$/u.test(projectId ?? "") || matches.length !== 1) {
    throw new Error("Stage 4 owned disposable database container is required");
  }
  return matches[0].id;
}

export function assertStage4PreRequestGuardOutput(output) {
  if (typeof output !== "string" || output.trim() !== STAGE4_PRE_REQUEST_GUARD) {
    throw new Error("Stage 4 pre-request guard verification failed");
  }
  return true;
}

export function assertStage4NegativeProbeResult({ payload, status }) {
  if (
    !Number.isInteger(status)
    || status < 400
    || payload?.code !== "55000"
    || payload?.message !== "ACCOUNT_SESSION_STALE"
  ) {
    throw new Error("Stage 4 primary guard negative probe failed");
  }
  return true;
}

function classifyStage4NegativeProbeTransportError(error, signal) {
  if (
    signal?.aborted
    || error?.name === "AbortError"
    || error?.name === "TimeoutError"
  ) {
    return "timeout_aborted";
  }
  if (error?.code === "ECONNREFUSED" || error?.cause?.code === "ECONNREFUSED") {
    return "connection_refused";
  }
  return "network_error";
}

async function readStage4NegativeProbeText(response) {
  if (response?.body === null || response?.body === undefined) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let cancelled = false;
  let completed = false;
  let size = 0;
  try {
    while (size < STAGE4_NEGATIVE_PROBE_MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      const remaining = STAGE4_NEGATIVE_PROBE_MAX_BODY_BYTES - size;
      const bounded = value.byteLength > remaining
        ? value.subarray(0, remaining)
        : value;
      chunks.push(Buffer.from(bounded));
      size += bounded.byteLength;
      if (value.byteLength > remaining) {
        await reader.cancel();
        cancelled = true;
        break;
      }
    }
    if (!completed && !cancelled && size >= STAGE4_NEGATIVE_PROBE_MAX_BODY_BYTES) {
      await reader.cancel();
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // The caller classifies the already-redacted transport failure.
    }
    throw error;
  }
  return Buffer.concat(chunks).toString("utf8");
}

function safeStage4NegativeProbePayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rawProviderCode = value.code;
  return {
    code: normalizeLocalSeedProviderCode(rawProviderCode),
    message: value.message === "ACCOUNT_SESSION_STALE"
      ? "ACCOUNT_SESSION_STALE"
      : "unknown",
    raw_code_is_exact: typeof rawProviderCode === "string"
      && rawProviderCode === "55000",
  };
}

/**
 * @param {{
 *   apiUrl: string | URL,
 *   fetchImpl?: typeof fetch,
 *   onObservation?: (observation: {status: number | null, transportCode: string}) => void,
 *   serviceRoleKey: string,
 *   signal?: AbortSignal,
 * }} options
 */
export async function requestStage4NegativeProbe({
  apiUrl,
  fetchImpl = fetch,
  onObservation = () => {},
  serviceRoleKey,
  signal = undefined,
}) {
  if (
    typeof fetchImpl !== "function"
    || typeof onObservation !== "function"
    || typeof serviceRoleKey !== "string"
    || serviceRoleKey.length === 0
  ) {
    throw new Error("Stage 4 negative probe request dependencies are invalid");
  }
  const target = new URL("/rest/v1/users?select=id&limit=1", apiUrl);
  let status = null;
  try {
    const response = await fetchImpl(target, {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
      method: "GET",
      signal,
    });
    status = Number.isInteger(response?.status) ? response.status : null;
    onObservation({ status, transportCode: "http_response" });

    const text = await readStage4NegativeProbeText(response);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const result = { payload: null, status, transportCode: "invalid_json" };
      onObservation({ status, transportCode: result.transportCode });
      return result;
    }
    const result = {
      payload: safeStage4NegativeProbePayload(parsed),
      status,
      transportCode: "json_response",
    };
    onObservation({ status, transportCode: result.transportCode });
    return result;
  } catch (error) {
    const transportCode = classifyStage4NegativeProbeTransportError(error, signal);
    const result = { payload: null, status, transportCode };
    onObservation({ status, transportCode });
    return result;
  }
}

function buildStage4NegativeProbeFailure(code, snapshot) {
  const safeFailure = {
    attempt_count: snapshot.attempt_count,
    code,
    last_http_status: snapshot.http_status,
    last_provider_code: snapshot.provider_code,
    last_reason_code: snapshot.reason_code,
    last_transport_code: snapshot.transport_code,
    message: code === "negative_probe_timeout"
      ? "primary guard negative probe timed out"
      : "primary guard negative probe returned an unexpected error",
  };
  const error = new Error(safeFailure.message);
  error.code = code;
  error.safeFailure = safeFailure;
  return error;
}

function toStage4NegativeProbeSnapshot(result, attemptCount) {
  const status = Number.isInteger(result?.status)
    && result.status >= 100
    && result.status <= 599
    ? result.status
    : null;
  return {
    attempt_count: attemptCount,
    http_status: status,
    provider_code: normalizeLocalSeedProviderCode(result?.payload?.code),
    reason_code: result?.payload?.message === "ACCOUNT_SESSION_STALE"
      ? "ACCOUNT_SESSION_STALE"
      : "unknown",
    transport_code: STAGE4_NEGATIVE_PROBE_TRANSPORT_CODES.has(
      result?.transportCode,
    )
      ? result.transportCode
      : status === null
        ? attemptCount === 0 ? "not_attempted" : "network_error"
        : "json_response",
  };
}

function isExactStage4NegativeProbeResult(result) {
  return Number.isInteger(result?.status)
    && result.status >= 400
    && result?.payload?.raw_code_is_exact === true
    && result?.payload?.message === "ACCOUNT_SESSION_STALE";
}

/**
 * Polls only the safe shape of the unscoped service-role guard response.
 * Successful HTTP responses mean the guarded primary PostgREST did not reject
 * the unscoped request. Gateway failures may be transient; any other wrong
 * provider response fails closed immediately.
 */
export async function pollStage4NegativeProbe({
  intervalMs = 250,
  now = () => performance.now(),
  probe,
  sleep = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)),
  timeoutMs = 15_000,
}) {
  if (typeof probe !== "function" || typeof now !== "function" || typeof sleep !== "function") {
    throw new Error("Stage 4 negative probe polling dependencies are required");
  }
  if (
    !Number.isInteger(timeoutMs)
    || timeoutMs < 10_000
    || timeoutMs > 20_000
    || !Number.isInteger(intervalMs)
    || intervalMs < 1
    || intervalMs > timeoutMs
  ) {
    throw new Error("Stage 4 negative probe polling bounds are invalid");
  }

  const deadline = now() + timeoutMs;
  let attemptCount = 0;
  let snapshot = toStage4NegativeProbeSnapshot(null, attemptCount);

  while (true) {
    const attemptRemainingMs = deadline - now();
    if (attemptRemainingMs <= 0) {
      throw buildStage4NegativeProbeFailure(
        "negative_probe_timeout",
        snapshot,
      );
    }

    attemptCount += 1;
    snapshot = toStage4NegativeProbeSnapshot(
      { transportCode: "pending" },
      attemptCount,
    );
    const controller = new AbortController();
    let abortTimer;
    try {
      const attemptDeadline = new Promise((_, reject) => {
        abortTimer = setTimeout(() => {
          controller.abort();
          reject(new Error("Stage 4 negative probe attempt deadline reached"));
        }, attemptRemainingMs);
      });
      const result = await Promise.race([
        probe({
          observe: (observation) => {
            snapshot = toStage4NegativeProbeSnapshot(
              observation,
              attemptCount,
            );
          },
          signal: controller.signal,
        }),
        attemptDeadline,
      ]);
      snapshot = toStage4NegativeProbeSnapshot(result, attemptCount);
      if (now() >= deadline) {
        throw buildStage4NegativeProbeFailure(
          "negative_probe_timeout",
          snapshot,
        );
      }
      if (isExactStage4NegativeProbeResult(result)) {
        return snapshot;
      }

      const isSuccess = snapshot.http_status !== null
        && snapshot.http_status >= 200
        && snapshot.http_status < 300;
      const isTransientGatewayFailure = [502, 503, 504].includes(
        snapshot.http_status,
      );
      const isTransientTransportFailure = new Set([
        "connection_refused",
        "network_error",
        "timeout_aborted",
      ]).has(snapshot.transport_code);
      if (!isSuccess && !isTransientGatewayFailure && !isTransientTransportFailure) {
        throw buildStage4NegativeProbeFailure(
          "negative_probe_unexpected",
          snapshot,
        );
      }
    } catch (error) {
      if (error?.safeFailure) throw error;
      if (controller.signal.aborted || now() >= deadline) {
        throw buildStage4NegativeProbeFailure(
          "negative_probe_timeout",
          snapshot,
        );
      }
      if (snapshot.transport_code === "pending") {
        snapshot = toStage4NegativeProbeSnapshot(
          { transportCode: "network_error" },
          attemptCount,
        );
      }
    } finally {
      clearTimeout(abortTimer);
    }

    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      throw buildStage4NegativeProbeFailure(
        "negative_probe_timeout",
        snapshot,
      );
    }
    await sleep(Math.min(intervalMs, remainingMs));
  }
}

export function resolveStage4ServiceProfile(profile = "full") {
  const services = STAGE4_SERVICE_PROFILES[profile];
  if (!services) {
    throw new Error(`unknown Stage 4 diagnostic profile: ${profile}`);
  }
  return [...services];
}

export function resolveStage4RequiredImageTags(profile = "full") {
  const services = new Set(resolveStage4ServiceProfile(profile));
  return STAGE4_IMAGE_REQUIREMENT_ORDER
    .filter(([, service]) => service === null || services.has(service))
    .map(([imageKey]) => STAGE4_CACHED_DOCKER_IMAGES[imageKey]);
}

export function evaluateStage4ImageCache({
  availableImages,
  profile,
}) {
  if (!Array.isArray(availableImages)) {
    throw new Error("Stage 4 available Docker image list is required");
  }
  const requiredImages = resolveStage4RequiredImageTags(profile);
  const availableSet = new Set(availableImages);
  const available = requiredImages.filter((image) => availableSet.has(image));
  const missing = requiredImages.filter((image) => !availableSet.has(image));
  return {
    available_images: available,
    failure: missing.length > 0 ? { ...MISSING_IMAGE_FAILURE } : null,
    missing_images: missing,
    ready: missing.length === 0,
    required_images: requiredImages,
  };
}

export function assertStage4CachedImages({ availableImages, profile }) {
  const result = evaluateStage4ImageCache({ availableImages, profile });
  if (!result.ready) {
    const error = new Error(MISSING_IMAGE_FAILURE.message);
    error.code = MISSING_IMAGE_FAILURE.code;
    error.cacheResult = result;
    throw error;
  }
  return result;
}

export function classifyStage4StartFailure(error) {
  if (error?.safeFailure && typeof error.safeFailure === "object") {
    return { ...error.safeFailure };
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timed out") || message.includes("timeout")) {
    return {
      code: "start_timeout",
      message: "isolated Supabase startup timed out",
    };
  }
  if (message.includes("docker") && (
    message.includes("unavailable")
    || message.includes("daemon")
    || message.includes("running")
  )) {
    return {
      code: "docker_unavailable",
      message: "Docker is unavailable for isolated startup",
    };
  }
  return {
    code: "start_failed",
    message: "isolated Supabase startup failed",
  };
}

export function classifyStage4CanonicalActivationFailureOutput({
  stderr,
  stdout,
  timedOut,
}) {
  void stdout;
  if (timedOut) {
    return {
      code: "activation_timeout",
      message: "Stage 4 canonical activation timed out",
    };
  }

  const details = typeof stderr === "string" ? stderr : "";
  const lifecycleMaintenance = details.match(
    /ERROR:\s+(ACCOUNT_LIFECYCLE_MAINTENANCE)\s*[\s\S]*?function\s+([a-z0-9_]+)\(/iu,
  );
  if (lifecycleMaintenance) {
    return {
      code: "activation_contract_blocked",
      message:
        `Stage 4 canonical activation blocked: ${lifecycleMaintenance[1]} @ ${lifecycleMaintenance[2]}`,
    };
  }

  return {
    code: "activation_failed",
    message: "Stage 4 canonical activation failed",
  };
}

const STAGE4_SEED_FAILURES = Object.freeze({
  seed_auth_failed: {
    code: "seed_auth_failed",
    message: "isolated Supabase demo seed authentication failed",
    phase: "demo_seed",
  },
  seed_bootstrap_missing: {
    code: "seed_bootstrap_missing",
    message: "isolated Supabase demo seed bootstrap data is unavailable",
    phase: "demo_seed",
  },
  seed_core_qa_failed: {
    code: "seed_core_qa_failed",
    message: "isolated Supabase core QA seed failed",
    phase: "demo_seed",
  },
  seed_data_operation_failed: {
    code: "seed_data_operation_failed",
    message: "isolated Supabase demo seed data operation failed",
    phase: "demo_seed",
  },
  seed_dependency_missing: {
    code: "seed_dependency_missing",
    message: "isolated Supabase demo seed dependency is unavailable",
    phase: "demo_seed",
  },
  seed_failed: {
    code: "seed_failed",
    message: "isolated Supabase demo seed failed",
    phase: "demo_seed",
  },
  seed_file_missing: {
    code: "seed_file_missing",
    message: "isolated Supabase demo seed file is unavailable",
    phase: "demo_seed",
  },
  seed_schema_missing: {
    code: "seed_schema_missing",
    message: "isolated Supabase demo seed schema is unavailable",
    phase: "demo_seed",
  },
  seed_target_unreachable: {
    code: "seed_target_unreachable",
    message: "isolated Supabase demo seed target is unreachable",
    phase: "demo_seed",
  },
});

/**
 * @param {{ stderr?: unknown, stdout?: unknown, timedOut?: boolean }} [input]
 */
const STAGE4_SEED_OPERATION_PATTERNS = Object.freeze([
  ["auth_users_list", ["auth users 조회 실패"]],
  ["auth_user_update", [
    "auth user 갱신 실패",
    "auth user 갱신 결과가 비어 있어요",
  ]],
  ["auth_user_create", [
    "auth user 생성 실패",
    "auth user 생성 결과가 비어 있어요",
  ]],
  ["public_user_read", ["public users 조회 실패"]],
  ["public_user_create", ["public users 생성 실패"]],
  ["public_user_update", ["public users 갱신 실패"]],
  ["core_qa_user_email_read", ["users 이메일 조회 실패"]],
  ["core_qa_user_read", ["users 조회 실패"]],
  ["core_qa_user_create", ["users 생성 실패"]],
  ["recipe_book_missing", ["demo dataset용 recipe book을 찾지 못했어요"]],
  ["planner_column_missing", [
    "planner column을 찾지 못했어요",
    "플래너 컬럼을 찾을 수 없습니다",
  ]],
  ["planner_columns_limit", [
    "이미 5개 컬럼이 있어 qa 플래너 컬럼을 더 만들 수 없습니다",
  ]],
  ["recipe_books_list", ["recipe_books 조회 실패"]],
  ["recipe_books_create", ["recipe_books 생성 실패"]],
  ["planner_columns_list", ["meal_plan_columns 조회 실패"]],
  ["planner_columns_create", ["meal_plan_columns 생성 실패"]],
  ["recipes_upsert", ["추가 demo recipes upsert 실패"]],
  ["core_qa_recipes_upsert", ["recipes upsert 실패"]],
  ["recipes_read", ["recipes 조회 실패"]],
  ["core_qa_recipe_sources_read", ["recipe_sources 조회 실패"]],
  ["core_qa_recipe_sources_upsert", ["recipe_sources upsert 실패"]],
  ["core_qa_recipe_ingredients_reset", ["recipe_ingredients 초기화 실패"]],
  ["core_qa_recipe_ingredients_create", ["recipe_ingredients 생성 실패"]],
  ["core_qa_recipe_steps_reset", ["recipe_steps 초기화 실패"]],
  ["core_qa_recipe_steps_create", ["recipe_steps 생성 실패"]],
  ["pantry_ingredients_read", ["demo ingredients 조회 실패"]],
  ["pantry_ingredients_update", ["demo ingredients 갱신 실패"]],
  ["pantry_ingredients_create", ["demo ingredients 생성 실패"]],
  ["core_qa_ingredients_read", ["ingredients 조회 실패"]],
  ["core_qa_ingredients_create", ["ingredients 생성 실패"]],
  ["core_qa_cooking_methods_read", ["cooking_methods 조회 실패"]],
  ["core_qa_cooking_methods_create", ["cooking_methods 생성 실패"]],
  ["core_qa_ingredient_synonyms_upsert", ["ingredient_synonyms upsert 실패"]],
  ["recipe_likes_reset", [
    "추가 demo recipe_likes 초기화 실패",
    "recipe_likes 초기화 실패",
  ]],
  ["recipe_likes_create", [
    "추가 demo recipe_likes 생성 실패",
    "recipe_likes 생성 실패",
  ]],
  ["recipe_book_items_reset", [
    "추가 demo recipe_book_items 초기화 실패",
    "main user recipe_book_items 초기화 실패",
    "other user recipe_book_items 초기화 실패",
  ]],
  ["recipe_book_items_create", [
    "추가 demo recipe_book_items 생성 실패",
    "recipe_book_items 생성 실패",
  ]],
  ["planner_meals_reset", [
    "추가 demo meals 초기화 실패",
    "meals 초기화 실패",
  ]],
  ["planner_meals_create", [
    "추가 demo meals 생성 실패",
    "meals 생성 실패",
  ]],
  ["ingredient_bundles_create", ["demo ingredient_bundles 생성 실패"]],
  ["ingredient_bundle_items_reset", ["demo ingredient_bundle_items 초기화 실패"]],
  ["ingredient_bundle_items_create", ["demo ingredient_bundle_items 생성 실패"]],
  ["pantry_items_reset", ["demo pantry_items 초기화 실패"]],
  ["pantry_items_create", ["demo pantry_items 생성 실패"]],
  ["recipe_likes_count", ["recipe_likes count 실패"]],
  ["recipe_book_items_count", ["recipe_book_items count 실패"]],
  ["planner_meals_count", ["meals count 실패"]],
  ["cook_done_count", ["cook_done count 실패"]],
  ["recipe_counters_update", ["recipes 카운트 갱신 실패"]],
]);

export function classifyStage4SeedOperationDetail(output) {
  const normalized = String(output ?? "").toLowerCase();
  for (const [detailCode, patterns] of STAGE4_SEED_OPERATION_PATTERNS) {
    if (patterns.some((pattern) => normalized.includes(pattern.toLowerCase()))) {
      return detailCode;
    }
  }
  return "unknown";
}

/**
 * @param {{ stderr?: unknown, stdout?: unknown, timedOut?: boolean }} [input]
 */
export function classifyStage4SeedFailureOutput({
  stderr,
  stdout,
  timedOut = false,
} = {}) {
  const rawOutput = `${String(stdout ?? "")}\n${String(stderr ?? "")}`;
  const output = rawOutput.toLowerCase();
  let category = "seed_failed";
  if (timedOut || /econnrefused|connection refused|fetch failed|target unreachable/u.test(output)) {
    category = "seed_target_unreachable";
  } else if (/err_module_not_found|cannot find (?:package|module)|module_not_found/u.test(output)) {
    category = "seed_dependency_missing";
  } else if (/\benoent\b|no such file or directory/u.test(output)) {
    category = "seed_file_missing";
  } else if (/\b42p01\b|\b42p06\b|relation .* does not exist|schema .* does not exist/u.test(output)) {
    category = "seed_schema_missing";
  } else if (/invalid login credentials|authentication failed|unauthorized|\b401\b|\b403\b/u.test(output)) {
    category = "seed_auth_failed";
  } else if (
    /auth users?.*(?:실패|비어)|auth user.*(?:실패|비어)/u.test(output)
  ) {
    category = "seed_auth_failed";
  } else if (
    /recipe book.*(?:찾지 못|찾을 수 없)|planner column.*(?:찾지 못|찾을 수 없)|demo dataset.*찾지 못/u.test(output)
  ) {
    category = "seed_bootstrap_missing";
  } else if (
    /(?:조회|생성|갱신|저장|삭제|추가|반영) 실패/u.test(output)
  ) {
    category = "seed_data_operation_failed";
  } else if (
    /qa[_ -]?seed|core qa seed|--user-id.*필요/u.test(output)
  ) {
    category = "seed_core_qa_failed";
  }
  const detailCode = classifyStage4SeedOperationDetail(output);
  const providerCodeMatch = output.match(
    /\[provider_code=([0-9a-z]+)\]/u,
  );
  const providerCode = normalizeLocalSeedProviderCode(
    providerCodeMatch?.[1],
  );
  const reasonCodeMatch = rawOutput.match(
    /\[reason_code=([0-9A-Za-z_]+)\]/u,
  );
  const reasonCode = normalizeLocalSeedReasonCode(
    reasonCodeMatch?.[1],
  );
  if (category === "seed_failed" && detailCode !== "unknown") {
    if (detailCode.startsWith("auth_")) {
      category = "seed_auth_failed";
    } else if (
      detailCode.endsWith("_missing")
      || detailCode.endsWith("_limit")
    ) {
      category = "seed_bootstrap_missing";
    } else {
      category = "seed_data_operation_failed";
    }
  }

  return {
    ...STAGE4_SEED_FAILURES[category],
    detail_code: detailCode,
    provider_code: providerCode,
    reason_code: reasonCode,
  };
}

export function buildStage4SensitiveCommandError({
  failureClassifier = null,
  label,
  result,
  timeoutMs,
}) {
  const timedOut = result?.error?.code === "ETIMEDOUT";
  if (typeof failureClassifier === "function") {
    const safeFailure = failureClassifier({
      stderr: result?.stderr,
      stdout: result?.stdout,
      timedOut,
    });
    const classified = new Error(safeFailure.message);
    classified.code = safeFailure.code;
    classified.safeFailure = safeFailure;
    return classified;
  }
  const status = Number.isInteger(result?.status) ? result.status : "unknown";
  const error = new Error(
    timedOut
      ? `${label} timed out after ${timeoutMs}ms`
      : `${label} failed with status ${status}`,
  );
  error.code = timedOut
    ? "sensitive_command_timeout"
    : "sensitive_command_failed";
  return error;
}

const CLEANUP_FAILURE = Object.freeze({
  code: "cleanup_failed",
  message: "isolated Supabase cleanup failed",
});

export function buildStage4DiagnosticOutcome({
  cleanupError,
  diagnosticStatus,
  primaryFailure,
}) {
  const cleanupFailure = cleanupError
    ? cleanupError?.safeFailure
      ? { ...cleanupError.safeFailure }
      : { ...CLEANUP_FAILURE }
    : null;
  return {
    cleanupFailure,
    failure: primaryFailure ?? cleanupFailure,
    status: cleanupFailure ? "failed" : diagnosticStatus,
  };
}

export function assertStage4DiagnosticAttemptAvailable({
  attemptId,
  diagnosticRoot,
}) {
  if (
    typeof attemptId !== "string"
    || !/^[a-z0-9][a-z0-9._-]{2,95}$/u.test(attemptId)
    || attemptId.includes("..")
  ) {
    throw new Error("Stage 4 diagnostic attempt id is invalid");
  }
  if (existsSync(path.join(diagnosticRoot, attemptId))) {
    throw new Error(`Stage 4 diagnostic attempt already exists: ${attemptId}`);
  }
}

function assertLoopbackHttpUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid loopback URL`);
  }
  if (parsed.protocol !== "http:" || !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`${label} must be loopback http only`);
  }
  return parsed;
}

function stableStage4Value(value) {
  if (Array.isArray(value)) {
    return value.map(stableStage4Value);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableStage4Value(value[key])]),
    );
  }
  return value;
}

function stableStage4Json(value) {
  return JSON.stringify(stableStage4Value(value));
}

function canonicalStage4PublicVerifyKey(key) {
  if (
    !key
    || typeof key !== "object"
    || typeof key.kid !== "string"
    || key.kid.length === 0
    || key.d !== undefined
    || (key.use !== undefined && key.use !== "sig")
  ) {
    throw new Error("Stage 4 guarded Auth JWKS must contain only public verify keys");
  }
  if (
    key.kty === "EC"
    && key.alg === "ES256"
    && key.crv === "P-256"
    && typeof key.x === "string"
    && key.x.length > 0
    && typeof key.y === "string"
    && key.y.length > 0
  ) {
    return stableStage4Value({
      alg: key.alg,
      crv: key.crv,
      kid: key.kid,
      kty: key.kty,
      use: key.use ?? "sig",
      x: key.x,
      y: key.y,
    });
  }
  if (
    key.kty === "RSA"
    && key.alg === "RS256"
    && typeof key.e === "string"
    && key.e.length > 0
    && typeof key.n === "string"
    && key.n.length > 0
  ) {
    return stableStage4Value({
      alg: key.alg,
      e: key.e,
      kid: key.kid,
      kty: key.kty,
      n: key.n,
      use: key.use ?? "sig",
    });
  }
  throw new Error("Stage 4 guarded Auth JWKS must contain only public verify keys");
}

function canonicalStage4PublicVerifyKeys(jwks) {
  if (!jwks || typeof jwks !== "object" || !Array.isArray(jwks.keys)) {
    throw new Error("Stage 4 guarded Auth JWKS response is invalid");
  }
  const keys = jwks.keys.map(canonicalStage4PublicVerifyKey)
    .sort((left, right) => left.kid.localeCompare(right.kid));
  if (keys.length === 0 || new Set(keys.map((key) => key.kid)).size !== keys.length) {
    throw new Error("Stage 4 guarded Auth JWKS must contain unique verify keys");
  }
  return keys;
}

async function requestStage4LoopbackJson(url, {
  maxBytes = STAGE4_GUARDED_JWKS_MAX_BODY_BYTES,
  timeoutMs = STAGE4_GUARDED_JWKS_TIMEOUT_MS,
} = {}) {
  return await new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const request = requestHttp(url, {
      headers: { accept: "application/json" },
      method: "GET",
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        finishReject(new Error("Stage 4 guarded Auth JWKS endpoint did not return success"));
        return;
      }
      const chunks = [];
      let totalBytes = 0;
      response.on("data", (chunk) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buffer.length;
        if (totalBytes > maxBytes) {
          response.destroy(new Error("Stage 4 guarded Auth JWKS response size is invalid"));
          return;
        }
        chunks.push(buffer);
      });
      response.on("end", () => {
        if (totalBytes === 0) {
          finishReject(new Error("Stage 4 guarded Auth JWKS response is empty"));
          return;
        }
        finishResolve(Buffer.concat(chunks).toString("utf8"));
      });
      response.on("error", () => {
        finishReject(new Error("Stage 4 guarded Auth JWKS network fetch failed closed"));
      });
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("Stage 4 guarded Auth JWKS network fetch timed out"));
    });
    request.on("error", () => {
      finishReject(new Error("Stage 4 guarded Auth JWKS network fetch failed closed"));
    });
    request.end();
  });
}

export async function buildStage4GuardedJwtVerificationJwks({
  authOrigin,
  jwtSecret,
}) {
  const normalizedAuthOrigin = assertLoopbackHttpUrl(
    authOrigin,
    "Stage 4 guarded Auth origin",
  );
  if (
    normalizedAuthOrigin.username
    || normalizedAuthOrigin.password
    || normalizedAuthOrigin.pathname !== "/"
    || normalizedAuthOrigin.search
    || normalizedAuthOrigin.hash
  ) {
    throw new Error("Stage 4 guarded Auth origin must be one exact loopback http origin");
  }
  if (typeof jwtSecret !== "string" || jwtSecret.length < 32) {
    throw new Error("Stage 4 guarded Data API JWT secret is invalid");
  }
  const body = await requestStage4LoopbackJson(
    `${normalizedAuthOrigin.origin}/auth/v1/.well-known/jwks.json`,
  );
  let jwks;
  try {
    jwks = JSON.parse(body);
  } catch {
    throw new Error("Stage 4 guarded Auth JWKS response is invalid");
  }
  const publicVerifyKeys = canonicalStage4PublicVerifyKeys(jwks);
  const legacyHs256Key = stableStage4Value({
    alg: "HS256",
    k: Buffer.from(jwtSecret, "utf8").toString("base64url"),
    kid: `stage4-guarded-hs256-${createHash("sha256").update(jwtSecret, "utf8").digest("hex").slice(0, 16)}`,
    kty: "oct",
    use: "sig",
  });
  if (publicVerifyKeys.some((key) => key.kid === legacyHs256Key.kid)) {
    throw new Error("Stage 4 guarded Auth JWKS must contain unique verify keys");
  }
  return stableStage4Json({
    keys: [...publicVerifyKeys, legacyHs256Key],
  });
}

function assertExactReservedStage4PublicAuthUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid HTTPS origin`);
  }
  if (
    parsed.origin !== STAGE4_RESERVED_AUTH_ORIGIN
    || parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(`${label} must be the reserved Stage 4 HTTPS origin`);
  }
  return parsed;
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

/**
 * @param {{
 *   contestedError?: (Error & { code?: string, safeFailure?: Record<string, string> }) | null,
 *   fallbackCleanup: () => unknown,
 *   stopCleanup: () => boolean,
 *   verifyCleanup: () => unknown,
 * }} options
 */
export function runStage4DockerCleanup({
  contestedError = null,
  fallbackCleanup,
  stopCleanup,
  verifyCleanup,
}) {
  if (contestedError) throw contestedError;
  if (
    typeof fallbackCleanup !== "function"
    || typeof stopCleanup !== "function"
    || typeof verifyCleanup !== "function"
  ) {
    throw new Error("Stage 4 Docker cleanup actions are required");
  }
  let succeeded = stopCleanup() === true;
  if (succeeded) {
    try {
      verifyCleanup();
    } catch {
      succeeded = false;
    }
  }
  if (!succeeded) {
    fallbackCleanup();
    verifyCleanup();
    return { succeeded: true, used_fallback: true };
  }
  return { succeeded: true, used_fallback: false };
}

export function resolveStage4GuardedDataProxyTarget({
  dataUpstreamUrl,
  proxyUrl,
  requestUrl,
  storageUpstreamUrl,
}) {
  const proxy = assertLoopbackHttpUrl(proxyUrl, "Stage 4 guarded proxy URL");
  const request = assertLoopbackHttpUrl(
    requestUrl,
    "Stage 4 guarded proxy request URL",
  );
  if (request.origin !== proxy.origin) {
    throw new Error("Stage 4 guarded proxy request origin mismatch");
  }

  let upstream;
  let pathname;
  if (request.pathname === "/rest/v1" || request.pathname.startsWith("/rest/v1/")) {
    upstream = assertLoopbackHttpUrl(
      dataUpstreamUrl,
      "Stage 4 guarded raw Data upstream URL",
    );
    pathname = request.pathname.slice("/rest/v1".length) || "/";
  } else if (
    request.pathname === "/storage/v1"
    || request.pathname.startsWith("/storage/v1/")
  ) {
    upstream = assertLoopbackHttpUrl(
      storageUpstreamUrl,
      "Stage 4 isolated Storage upstream URL",
    );
    pathname = request.pathname;
  } else {
    throw new Error("Stage 4 guarded proxy route is not allowlisted");
  }
  upstream.pathname = pathname;
  upstream.search = request.search;
  return upstream.toString();
}

export function classifyStage4DataUpstreamFailure({ body, status }) {
  let parsed = null;
  try {
    parsed = JSON.parse(typeof body === "string" ? body : "");
  } catch {
    parsed = null;
  }
  const rawCode = typeof parsed?.code === "string"
    ? parsed.code.trim().toUpperCase()
    : "";
  const providerCode = /^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/u.test(rawCode)
    ? rawCode
    : "unknown";
  const message = typeof parsed?.message === "string" ? parsed.message : "";
  const permissionTable = message.match(
    /permission denied for table (users|recipes|recipe_books|meal_plan_columns|meals|pantry_items|leftover_dishes)/iu,
  )?.[1]?.toLowerCase() ?? null;
  const category = message.includes("ACCOUNT_LIFECYCLE_MAINTENANCE")
    ? "ACCOUNT_LIFECYCLE_MAINTENANCE"
    : message.includes("ACCOUNT_SESSION_STALE")
      ? "ACCOUNT_SESSION_STALE"
      : /row-level security/iu.test(message)
        ? "row_level_security"
        : /legacy account mutation authority/iu.test(message)
          ? "legacy_mutation_authority"
          : permissionTable
            ? `permission_denied_${permissionTable}`
            : /permission denied/iu.test(message)
            ? "permission_denied"
            : /duplicate key/iu.test(message)
              ? "duplicate_key"
              : /does not exist|schema cache/iu.test(message)
                ? "schema_unavailable"
                : "unknown";
  return {
    category,
    provider_code: providerCode,
    status: Number.isInteger(status) ? status : null,
  };
}

function stage4ProxyHeaders(headers, targetHost = null) {
  const forwarded = { ...headers };
  if (targetHost) forwarded.host = targetHost;
  for (const name of [
    "connection",
    "keep-alive",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]) {
    delete forwarded[name];
  }
  return forwarded;
}

const STAGE4_RAW_ATTESTATION_HEADER = "x-homecook-session-attestation";
const STAGE4_RAW_ATTESTATION_SIGNATURE_HEADER =
  "x-homecook-session-attestation-signature";
const STAGE4_VERIFIED_ATTESTATION_HEADER = "x-homecook-attestation-verified";

function normalizeStage4ProxyHeaderValue(value) {
  if (Array.isArray(value)) {
    return value.length === 1 ? value[0] : null;
  }
  return typeof value === "string" ? value : null;
}

function signStage4AttestationPayload(payload, secret) {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function parseStage4AttestationClaims(payload) {
  const claims = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  );
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
    throw new Error("Stage 4 attestation payload must be an object");
  }
  return claims;
}

function isStage4IsoUtcTimestamp(value) {
  return typeof value === "string"
    && ISO_UTC_TIMESTAMP_PATTERN.test(value)
    && Number.isFinite(Date.parse(value));
}

export function verifyAndTransformStage4ProxyAttestationHeaders({
  attestationSecret,
  headers,
  method,
  path,
  nowSeconds = Math.floor(Date.now() / 1_000),
}) {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    throw new Error("Stage 4 proxy headers are required");
  }
  if (typeof method !== "string" || method.length === 0) {
    throw new Error("Stage 4 proxy request method is required");
  }
  if (typeof path !== "string" || !path.startsWith("/")) {
    throw new Error("Stage 4 proxy request path is invalid");
  }
  if (!Number.isSafeInteger(nowSeconds)) {
    throw new Error("Stage 4 proxy current epoch is invalid");
  }

  const payload = normalizeStage4ProxyHeaderValue(
    headers[STAGE4_RAW_ATTESTATION_HEADER],
  );
  const signature = normalizeStage4ProxyHeaderValue(
    headers[STAGE4_RAW_ATTESTATION_SIGNATURE_HEADER],
  );

  if (payload === null && signature === null) {
    const forwarded = { ...headers };
    delete forwarded[STAGE4_VERIFIED_ATTESTATION_HEADER];
    delete forwarded[STAGE4_RAW_ATTESTATION_HEADER];
    delete forwarded[STAGE4_RAW_ATTESTATION_SIGNATURE_HEADER];
    return {
      forwardedHeaders: forwarded,
      verifiedPayload: null,
    };
  }

  if (
    payload === null
    || signature === null
    || !SHA256_PATTERN.test(signature)
    || typeof attestationSecret !== "string"
    || attestationSecret.length < 32
  ) {
    return { ok: false, reason: "header_shape" };
  }

  try {
    const expectedSignature = signStage4AttestationPayload(
      payload,
      attestationSecret,
    );
    if (
      !timingSafeEqual(
        Buffer.from(signature, "utf8"),
        Buffer.from(expectedSignature, "utf8"),
      )
    ) {
      return { ok: false, reason: "signature" };
    }

    const claims = parseStage4AttestationClaims(payload);
    const ttlSeconds = claims.expires_at - claims.issued_at;
    if (
      !Number.isSafeInteger(claims.version)
      || claims.version <= 0
      || typeof claims.method !== "string"
      || claims.method !== method.toUpperCase()
      || typeof claims.path !== "string"
      || claims.path !== path
      || typeof claims.issuer !== "string"
      || !claims.issuer.endsWith("/auth/v1")
      || !UUID_PATTERN.test(claims.owner_uuid)
      || !isStage4IsoUtcTimestamp(claims.identity_created_at)
      || typeof claims.session_key_hash !== "string"
      || !SHA256_PATTERN.test(claims.session_key_hash)
      || !Number.isSafeInteger(claims.issued_at)
      || !Number.isSafeInteger(claims.expires_at)
      || claims.issued_at > nowSeconds + 5
      || claims.expires_at < nowSeconds
      || ttlSeconds <= 0
      || ttlSeconds > 60
    ) {
      return { ok: false, reason: "claims_shape" };
    }

    const forwarded = { ...headers };
    delete forwarded[STAGE4_RAW_ATTESTATION_HEADER];
    delete forwarded[STAGE4_RAW_ATTESTATION_SIGNATURE_HEADER];
    forwarded[STAGE4_VERIFIED_ATTESTATION_HEADER] = payload;
    return {
      forwardedHeaders: forwarded,
      ok: true,
      verifiedPayload: payload,
    };
  } catch {
    return { ok: false, reason: "payload" };
  }
}

/**
 * @param {{
 *   attestationSecret?: string | null,
 *   dataUpstreamUrl: string,
 *   onSafeFailure?: (failure: Record<string, unknown>) => void,
 *   port: number,
 *   storageUpstreamUrl: string,
 * }} options
 */
export async function startStage4GuardedDataProxy({
  attestationSecret = null,
  dataUpstreamUrl,
  onSafeFailure = () => {},
  port,
  storageUpstreamUrl,
}) {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Stage 4 guarded proxy port is invalid");
  }
  if (typeof onSafeFailure !== "function") {
    throw new Error("Stage 4 guarded proxy failure observer is invalid");
  }
  const dataOrigin = assertLoopbackHttpUrl(
    dataUpstreamUrl,
    "Stage 4 guarded raw Data upstream URL",
  ).origin;
  const storageOrigin = assertLoopbackHttpUrl(
    storageUpstreamUrl,
    "Stage 4 isolated Storage upstream URL",
  ).origin;
  let proxyUrl = null;
  const server = createServer((clientRequest, clientResponse) => {
    let target;
    try {
      const host = clientRequest.headers.host ?? "";
      target = new URL(resolveStage4GuardedDataProxyTarget({
        dataUpstreamUrl: dataOrigin,
        proxyUrl,
        requestUrl: `http://${host}${clientRequest.url ?? "/"}`,
        storageUpstreamUrl: storageOrigin,
      }));
    } catch {
      clientResponse.writeHead(404, { "content-type": "text/plain" });
      clientResponse.end("not found");
      return;
    }

    const authorityHeaders = verifyAndTransformStage4ProxyAttestationHeaders({
      attestationSecret,
      headers: clientRequest.headers,
      method: clientRequest.method ?? "GET",
      path: target.pathname,
    });
    if (authorityHeaders.ok === false) {
      onSafeFailure({
        category: `invalid_attestation_${authorityHeaders.reason}`,
        provider_code: "local_proxy",
        status: 401,
      });
      clientResponse.writeHead(401, { "content-type": "text/plain" });
      clientResponse.end("invalid session attestation");
      return;
    }

    const upstreamRequest = requestHttp(target, {
      headers: stage4ProxyHeaders(
        authorityHeaders.forwardedHeaders,
        target.host,
      ),
      method: clientRequest.method,
    }, (upstreamResponse) => {
      const failureChunks = [];
      let failureBytes = 0;
      if ((upstreamResponse.statusCode ?? 0) >= 400) {
        upstreamResponse.on("data", (chunk) => {
          if (failureBytes >= 4_096) return;
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          const remaining = 4_096 - failureBytes;
          failureChunks.push(buffer.subarray(0, remaining));
          failureBytes += Math.min(buffer.length, remaining);
        });
        upstreamResponse.on("end", () => {
          try {
            onSafeFailure(classifyStage4DataUpstreamFailure({
              body: Buffer.concat(failureChunks).toString("utf8"),
              status: upstreamResponse.statusCode ?? null,
            }));
          } catch {
            // Diagnostics must not change the proxy response contract.
          }
        });
      }
      clientResponse.writeHead(
        upstreamResponse.statusCode ?? 502,
        stage4ProxyHeaders(upstreamResponse.headers),
      );
      upstreamResponse.pipe(clientResponse);
    });
    upstreamRequest.on("error", () => {
      if (!clientResponse.headersSent) clientResponse.writeHead(502);
      clientResponse.end();
    });
    clientRequest.on("error", () => upstreamRequest.destroy());
    clientRequest.pipe(upstreamRequest);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port }, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeStage4GuardedDataProxy(server);
    throw new Error("Stage 4 guarded proxy address is unavailable");
  }
  proxyUrl = `http://127.0.0.1:${address.port}`;
  return { server, url: proxyUrl };
}

export async function closeStage4GuardedDataProxy(server) {
  if (!server || typeof server.close !== "function") {
    throw new Error("Stage 4 guarded proxy server is invalid");
  }
  if (server.listening === false) return;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

export function buildStage4ServerEnvironment({
  ambient = {},
  anonKey,
  apiUrl,
  appOrigin,
  authApiUrl,
  publicAuthUrl = STAGE4_RESERVED_AUTH_ORIGIN,
  serviceRoleKey,
}) {
  for (const [label, value] of Object.entries({
    anonKey,
    apiUrl,
    appOrigin,
    authApiUrl,
    publicAuthUrl,
    serviceRoleKey,
  })) {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Stage 4 server target ${label} is missing`);
    }
  }

  const normalizedApiUrl = assertLoopbackHttpUrl(
    apiUrl,
    "Stage 4 server API URL",
  ).origin;
  const normalizedAppOrigin = assertLoopbackHttpUrl(
    appOrigin,
    "Stage 4 server app origin",
  ).origin;
  const normalizedAuthApiUrl = assertLoopbackHttpUrl(
    authApiUrl,
    "Stage 4 server Auth API URL",
  ).origin;
  const normalizedPublicAuthOrigin = assertExactReservedStage4PublicAuthUrl(
    publicAuthUrl,
    "Stage 4 server public Auth URL",
  ).origin;
  const normalizedPublicAuthIssuer =
    `${normalizedPublicAuthOrigin}/auth/v1`;
  if (normalizedApiUrl === normalizedAuthApiUrl) {
    throw new Error("Stage 4 guarded Data and Auth API URLs must be distinct");
  }

  const serverEnvironment = {
    ...ambient,
    AUTH_SUPABASE_EXPECTED_ISSUER: normalizedPublicAuthIssuer,
    AUTH_SUPABASE_JWKS_URL:
      `${normalizedAuthApiUrl}/auth/v1/.well-known/jwks.json`,
    DATA_SUPABASE_PUBLISHABLE_KEY: anonKey,
    DATA_SUPABASE_SECRET_KEY: serviceRoleKey,
    DATA_SUPABASE_URL: normalizedApiUrl,
    HOMECOOK_AUTH_AUTHORITY: "local",
    HOMECOOK_STAGE4_CAPTURE_MODE: STAGE4_CAPTURE_MODE,
    HOMECOOK_DATA_AUTHORITY: "local",
    LOCAL_SUPABASE_INTERNAL_URL: normalizedAuthApiUrl,
    LOCAL_SUPABASE_SECRET_KEY: serviceRoleKey,
    NEXT_PUBLIC_APP_URL: normalizedAppOrigin,
    NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY: anonKey,
    NEXT_PUBLIC_AUTH_SUPABASE_URL: normalizedAuthApiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    NEXT_PUBLIC_SUPABASE_URL: normalizedAuthApiUrl,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  };
  delete serverEnvironment.HOMECOOK_ENABLE_QA_FIXTURES;
  delete serverEnvironment.NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES;
  return serverEnvironment;
}

function normalizeStage4ServerTarget(env) {
  const target = Object.fromEntries(
    TARGET_ENV_KEYS.map((key) => {
      const value = env?.[key];
      if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Stage 4 server target ${key} is missing`);
      }
      return [key, value];
    }),
  );
  if (
    target.HOMECOOK_AUTH_AUTHORITY !== "local"
    || target.HOMECOOK_DATA_AUTHORITY !== "local"
  ) {
    throw new Error("Stage 4 Auth and Data authorities must be local");
  }
  if (target.HOMECOOK_STAGE4_CAPTURE_MODE !== STAGE4_CAPTURE_MODE) {
    throw new Error("Stage 4 capture mode must stay enabled");
  }
  if (target.AUTH_SUPABASE_EXPECTED_ISSUER !== STAGE4_RESERVED_AUTH_ISSUER) {
    throw new Error("Stage 4 Auth issuer must use the reserved HTTPS issuer");
  }

  const dataOrigin = assertLoopbackHttpUrl(
    target.DATA_SUPABASE_URL,
    "Stage 4 Data URL",
  ).origin;
  const appOrigin = assertLoopbackHttpUrl(
    target.NEXT_PUBLIC_APP_URL,
    "Stage 4 app URL",
  ).origin;
  const authApiOrigin = assertLoopbackHttpUrl(
    target.LOCAL_SUPABASE_INTERNAL_URL,
    "Stage 4 LOCAL_SUPABASE_INTERNAL_URL",
  ).origin;
  const authOrigin = assertLoopbackHttpUrl(
    target.NEXT_PUBLIC_AUTH_SUPABASE_URL,
    "Stage 4 Auth URL",
  ).origin;
  if (dataOrigin === authOrigin) {
    throw new Error("Stage 4 guarded Data URL must be distinct from Auth");
  }
  if (target.NEXT_PUBLIC_SUPABASE_URL !== authOrigin) {
    throw new Error("Stage 4 NEXT_PUBLIC_SUPABASE_URL must match the isolated Auth origin");
  }
  if (
    target.AUTH_SUPABASE_JWKS_URL
    !== `${authApiOrigin}/auth/v1/.well-known/jwks.json`
  ) {
    throw new Error("Stage 4 Auth JWKS URL must stay on the exact loopback Auth origin");
  }

  return {
    ...target,
    DATA_SUPABASE_URL: dataOrigin,
    LOCAL_SUPABASE_INTERNAL_URL: authApiOrigin,
    NEXT_PUBLIC_APP_URL: appOrigin,
    NEXT_PUBLIC_AUTH_SUPABASE_URL: authOrigin,
    NEXT_PUBLIC_SUPABASE_URL: authOrigin,
  };
}

export function hashStage4ServerTarget(env) {
  const target = normalizeStage4ServerTarget(env);
  return createHash("sha256")
    .update(JSON.stringify(target))
    .digest("hex");
}

export function assertStage4ServerEnvironment(env, attestation) {
  const target = normalizeStage4ServerTarget(env);
  if (target.DATA_SUPABASE_URL !== new URL(attestation.api_url).origin) {
    throw new Error("Stage 4 process Data URL does not match attestation");
  }
  if (target.NEXT_PUBLIC_AUTH_SUPABASE_URL !== new URL(attestation.auth_api_url).origin) {
    throw new Error("Stage 4 process Auth transport URL does not match attestation");
  }
  if (target.AUTH_SUPABASE_EXPECTED_ISSUER !== attestation.auth_public_issuer) {
    throw new Error("Stage 4 process Auth issuer does not match attestation");
  }
  if (target.AUTH_SUPABASE_JWKS_URL !== `${new URL(attestation.auth_api_url).origin}/auth/v1/.well-known/jwks.json`) {
    throw new Error("Stage 4 process Auth JWKS URL does not match attestation");
  }
  if (target.NEXT_PUBLIC_APP_URL !== new URL(attestation.app_origin).origin) {
    throw new Error("Stage 4 process app URL does not match attestation");
  }
  const digest = hashStage4ServerTarget(target);
  if (digest !== attestation.server_env_sha256) {
    throw new Error("Stage 4 server target digest does not match attestation");
  }
  return digest;
}

const STAGE4_ATTESTATION_KEYS = Object.freeze([
  "auth_public_issuer",
  "api_url",
  "app_origin",
  "auth_api_url",
  "canonical_activation",
  "docker",
  "generated_at",
  "guarded_data_api_url",
  "guarded_data_api_used",
  "guarded_data_proxy_used",
  "migration_sha256",
  "negative_probe_passed",
  "pinned_isolated_local",
  "rehearsal_only",
  "ports",
  "primary_guard_unchanged",
  "project_id",
  "qa_fixture_scope",
  "remote_linked_cloud_access",
  "server_env_sha256",
  "server_env_target",
  "shadow_seed_api_removed",
  "shadow_seed_api_used",
  "source_head_sha",
  "supabase_cli_version",
]);
const STAGE4_ATTESTATION_DOCKER_KEYS = Object.freeze([
  "containers",
  "networks",
  "volumes",
]);
const STAGE4_ATTESTATION_PORT_KEYS = Object.freeze([
  "app",
  "auth",
  "base",
  "data",
  "guarded",
]);

function assertExactObjectKeys(value, expectedKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} schema is invalid`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} schema contains unknown or missing fields`);
  }
}

function assertExactLoopbackHttpOrigin(value, label) {
  const parsed = assertLoopbackHttpUrl(value, label);
  if (
    typeof value !== "string"
    || value !== parsed.origin
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(`${label} must be an exact origin without credentials, path, query or hash`);
  }
  return parsed;
}

function assertStage4GeneratedAt(value) {
  if (typeof value !== "string") {
    throw new Error("Stage 4 generated_at is invalid");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error("Stage 4 generated_at is invalid");
  }
  return value;
}

export function validateStage4TargetAttestation(attestation, expectedAppOrigin) {
  if (!attestation || typeof attestation !== "object" || Array.isArray(attestation)) {
    throw new Error("Stage 4 target attestation is required");
  }
  assertExactObjectKeys(
    attestation,
    STAGE4_ATTESTATION_KEYS,
    "Stage 4 target attestation",
  );
  assertExactObjectKeys(
    attestation.docker,
    STAGE4_ATTESTATION_DOCKER_KEYS,
    "Stage 4 Docker attestation",
  );
  assertExactObjectKeys(
    attestation.ports,
    STAGE4_ATTESTATION_PORT_KEYS,
    "Stage 4 port attestation",
  );
  if (attestation.pinned_isolated_local !== true) {
    throw new Error("Stage 4 target must be pinned isolated local");
  }
  if (attestation.rehearsal_only !== true) {
    throw new Error("Stage 4 target must remain rehearsal only");
  }
  const canonicalActivation = assertStage4CanonicalActivationOutput(
    JSON.stringify(attestation.canonical_activation),
  );
  if (attestation.remote_linked_cloud_access !== 0) {
    throw new Error("Stage 4 target must record remote linked cloud access zero");
  }
  if (
    !Array.isArray(attestation.qa_fixture_scope)
    || attestation.qa_fixture_scope.length !== STAGE4_QA_FIXTURE_SCOPE.length
    || attestation.qa_fixture_scope.some(
      (scope, index) => scope !== STAGE4_QA_FIXTURE_SCOPE[index],
    )
  ) {
    throw new Error("Stage 4 QA fixture scope is invalid");
  }
  if (!/^hcg_[a-z0-9_]+$/u.test(attestation.project_id ?? "")) {
    throw new Error("Stage 4 isolated project id is invalid");
  }
  if (!SHA256_PATTERN.test(attestation.migration_sha256 ?? "")) {
    throw new Error("Stage 4 migration digest is invalid");
  }
  if (!GIT_SHA_PATTERN.test(attestation.source_head_sha ?? "")) {
    throw new Error("Stage 4 source head is invalid");
  }
  if (!SHA256_PATTERN.test(attestation.server_env_sha256 ?? "")) {
    throw new Error("Stage 4 server environment digest is invalid");
  }
  if (attestation.server_env_target !== "isolated-supabase") {
    throw new Error("Stage 4 server environment target is not isolated Supabase");
  }
  if (attestation.supabase_cli_version !== STAGE4_SUPABASE_CLI_VERSION) {
    throw new Error("Stage 4 Supabase CLI version is invalid");
  }
  assertStage4GeneratedAt(attestation.generated_at);
  if (attestation.auth_public_issuer !== STAGE4_RESERVED_AUTH_ISSUER) {
    throw new Error("Stage 4 public Auth issuer is invalid");
  }
  for (const field of [
    "guarded_data_api_used",
    "guarded_data_proxy_used",
    "negative_probe_passed",
    "primary_guard_unchanged",
    "shadow_seed_api_removed",
    "shadow_seed_api_used",
  ]) {
    if (attestation[field] !== true) {
      throw new Error("Stage 4 guarded Data or shadow seed closeout is incomplete");
    }
  }

  const apiUrl = assertExactLoopbackHttpOrigin(
    attestation.api_url,
    "Stage 4 API URL",
  );
  const authApiUrl = assertExactLoopbackHttpOrigin(
    attestation.auth_api_url,
    "Stage 4 Auth API URL",
  );
  const guardedDataApiUrl = assertExactLoopbackHttpOrigin(
    attestation.guarded_data_api_url,
    "Stage 4 guarded raw Data API URL",
  );
  if (apiUrl.origin === authApiUrl.origin) {
    throw new Error("Stage 4 guarded Data and Auth API URLs must be distinct");
  }
  const appOrigin = assertExactLoopbackHttpOrigin(
    attestation.app_origin,
    "Stage 4 app origin",
  );
  const expectedOrigin = assertExactLoopbackHttpOrigin(
    expectedAppOrigin,
    "Expected Stage 4 app origin",
  );
  if (appOrigin.origin !== expectedOrigin.origin) {
    throw new Error("Stage 4 attested app origin does not match capture base URL");
  }

  assertPositiveInteger(attestation.ports?.base, "Stage 4 isolated base port");
  assertPositiveInteger(attestation.ports?.app, "Stage 4 app port");
  assertPositiveInteger(attestation.ports?.auth, "Stage 4 Auth API port");
  assertPositiveInteger(attestation.ports?.data, "Stage 4 Data API port");
  assertPositiveInteger(
    attestation.ports?.guarded,
    "Stage 4 guarded raw Data API port",
  );
  if (Number(appOrigin.port) !== attestation.ports.app) {
    throw new Error("Stage 4 app origin port does not match attestation");
  }
  if (
    Number(authApiUrl.port) !== attestation.ports.auth
    || attestation.ports.auth !== attestation.ports.base + 1
  ) {
    throw new Error("Stage 4 Auth API URL is outside the isolated port range");
  }
  if (Number(apiUrl.port) !== attestation.ports.data) {
    throw new Error("Stage 4 guarded Data API port does not match attestation");
  }
  if (Number(guardedDataApiUrl.port) !== attestation.ports.guarded) {
    throw new Error("Stage 4 guarded raw Data API port does not match attestation");
  }
  const distinctPorts = new Set([
    attestation.ports.app,
    attestation.ports.auth,
    attestation.ports.data,
    attestation.ports.guarded,
  ]);
  if (distinctPorts.size !== 4) {
    throw new Error("Stage 4 app, Auth, Data and guarded ports must be distinct");
  }
  if (
    attestation.ports.data >= attestation.ports.base
    && attestation.ports.data <= attestation.ports.base + 7
  ) {
    throw new Error("Stage 4 guarded Data API overlaps the isolated port range");
  }
  if (
    attestation.ports.app >= attestation.ports.base
    && attestation.ports.app <= attestation.ports.base + 7
  ) {
    throw new Error("Stage 4 app port overlaps the isolated Supabase port range");
  }
  if (
    attestation.ports.guarded >= attestation.ports.base
    && attestation.ports.guarded <= attestation.ports.base + 7
  ) {
    throw new Error("Stage 4 guarded raw Data API overlaps the isolated range");
  }

  for (const kind of ["containers", "networks", "volumes"]) {
    assertPositiveInteger(attestation.docker?.[kind], `Stage 4 Docker ${kind}`);
  }

  return {
    auth_public_issuer: attestation.auth_public_issuer,
    api_url: apiUrl.origin,
    app_origin: appOrigin.origin,
    auth_api_url: authApiUrl.origin,
    canonical_activation: canonicalActivation,
    docker: {
      containers: attestation.docker.containers,
      networks: attestation.docker.networks,
      volumes: attestation.docker.volumes,
    },
    generated_at: attestation.generated_at,
    guarded_data_api_url: guardedDataApiUrl.origin,
    guarded_data_api_used: true,
    guarded_data_proxy_used: true,
    migration_sha256: attestation.migration_sha256,
    negative_probe_passed: true,
    pinned_isolated_local: true,
    rehearsal_only: true,
    ports: {
      app: attestation.ports.app,
      auth: attestation.ports.auth,
      base: attestation.ports.base,
      data: attestation.ports.data,
      guarded: attestation.ports.guarded,
    },
    primary_guard_unchanged: true,
    project_id: attestation.project_id,
    qa_fixture_scope: buildStage4QaFixtureScope(),
    remote_linked_cloud_access: 0,
    server_env_sha256: attestation.server_env_sha256,
    server_env_target: "isolated-supabase",
    shadow_seed_api_removed: true,
    shadow_seed_api_used: true,
    source_head_sha: attestation.source_head_sha,
    supabase_cli_version: STAGE4_SUPABASE_CLI_VERSION,
  };
}

export function buildConservativeStateMatrix({
  observedStateCandidate,
  requiredStates,
}) {
  if (!Array.isArray(requiredStates) || requiredStates.length === 0) {
    throw new Error("Stage 4 required states are missing");
  }
  return {
    observed_state_candidate: observedStateCandidate ?? null,
    pending_states: [...requiredStates],
    verified_states: [],
  };
}

const STAGE4_PRIVATE_NONDISCLOSURE_FACETS = [
  "private-owner-visible",
  "private-other-owner-denied",
  "private-public-list-absent",
  "quarantined-public-list-absent",
  "deleted-public-list-absent",
  "public-detail-nondisclosure",
  "search-nondisclosure",
  "tag-theme-nondisclosure",
  "cache-seo-nondisclosure",
];

function assertStage4ProofEvidence(entry, sourceHeadSha, label) {
  if (!entry || typeof entry !== "object" || entry.result !== "passed") {
    throw new Error(`Stage 4 ${label} evidence must be passed`);
  }
  if (
    !["playwright", "postgres", "real-browser", "vitest"].includes(entry.kind)
  ) {
    throw new Error(`Stage 4 ${label} evidence kind is invalid`);
  }
  if (
    typeof entry.path !== "string"
    || entry.path.length === 0
    || entry.path.startsWith("/")
    || entry.path.split(/[\\/]/u).includes("..")
  ) {
    throw new Error(`Stage 4 ${label} evidence path is unsafe`);
  }
  if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? "")) {
    throw new Error(`Stage 4 ${label} evidence sha256 is invalid`);
  }
  if (entry.source_head_sha !== sourceHeadSha) {
    throw new Error(`Stage 4 ${label} evidence source head is stale`);
  }
  return { ...entry };
}

export function finalizeStage4Proof({
  captureManifest,
  proofLedger,
  stateMatrices,
}) {
  const sourceHeadSha = captureManifest?.source_head_sha;
  if (!/^[a-f0-9]{40}$/u.test(sourceHeadSha ?? "")) {
    throw new Error("Stage 4 capture source head is invalid");
  }
  if (proofLedger?.source_head_sha !== sourceHeadSha) {
    throw new Error("Stage 4 proof source head does not match capture source head");
  }
  if (
    captureManifest?.quality?.quality_status !== "passed"
    || captureManifest?.real_local_stack !== true
    || captureManifest?.remote_linked_cloud_access !== 0
    || captureManifest?.owner_boundary?.main_authenticated !== true
    || captureManifest?.owner_boundary?.other_authenticated !== true
    || captureManifest?.owner_boundary?.distinct_profiles !== true
  ) {
    throw new Error("Stage 4 capture preconditions are incomplete");
  }
  if (!Array.isArray(stateMatrices) || stateMatrices.length === 0) {
    throw new Error("Stage 4 state matrices are missing");
  }

  const privateProof = proofLedger?.private_nondisclosure;
  if (privateProof?.status !== "passed") {
    throw new Error("Stage 4 private nondisclosure proof is incomplete");
  }
  const privateFacets = new Set(privateProof.facets ?? []);
  for (const facet of STAGE4_PRIVATE_NONDISCLOSURE_FACETS) {
    if (!privateFacets.has(facet)) {
      throw new Error(`Stage 4 private nondisclosure facet is missing: ${facet}`);
    }
  }
  if (!Array.isArray(privateProof.evidence) || privateProof.evidence.length === 0) {
    throw new Error("Stage 4 private nondisclosure evidence is missing");
  }
  const privateEvidence = privateProof.evidence.map((entry, index) =>
    assertStage4ProofEvidence(entry, sourceHeadSha, `private:${index}`)
  );

  const finalizedMatrices = stateMatrices.map((matrix) => {
    const screen = matrix?.screen;
    const requiredStates = matrix?.required_states;
    if (
      typeof screen !== "string"
      || !Array.isArray(requiredStates)
      || requiredStates.length === 0
      || matrix.source_head_sha !== sourceHeadSha
      || matrix?.quality?.quality_status !== "passed"
    ) {
      throw new Error(`Stage 4 state matrix is invalid: ${screen ?? "unknown"}`);
    }
    const proofStates = proofLedger?.screens?.[screen]?.states;
    const stateEvidence = {};
    for (const state of requiredStates) {
      const entries = proofStates?.[state];
      if (!Array.isArray(entries) || entries.length === 0) {
        throw new Error(`Stage 4 missing proof for ${screen}:${state}`);
      }
      stateEvidence[state] = entries.map((entry, index) =>
        assertStage4ProofEvidence(
          entry,
          sourceHeadSha,
          `${screen}:${state}:${index}`,
        )
      );
    }
    return {
      ...matrix,
      pending_states: [],
      state_evidence: stateEvidence,
      verified_states: [...requiredStates],
    };
  });

  return {
    owner_boundary: {
      ...captureManifest.owner_boundary,
      private_nondisclosure: {
        evidence: privateEvidence,
        facets: [...STAGE4_PRIVATE_NONDISCLOSURE_FACETS],
        status: "passed",
      },
    },
    stage4_complete: true,
    state_matrices: finalizedMatrices,
  };
}

export function summarizeStage4Quality(observations) {
  const totals = (Array.isArray(observations) ? observations : []).reduce(
    (summary, observation) => {
      const metrics = observation?.metrics ?? {};
      summary.axe += Array.isArray(metrics.serious_or_critical_axe)
        ? metrics.serious_or_critical_axe.length
        : 0;
      summary.overflow += Number(metrics.horizontal_overflow_px) > 0 ? 1 : 0;
      summary.targets += Array.isArray(metrics.touch_target_failures)
        ? metrics.touch_target_failures.length
        : 0;
      return summary;
    },
    { axe: 0, overflow: 0, targets: 0 },
  );
  return {
    axe_serious_or_critical: totals.axe,
    horizontal_overflow_observations: totals.overflow,
    quality_status:
      totals.axe > 0 || totals.overflow > 0 || totals.targets > 0
        ? "failed"
        : "passed",
    touch_target_failures: totals.targets,
  };
}

export function assertStableProfileIdentity(previousSha, nextSha) {
  if (!SHA256_PATTERN.test(nextSha ?? "")) {
    throw new Error("Stage 4 profile identity digest is invalid");
  }
  if (previousSha && previousSha !== nextSha) {
    throw new Error("Stage 4 main profile changed across viewports");
  }
  return nextSha;
}

function buildStage4LocalProfileFailure({
  attemptCount,
  code,
  errorCode,
  status,
}) {
  const error = new Error(
    `Stage 4 local profile verification failed (${status ?? "unknown"}, ${errorCode})`,
  );
  error.code = code;
  error.safeFailure = {
    attempt_count: attemptCount,
    code,
    last_error_code: errorCode,
    last_http_status: status ?? null,
  };
  return error;
}

function readStage4LocalProfileAttempt(response) {
  const status = Number.isInteger(response?.status) ? response.status : null;
  const payload = response?.payload ?? null;
  const errorCode = typeof payload?.error?.code === "string"
    ? payload.error.code
    : payload?.success === true
      ? "unexpected_profile"
      : "unknown";
  return {
    errorCode,
    payload,
    retryable: payload?.success === false && (
      (
        status === 409
        && payload?.error?.code === "ACCOUNT_SESSION_STALE"
      )
      || (
        status === 500
        && payload?.error?.code === "INTERNAL_ERROR"
      )
    ),
    status,
  };
}

/**
 * @param {{
 *   expectedEmail: string,
 *   expectedId?: string | null,
 *   getDelayMs?: (context: {
 *     attemptCount: number,
 *     remainingMs: number,
 *     startedAt: number,
 *     status: number | null,
 *   }) => number,
 *   maxAttempts?: number,
 *   now?: () => number,
 *   probe: () => Promise<{ payload: unknown, status: number | null } | undefined>,
 *   sleep?: (durationMs: number) => Promise<void>,
 *   timeoutMs?: number,
 * }} options
 * @returns {Promise<{ email: string, id: string }>}
 */
export async function pollStage4LocalProfile({
  expectedEmail,
  expectedId = null,
  getDelayMs = () => 150,
  maxAttempts = 4,
  now = () => Date.now(),
  probe,
  sleep = (durationMs) => new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  }),
  timeoutMs = 1_500,
}) {
  if (
    typeof expectedEmail !== "string"
    || expectedEmail.length === 0
    || typeof probe !== "function"
    || typeof getDelayMs !== "function"
    || !Number.isInteger(maxAttempts)
    || maxAttempts < 1
    || typeof now !== "function"
    || typeof sleep !== "function"
    || !Number.isInteger(timeoutMs)
    || timeoutMs < 1
  ) {
    throw new Error("Stage 4 local profile polling options are invalid");
  }

  const startedAt = now();
  let attemptCount = 0;
  let lastStatus = null;
  let lastErrorCode = "unknown";

  while (attemptCount < maxAttempts && now() - startedAt <= timeoutMs) {
    attemptCount += 1;
    const attempt = readStage4LocalProfileAttempt(await probe());
    lastStatus = attempt.status;
    lastErrorCode = attempt.errorCode;

    if (attempt.status === 200 && attempt.payload?.success === true) {
      const profileId = attempt.payload?.data?.id;
      const profileEmail = attempt.payload?.data?.email;
      if (
        typeof profileId === "string"
        && profileEmail === expectedEmail
        && (expectedId === null || profileId === expectedId)
      ) {
        return {
          email: profileEmail,
          id: profileId,
        };
      }
      throw buildStage4LocalProfileFailure({
        attemptCount,
        code: "stage4_local_profile_unexpected",
        errorCode: "unexpected_profile",
        status: attempt.status,
      });
    }

    if (!attempt.retryable) {
      throw buildStage4LocalProfileFailure({
        attemptCount,
        code: "stage4_local_profile_unexpected",
        errorCode: attempt.errorCode,
        status: attempt.status,
      });
    }

    const remainingMs = timeoutMs - (now() - startedAt);
    if (attemptCount >= maxAttempts || remainingMs <= 0) {
      break;
    }

    const delayMs = getDelayMs({
      attemptCount,
      remainingMs,
      startedAt,
      status: attempt.status,
    });
    if (!Number.isInteger(delayMs) || delayMs < 0) {
      throw new Error("Stage 4 local profile polling delay is invalid");
    }
    if (delayMs > remainingMs) {
      break;
    }
    await sleep(delayMs);
  }

  throw buildStage4LocalProfileFailure({
    attemptCount,
    code: "stage4_local_profile_retry_exhausted",
    errorCode: lastErrorCode,
    status: lastStatus,
  });
}

/**
 * @param {{
 *   expectedEmail: string,
 *   expectedId?: string | null,
 *   fetchProfile: () => Promise<{ payload: unknown, status: number | null } | undefined>,
 *   intervalMs?: number,
 *   maxAttempts?: number,
 *   now?: () => number,
 *   sleep?: (durationMs: number) => Promise<void>,
 *   timeoutMs?: number,
 * }} options
 * @returns {Promise<{ email: string, id: string }>}
 */
export async function verifyStage4LocalProfile({
  expectedEmail,
  expectedId = null,
  fetchProfile,
  intervalMs = 150,
  maxAttempts = 4,
  now = () => Date.now(),
  sleep = (durationMs) => new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  }),
  timeoutMs = 1_500,
}) {
  if (
    typeof expectedEmail !== "string"
    || expectedEmail.length === 0
    || typeof fetchProfile !== "function"
    || !Number.isInteger(intervalMs)
    || intervalMs < 1
  ) {
    throw new Error("Stage 4 local profile verification options are invalid");
  }
  return pollStage4LocalProfile({
    expectedEmail,
    expectedId,
    getDelayMs: () => intervalMs,
    maxAttempts,
    now,
    probe: fetchProfile,
    sleep,
    timeoutMs,
  });
}

export function assertNoRemoteSupabaseViolations(violations) {
  if (Array.isArray(violations) && violations.length > 0) {
    throw new Error(
      `remote Supabase request detected: ${[...new Set(violations)].join(", ")}`,
    );
  }
}

export function canPromoteStage4Evidence({
  qualityStatus,
  stage4Complete,
}) {
  return stage4Complete === true && qualityStatus === "passed";
}
