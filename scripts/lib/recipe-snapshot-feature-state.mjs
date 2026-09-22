/** PostgreSQL connection defaults, never a browser/app feature override. */
export const FEATURE_NAMES = ["homecook.personal_recipe_v2", "homecook.snapshot_v2_creation"];

export function parseFeatureStateArguments(argv) {
  const options = { command: "status", execute: false, config: null };
  const args = [...argv];
  if (args[0] && !args[0].startsWith("--")) options.command = args.shift();
  if (!["status", "plan", "enable", "disable"].includes(options.command)) throw new Error("Use status, plan, enable or disable");
  const seen = new Set();
  while (args.length) {
    const name = args.shift();
    if (seen.has(name)) throw new Error("Repeated option");
    seen.add(name);
    if (name === "--execute") options.execute = true;
    else if (name === "--config" && args[0] && !args[0].startsWith("--")) options.config = args.shift();
    else throw new Error("Unsupported option");
  }
  if (options.execute && !["enable", "disable"].includes(options.command)) throw new Error("--execute requires enable or disable");
  if (!options.config?.startsWith("/")) throw new Error("--config requires an absolute private config path");
  return options;
}

// All output is counts/settings, never recipe names, user identifiers or secrets.
export const FEATURE_STATE_SELECT = `
select jsonb_build_object(
  'database', current_database(),
  'mode', public.read_recipe_snapshot_ui_mode(),
  'effective_pair', jsonb_build_array(
    current_setting('homecook.personal_recipe_v2', true),
    current_setting('homecook.snapshot_v2_creation', true)),
  'database_pair', (select jsonb_build_array(
    max(split_part(setting, '=', 2)) filter (where setting like 'homecook.personal_recipe_v2=%'),
    max(split_part(setting, '=', 2)) filter (where setting like 'homecook.snapshot_v2_creation=%'))
    from pg_catalog.pg_db_role_setting s cross join lateral unnest(s.setconfig) setting
    where s.setrole = 0 and s.setdatabase = (select oid from pg_catalog.pg_database where datname = current_database())),
  'role_overrides', (select count(*) from pg_catalog.pg_db_role_setting s
    cross join lateral unnest(s.setconfig) setting
    where s.setrole <> 0 and s.setdatabase in (0, (select oid from pg_catalog.pg_database where datname = current_database()))
    and (setting like 'homecook.personal_recipe_v2=%' or setting like 'homecook.snapshot_v2_creation=%')),
  'generation_active', (select state = 'generation_active' from public.account_generation_capability_state where singleton),
  'missing_meal_pins', (select count(*) from public.meals where status in ('registered','shopping_done') and recipe_content_snapshot_id is null),
  'mismatched_meal_pins', (select count(*) from public.meals m join public.recipe_content_snapshots s on s.id = m.recipe_content_snapshot_id
    where m.recipe_id is distinct from s.recipe_id or (m.recipe_nutrition_snapshot_id is not null and m.recipe_nutrition_snapshot_id is distinct from s.recipe_nutrition_snapshot_id)),
  'unmanaged_recipe_images', (select count(*) from storage.objects o where o.bucket_id in ('recipe-images','recipe-images-private')
    and not exists (select 1 from public.recipe_image_objects r where r.bucket_id = o.bucket_id and r.object_path = o.name)),
  'invalid_private_image_refs', (select count(*) from public.recipe_image_object_references r
    join public.recipe_image_objects o on o.id = r.image_object_id
    join public.recipes recipe on r.reference_type = 'recipe_thumbnail' and r.consumer_id = recipe.id
    where recipe.visibility = 'private' and (o.visibility <> 'private' or o.owner_uuid is distinct from recipe.created_by or o.state <> 'attached_private'))
) as state`;

export function featureBlockers(state, enabling) {
  const blockers = [];
  if (state.database !== "postgres") blockers.push("unexpected_database");
  if (state.role_overrides !== 0) blockers.push("role_feature_overrides");
  if (enabling) {
    if (state.generation_active !== true) blockers.push("account_generation_not_active");
    for (const key of ["missing_meal_pins", "mismatched_meal_pins", "invalid_private_image_refs"]) {
      if (!Number.isSafeInteger(state[key]) || state[key] !== 0) blockers.push(key);
    }
  }
  return blockers;
}

export function buildFeatureStateMutation(enabled, expectedDatabasePair) {
  if (!Array.isArray(expectedDatabasePair) || expectedDatabasePair.length !== 2
    || expectedDatabasePair.some((v) => v !== null && !["on", "off"].includes(v))) throw new Error("Unexpected database feature defaults");
  const expected = JSON.stringify(expectedDatabasePair); // fixed allowlisted values only
  const value = enabled ? "on" : "off";
  return `begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('homecook-recipe-feature-state', 0));
${enabled ? `lock table public.account_generation_capability_state, public.meals, public.recipe_content_snapshots,
 public.recipes, public.recipe_image_objects, public.recipe_image_object_references, storage.objects in share mode;` : ""}
do $feature$
declare s jsonb;
begin
  ${FEATURE_STATE_SELECT.replace(" as state", " into s")};
  if s->>'database' <> 'postgres' or (s->>'role_overrides')::int <> 0
    or s->'database_pair' is distinct from '${expected}'::jsonb then
    raise exception 'Feature setting changed or role override present';
  end if;
  ${enabled ? `if s->>'generation_active' is distinct from 'true'
    or (s->>'missing_meal_pins')::bigint <> 0 or (s->>'mismatched_meal_pins')::bigint <> 0
    or (s->>'invalid_private_image_refs')::bigint <> 0 then
    raise exception 'Recipe snapshot data preflight failed';
  end if;` : ""}
end;
$feature$;
alter database postgres set homecook.personal_recipe_v2 = '${value}';
alter database postgres set homecook.snapshot_v2_creation = '${value}';
commit;`;
}

export async function runFeatureStateOperation(options, adapter) {
  const state = await adapter.read();
  const enabling = options.command !== "disable";
  const blockers = featureBlockers(state, enabling);
  const warnings = state.unmanaged_recipe_images > 0 ? ["unmanaged_recipe_images_report_only"] : [];
  const result = { command: options.command, state, blockers, warnings, writes: 0, activation_verified: false };
  if (!options.execute) return { ...result, status: options.command === "status" ? "STATUS" : blockers.length ? "BLOCKED" : "PLAN_READY" };
  if (blockers.length) throw new Error(`Feature state blocked: ${blockers.join(", ")}`);
  await adapter.verifyBackup();
  await adapter.verifyTarget();
  await adapter.apply(buildFeatureStateMutation(enabling, state.database_pair));
  // Separate psql invocation is essential: ALTER DATABASE defaults affect NEW connections.
  const after = await adapter.read();
  const expected = enabling ? "on" : "off";
  if (!Array.isArray(after.database_pair) || after.database_pair.length !== 2
    || after.database_pair.some((v) => v !== expected)
    || !Array.isArray(after.effective_pair) || after.effective_pair.length !== 2
    || after.effective_pair.some((v) => v !== expected)
    || after.mode !== (enabling ? "snapshot_v2" : "legacy_v1")) {
    throw new Error("Database defaults were changed but fresh-connection verification failed; inspect status before retrying");
  }
  return { ...result, state: after, status: "NEW_CONNECTION_DEFAULTS_APPLIED", writes: 2,
    next: "Reconnect the existing PostgREST pool through its normal operation, then verify the actual app fork/start/complete/meal-log flow. This command does not restart services, backfill data, or verify live activation." };
}

/** Parse libpq syntax without ever returning credentials or echoing bad input. */
export function parsePostgrestDatabaseTarget(value, containerName) {
  const fail = () => { throw new Error("PostgREST must use the exact local database without connection overrides"); };
  if (typeof value !== "string" || !value.trim()) fail();
  let fields;
  if (/^postgres(?:ql)?:\/\//.test(value)) {
    let url;
    try { url = new URL(value); } catch { fail(); }
    if (url.search || url.hash) fail();
    try { fields = { host: url.hostname, port: url.port || "5432", dbname: decodeURIComponent(url.pathname.slice(1)), user: decodeURIComponent(url.username) }; } catch { fail(); }
  } else {
    fields = Object.create(null);
    let offset = 0;
    while (offset < value.length) {
      while (/\s/.test(value[offset] ?? "") && offset < value.length) offset++;
      if (offset === value.length) break;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*/.exec(value.slice(offset));
      if (!match) fail();
      const key = match[1];
      if (Object.hasOwn(fields, key) || !["host", "port", "dbname", "user", "password", "sslmode", "connect_timeout", "application_name"].includes(key)) fail();
      offset += match[0].length;
      let part = "";
      const quoted = value[offset] === "'";
      if (quoted) offset++;
      let closed = !quoted;
      while (offset < value.length) {
        const char = value[offset++];
        if (char === "\\") {
          if (offset >= value.length) fail();
          part += value[offset++];
        } else if (quoted && char === "'") { closed = true; break; }
        else if (!quoted && /\s/.test(char)) break;
        else part += char;
      }
      if (!closed || (quoted && offset < value.length && !/\s/.test(value[offset]))) fail();
      fields[key] = part;
    }
  }
  if (!["postgres", containerName].includes(fields.host) || fields.dbname !== "postgres"
    || (fields.port && fields.port !== "5432") || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(fields.user ?? "")) fail();
  return { loginRole: fields.user, database: "postgres" };
}

export function resolvePostgrestDatabaseTarget({ environment, command, entrypoint, canonicalScriptsMatch }, containerName) {
  const env = Object.fromEntries(environment.map((item) => {
    const index = item.indexOf("="); return [item.slice(0, index), item.slice(index + 1)];
  }));
  if (env.PGRST_DB_URI) return parsePostgrestDatabaseTarget(env.PGRST_DB_URI, containerName);
  if (JSON.stringify(command) !== JSON.stringify(["/homecook/start-postgrest.sh"])
    || JSON.stringify(entrypoint) !== JSON.stringify(["/homecook/secret-entrypoint.sh"])
    || canonicalScriptsMatch !== true
    || (env.HOMECOOK_REHEARSAL_DB_NAME && env.HOMECOOK_REHEARSAL_DB_NAME !== "postgres")
    || env.HOMECOOK_SECRET_EXPORTS !== "POSTGRES_PASSWORD=postgres_password;PGRST_JWT_SECRET=jwt_jwks") {
    throw new Error("PostgREST runtime target requires the exact canonical secret/start entrypoints");
  }
  // The verified script assembles this target after reading secrets. Do not read
  // /proc/environ or the password merely to rediscover these non-secret fields.
  return { loginRole: "authenticator", database: "postgres" };
}
