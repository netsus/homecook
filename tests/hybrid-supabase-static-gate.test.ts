import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

import { inventoryHybridAuthorityPaths } from "../scripts/lib/hybrid-authority-inventory.mjs";

describe("hybrid authority AST/static gate", () => {
  let defaultInventory: ReturnType<typeof inventoryHybridAuthorityPaths>;

  beforeAll(() => {
    defaultInventory = inventoryHybridAuthorityPaths();
  }, 30_000);

  it("has zero user-route service-role fallback or direct bypass", () => {
    const inventory = defaultInventory;

    expect(inventory.userServiceRoleViolations).toEqual([]);
    expect(inventory.userDirectServiceRoleEntries).toEqual([]);
    expect(inventory.internalOperationViolations).toEqual([]);
    expect(inventory.remoteCompatibilityEntries.map((entry) => entry.file))
      .toEqual([
        "app/api/v1/recipes/[id]/route.ts",
      ]);
    expect(inventory.internalOperationEntries.map((entry) => ({
      factory: entry.factory,
      file: entry.file,
    }))).toEqual([
      {
        factory: "createAdminDataInternalClient",
        file: "app/admin/layout.tsx",
      },
      {
        factory: "createNotFoundFeedbackInternalClient",
        file: "app/api/v1/feedback/404/route.ts",
      },
      {
        factory: "createRecipeImageInternalClient",
        file: "app/api/v1/recipes/images/[image_object_id]/cancel/route.ts",
      },
      {
        factory: "createRecipeImageInternalClient",
        file: "app/api/v1/recipes/images/route.ts",
      },
      {
        factory: "createAccountLifecycleInternalRpcClient",
        file: "app/api/v1/users/me/cutover-quarantine-resolution/route.ts",
      },
      {
        factory: "createAccountLifecycleInternalRpcClient",
        file: "app/api/v1/users/me/route.ts",
      },
      {
        factory: "createAccountLifecycleInternalRpcClient",
        file: "app/api/v1/users/me/route.ts",
      },
      {
        factory: "createAuthCallbackOperationsClient",
        file: "app/auth/callback/route.ts",
      },
      {
        factory: "createAccountLifecycleInternalRpcClient",
        file: "lib/server/account-generation/quarantine-gate.ts",
      },
      {
        factory: "createAdminDataInternalClient",
        file: "lib/server/admin-auth.ts",
      },
      {
        factory: "createOperationalEventInternalClient",
        file: "lib/server/admin-events.ts",
      },
      {
        factory: "createSessionLogoutInternalDataClient",
        file: "lib/server/hybrid-auth/logout.ts",
      },
      {
        factory: "createYoutubeIngredientRegistrationInternalRpcClient",
        file: "lib/server/youtube-import.ts",
      },
      {
        factory: "createAuthRefreshInternalDataClient",
        file: "lib/supabase/server.ts",
      },
    ]);

    const serverFactory = readFileSync("lib/supabase/server.ts", "utf8");
    expect(serverFactory).toMatch(
      /createRemoteCompatibilityServiceRoleClient[\s\S]+authority === "local"[\s\S]+\? null/i,
    );
  });

  it("routes every local Data handler through the common API response boundary", () => {
    const inventory = defaultInventory;

    expect(inventory.dataRouteResponseBoundaries).toHaveLength(52);
    expect(inventory.dataRouteResponseBoundaryViolations).toEqual([]);
  });

  it("links every official anonymous API route to an exact public-read scope", () => {
    const inventory = defaultInventory;

    expect(inventory.publicRouteContractViolations).toEqual([]);
    expect(inventory.publicRouteContracts).toEqual([
      expect.objectContaining({
        file: "app/api/v1/cooking-methods/route.ts",
        scope: "cooking-methods",
      }),
      expect.objectContaining({
        file: "app/api/v1/ingredients/route.ts",
        scope: "ingredients",
      }),
      expect.objectContaining({
        file: "app/api/v1/recipes/[id]/cook-mode/route.ts",
        scope: "recipe-cook-mode",
      }),
      expect.objectContaining({
        file: "app/api/v1/recipes/[id]/route.ts",
        scope: "recipe-detail",
      }),
      expect.objectContaining({
        file: "app/api/v1/recipes/route.ts",
        scope: "recipes",
      }),
      expect.objectContaining({
        file: "app/api/v1/recipes/themes/route.ts",
        scope: "recipe-themes",
      }),
      expect.objectContaining({
        file: "app/api/v1/tags/route.ts",
        scope: "tags",
      }),
    ]);
  });

  it("has zero browser direct Storage mutations after Stage 4", () => {
    const inventory = defaultInventory;

    expect(inventory.browserDirectStoragePaths).toEqual([]);
  });

  it("allows Supabase browser runtime imports only in the Auth adapter", () => {
    const inventory = defaultInventory;

    expect(inventory.browserSupabaseRuntimeImportViolations).toEqual([]);
  });

  it("finds ESM, CommonJS, re-export, and dynamic loader bypasses in the client graph", () => {
    const fixtureRoot = path.resolve(
      "tests/fixtures/hybrid-static-bypasses",
    );
    const inventory = inventoryHybridAuthorityPaths(fixtureRoot);

    expect(inventory.browserSupabaseRuntimeImportViolations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "components/dynamic-binding-client.tsx",
          kind: "unknown-runtime-dynamic-import",
        }),
        expect.objectContaining({
          file: "components/dynamic-import-options-client.tsx",
          kind: "runtime-dynamic-import",
          package: "@supabase/supabase-js",
        }),
        expect.objectContaining({
          file: "components/dynamic-import-options-client.tsx",
          kind: "unknown-runtime-dynamic-import",
        }),
        expect.objectContaining({
          file: "components/dynamic-unknown-sdk-client.tsx",
          kind: "unknown-runtime-dynamic-import",
        }),
        expect.objectContaining({
          file: "components/forbidden-commonjs-alias-client.tsx",
          kind: "runtime-require",
          package: "@supabase/supabase-js",
        }),
        expect.objectContaining({
          file: "components/forbidden-commonjs-client.tsx",
          kind: "runtime-require",
          package: "@supabase/supabase-js",
        }),
        expect.objectContaining({
          file: "components/unknown-runtime-loader-client.tsx",
          kind: "unknown-runtime-dynamic-import",
        }),
        expect.objectContaining({
          file: "components/unknown-runtime-loader-client.tsx",
          kind: "unknown-runtime-require",
        }),
        expect.objectContaining({
          file: "components/forbidden-supabase-client.tsx",
          package: "@supabase/ssr",
        }),
        expect.objectContaining({
          file: "components/forbidden-supabase-client.tsx",
          package: "@supabase/storage-js",
        }),
        expect.objectContaining({
          file: "stores/forbidden-supabase-barrel.ts",
          package: "@supabase/supabase-js",
        }),
        expect.objectContaining({
          file: "stores/ambiguous-runtime.mts",
          package: "@supabase/supabase-js",
        }),
        expect.objectContaining({
          file: "stores/forbidden-commonjs-barrel.js",
          kind: "runtime-require",
          package: "@supabase/storage-js",
        }),
        expect.objectContaining({
          file: "stores/forbidden-cjs.cjs",
          kind: "runtime-require",
          package: "@supabase/supabase-js",
        }),
        expect.objectContaining({
          file: "stores/forbidden-cts.cts",
          package: "@supabase/supabase-js",
        }),
        expect.objectContaining({
          file: "stores/forbidden-jsx.jsx",
          package: "@supabase/ssr",
        }),
        expect.objectContaining({
          file: "stores/forbidden-mts.mts",
          package: "@supabase/supabase-js",
        }),
        expect.objectContaining({
          file: "stores/forbidden-runtime-index/index.cts",
          package: "@supabase/supabase-js",
        }),
      ]),
    );
    expect(inventory.browserSupabaseRuntimeImportViolations).toHaveLength(19);
    expect(inventory.browserSupabaseRuntimeImportViolations).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "components/supabase-type-only-client.tsx",
        }),
        expect.objectContaining({
          file: "components/safe-commonjs-helper-client.tsx",
        }),
        expect.objectContaining({
          file: "components/safe-local-runtime-client.tsx",
        }),
        expect.objectContaining({
          file: "lib/api/safe-runtime-mts.mts",
        }),
        expect.objectContaining({
          file: "lib/api/safe-runtime-type.mts",
        }),
        expect.objectContaining({
          file: "lib/api/type-only-ambiguous-runtime.mts",
        }),
      ]),
    );
  });

  it("covers every viable runtime source when TypeScript resolves an ambiguous explicit extension", () => {
    const fixtureRoot = path.resolve(
      "tests/fixtures/hybrid-static-bypasses",
    );
    const importer = path.join(
      fixtureRoot,
      "components/ambiguous-extension-client.tsx",
    );
    const resolved = ts.resolveModuleName(
      "../stores/ambiguous-runtime.mjs",
      importer,
      {
        allowJs: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
      ts.sys,
    ).resolvedModule;
    const inventory = inventoryHybridAuthorityPaths(fixtureRoot);

    expect(
      path.relative(fixtureRoot, resolved?.resolvedFileName ?? ""),
    ).toBe("stores/ambiguous-runtime.mts");
    expect(inventory.clientReachableFiles).toEqual(
      expect.arrayContaining([
        "stores/ambiguous-runtime.mjs",
        "stores/ambiguous-runtime.mts",
        "lib/api/safe-ambiguous-runtime.mjs",
        "lib/api/safe-ambiguous-runtime.mts",
      ]),
    );
    expect(inventory.clientReachableFiles).not.toContain(
      "lib/api/type-only-ambiguous-runtime.mts",
    );
  });

  it("keeps direct executable Storage syntax as an auxiliary canary", () => {
    const fixtureRoot = path.resolve(
      "tests/fixtures/hybrid-static-bypasses",
    );
    const inventory = inventoryHybridAuthorityPaths(fixtureRoot);

    expect(
      inventory.browserDirectStoragePaths.map((entry) => entry.file),
    ).toEqual([
      "features/unsafe.mjs",
      "lib/api/sdk-bracket.js",
    ]);
    expect(inventory.clientReachableFiles).not.toContain(
      "lib/server/type-only-storage.ts",
    );
    expect(inventory.clientReachableFiles).not.toContain(
      "stores/server-only.ts",
    );
    expect(inventory.clientReachableFiles).toEqual(
      expect.arrayContaining([
        "components/commonjs-barrel-client.tsx",
        "components/dynamic-import-options-client.tsx",
        "components/forbidden-supabase-client.tsx",
        "components/dynamic-client.tsx",
        "components/runtime-extension-client.tsx",
        "components/safe-local-runtime-client.tsx",
        "components/supabase-type-only-client.tsx",
        "components/unknown-runtime-loader-client.tsx",
        "lib/api/safe-ambiguous-runtime.mjs",
        "lib/api/safe-ambiguous-runtime.mts",
        "lib/api/safe-import-options.mts",
        "lib/api/safe-runtime-mts.mts",
        "stores/ambiguous-runtime.mjs",
        "stores/ambiguous-runtime.mts",
        "stores/forbidden-commonjs-barrel.js",
        "stores/forbidden-cjs.cjs",
        "stores/forbidden-cts.cts",
        "stores/forbidden-jsx.jsx",
        "stores/forbidden-mts.mts",
        "stores/forbidden-runtime-index/index.cts",
        "stores/forbidden-supabase-barrel.ts",
      ]),
    );
    expect(inventory.clientReachableFiles).not.toContain(
      "lib/api/safe-runtime-type.mts",
    );
    expect(inventory.clientReachableFiles).not.toContain(
      "lib/api/type-only-ambiguous-runtime.mts",
    );
  });

  it("keeps every remaining service-role call inside an exact allowlist", () => {
    const inventory = defaultInventory;

    expect(inventory.serviceRoleEntries).toEqual([]);
    expect(inventory.genericLocalServiceRoleViolations).toEqual([]);
    expect(inventory.remoteCompatibilityEntries.map((entry) => entry.file))
      .toEqual(["app/api/v1/recipes/[id]/route.ts"]);
  });
});
