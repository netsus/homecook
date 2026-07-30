import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { inventoryHybridAuthorityPaths } from "../scripts/lib/hybrid-authority-inventory.mjs";

describe("hybrid authority AST/static gate", () => {
  it("has zero user-route service-role fallback or direct bypass", () => {
    const inventory = inventoryHybridAuthorityPaths();

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
    const inventory = inventoryHybridAuthorityPaths();

    expect(inventory.dataRouteResponseBoundaries).toHaveLength(52);
    expect(inventory.dataRouteResponseBoundaryViolations).toEqual([]);
  });

  it("links every official anonymous API route to an exact public-read scope", () => {
    const inventory = inventoryHybridAuthorityPaths();

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
    const inventory = inventoryHybridAuthorityPaths();

    expect(inventory.browserDirectStoragePaths).toEqual([]);
  });

  it("finds every adversarial client-reachable Storage mutation bypass", () => {
    const fixtureRoot = path.resolve(
      "tests/fixtures/hybrid-static-bypasses",
    );
    const inventory = inventoryHybridAuthorityPaths(fixtureRoot);

    expect(
      inventory.browserDirectStoragePaths.map((entry) => entry.file),
    ).toEqual([
      "lib/api/dynamic-sdk-alias.mjs",
      "lib/api/raw-delete.ts",
      "lib/api/sdk-alias.mjs",
      "lib/api/sdk-bracket.js",
    ]);
    expect(inventory.clientReachableFiles).not.toContain(
      "lib/server/type-only-storage.ts",
    );
  });

  it("keeps every remaining service-role call inside an exact allowlist", () => {
    const inventory = inventoryHybridAuthorityPaths();

    expect(inventory.serviceRoleEntries).toEqual([]);
    expect(inventory.genericLocalServiceRoleViolations).toEqual([]);
    expect(inventory.remoteCompatibilityEntries.map((entry) => entry.file))
      .toEqual(["app/api/v1/recipes/[id]/route.ts"]);
  });
});
