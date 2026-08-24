import { createHmac } from "node:crypto";

const STAGE4_PRIMARY_GUARD =
  "pgrst.db_pre_request=public.verify_hybrid_request_authority_pre_request";
const CONTAINER_ID_PATTERN = /^[a-f0-9]{64}$/u;
const CONTAINER_NAME_PATTERN = /^homecook_stage4_(?:guarded|seed)_rest_hcg_[a-z0-9_]+$/u;
const PROJECT_ID_PATTERN = /^hcg_[a-z0-9_]+$/u;
const SERVICE_LABELS = new Set([
  "stage4-guarded-postgrest",
  "stage4-shadow-seed-postgrest",
]);

export function buildStage4AuxiliaryIdentityFailure(detail = "identity") {
  const safeFailure = {
    code: "auxiliary_identity_mismatch",
    message: "Stage 4 auxiliary Docker identity could not be proven",
  };
  const safeDetail = new Set(["container id", "identity", "same-name"])
    .has(detail)
    ? detail
    : "identity";
  const error = new Error(
    `Stage 4 auxiliary Docker ${safeDetail} could not be proven`,
  );
  error.code = safeFailure.code;
  error.safeFailure = safeFailure;
  return error;
}

export function assertStage4AuxiliaryContainerRunId(output) {
  const lines = typeof output === "string"
    ? output.trim().split(/\r?\n/u).filter(Boolean)
    : [];
  if (lines.length !== 1 || !CONTAINER_ID_PATTERN.test(lines[0])) {
    throw buildStage4AuxiliaryIdentityFailure("container id");
  }
  return lines[0];
}

export function runStage4AuxiliaryContainerStart({
  assertNameAvailable,
  start,
}) {
  if (
    typeof assertNameAvailable !== "function"
    || typeof start !== "function"
  ) {
    throw buildStage4AuxiliaryIdentityFailure();
  }
  try {
    assertNameAvailable();
    return assertStage4AuxiliaryContainerRunId(start());
  } catch (error) {
    if (error?.code === "auxiliary_identity_mismatch") throw error;
    throw buildStage4AuxiliaryIdentityFailure();
  }
}

export function assertStage4AuxiliaryContainerIdentity({ expected, resource }) {
  const labels = resource?.Config?.Labels ?? {};
  const actualName = typeof resource?.Name === "string"
    ? resource.Name.replace(/^\//u, "")
    : "";
  const validExpected = CONTAINER_ID_PATTERN.test(expected?.containerId ?? "")
    && CONTAINER_NAME_PATTERN.test(expected?.containerName ?? "")
    && PROJECT_ID_PATTERN.test(expected?.projectId ?? "")
    && expected.containerName.endsWith(`_${expected.projectId}`)
    && SERVICE_LABELS.has(expected?.serviceLabel);
  if (
    !validExpected
    || resource?.Id !== expected.containerId
    || actualName !== expected.containerName
    || labels["com.docker.compose.project"] !== expected.projectId
    || labels["com.docker.compose.service"] !== expected.serviceLabel
  ) {
    throw buildStage4AuxiliaryIdentityFailure();
  }
  return expected.containerId;
}

export function assertNoStage4AuxiliaryContainerName({
  expectedName,
  resources,
}) {
  if (!CONTAINER_NAME_PATTERN.test(expectedName ?? "") || !Array.isArray(resources)) {
    throw buildStage4AuxiliaryIdentityFailure("same-name");
  }
  const sameName = resources.some((resource) =>
    typeof resource?.Name === "string"
    && resource.Name.replace(/^\//u, "") === expectedName
  );
  if (sameName) {
    throw buildStage4AuxiliaryIdentityFailure("same-name");
  }
  return true;
}

function encodeJwtPart(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function createStage4ShadowSeedDatabaseJwt({
  jwtSecret,
  nowSeconds = Math.floor(Date.now() / 1_000),
}) {
  if (typeof jwtSecret !== "string" || jwtSecret.length < 32) {
    throw new Error("Stage 4 shadow seed JWT secret must be at least 32 characters");
  }
  if (!Number.isInteger(nowSeconds) || nowSeconds <= 0) {
    throw new Error("Stage 4 shadow seed JWT issue time is invalid");
  }
  const header = encodeJwtPart({ alg: "HS256", typ: "JWT" });
  const payload = encodeJwtPart({
    aud: "authenticated",
    exp: nowSeconds + 3_600,
    iat: nowSeconds,
    role: "postgres",
  });
  const unsigned = `${header}.${payload}`;
  const signature = createHmac("sha256", jwtSecret)
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
}

export function buildStage4ShadowSeedContainerArgs({
  containerName,
  environmentFilePath,
  image,
  networkId,
  port,
  projectId,
}) {
  if (
    typeof containerName !== "string"
    || !containerName.startsWith("homecook_stage4_seed_rest_")
    || typeof environmentFilePath !== "string"
    || environmentFilePath.length === 0
    || typeof image !== "string"
    || image.length === 0
    || typeof networkId !== "string"
    || networkId.length === 0
    || !Number.isInteger(port)
    || port < 1_024
    || port > 65_535
    || !/^hcg_[a-z0-9_]+$/u.test(projectId ?? "")
  ) {
    throw new Error("Stage 4 shadow seed container configuration is invalid");
  }
  return [
    "run",
    "--detach",
    "--name",
    containerName,
    "--label",
    `com.docker.compose.project=${projectId}`,
    "--label",
    "com.docker.compose.service=stage4-shadow-seed-postgrest",
    "--network",
    networkId,
    "--publish",
    `127.0.0.1:${port}:3000`,
    "--env-file",
    environmentFilePath,
    image,
  ];
}

export function buildStage4GuardedDataContainerArgs({
  containerName,
  environmentFilePath,
  image,
  networkId,
  port,
  projectId,
}) {
  if (
    typeof containerName !== "string"
    || !containerName.startsWith("homecook_stage4_guarded_rest_")
    || typeof environmentFilePath !== "string"
    || environmentFilePath.length === 0
    || typeof image !== "string"
    || image.length === 0
    || typeof networkId !== "string"
    || networkId.length === 0
    || !Number.isInteger(port)
    || port < 1_024
    || port > 65_535
    || !/^hcg_[a-z0-9_]+$/u.test(projectId ?? "")
  ) {
    throw new Error("Stage 4 guarded Data API container configuration is invalid");
  }
  return [
    "run",
    "--detach",
    "--name",
    containerName,
    "--label",
    `com.docker.compose.project=${projectId}`,
    "--label",
    "com.docker.compose.service=stage4-guarded-postgrest",
    "--network",
    networkId,
    "--publish",
    `127.0.0.1:${port}:3000`,
    "--env-file",
    environmentFilePath,
    image,
  ];
}

export function assertNoStage4ShadowSeedContainers({ containers, projectId }) {
  if (!Array.isArray(containers) || !/^hcg_[a-z0-9_]+$/u.test(projectId ?? "")) {
    throw new Error("Stage 4 shadow seed cleanup inventory is invalid");
  }
  const expectedName = `homecook_stage4_seed_rest_${projectId}`;
  const remaining = containers.filter((container) =>
    container?.name === expectedName && container?.project === projectId
  );
  if (remaining.length > 0) {
    throw new Error("Stage 4 shadow seed cleanup left an owned container");
  }
  return true;
}

export function assertNoStage4GuardedDataContainers({ containers, projectId }) {
  if (!Array.isArray(containers) || !/^hcg_[a-z0-9_]+$/u.test(projectId ?? "")) {
    throw new Error("Stage 4 guarded Data API cleanup inventory is invalid");
  }
  const expectedName = `homecook_stage4_guarded_rest_${projectId}`;
  const remaining = containers.filter((container) =>
    container?.name === expectedName && container?.project === projectId
  );
  if (remaining.length > 0) {
    throw new Error("Stage 4 guarded Data API cleanup left an owned container");
  }
  return true;
}

function requireLifecycleAction(action) {
  if (typeof action !== "function") {
    throw new Error("Stage 4 shadow seed lifecycle action is required");
  }
}

/**
 * @param {{
 *   assertShadowRemoved: () => unknown | Promise<unknown>,
 *   negativeProbe: () => unknown | Promise<unknown>,
 *   onPhase?: (phase: string) => void,
 *   removeShadow: () => unknown | Promise<unknown>,
 *   seed: () => unknown | Promise<unknown>,
 *   startShadow: () => unknown | Promise<unknown>,
 *   state: Record<string, boolean>,
 *   verifyPrimaryGuard: () => string | Promise<string>,
 *   verifyPrimaryAuthHealth: () => unknown | Promise<unknown>,
 *   waitShadow: () => unknown | Promise<unknown>,
 * }} options
 */
export async function runStage4ShadowSeedLifecycle({
  assertShadowRemoved,
  negativeProbe,
  onPhase = () => {},
  removeShadow,
  seed,
  startShadow,
  state,
  verifyPrimaryGuard,
  verifyPrimaryAuthHealth,
  waitShadow,
}) {
  for (const action of [
    assertShadowRemoved,
    negativeProbe,
    onPhase,
    removeShadow,
    seed,
    startShadow,
    verifyPrimaryAuthHealth,
    verifyPrimaryGuard,
    waitShadow,
  ]) {
    requireLifecycleAction(action);
  }
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("Stage 4 shadow seed lifecycle state is required");
  }

  const baselineGuard = await verifyPrimaryGuard();
  if (baselineGuard !== STAGE4_PRIMARY_GUARD) {
    throw new Error("Stage 4 primary pre-request guard baseline is invalid");
  }
  onPhase("primary-guard-baseline-verified");

  let seedFailure = null;
  let shadowStarted = false;
  try {
    await startShadow();
    shadowStarted = true;
    state.shadow_seed_api_used = true;
    onPhase("shadow-seed-api-started");
    await waitShadow();
    onPhase("shadow-seed-api-ready");
    onPhase("demo-seed-begin");
    await seed();
    onPhase("demo-seed-complete");
  } catch (error) {
    seedFailure = error;
  }

  if (shadowStarted) {
    await removeShadow();
    await assertShadowRemoved();
    state.shadow_seed_api_removed = true;
    onPhase("shadow-seed-api-removed");
  }

  const currentGuard = await verifyPrimaryGuard();
  if (currentGuard !== baselineGuard) {
    throw new Error("Stage 4 primary pre-request guard changed during shadow seed");
  }
  state.primary_guard_unchanged = true;
  onPhase("primary-guard-unchanged");

  await verifyPrimaryAuthHealth();
  onPhase("primary-auth-health-after-shadow");

  onPhase("negative-probe-begin");
  try {
    await negativeProbe();
    state.negative_probe_passed = true;
    onPhase("negative-probe-pass");
  } catch (error) {
    onPhase(
      error?.code === "negative_probe_timeout"
        ? "negative-probe-timeout"
        : "negative-probe-failed",
    );
    throw error;
  }

  if (seedFailure) throw seedFailure;
  return state;
}
