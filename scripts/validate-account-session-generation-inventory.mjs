import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const REPO_ROOT = process.cwd();
const INVENTORY_PATH = path.join(
  REPO_ROOT,
  "docs/security/account-session-generation-inventory.json",
);
const ROUTE_ROOT = path.join(REPO_ROOT, "app");
const WRITE_SCAN_ROOTS = [
  path.join(REPO_ROOT, "app"),
  path.join(REPO_ROOT, "lib"),
];
const MIGRATIONS_ROOT = path.join(REPO_ROOT, "supabase/migrations");

const args = new Set(process.argv.slice(2));
const mode = args.has("--write") ? "write" : "check";

const ROUTE_METADATA_BY_KEY = {
  "POST /internal/account-maintenance/tick": { owner_scope: "system", persists_personal_state: false },
  "POST /api/v1/auth/logout": { owner_scope: "auth-session", persists_personal_state: false },
  "POST /api/v1/admin/page-view": { owner_scope: "admin", persists_personal_state: false },
  "POST /api/v1/cooking/sessions": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/cooking/sessions/[session_id]/cancel": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/cooking/sessions/[session_id]/complete": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/cooking/standalone-complete": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/feedback/404": { owner_scope: "public", persists_personal_state: false },
  "POST /api/v1/food-products": { owner_scope: "authenticated-user", persists_personal_state: true },
  "PATCH /api/v1/food-products/[product_id]": { owner_scope: "authenticated-user", persists_personal_state: true },
  "DELETE /api/v1/food-products/[product_id]": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/food-products/[product_id]/report": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/leftovers/[leftover_id]/eat": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/leftovers/[leftover_id]/keep": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/leftovers/[leftover_id]/uneat": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/meals": { owner_scope: "authenticated-user", persists_personal_state: true },
  "PATCH /api/v1/meals/[meal_id]": { owner_scope: "authenticated-user", persists_personal_state: true },
  "DELETE /api/v1/meals/[meal_id]": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/pantry": { owner_scope: "authenticated-user", persists_personal_state: true },
  "DELETE /api/v1/pantry": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/planner/columns": { owner_scope: "authenticated-user", persists_personal_state: true },
  "PATCH /api/v1/planner/columns/[column_id]": { owner_scope: "authenticated-user", persists_personal_state: true },
  "DELETE /api/v1/planner/columns/[column_id]": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/product-planner-entries": { owner_scope: "authenticated-user", persists_personal_state: true },
  "PATCH /api/v1/product-planner-entries/[entry_id]": { owner_scope: "authenticated-user", persists_personal_state: true },
  "DELETE /api/v1/product-planner-entries/[entry_id]": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/recipe-books": { owner_scope: "authenticated-user", persists_personal_state: true },
  "PATCH /api/v1/recipe-books/[book_id]": { owner_scope: "authenticated-user", persists_personal_state: true },
  "DELETE /api/v1/recipe-books/[book_id]": { owner_scope: "authenticated-user", persists_personal_state: true },
  "DELETE /api/v1/recipe-books/[book_id]/recipes/[recipe_id]": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/recipes": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/recipes/[id]/like": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/recipes/[id]/save": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/recipes/images": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/recipes/tag-suggestions": { owner_scope: "authenticated-user", persists_personal_state: false },
  "POST /api/v1/recipes/youtube/candidate-drafts": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/recipes/youtube/extract": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/recipes/youtube/ingredient-registration": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/recipes/youtube/register": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/recipes/youtube/validate": { owner_scope: "authenticated-user", persists_personal_state: false },
  "POST /api/v1/shopping/lists": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/shopping/lists/[list_id]/complete": { owner_scope: "authenticated-user", persists_personal_state: true },
  "PATCH /api/v1/shopping/lists/[list_id]/items/[item_id]": { owner_scope: "authenticated-user", persists_personal_state: true },
  "PATCH /api/v1/shopping/lists/[list_id]/items/bulk": { owner_scope: "authenticated-user", persists_personal_state: true },
  "PATCH /api/v1/shopping/lists/[list_id]/items/reorder": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/users/me/gamification/notifications/seen": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/users/me/gamification/tutorial-quests/[quest_key]/dismiss": { owner_scope: "authenticated-user", persists_personal_state: true },
  "POST /api/v1/users/me/cutover-quarantine-resolution": { owner_scope: "authenticated-user", persists_personal_state: true },
  "PATCH /api/v1/users/me": { owner_scope: "authenticated-user", persists_personal_state: true },
  "DELETE /api/v1/users/me": { owner_scope: "authenticated-user", persists_personal_state: true },
  "PATCH /api/v1/users/me/settings": { owner_scope: "authenticated-user", persists_personal_state: true },
};

const LIB_FILE_OWNER_SCOPE = {
  "app/api/v1/users/me/_account-generation-active.ts": "authenticated-user",
  "lib/server/account-generation/auth-callback.ts": "authenticated-user",
  "lib/server/account-generation/external-write.ts": "authenticated-user",
  "lib/server/admin-audit.ts": "admin",
  "lib/server/admin-events.ts": "system",
  "lib/server/recipe-nutrition-snapshot.ts": "system",
  "lib/server/user-bootstrap.ts": "authenticated-user",
  "lib/server/user-gamification.ts": "authenticated-user",
  "lib/server/user-growth-activity.ts": "authenticated-user",
  "lib/server/user-progress.ts": "authenticated-user",
  "lib/server/youtube-import.ts": "authenticated-user",
};

const ROUTE_FILE_METADATA_BY_ROUTE = {
  "/api/v1/recipes/[id]": { owner_scope: "public", persists_personal_state: false },
  "/auth/callback": { owner_scope: "authenticated-user", persists_personal_state: true },
};

const KNOWN_STORAGE_BUCKETS = {
  RECIPE_IMAGE_BUCKET: "recipe-images",
};

const MUTATING_RPC_PATTERN =
  /^(abort|apply|begin|bind|cleanup|complete|consume|create|delete|finalize|increment|initiate|promote|register|report|resolve|revoke|set|stage|start|update|write)_/u;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

async function walkFiles(root, predicate) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const resolved = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(resolved, predicate);
    }
    if (predicate(resolved)) {
      return [resolved];
    }
    return [];
  }));

  return files.flat().sort();
}

function lineNumberFromIndex(source, index) {
  return source.slice(0, index).split("\n").length;
}

function routeFromFile(sourceFile) {
  const relative = normalizePath(path.relative(REPO_ROOT, sourceFile));
  const withoutApp = relative.replace(/^app/u, "");
  const routePath = withoutApp.replace(/\/route\.ts$/u, "");
  return routePath || "/";
}

function assertRouteClassification(routeKey) {
  const metadata = ROUTE_METADATA_BY_KEY[routeKey];
  if (!metadata) {
    throw new Error(`unclassified mutation route: ${routeKey}`);
  }
  return metadata;
}

function ownerScopeForWrite(sourceFile) {
  const normalized = normalizePath(path.relative(REPO_ROOT, sourceFile));
  if (normalized.endsWith("/route.ts")) {
    const route = routeFromFile(sourceFile);
    const directMetadata = ROUTE_FILE_METADATA_BY_ROUTE[route];
    if (directMetadata) {
      return {
        source_file: normalized,
        route,
        ...directMetadata,
      };
    }

    const routeMetadataEntries = Object.entries(ROUTE_METADATA_BY_KEY)
      .filter(([key]) => key.endsWith(` ${route}`))
      .map(([, metadata]) => metadata);
    if (routeMetadataEntries.length === 0) {
      throw new Error(`unclassified write route file: ${route}`);
    }

    const [first] = routeMetadataEntries;
    const consistent = routeMetadataEntries.every((metadata) =>
      metadata.owner_scope === first.owner_scope
      && metadata.persists_personal_state === first.persists_personal_state,
    );
    if (!consistent) {
      throw new Error(`inconsistent route metadata for write route file: ${route}`);
    }

    return {
      source_file: normalized,
      route,
      ...first,
    };
  }

  const scope = LIB_FILE_OWNER_SCOPE[normalized];
  if (!scope) {
    throw new Error(`unclassified write source file: ${normalized}`);
  }

  return {
    source_file: normalized,
    route: null,
    owner_scope: scope,
    persists_personal_state: scope === "authenticated-user",
  };
}

function ownerScopeForRouteMethod(sourceFile, method) {
  const route = routeFromFile(sourceFile);
  const key = `${method} ${route}`;
  const metadata = assertRouteClassification(key);
  return {
    key,
    route,
    source_file: normalizePath(path.relative(REPO_ROOT, sourceFile)),
    method,
    ...metadata,
  };
}

function isRouteFile(filePath) {
  return normalizePath(filePath).endsWith("/route.ts");
}

function isTsSource(filePath) {
  return /\.(ts|tsx)$/u.test(filePath);
}

async function collectRouteInventory() {
  const routeFiles = await walkFiles(ROUTE_ROOT, (filePath) => isRouteFile(filePath));
  const routes = await Promise.all(routeFiles.map(async (filePath) => {
    const source = await readFile(filePath, "utf8");
    const matches = source.matchAll(/export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)\s*\(/gu);

    return Array.from(matches, (match) => {
      const method = match[1];
      return ownerScopeForRouteMethod(filePath, method);
    });
  }));

  return routes.flat().sort((left, right) => left.key.localeCompare(right.key));
}

function collectMutatingRpcEntries(source, sourceFile) {
  const entries = [];
  const regex = /\.rpc\(\s*["'`]([^"'`]+)["'`]/gu;
  let match;
  let ordinal = 0;

  while ((match = regex.exec(source)) !== null) {
    const target = match[1];
    if (!MUTATING_RPC_PATTERN.test(target)) {
      continue;
    }

    ordinal += 1;
    const ownership = ownerScopeForWrite(sourceFile);
    entries.push({
      key: `rpc|${ownership.source_file}|${target}|${ordinal}`,
      kind: "rpc",
      operation: "call",
      target,
      line: lineNumberFromIndex(source, match.index),
      ...ownership,
    });
  }

  return entries;
}

function collectDirectDmlEntries(source, sourceFile) {
  const entries = [];
  const regex = /\.from\(\s*["'`]([^"'`]+)["'`]\s*\)([\s\S]{0,240}?)\.(insert|update|upsert|delete)\s*\(/gu;
  let match;
  let ordinal = 0;

  while ((match = regex.exec(source)) !== null) {
    ordinal += 1;
    const ownership = ownerScopeForWrite(sourceFile);
    entries.push({
      key: `direct_dml|${ownership.source_file}|${match[1]}|${match[3]}|${ordinal}`,
      kind: "direct_dml",
      operation: match[3],
      target: match[1],
      line: lineNumberFromIndex(source, match.index),
      ...ownership,
    });
  }

  return entries;
}

function collectStorageEntries(source, sourceFile) {
  const entries = [];
  const bucketMatch = source.match(/storage\.from\(\s*([A-Z0-9_]+|["'`][^"'`]+["'`])\s*\)/u);
  if (!bucketMatch) {
    return entries;
  }

  const ownership = ownerScopeForWrite(sourceFile);
  const rawBucketTarget = bucketMatch[1].replace(/^["'`]|["'`]$/gu, "");
  const bucketTarget = KNOWN_STORAGE_BUCKETS[rawBucketTarget] ?? rawBucketTarget.toLowerCase();
  const kind = source.includes("createServiceRoleClient()")
    ? "service_external_write"
    : "storage";

  for (const operation of ["upload", "remove", "move", "copy", "createSignedUploadUrl"]) {
    const regex = new RegExp(`\\.${operation}\\s*\\(`, "gu");
    let match;
    let ordinal = 0;
    while ((match = regex.exec(source)) !== null) {
      ordinal += 1;
      entries.push({
        key: `${kind}|${ownership.source_file}|${bucketTarget}|${operation}|${ordinal}`,
        kind,
        operation,
        target: bucketTarget,
        line: lineNumberFromIndex(source, match.index),
        ...ownership,
      });
    }
  }

  return entries;
}

async function collectWriteInventory() {
  const sourceFiles = (
    await Promise.all(WRITE_SCAN_ROOTS.map((root) => walkFiles(root, isTsSource)))
  ).flat().sort();
  const entries = await Promise.all(sourceFiles.map(async (filePath) => {
    const source = await readFile(filePath, "utf8");
    return [
      ...collectMutatingRpcEntries(source, filePath),
      ...collectDirectDmlEntries(source, filePath),
      ...collectStorageEntries(source, filePath),
    ];
  }));

  return entries.flat().sort((left, right) => left.key.localeCompare(right.key));
}

async function collectAuthUsersInboundFks() {
  const migrationFiles = await walkFiles(MIGRATIONS_ROOT, (filePath) => filePath.endsWith(".sql"));
  const entries = await Promise.all(migrationFiles.map(async (migrationFile) => {
    const source = await readFile(migrationFile, "utf8");
    const migrationEntries = [];
    const tableRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)\s*\(([\s\S]*?)\);\s*/gimu;
    let tableMatch;

    while ((tableMatch = tableRegex.exec(source)) !== null) {
      const table = tableMatch[1];
      const body = tableMatch[2];
      const columnRegex =
        /^\s*([a-z0-9_]+)\s+[^,\n]*references\s+auth\.users\s*\(\s*id\s*\)(?:\s+on\s+delete\s+(cascade|restrict|set null|set default|no action))?/gimu;
      let columnMatch;

      while ((columnMatch = columnRegex.exec(body)) !== null) {
        const column = columnMatch[1];
        const onDelete = (columnMatch[2] ?? "no action").toLowerCase();
        migrationEntries.push({
          key: `${table}.${column}:${onDelete}`,
          migration: normalizePath(path.relative(REPO_ROOT, migrationFile)),
          table,
          column,
          on_delete: onDelete,
        });
      }
    }
    return migrationEntries;
  }));

  return entries.flat().sort((left, right) => left.key.localeCompare(right.key));
}

function buildInventoryBody(routeInventory, writeInventory, authUsersInboundFks) {
  const withRouteGuard = routeInventory.map((entry) => ({
    ...entry,
    guard_mode: entry.persists_personal_state
      ? "protected-rpc-or-database-before-trigger"
      : "not_applicable",
    expected_generation: entry.persists_personal_state
      ? "joint-promote-server-verified-session-binding"
      : "not_applicable",
    activation_phase: entry.persists_personal_state
      ? "f0-expand-legacy-guard"
      : "always",
  }));
  const withWriteGuard = writeInventory.map((entry) => ({
    ...entry,
    guard_mode: !entry.persists_personal_state
      ? "not_applicable"
      : entry.kind === "service_external_write"
        ? "shared-fence-external-attempt-lease"
        : entry.kind === "storage"
          ? "authenticated-storage-policy-predicate"
          : entry.kind === "direct_dml"
            ? "database-before-trigger"
            : "protected-rpc-or-mutated-table-before-trigger",
    expected_generation: entry.persists_personal_state
      ? "joint-promote-server-verified-session-binding"
      : "not_applicable",
    activation_phase: entry.persists_personal_state
      ? "f0-expand-legacy-guard"
      : "always",
  }));

  return {
    schema_version: 1,
    inventory_scope: "account-session-generation-foundation",
    route_inventory: withRouteGuard,
    write_inventory: withWriteGuard,
    auth_users_inbound_fks: authUsersInboundFks,
  };
}

function serializeInventory(body) {
  return {
    ...body,
    generated_at: new Date().toISOString(),
    checksum: sha256(JSON.stringify(body)),
  };
}

function assertInventoryMatches(expected, actual) {
  const expectedBody = {
    schema_version: expected.schema_version,
    inventory_scope: expected.inventory_scope,
    route_inventory: expected.route_inventory,
    write_inventory: expected.write_inventory,
    auth_users_inbound_fks: expected.auth_users_inbound_fks,
  };
  const expectedChecksum = sha256(JSON.stringify(expectedBody));

  if (expected.checksum !== expectedChecksum) {
    throw new Error("stored inventory checksum does not match the stored body");
  }

  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expectedBody);
  if (actualJson !== expectedJson) {
    throw new Error("account session generation inventory drift detected");
  }
}

async function main() {
  const [routeInventory, writeInventory, authUsersInboundFks] = await Promise.all([
    collectRouteInventory(),
    collectWriteInventory(),
    collectAuthUsersInboundFks(),
  ]);

  const body = buildInventoryBody(routeInventory, writeInventory, authUsersInboundFks);

  if (mode === "write") {
    await writeFile(INVENTORY_PATH, `${JSON.stringify(serializeInventory(body), null, 2)}\n`, "utf8");
    process.stdout.write(
      `wrote account session generation inventory with ${routeInventory.length} routes, `
      + `${writeInventory.length} write surfaces, ${authUsersInboundFks.length} auth.users inbound fks\n`,
    );
    return;
  }

  const expected = JSON.parse(await readFile(INVENTORY_PATH, "utf8"));
  assertInventoryMatches(expected, body);
  process.stdout.write(
    `account session generation inventory is valid `
    + `(${routeInventory.length} routes, ${writeInventory.length} write surfaces, `
    + `${authUsersInboundFks.length} auth.users inbound fks)\n`,
  );
}

await main();
