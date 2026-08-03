import { execFileSync, spawn } from "node:child_process";
import {
  createHmac,
  createPrivateKey,
  randomBytes,
  randomUUID,
  sign as signPayload,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {
  createServer as createHttpsServer,
  get as httpsGet,
  request as httpsRequest,
} from "node:https";
import { request as httpRequest } from "node:http";
import { basename, join, resolve } from "node:path";
import { tmpdir } from "node:os";

import {
  fullLocalImageRefsForPlatform,
  generateFullLocalSecretBundle,
  materializeFullLocalSecrets,
} from "./full-local-production-runtime.mjs";

const SAFE_PROJECT = /^homecook-rehearsal-[a-z0-9-]{1,43}$/u;
const EXACT_SHA = /^[0-9a-f]{40}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function assertSafePlan(plan) {
  if (!plan || typeof plan !== "object") {
    throw new Error("isolated full-local adapter requires a resource plan");
  }
  if (
    !SAFE_PROJECT.test(plan.compose_project ?? "")
    || plan.full_local_env?.FULL_LOCAL_COMPOSE_PROJECT_NAME
      !== plan.compose_project
    || plan.cleanup?.compose_project !== plan.compose_project
    || !Array.isArray(plan.cleanup?.remove_only_named_volumes)
    || plan.cleanup.remove_only_named_volumes.length !== 2
    || !plan.cleanup.remove_only_named_volumes.includes(plan.postgres_volume)
    || !plan.cleanup.remove_only_named_volumes.includes(plan.storage_volume)
  ) {
    throw new Error("isolated full-local adapter requires exact bounded Docker resources");
  }
  const tempRoot = resolve(plan.temp_root ?? "");
  if (
    !tempRoot.startsWith(resolve(tmpdir()))
    || !basename(tempRoot).startsWith("homecook-rehearsal-")
    || tempRoot === resolve(tmpdir())
  ) {
    throw new Error("isolated full-local adapter requires a bounded temporary root");
  }
  for (const value of [
    plan.loopback?.gateway_url,
    plan.loopback?.auth_proxy_url,
    plan.loopback?.public_auth_url,
    plan.loopback?.app_url,
  ]) {
    const parsed = new URL(value);
    if (parsed.hostname !== "127.0.0.1") {
      throw new Error("isolated full-local adapter permits loopback URLs only");
    }
  }
  if (
    plan.loopback.issuer !== `${plan.loopback.public_auth_url}/auth/v1`
    || !plan.loopback.issuer.startsWith("https://127.0.0.1:")
  ) {
    throw new Error("isolated full-local adapter requires an exact HTTPS issuer");
  }
  return { ...plan, temp_root: tempRoot };
}

function command(executable, args, { cwd, env, label }) {
  try {
    return execFileSync(executable, args, {
      cwd,
      encoding: "utf8",
      env,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = String(error?.stderr ?? "")
      .replaceAll(/postgres(?:ql)?:\/\/[^\s]+/giu, "[REDACTED_DATABASE_URL]")
      .replaceAll(
        /(?:password|secret|token|key)=[^\s]+/giu,
        "[REDACTED_CREDENTIAL]",
      )
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-3)
      .join(" | ")
      .slice(0, 800);
    throw new Error(`${label} failed${detail ? `: ${detail}` : ""}`);
  }
}

function compose(runtime, args) {
  return command("docker", [
    "compose",
    "--project-name",
    runtime.plan.compose_project,
    "-f",
    runtime.composeFile,
    "-f",
    runtime.overrideFile,
    ...args,
  ], {
    cwd: runtime.root,
    env: runtime.env,
    label: "isolated full-local compose",
  });
}

async function waitForHealthy(runtime) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const containers = compose(runtime, ["ps", "-q"])
      .trim().split("\n").filter(Boolean);
    if (containers.length === 7) {
      const states = containers.map((container) => JSON.parse(command(
        "docker",
        ["inspect", "--format", "{{json .State}}", container],
        {
          cwd: runtime.root,
          env: runtime.env,
          label: "isolated full-local container inspection",
        },
      )));
      if (states.every((state) =>
        state.Status === "running"
        && (!state.Health || state.Health.Status === "healthy"))) {
        return;
      }
      if (states.some((state) => state.Status === "exited")) {
        throw new Error("isolated full-local container exited before readiness");
      }
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
  }
  throw new Error("isolated full-local runtime did not become healthy");
}

function startHttpsProxy(runtime) {
  const gateway = new URL(runtime.plan.loopback.gateway_url);
  const publicAuth = new URL(runtime.plan.loopback.public_auth_url);
  const server = createHttpsServer({
    cert: readFileSync(runtime.certificateFile),
    key: readFileSync(runtime.privateKeyFile),
  }, (incoming, outgoing) => {
    const upstream = httpRequest({
      hostname: gateway.hostname,
      port: gateway.port,
      method: incoming.method,
      path: incoming.url,
      headers: { ...incoming.headers, host: gateway.host },
    }, (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    });
    upstream.on("error", () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    incoming.pipe(upstream);
  });
  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(Number(publicAuth.port), "127.0.0.1", () =>
      resolveServer(server));
  });
}

function httpsHealth(runtime) {
  return new Promise((resolveHealth, reject) => {
    const request = httpsGet(
      `${runtime.plan.loopback.public_auth_url}/auth/v1/health`,
      {
        ca: readFileSync(runtime.certificateFile),
        headers: { apikey: runtime.secrets.publishable_key },
      },
      (response) => {
        response.resume();
        response.once("end", () => {
          if (response.statusCode === 200) resolveHealth();
          else reject(new Error("isolated HTTPS Auth health check failed"));
        });
      },
    );
    request.once("error", () =>
      reject(new Error("isolated HTTPS Auth health check failed")));
  });
}

function httpsJson(runtime, path) {
  return new Promise((resolveJson, reject) => {
    const request = httpsGet(
      `${runtime.plan.loopback.public_auth_url}${path}`,
      {
        ca: readFileSync(runtime.certificateFile),
        headers: { apikey: runtime.secrets.publishable_key },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.once("end", () => {
          if (response.statusCode !== 200) {
            reject(new Error("isolated HTTPS JSON request failed"));
            return;
          }
          try {
            resolveJson(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error("isolated HTTPS JSON response was invalid"));
          }
        });
      },
    );
    request.once("error", () =>
      reject(new Error("isolated HTTPS JSON request failed")));
  });
}

function applyRepositoryMigrations(runtime) {
  const migrationDirectory = join(runtime.root, "supabase", "migrations");
  const migrations = readdirSync(migrationDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (migrations.length === 0) {
    throw new Error("isolated full-local migration inventory is empty");
  }
  const migrationSql = `${migrations.map((migration) => [
    `\\echo applying ${migration}`,
    "begin;",
    readFileSync(join(migrationDirectory, migration), "utf8"),
    "commit;",
  ].join("\n")).join("\n")}\nnotify pgrst, 'reload schema';\n`;
  try {
    execFileSync("docker", [
      "exec",
      "--interactive",
      runtime.postgresContainer,
      "psql",
      "--username", "postgres",
      "--dbname", "postgres",
      "--set", "ON_ERROR_STOP=1",
    ], {
      cwd: runtime.root,
      encoding: "utf8",
      env: runtime.env,
      input: migrationSql,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = String(error?.stderr ?? "")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-3)
      .join(" | ")
      .slice(0, 800);
    throw new Error(
      `isolated repository migration stream failed${detail ? `: ${detail}` : ""}`,
    );
  }
}

function postgres(runtime, sql, { output = false } = {}) {
  try {
    return execFileSync("docker", [
      "exec",
      "--interactive",
      runtime.postgresContainer,
      "psql",
      "--username", "postgres",
      "--dbname", "postgres",
      "--set", "ON_ERROR_STOP=1",
      ...(output ? ["--tuples-only", "--no-align"] : []),
    ], {
      cwd: runtime.root,
      encoding: "utf8",
      env: runtime.env,
      input: sql,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    const detail = String(error?.stderr ?? "")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-3)
      .join(" | ")
      .slice(0, 800);
    throw new Error(
      `isolated fixture database operation failed${detail ? `: ${detail}` : ""}`,
    );
  }
}

function parseJwtClaims(accessToken) {
  const parts = accessToken.split(".");
  if (parts.length !== 3 || !parts[1]) {
    throw new Error("isolated Auth session token shape is invalid");
  }
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error("isolated Auth session claims are invalid");
  }
  if (
    !claims
    || typeof claims !== "object"
    || !UUID.test(claims.sub ?? "")
    || !UUID.test(claims.session_id ?? "")
    || !Number.isSafeInteger(claims.iat)
    || !Number.isSafeInteger(claims.exp)
    || claims.exp <= claims.iat
  ) {
    throw new Error("isolated Auth session claims are incomplete");
  }
  return claims;
}

function httpsJsonRequest(runtime, path, {
  body,
  headers = {},
  method = "GET",
  statuses = [200],
} = {}) {
  return new Promise((resolveJson, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const request = httpsRequest(
      `${runtime.plan.loopback.public_auth_url}${path}`,
      {
        ca: readFileSync(runtime.certificateFile),
        headers: {
          accept: "application/json",
          ...(payload ? {
            "content-length": String(payload.byteLength),
            "content-type": "application/json",
          } : {}),
          ...headers,
        },
        method,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.once("end", () => {
          if (!statuses.includes(response.statusCode ?? 0)) {
            reject(new Error(
              `isolated Auth request returned status ${response.statusCode ?? 0}`,
            ));
            return;
          }
          try {
            resolveJson(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error("isolated Auth JSON response was invalid"));
          }
        });
      },
    );
    request.once("error", () => reject(new Error("isolated Auth request failed")));
    if (payload) request.write(payload);
    request.end();
  });
}

async function createLocalAuthCaller(runtime, label) {
  const email = `homecook-${label}-${randomUUID()}@example.invalid`;
  const password = randomBytes(24).toString("base64url");
  const adminHeaders = {
    apikey: runtime.secrets.secret_key,
    authorization: `Bearer ${runtime.secrets.secret_key}`,
  };
  const user = await httpsJsonRequest(runtime, "/auth/v1/admin/users", {
    body: {
      email,
      email_confirm: true,
      password,
      user_metadata: { nickname: label, provider: "google" },
    },
    headers: adminHeaders,
    method: "POST",
    statuses: [200, 201],
  });
  const session = await httpsJsonRequest(
    runtime,
    "/auth/v1/token?grant_type=password",
    {
      body: { email, password },
      headers: { apikey: runtime.secrets.publishable_key },
      method: "POST",
    },
  );
  const liveUser = await httpsJsonRequest(runtime, "/auth/v1/user", {
    headers: {
      apikey: runtime.secrets.publishable_key,
      authorization: `Bearer ${session.access_token}`,
    },
  });
  if (
    !UUID.test(user?.id ?? "")
    || typeof user?.created_at !== "string"
    || liveUser?.id !== user.id
    || typeof liveUser?.created_at !== "string"
    || typeof session?.access_token !== "string"
    || typeof session?.refresh_token !== "string"
  ) {
    throw new Error("isolated Auth caller creation returned an invalid shape");
  }
  const claims = parseJwtClaims(session.access_token);
  if (claims.sub !== user.id || claims.iss !== runtime.plan.loopback.issuer) {
    throw new Error("isolated Auth caller issuer/owner binding is invalid");
  }
  if (liveUser.created_at !== user.created_at) {
    throw new Error("isolated Auth identity epoch serialization is inconsistent");
  }
  return { claims, session, user };
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sessionBindingHash(runtime, caller) {
  return createHmac(
    "sha256",
    runtime.secrets.session_generation_hmac_key_v2,
  ).update([
    "v1",
    runtime.plan.loopback.issuer,
    caller.user.id,
    new Date(caller.user.created_at).toISOString(),
    caller.claims.session_id,
  ].join("\n"), "utf8").digest("hex");
}

function addReleaseCompatibleNotBeforeClaim(runtime, caller) {
  if (Number.isSafeInteger(caller.claims.nbf)) return;
  const [encodedHeader] = caller.session.access_token.split(".");
  if (!encodedHeader) {
    throw new Error("isolated Auth token header is missing");
  }
  const header = JSON.parse(
    Buffer.from(encodedHeader, "base64url").toString("utf8"),
  );
  const privateKey = JSON.parse(runtime.secrets.jwt_keys).find((key) =>
    key?.kty === "EC" && typeof key?.d === "string" && key.kid === header.kid
  );
  if (!privateKey || header.alg !== "ES256") {
    throw new Error("isolated Auth signing key did not match the session token");
  }
  const claims = { ...caller.claims, nbf: caller.claims.iat };
  const signingInput = [
    Buffer.from(JSON.stringify(header), "utf8").toString("base64url"),
    Buffer.from(JSON.stringify(claims), "utf8").toString("base64url"),
  ].join(".");
  const signature = signPayload("SHA256", Buffer.from(signingInput), {
    dsaEncoding: "ieee-p1363",
    key: createPrivateKey({ format: "jwk", key: privateKey }),
  }).toString("base64url");
  caller.claims = claims;
  caller.session.access_token = `${signingInput}.${signature}`;
}

function alignFixtureAuthEpochsToReleasePrecision(runtime, callers) {
  const ownerIds = callers
    .map((caller) => `${sqlLiteral(caller.user.id)}::uuid`)
    .join(", ");
  postgres(runtime, `
    update auth.users
    set created_at = date_trunc('milliseconds', created_at),
        updated_at = greatest(
          date_trunc('milliseconds', created_at),
          date_trunc('milliseconds', updated_at)
        )
    where id in (${ownerIds});
  `);
  for (const caller of callers) {
    caller.user.created_at = new Date(caller.user.created_at).toISOString();
  }
}

function seedTwoOwnerAuthority(runtime, ownerA, ownerB) {
  const fixture = {
    cutoverAttemptId: randomUUID(),
    ingredientId: randomUUID(),
    methodId: randomUUID(),
    missingRecipeId: randomUUID(),
    recipeId: randomUUID(),
  };
  const activatedAt = new Date(
    Math.min(ownerA.claims.iat, ownerB.claims.iat) * 1_000 - 1_000,
  ).toISOString();
  const callerValues = [ownerA, ownerB].map((caller, index) => {
    const identityCreatedAt = caller.user.created_at;
    const issuedAt = new Date(caller.claims.iat * 1_000).toISOString();
    const expiresAt = new Date(caller.claims.exp * 1_000).toISOString();
    return `(
      ${sqlLiteral(caller.user.id)}::uuid,
      ${sqlLiteral(`owner-${index + 1}`)},
      ${sqlLiteral(caller.user.email)},
      'google'::public.social_provider_type,
      ${sqlLiteral(`owner-${index + 1}`)},
      ${sqlLiteral(identityCreatedAt)}::timestamptz,
      ${sqlLiteral(issuedAt)}::timestamptz,
      ${sqlLiteral(expiresAt)}::timestamptz,
      ${sqlLiteral(sessionBindingHash(runtime, caller))}
    )`;
  }).join(",\n");
  postgres(runtime, `
    begin;
    insert into public.account_generation_cutover_attempts
      (id, state, capability_revision, result_json)
    values (
      ${sqlLiteral(fixture.cutoverAttemptId)}::uuid,
      'promoted',
      2,
      '{}'::jsonb
    );
    create temporary table fixture_callers (
      owner_uuid uuid,
      nickname text,
      email text,
      provider public.social_provider_type,
      social_id text,
      identity_created_at timestamptz,
      session_issued_at timestamptz,
      binding_expires_at timestamptz,
      session_key_hash text
    ) on commit drop;
    insert into fixture_callers values ${callerValues};
    insert into public.users (
      id, nickname, email, social_provider, social_id, settings_json
    )
    select owner_uuid, nickname, email, provider, social_id,
        '{"user_bootstrap_version":3}'::jsonb
    from fixture_callers;
    insert into public.user_account_generation_watermarks (
      owner_uuid, last_account_generation
    ) select owner_uuid, 1 from fixture_callers;
    insert into public.user_account_lifecycles (
      owner_uuid, account_generation, auth_identity_created_at_snapshot,
      origin, status, activated_at
    ) select owner_uuid, 1, identity_created_at, 'runtime', 'active',
        ${sqlLiteral(activatedAt)}::timestamptz
      from fixture_callers;
    insert into public.user_session_generation_bindings (
      session_key_hash, hmac_key_version, owner_uuid,
      expected_account_generation, auth_identity_created_at_snapshot,
      binding_state, auth_authority, local_issuer, local_verified_at,
      auth_cutover_epoch, session_issued_at, binding_expires_at
    ) select session_key_hash, 1, owner_uuid, 1, identity_created_at,
        'active', 'local', ${sqlLiteral(runtime.plan.loopback.issuer)},
        session_issued_at, 2, session_issued_at, binding_expires_at
      from fixture_callers;

    insert into public.ingredients (id, standard_name, category, default_unit)
    values (
      ${sqlLiteral(fixture.ingredientId)}::uuid,
      '격리 재료',
      '기타',
      'g'
    );
    insert into public.cooking_methods (
      id, code, label, color_key
    ) values (
      ${sqlLiteral(fixture.methodId)}::uuid,
      ${sqlLiteral(`iso-${fixture.methodId.slice(0, 8)}`)},
      '격리',
      'gray'
    );
    insert into public.recipes (
      id, title, description, base_servings, source_type, created_by, visibility
    ) values (
      ${sqlLiteral(fixture.recipeId)}::uuid,
      '격리 소유자 레시피',
      'two-owner non-disclosure fixture',
      2,
      'manual',
      ${sqlLiteral(ownerA.user.id)}::uuid,
      'private'
    );
    insert into public.recipe_ingredients (
      recipe_id, ingredient_id, amount, unit, ingredient_type,
      display_text, sort_order, scalable
    ) values (
      ${sqlLiteral(fixture.recipeId)}::uuid,
      ${sqlLiteral(fixture.ingredientId)}::uuid,
      100,
      'g',
      'QUANT',
      '격리 재료 100g',
      0,
      true
    );
    insert into public.recipe_steps (
      recipe_id, step_number, instruction, cooking_method_id,
      ingredients_used
    ) values (
      ${sqlLiteral(fixture.recipeId)}::uuid,
      1,
      '격리 조리 단계',
      ${sqlLiteral(fixture.methodId)}::uuid,
      jsonb_build_array(${sqlLiteral(fixture.ingredientId)})
    );
    update private.full_local_auth_control
    set authority = 'local',
        local_issuer = ${sqlLiteral(runtime.plan.loopback.issuer)},
        cutover_epoch = 2,
        hmac_key_version = 1,
        flows_open = true,
        local_activated_at = ${sqlLiteral(activatedAt)}::timestamptz,
        updated_at = ${sqlLiteral(activatedAt)}::timestamptz
    where singleton;
    commit;
  `);
  return fixture;
}

async function ensureTwoOwnerFixture(runtime) {
  if (runtime.twoOwnerFixture) return runtime.twoOwnerFixture;
  const ownerA = await createLocalAuthCaller(runtime, "owner-a");
  const ownerB = await createLocalAuthCaller(runtime, "owner-b");
  addReleaseCompatibleNotBeforeClaim(runtime, ownerA);
  addReleaseCompatibleNotBeforeClaim(runtime, ownerB);
  alignFixtureAuthEpochsToReleasePrecision(runtime, [ownerA, ownerB]);
  const fixture = seedTwoOwnerAuthority(runtime, ownerA, ownerB);
  runtime.twoOwnerFixture = { fixture, ownerA, ownerB };
  return runtime.twoOwnerFixture;
}

function activateTwoOwnerFixture(runtime, twoOwnerFixture) {
  if (runtime.twoOwnerFixtureActivated) return;
  const { fixture, ownerA, ownerB } = twoOwnerFixture;
  const activatedAt = new Date(
    Math.min(ownerA.claims.iat, ownerB.claims.iat) * 1_000 - 1_000,
  ).toISOString();
  postgres(runtime, `
    update public.account_generation_capability_state
    set state = 'generation_active',
        revision = revision + 1,
        current_cutover_attempt_id = ${sqlLiteral(fixture.cutoverAttemptId)}::uuid,
        activated_at = ${sqlLiteral(activatedAt)}::timestamptz
    where singleton;
  `);
  assertSeededCallerAuthority(runtime, ownerA);
  assertSeededCallerAuthority(runtime, ownerB);
  runtime.twoOwnerFixtureActivated = true;
}

function readFlagOffMutationState(runtime) {
  const row = postgres(runtime, `
    select concat_ws('|',
      case when current_setting('homecook.personal_recipe_v2', true) = 'on'
        then '1' else '0' end,
      case when current_setting('homecook.snapshot_v2_creation', true) = 'on'
        then '1' else '0' end,
      (select count(*) from public.recipes as recipe
        where recipe.created_by is not null
          and recipe.source_type = 'manual'
          and recipe.visibility = 'private'),
      (select count(distinct recipe.created_by) from public.recipes as recipe
        where recipe.created_by is not null
          and recipe.source_type = 'manual'
          and recipe.visibility = 'private'),
      (select count(*) from public.recipe_change_previews),
      (select count(*) from public.cooking_sessions
        where contract_version = 'snapshot_v2'),
      (select count(*) from public.cooking_session_meal_claims),
      (select count(*) from public.mutation_idempotency_keys
        where operation_scope like 'personal_recipe_%')
    );
  `, { output: true }).trim();
  const values = row.split('|').map((value) => Number(value));
  if (values.length !== 8 || values.some((value) => !Number.isSafeInteger(value))) {
    throw new Error("isolated release mutation inventory was invalid");
  }
  return {
    personalRecipeV2Enabled: values[0] === 1,
    snapshotV2CreationEnabled: values[1] === 1,
    personalEntryCount: values[2],
    personalCallerCount: values[3],
    previewCount: values[4],
    snapshotV2SessionCount: values[5],
    claimCount: values[6],
    personalIdempotencyCount: values[7],
  };
}

async function readLegacyV1Shape(runtime) {
  const response = await fetch(
    `${runtime.plan.loopback.app_url}/api/v1/cooking/sessions`,
    {
      body: JSON.stringify({
        cooking_servings: 0,
        meal_ids: [],
        recipe_id: "invalid-recipe-id",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(30_000),
    },
  );
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("isolated legacy-v1 response was not JSON");
  }
  const expectedFields = [
    { field: "recipe_id", reason: "invalid_uuid" },
    { field: "meal_ids", reason: "required_non_empty" },
    { field: "cooking_servings", reason: "min_value" },
  ];
  if (
    response.status !== 422
    || payload?.success !== false
    || payload?.data !== null
    || payload?.error?.code !== "VALIDATION_ERROR"
    || typeof payload?.error?.message !== "string"
    || JSON.stringify(payload?.error?.fields) !== JSON.stringify(expectedFields)
    || Object.keys(payload).sort().join(',') !== 'data,error,success'
  ) {
    const safeCode = typeof payload?.error?.code === "string"
      ? payload.error.code.slice(0, 80)
      : "missing";
    throw new Error(
      `isolated legacy-v1 response shape drifted ${response.status}/${safeCode}`,
    );
  }
  return true;
}

function assertSeededCallerAuthority(runtime, caller) {
  const requestEpoch = Math.floor(Date.now() / 1_000);
  const identityCreatedAt = caller.user.created_at;
  const sessionIssuedAt = new Date(caller.claims.iat * 1_000).toISOString();
  const claims = {
    aud: "authenticated",
    exp: caller.claims.exp,
    iat: caller.claims.iat,
    iss: caller.claims.iss,
    role: "authenticated",
    session_id: caller.claims.session_id,
    sub: caller.claims.sub,
  };
  const attestation = Buffer.from(JSON.stringify({
    version: 1,
    method: "GET",
    path: "/recipes",
    issuer: runtime.plan.loopback.issuer,
    owner_uuid: caller.user.id,
    identity_created_at: identityCreatedAt,
    session_key_hash: sessionBindingHash(runtime, caller),
    issued_at: requestEpoch,
    expires_at: requestEpoch + 30,
  }), "utf8").toString("base64url");
  const result = postgres(runtime, `
    set request.jwt.claims = '{"role":"service_role"}';
    select public.assert_full_local_session_authority(
      ${sqlLiteral(runtime.plan.loopback.issuer)},
      ${sqlLiteral(caller.user.id)}::uuid,
      ${sqlLiteral(identityCreatedAt)}::timestamptz,
      ${sqlLiteral(sessionBindingHash(runtime, caller))},
      1,
      2,
      ${sqlLiteral(sessionIssuedAt)}::timestamptz
    ) ->> 'binding_state';
    set request.jwt.claims = ${sqlLiteral(JSON.stringify(claims))};
    set request.method = 'GET';
    set request.path = '/recipes';
    set request.headers = ${sqlLiteral(JSON.stringify({
      "x-homecook-attestation-verified": attestation,
    }))};
    select private.verify_hybrid_request_authority();
    select 'active';
  `, { output: true });
  if (!result.trim().endsWith("active")) {
    throw new Error("isolated seeded session authority preflight failed");
  }
}

async function assertPreviewDataApi(runtime, caller, fixture) {
  const response = await fetch(
    `${runtime.plan.loopback.gateway_url}/rest/v1/rpc/preview_recipe_future_plan_impact`,
    {
      body: JSON.stringify({
        p_owner_uuid: caller.user.id,
        p_auth_identity_created_at_snapshot: caller.user.created_at,
        p_session_key_hash: sessionBindingHash(runtime, caller),
        p_hmac_key_version: 1,
        p_session_issued_at:
          new Date(caller.claims.iat * 1_000).toISOString(),
        p_recipe_id: fixture.missingRecipeId,
        p_base_recipe_revision: 1,
        p_draft: futureDraft(fixture),
      }),
      headers: {
        apikey: runtime.secrets.secret_key,
        authorization: `Bearer ${runtime.secrets.secret_key}`,
        "content-type": "application/json",
        "x-homecook-internal-scope": "recipe-future-propagation",
      },
      method: "POST",
      signal: AbortSignal.timeout(10_000),
    },
  );
  const payload = await response.json();
  const safeDetail = [payload?.code, payload?.message, payload?.details]
    .filter((value) => typeof value === "string")
    .join(" ");
  if (!safeDetail.includes("RESOURCE_NOT_FOUND")) {
    const safeCode = typeof payload?.code === "string"
      ? payload.code.slice(0, 80)
      : "missing";
    throw new Error(
      `isolated future preview Data API preflight returned ${response.status}/${safeCode}`,
    );
  }
}

function createReleaseWorktree(runtime, releaseSha, slot) {
  if (!EXACT_SHA.test(releaseSha ?? "")) {
    throw new Error("isolated application release requires an exact SHA");
  }
  const worktree = join(runtime.plan.temp_root, "worktrees", slot);
  mkdirSync(join(runtime.plan.temp_root, "worktrees"), { recursive: true });
  command("git", ["worktree", "add", "--detach", worktree, releaseSha], {
    cwd: runtime.root,
    env: process.env,
    label: "isolated application worktree creation",
  });
  symlinkSync(join(runtime.root, "node_modules"), join(worktree, "node_modules"), "dir");
  runtime.worktrees.push(worktree);
  return worktree;
}

function applicationEnvironment(runtime) {
  const generationSecret = runtime.secrets.session_generation_hmac_key_v2;
  return {
    ...process.env,
    AUTH_FLOW_HMAC_KEY: runtime.secrets.auth_flow_hmac_key,
    AUTH_SUPABASE_EXPECTED_ISSUER: runtime.plan.loopback.issuer,
    AUTH_SUPABASE_JWKS_URL:
      `${runtime.plan.loopback.issuer}/.well-known/jwks.json`,
    DATA_SUPABASE_PUBLISHABLE_KEY: runtime.secrets.publishable_key,
    DATA_SUPABASE_SECRET_KEY: runtime.secrets.secret_key,
    DATA_SUPABASE_URL: runtime.plan.loopback.gateway_url,
    HOMECOOK_AUTH_AUTHORITY: "local",
    HOMECOOK_DATA_AUTHORITY: "local",
    HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1:
      runtime.secrets.session_attestation_hmac_key_v1,
    HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1: generationSecret,
    HOMECOOK_SESSION_GENERATION_HMAC_KEY_V2: generationSecret,
    LOCAL_SUPABASE_INTERNAL_URL: runtime.plan.loopback.gateway_url,
    LOCAL_SUPABASE_SECRET_KEY: runtime.secrets.secret_key,
    NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY: runtime.secrets.publishable_key,
    NEXT_PUBLIC_AUTH_SUPABASE_URL: runtime.plan.loopback.public_auth_url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: runtime.secrets.publishable_key,
    NEXT_PUBLIC_SUPABASE_URL: runtime.plan.loopback.gateway_url,
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_EXTRA_CA_CERTS: runtime.certificateFile,
    SUPABASE_SERVICE_ROLE_KEY: runtime.secrets.secret_key,
  };
}

async function waitForApplication(runtime, child) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("isolated application exited before readiness");
    }
    try {
      const response = await fetch(runtime.plan.loopback.app_url, {
        signal: AbortSignal.timeout(2_000),
      });
      await response.arrayBuffer();
      if (response.status > 0) return;
    } catch {
      // The development server is still compiling or binding its loopback port.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error("isolated application did not become ready");
}

async function startReleaseApplication(runtime, releaseSha, slot) {
  const worktree = createReleaseWorktree(runtime, releaseSha, slot);
  const child = spawn(
    join(runtime.root, "node_modules", ".bin", "next"),
    [
      "dev",
      "--hostname", "127.0.0.1",
      "--port", new URL(runtime.plan.loopback.app_url).port,
    ],
    {
      cwd: worktree,
      env: applicationEnvironment(runtime),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  const capture = (chunk) => {
    output = `${output}${chunk.toString("utf8")}`.slice(-8_000);
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  try {
    await waitForApplication(runtime, child);
  } catch {
    throw new Error(
      `isolated application startup failed${output ? " (bounded log captured)" : ""}`,
    );
  }
  runtime.applications.push(child);
  return child;
}

async function stopApplication(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function sessionCookie(caller) {
  const value = `base64-${Buffer.from(
    JSON.stringify(caller.session),
    "utf8",
  ).toString("base64url")}`;
  return `sb-127-auth-token=${value}`;
}

function futureDraft(fixture) {
  return {
    title: "격리 변경 초안",
    description: "two-owner non-disclosure fixture",
    base_servings: 2,
    ingredients: [{
      ingredient_id: fixture.ingredientId,
      amount: 100,
      unit: "g",
      ingredient_type: "QUANT",
      display_text: "격리 재료 100g",
      scalable: true,
    }],
    steps: [{
      step_number: 1,
      instruction: "격리 조리 단계",
      cooking_method_id: fixture.methodId,
      ingredients_used: [fixture.ingredientId],
    }],
  };
}

async function callDeniedRoute(runtime, caller, path, method, body) {
  const response = await fetch(`${runtime.plan.loopback.app_url}${path}`, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      cookie: sessionCookie(caller),
      ...(method === "PATCH" ? { "Idempotency-Key": randomUUID() } : {}),
    },
    method,
    signal: AbortSignal.timeout(30_000),
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("isolated application denial response was not JSON");
  }
  if (
    response.status !== 404
    || payload?.success !== false
    || payload?.error?.code !== "RESOURCE_NOT_FOUND"
  ) {
    const safeCode = typeof payload?.error?.code === "string"
      ? payload.error.code.slice(0, 80)
      : "missing";
    throw new Error(
      `isolated denial route returned ${response.status}/${safeCode}`,
    );
  }
  return { error_code: "RESOURCE_NOT_FOUND", status: 404 };
}

function readDomainDigests(runtime) {
  const rows = postgres(runtime, `
    select scope || '|' || digest
    from (
      values
        ('recipe', md5(concat_ws('|',
          (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.recipes row_value),
          (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.recipe_ingredients row_value),
          (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.recipe_steps row_value)
        ))),
        ('content', md5(concat_ws('|',
          (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.recipe_content_snapshots row_value),
          (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.recipe_nutrition_snapshots row_value),
          (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.recipe_change_previews row_value)
        ))),
        ('meal', md5((select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.meals row_value))),
        ('shopping', md5(concat_ws('|',
          (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.shopping_lists row_value),
          (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.shopping_list_items row_value)
        ))),
        ('claim', md5((select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.cooking_session_meal_claims row_value))),
        ('session', md5(concat_ws('|',
          (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.cooking_sessions row_value),
          (select coalesce(jsonb_agg(to_jsonb(row_value) order by to_jsonb(row_value)::text)::text, '[]') from public.cooking_session_meals row_value)
        )))
    ) as digest_rows(scope, digest)
    order by scope;
  `, { output: true });
  const result = new Map();
  for (const row of rows.trim().split("\n").filter(Boolean)) {
    const [scope, digest] = row.trim().split("|");
    if (!scope || !/^[0-9a-f]{32}$/u.test(digest ?? "")) {
      throw new Error("isolated domain digest output was invalid");
    }
    result.set(scope, digest);
  }
  if (result.size !== 6) {
    throw new Error("isolated domain digest scope count was invalid");
  }
  return result;
}

function closeServer(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolveClose) => server.close(() => resolveClose()));
}

function createRuntime(plan) {
  const root = process.cwd();
  const secretDirectory = join(plan.temp_root, "secrets");
  const overrideFile = join(plan.temp_root, "compose.override.yml");
  const certificateFile = join(plan.temp_root, "loopback.crt");
  const privateKeyFile = join(plan.temp_root, "loopback.key");
  const images = fullLocalImageRefsForPlatform(
    process.arch === "arm64" ? "linux/arm64" : "linux/amd64",
  );
  const gatewayPort = new URL(plan.loopback.gateway_url).port;
  const authProxyPort = new URL(plan.loopback.auth_proxy_url).port;
  const env = {
    ...process.env,
    FULL_LOCAL_ADDITIONAL_REDIRECT_URLS:
      `${plan.loopback.app_url}/auth/callback,${plan.loopback.app_url}/auth/link/callback`,
    FULL_LOCAL_API_EXTERNAL_URL: plan.loopback.issuer,
    FULL_LOCAL_AUTH_IMAGE: images.auth,
    FULL_LOCAL_AUTH_PROXY_PORT: authProxyPort,
    FULL_LOCAL_COMPOSE_PROJECT_NAME: plan.compose_project,
    FULL_LOCAL_DOCKER_PLATFORM:
      process.arch === "arm64" ? "linux/arm64" : "linux/amd64",
    FULL_LOCAL_ENABLE_ANONYMOUS_USERS: "false",
    FULL_LOCAL_ENABLE_EMAIL_AUTOCONFIRM: "true",
    FULL_LOCAL_ENABLE_EMAIL_SIGNUP: "true",
    FULL_LOCAL_ENABLE_PHONE_SIGNUP: "false",
    FULL_LOCAL_INTERNAL_GATEWAY_PORT: gatewayPort,
    FULL_LOCAL_INTERNAL_GATEWAY_URL: plan.loopback.gateway_url,
    FULL_LOCAL_INTERNAL_S3_URL:
      `${plan.loopback.gateway_url}/storage/v1/s3`,
    FULL_LOCAL_KONG_IMAGE: images.kong,
    FULL_LOCAL_NODE_IMAGE: images.node,
    FULL_LOCAL_POSTGRES_IMAGE: images.postgres,
    FULL_LOCAL_POSTGRES_VOLUME_NAME: plan.postgres_volume,
    FULL_LOCAL_POSTGREST_IMAGE: images.postgrest,
    FULL_LOCAL_PUBLIC_AUTH_URL: plan.loopback.public_auth_url,
    FULL_LOCAL_SECRET_DIR: secretDirectory,
    FULL_LOCAL_SITE_URL: plan.loopback.app_url,
    FULL_LOCAL_STORAGE_FILE_SIZE_LIMIT: "52428800",
    FULL_LOCAL_STORAGE_GLOBAL_BUCKET: "homecook-rehearsal",
    FULL_LOCAL_STORAGE_IMAGE: images.storage,
    FULL_LOCAL_STORAGE_REGION: "homecook-local-1",
    FULL_LOCAL_STORAGE_TENANT_ID: "homecook-rehearsal",
    FULL_LOCAL_STORAGE_VOLUME_NAME: plan.storage_volume,
  };
  return {
    root,
    plan,
    env,
    secretDirectory,
    overrideFile,
    certificateFile,
    privateKeyFile,
    composeFile: join(root, plan.compose_file),
    secrets: null,
    httpsServer: null,
    applications: [],
    worktrees: [],
  };
}

export function createRecipeContentSnapshotFuturePropagationFullLocalAdapter({
  plan: rawPlan,
}) {
  const plan = assertSafePlan(rawPlan);
  const runtime = createRuntime(plan);
  return {
    async prepare() {
      if (existsSync(plan.temp_root)) {
        throw new Error("isolated full-local temporary root already exists");
      }
      mkdirSync(plan.temp_root, { mode: 0o700 });
      mkdirSync(runtime.secretDirectory, { mode: 0o700 });
      chmodSync(runtime.secretDirectory, 0o700);
      runtime.secrets = generateFullLocalSecretBundle();
      materializeFullLocalSecrets({
        readSecret: (name) => runtime.secrets[name],
        targetDirectory: runtime.secretDirectory,
      });
      writeFileSync(
        runtime.overrideFile,
        "services: {}\n",
        { encoding: "utf8", mode: 0o600 },
      );
      command("openssl", [
        "req", "-x509", "-newkey", "rsa:2048", "-nodes",
        "-keyout", runtime.privateKeyFile,
        "-out", runtime.certificateFile,
        "-days", "1",
        "-subj", "/CN=127.0.0.1",
        "-addext", "subjectAltName=IP:127.0.0.1",
      ], {
        cwd: runtime.root,
        env: process.env,
        label: "isolated loopback certificate generation",
      });
      chmodSync(runtime.privateKeyFile, 0o600);
      chmodSync(runtime.certificateFile, 0o600);
      compose(runtime, ["up", "-d"]);
      await waitForHealthy(runtime);
      runtime.postgresContainer = compose(runtime, ["ps", "-q", "postgres"])
        .trim();
      if (!runtime.postgresContainer) {
        throw new Error("isolated PostgreSQL container identity is missing");
      }
      runtime.httpsServer = await startHttpsProxy(runtime);
      await httpsHealth(runtime);
      const jwks = await httpsJson(
        runtime,
        "/auth/v1/.well-known/jwks.json",
      );
      if (
        !jwks
        || typeof jwks !== "object"
        || !Array.isArray(jwks.keys)
        || !jwks.keys.some((key) =>
          key?.alg === "ES256"
          && key?.kty === "EC"
          && typeof key?.kid === "string"
          && key.kid.length > 0)
      ) {
        throw new Error("isolated full-local Auth did not expose ES256 JWKS");
      }
      applyRepositoryMigrations(runtime);
      return {
        auth_jwt_algorithm: "ES256",
        compose_project: plan.compose_project,
        external_writes: 0,
        issuer: plan.loopback.issuer,
        migrations_applied: true,
        internal: runtime,
      };
    },

    async collectTwoOwner({ releaseSha }) {
      if (releaseSha !== plan.current_head_sha) {
        throw new Error("two-owner rehearsal requires the exact current head");
      }
      const { fixture, ownerA, ownerB } = await ensureTwoOwnerFixture(runtime);
      activateTwoOwnerFixture(runtime, { fixture, ownerA, ownerB });
      await assertPreviewDataApi(runtime, ownerA, fixture);
      const application = await startReleaseApplication(
        runtime,
        releaseSha,
        "current-two-owner",
      );
      try {
        const before = readDomainDigests(runtime);
        const draft = futureDraft(fixture);
        const previewBody = {
          base_recipe_revision: 1,
          draft,
        };
        const patchBody = {
          ...previewBody,
          future_plan_strategy: "keep",
          image_object_id: null,
          impact_token: "isolated-denied-impact-token",
        };
        const previewMissing = await callDeniedRoute(
          runtime,
          ownerA,
          `/api/v1/recipes/${fixture.missingRecipeId}/future-plan-impact`,
          "POST",
          previewBody,
        );
        const patchMissing = await callDeniedRoute(
          runtime,
          ownerA,
          `/api/v1/recipes/${fixture.missingRecipeId}`,
          "PATCH",
          patchBody,
        );
        const previewOtherOwner = await callDeniedRoute(
          runtime,
          ownerB,
          `/api/v1/recipes/${fixture.recipeId}/future-plan-impact`,
          "POST",
          previewBody,
        );
        const patchOtherOwner = await callDeniedRoute(
          runtime,
          ownerB,
          `/api/v1/recipes/${fixture.recipeId}`,
          "PATCH",
          patchBody,
        );
        const after = readDomainDigests(runtime);
        const unchangedScopes = [...before.keys()].filter(
          (scope) => before.get(scope) === after.get(scope),
        );
        if (unchangedScopes.length !== before.size) {
          throw new Error("isolated denial routes changed a protected digest scope");
        }
        return {
          authenticated_owner_caller_present: true,
          owner_a_user_id: ownerA.user.id,
          owner_b_user_id: ownerB.user.id,
          patch_missing_recipe: patchMissing,
          patch_other_owner_recipe: patchOtherOwner,
          preview_missing_recipe: previewMissing,
          preview_other_owner_recipe: previewOtherOwner,
          production_writes: 0,
          remote_writes: 0,
          service_role_operations: ["seed", "digest", "cleanup"],
          staging_writes: 0,
          unchanged_digest_scope_count: unchangedScopes.length,
          unchanged_digest_scopes: unchangedScopes,
        };
      } finally {
        await stopApplication(application);
      }
    },

    async collectRelease({ releaseSha, releaseSlot }) {
      if (
        ![plan.current_head_sha, plan.immediate_previous_sha].includes(releaseSha)
        || !["current", "immediate_previous"].includes(releaseSlot)
      ) {
        throw new Error("release rehearsal requires an exact locked release slot");
      }
      const before = readFlagOffMutationState(runtime);
      const application = await startReleaseApplication(
        runtime,
        releaseSha,
        `release-${releaseSlot}`,
      );
      let legacyV1ShapePreserved;
      try {
        legacyV1ShapePreserved = await readLegacyV1Shape(runtime);
      } finally {
        await stopApplication(application);
      }
      const after = readFlagOffMutationState(runtime);
      return {
        release_sha: releaseSha,
        personal_recipe_v2_enabled: after.personalRecipeV2Enabled,
        snapshot_v2_creation_enabled: after.snapshotV2CreationEnabled,
        personal_entry_count: after.personalEntryCount,
        personal_caller_count: after.personalCallerCount,
        recipe_change_previews_delta: after.previewCount - before.previewCount,
        session_delta:
          after.snapshotV2SessionCount - before.snapshotV2SessionCount,
        claim_delta: after.claimCount - before.claimCount,
        personal_v2_idempotency_delta:
          after.personalIdempotencyCount - before.personalIdempotencyCount,
        legacy_v1_shape_preserved: legacyV1ShapePreserved,
      };
    },

    async writeReport({ report, reportPath }) {
      if (typeof reportPath !== "string" || !reportPath.startsWith("/")) {
        throw new Error("isolated collector report path must be absolute");
      }
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      chmodSync(reportPath, 0o600);
    },

    async cleanup({ runtime: preparedRuntime } = {}) {
      const active = preparedRuntime?.internal ?? runtime;
      for (const application of [...active.applications].reverse()) {
        await stopApplication(application);
      }
      await closeServer(active.httpsServer);
      if (existsSync(active.overrideFile)) {
        try {
          compose(active, ["down", "--volumes", "--remove-orphans"]);
        } catch {
          // Continue with exact-name cleanup below.
        }
      }
      for (const volume of plan.cleanup.remove_only_named_volumes) {
        try {
          command("docker", ["volume", "rm", volume], {
            cwd: active.root,
            env: active.env,
            label: "isolated named volume cleanup",
          });
        } catch {
          // The compose cleanup may already have removed this exact volume.
        }
      }
      for (const worktree of [...active.worktrees].reverse()) {
        try {
          command("git", ["worktree", "remove", "--force", worktree], {
            cwd: active.root,
            env: process.env,
            label: "isolated application worktree cleanup",
          });
        } catch {
          // The bounded temporary root cleanup below remains the fallback.
        }
      }
      try {
        command("git", ["worktree", "prune"], {
          cwd: active.root,
          env: process.env,
          label: "isolated application worktree prune",
        });
      } catch {
        // A later repository maintenance pass can prune stale temp metadata.
      }
      if (existsSync(plan.temp_root)) {
        rmSync(plan.temp_root, { recursive: true, force: true });
      }
    },
  };
}
