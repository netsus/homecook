import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { inventoryHybridAuthorityPaths } from "./hybrid-authority-inventory.mjs";
import {
  assertRecipeSnapshotAuthorityFullLocalEnvironment,
  assertRecipeSnapshotAuthorityFullLocalResult,
  buildRecipeSnapshotAuthorityFullLocalPsqlRequest,
  buildRecipeSnapshotAuthorityFullLocalVerificationPlan,
} from "./recipe-snapshot-authority-full-local-verifier.mjs";
import {
  assertRecipeSnapshotAuthorityMergedExactSource,
} from "./recipe-snapshot-authority-remote-verifier.mjs";

const MODE = "post-merge-full-local-read-only";
const TARGET = "self-hosted-local-auth-db-storage-single-authority";
const SOURCE_OF_RECORD = "live-remote-read-only-pre-floor";
const SAFE_CHECK_ENVIRONMENT_KEYS = [
  "PATH",
  "LANG",
  "LC_ALL",
  "HOME",
  "TMPDIR",
  "CI",
  "NO_COLOR",
  "FORCE_COLOR",
  "TZ",
];

const PERSONAL_EDITOR_CHECKS = [
  {
    id: "personal-editor-permissions-contract",
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      "tests/personal-recipe-editor-permissions.test.ts",
      "tests/personal-recipe-editor-contract.test.ts",
    ],
  },
  {
    id: "personal-editor-full-local-source-boundary",
    command: "pnpm",
    args: [
      "exec",
      "vitest",
      "run",
      "tests/personal-recipe-editor-full-local-verifier.test.ts",
    ],
  },
];

const MANUAL_ONLY_PENDING = [
  "provider-live-callback-link",
  "cloudflare-public-edge",
  "final-backup-restore",
  "off-mac-restore",
  "first-local-mutation-cutover",
  "post-floor-recovery",
];

const SOURCE_EVIDENCE_KEYS = [
  "app_surface_personal_editor_marker_count",
  "browser_direct_storage_path_count",
  "capability_on_occurrence_count",
  "capability_off_occurrence_count",
  "internal_operation_violation_count",
  "legacy_recipe_post_handler_count",
  "mypage_surface_personal_editor_marker_count",
  "personal_create_active_entry",
  "recipe_collection_personal_editor_marker_count",
  "recipe_collection_personal_origin_field_count",
  "recipe_delete_handler_count",
  "recipe_patch_handler_count",
  "recipebook_surface_personal_editor_marker_count",
  "user_direct_service_role_count",
  "user_service_role_violation_count",
].sort();

const BOUNDARY_CHECKS = {
  owner_access: "passed",
  other_owner_nondisclosure: "passed",
  deleted_nondisclosure: "passed",
  quarantined_nondisclosure: "passed",
  public_surface_boundary: "passed",
  browser_direct_data_storage_mutation: "zero",
  service_role_user_fallback: "zero",
  remote_application_writes: "zero",
};

function hasExactKeys(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return actualKeys.length === sortedExpectedKeys.length
    && actualKeys.every((key, index) => key === sortedExpectedKeys[index]);
}

function listSourceFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, {
    encoding: "utf8",
    withFileTypes: true,
  })) {
    if (entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(path));
    } else if (entry.isFile() && /\.(?:ts|tsx)$/u.test(entry.name)) {
      files.push(path);
    }
  }
  return files.sort();
}

function countPatternMatchesInFiles(files, pattern) {
  return files.reduce((total, file) => {
    const source = readFileSync(file, "utf8");
    return total + (source.match(pattern)?.length ?? 0);
  }, 0);
}

export function assertPersonalRecipeEditorFullLocalEnvironment(environment) {
  try {
    assertRecipeSnapshotAuthorityFullLocalEnvironment(environment);
  } catch {
    throw new Error(
      "personal recipe editor verifier requires local Auth and Data authority",
    );
  }
}

export function assertPersonalRecipeEditorMergedExactSource(source) {
  try {
    return assertRecipeSnapshotAuthorityMergedExactSource(source);
  } catch {
    throw new Error(
      "personal recipe editor verifier requires a clean merged exact origin/master source",
    );
  }
}

export function buildPersonalRecipeEditorCheckEnvironment(
  baseEnvironment = {},
) {
  return Object.fromEntries(
    SAFE_CHECK_ENVIRONMENT_KEYS
      .filter((key) => baseEnvironment[key] !== undefined)
      .map((key) => [key, baseEnvironment[key]]),
  );
}

export function buildPersonalRecipeEditorFullLocalVerificationPlan({ mode }) {
  if (mode !== MODE) {
    throw new Error(
      "unsupported personal recipe editor full-local verification mode: "
        + (mode ?? "missing"),
    );
  }
  const fullLocalPlan = buildRecipeSnapshotAuthorityFullLocalVerificationPlan({
    mode,
  });
  return {
    ...fullLocalPlan,
    mode,
    target: TARGET,
    sourceOfRecord: SOURCE_OF_RECORD,
    stableRemoteUuidRestore: true,
    remoteTransientAuthState: "excluded-relogin-required",
    externalPersonalWrite: "dark",
    requiredChecks: [
      ...PERSONAL_EDITOR_CHECKS.map((check) => ({
        ...check,
        args: [...check.args],
      })),
      ...fullLocalPlan.requiredChecks,
    ],
    manualOnlyPending: [...MANUAL_ONLY_PENDING],
  };
}

export function buildPersonalRecipeEditorFullLocalPsqlRequest(options) {
  try {
    return buildRecipeSnapshotAuthorityFullLocalPsqlRequest(options);
  } catch {
    throw new Error(
      "personal recipe editor full-local verifier requires a credentialed loopback database and read-only SQL",
    );
  }
}

export function collectPersonalRecipeEditorSourceEvidence(repositoryRoot) {
  const inventory = inventoryHybridAuthorityPaths(repositoryRoot);
  const appSourceFiles = listSourceFiles(join(repositoryRoot, "app"));
  const mypageSourceFiles = listSourceFiles(
    join(repositoryRoot, "components/mypage"),
  );
  const recipebookSourceFiles = listSourceFiles(
    join(repositoryRoot, "components/recipebook"),
  );
  const detailSource = readFileSync(
    join(repositoryRoot, "components/recipe/recipe-detail-screen.tsx"),
    "utf8",
  );
  const policySource = readFileSync(
    join(repositoryRoot, "lib/personal-recipe-editor.ts"),
    "utf8",
  );
  const recipeRouteSource = readFileSync(
    join(repositoryRoot, "app/api/v1/recipes/[id]/route.ts"),
    "utf8",
  );
  const recipeCollectionRouteSource = readFileSync(
    join(repositoryRoot, "app/api/v1/recipes/route.ts"),
    "utf8",
  );
  const capabilityOccurrenceCount =
    detailSource.match(/\bcapabilityEnabled\b/gu)?.length ?? 0;
  const capabilityOffOccurrenceCount =
    detailSource.match(/capabilityEnabled=\{false\}/gu)?.length ?? 0;
  const personalCreateCase =
    policySource.match(
      /case\s+"personal-create"(?<body>[\s\S]*?)(?=\n\s*case\s+|\n\s*\}\n)/u,
    )?.groups?.body ?? "";

  return {
    app_surface_personal_editor_marker_count:
      countPatternMatchesInFiles(
        appSourceFiles,
        /\b(?:personal-create|personal-edit|public-fork|personal_recipe_v2)\b|내 레시피로 수정/gu,
      ),
    browser_direct_storage_path_count:
      inventory.browserDirectStoragePaths.length,
    capability_on_occurrence_count:
      capabilityOccurrenceCount - capabilityOffOccurrenceCount,
    capability_off_occurrence_count: capabilityOffOccurrenceCount,
    internal_operation_violation_count:
      inventory.internalOperationViolations.length,
    legacy_recipe_post_handler_count:
      recipeCollectionRouteSource.match(
        /export\s+async\s+function\s+POST\b/gu,
      )?.length ?? 0,
    mypage_surface_personal_editor_marker_count:
      countPatternMatchesInFiles(
        mypageSourceFiles,
        /\b(?:personal-create|personal-edit|public-fork|personal_recipe_v2)\b|내 레시피로 수정/gu,
      ),
    personal_create_active_entry:
      !/activeEntry:\s*false/u.test(personalCreateCase),
    recipe_collection_personal_editor_marker_count:
      recipeCollectionRouteSource.match(
        /\b(?:personal-create|personal-edit|public-fork|personal_recipe_v2)\b/gu,
      )?.length ?? 0,
    recipe_collection_personal_origin_field_count:
      recipeCollectionRouteSource.match(/\borigin_recipe_id\b/gu)?.length ?? 0,
    recipe_delete_handler_count:
      recipeRouteSource.match(/export\s+async\s+function\s+DELETE\b/gu)
        ?.length ?? 0,
    recipe_patch_handler_count:
      recipeRouteSource.match(/export\s+async\s+function\s+PATCH\b/gu)
        ?.length ?? 0,
    recipebook_surface_personal_editor_marker_count:
      countPatternMatchesInFiles(
        recipebookSourceFiles,
        /\b(?:personal-create|personal-edit|public-fork|personal_recipe_v2)\b|내 레시피로 수정/gu,
      ),
    user_direct_service_role_count:
      inventory.userDirectServiceRoleEntries.length,
    user_service_role_violation_count:
      inventory.userServiceRoleViolations.length,
  };
}

export function assertPersonalRecipeEditorSourceEvidence(evidence) {
  const countKeys = SOURCE_EVIDENCE_KEYS.filter(
    (key) => key !== "personal_create_active_entry",
  );
  const valid =
    hasExactKeys(evidence, SOURCE_EVIDENCE_KEYS)
    && countKeys.every(
      (key) => Number.isInteger(evidence[key]) && evidence[key] >= 0,
    )
    && evidence.app_surface_personal_editor_marker_count === 0
    && evidence.browser_direct_storage_path_count === 0
    && evidence.capability_on_occurrence_count === 0
    && evidence.capability_off_occurrence_count > 0
    && evidence.internal_operation_violation_count === 0
    && evidence.legacy_recipe_post_handler_count === 1
    && evidence.mypage_surface_personal_editor_marker_count === 0
    && evidence.personal_create_active_entry === false
    && evidence.recipe_collection_personal_editor_marker_count === 0
    && evidence.recipe_collection_personal_origin_field_count === 0
    && evidence.recipe_delete_handler_count === 0
    && evidence.recipe_patch_handler_count === 0
    && evidence.recipebook_surface_personal_editor_marker_count === 0
    && evidence.user_direct_service_role_count === 0
    && evidence.user_service_role_violation_count === 0;
  if (!valid) {
    throw new Error("personal recipe editor source evidence failed closed");
  }
  return evidence;
}

export function assertPersonalRecipeEditorFullLocalResult(result) {
  if (!hasExactKeys(result, [
    "full_local_authority",
    "personal_editor_source",
  ])) {
    throw new Error("personal recipe editor full-local result failed closed");
  }
  try {
    assertRecipeSnapshotAuthorityFullLocalResult(result.full_local_authority);
    assertPersonalRecipeEditorSourceEvidence(result.personal_editor_source);
  } catch {
    throw new Error("personal recipe editor full-local result failed closed");
  }
  return result;
}

export function assertPersonalRecipeEditorFullLocalExecutionEvidence(evidence) {
  const plan = buildPersonalRecipeEditorFullLocalVerificationPlan({
    mode: MODE,
  });
  const valid =
    hasExactKeys(evidence, [
      "source_merge_sha",
      "checks",
      "manual_only",
      "boundary_checks",
      "production_writes",
      "staging_writes",
      "remote_application_writes",
    ])
    && /^[0-9a-f]{40}$/u.test(evidence.source_merge_sha)
    && hasExactKeys(
      evidence.checks,
      plan.requiredChecks.map((check) => check.id),
    )
    && Object.values(evidence.checks).every((status) => status === "passed")
    && hasExactKeys(evidence.manual_only, MANUAL_ONLY_PENDING)
    && Object.values(evidence.manual_only).every(
      (status) => status === "pending",
    )
    && hasExactKeys(evidence.boundary_checks, Object.keys(BOUNDARY_CHECKS))
    && Object.entries(BOUNDARY_CHECKS).every(
      ([key, value]) => evidence.boundary_checks[key] === value,
    )
    && evidence.production_writes === 0
    && evidence.staging_writes === 0
    && evidence.remote_application_writes === 0;
  if (!valid) {
    throw new Error(
      "personal recipe editor full-local execution evidence failed closed",
    );
  }
  return evidence;
}

export function buildPersonalRecipeEditorFullLocalSummary({
  mergeSha,
  localResult,
  executionEvidence,
}) {
  if (!/^[0-9a-f]{40}$/u.test(mergeSha ?? "")) {
    throw new Error(
      "personal recipe editor full-local verification requires an exact merge SHA",
    );
  }
  assertPersonalRecipeEditorFullLocalResult(localResult);
  assertPersonalRecipeEditorFullLocalExecutionEvidence(executionEvidence);
  if (executionEvidence.source_merge_sha !== mergeSha) {
    throw new Error(
      "personal recipe editor full-local execution evidence must match the exact merge SHA",
    );
  }

  return {
    ok: true,
    mode: MODE,
    target: TARGET,
    merge_sha: mergeSha,
    source_of_record_status: SOURCE_OF_RECORD,
    full_local_auth_db_storage_status: "ready",
    stable_remote_uuid_restore_status: "ready",
    remote_transient_auth_state_status: "excluded-relogin-required",
    local_session_rls_owner_boundary_status: "ready",
    personal_editor_permission_boundary_status: "ready",
    public_surface_status: "app-and-official-auth-v1-only",
    private_storage_image_authority_status: "ready",
    external_personal_write_status: "dark",
    automated_check_count:
      Object.keys(executionEvidence.checks).length,
    manual_only_status: "pending",
    manual_only_pending: [...MANUAL_ONLY_PENDING],
    production_writes: 0,
    staging_writes: 0,
    remote_application_writes: 0,
  };
}

export function buildPersonalRecipeEditorBoundaryChecks() {
  return { ...BOUNDARY_CHECKS };
}
