import { readFileSync } from "node:fs";
import path from "node:path";

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

  it("finds every adversarial client-reachable Storage mutation bypass", () => {
    const fixtureRoot = path.resolve(
      "tests/fixtures/hybrid-static-bypasses",
    );
    const inventory = inventoryHybridAuthorityPaths(fixtureRoot);

    expect(
      inventory.browserDirectStoragePaths.map((entry) => entry.file),
    ).toEqual([
      "components/dynamic-binding-client.tsx",
      "components/dynamic-binding-client.tsx",
      "components/dynamic-binding-client.tsx",
      "components/dynamic-binding-client.tsx",
      "components/dynamic-binding-client.tsx",
      "components/dynamic-binding-client.tsx",
      "components/dynamic-unknown-sdk-client.tsx",
      "components/dynamic-unknown-sdk-client.tsx",
      "components/dynamic-unknown-sdk-client.tsx",
      "components/dynamic-unknown-sdk-client.tsx",
      "components/dynamic-unknown-sdk-client.tsx",
      "components/dynamic-unknown-sdk-client.tsx",
      "components/live-binding-client.tsx",
      "components/live-binding-client.tsx",
      "components/live-binding-client.tsx",
      "components/live-binding-client.tsx",
      "components/live-binding-client.tsx",
      "components/live-binding-client.tsx",
      "components/live-binding-client.tsx",
      "features/unsafe.mjs",
      "lib/api/dynamic-sdk-alias.mjs",
      "lib/api/raw-delete.ts",
      "lib/api/sdk-alias.mjs",
      "lib/api/sdk-bracket.js",
      "stores/aliased-rest.ts",
      "stores/imported-fetch.ts",
      "stores/sdk-patterns.ts",
      "stores/sdk-patterns.ts",
      "stores/sdk-patterns.ts",
      "stores/unsafe.ts",
    ]);
    expect(inventory.clientReachableFiles).not.toContain(
      "lib/server/type-only-storage.ts",
    );
    expect(inventory.clientReachableFiles).not.toContain(
      "stores/server-only.ts",
    );
    expect(inventory.clientReachableFiles).toEqual(
      expect.arrayContaining([
        "components/dynamic-client.tsx",
        "components/dynamic-binding-client.tsx",
        "components/dynamic-unknown-sdk-client.tsx",
        "components/live-binding-client.tsx",
        "components/live-binding-safe-client.tsx",
        "components/safe-dynamic-client.tsx",
        "lib/api/complex/index.ts",
        "lib/api/cycle-a.ts",
        "lib/api/cycle-b.ts",
        "lib/api/fetch-barrel.ts",
        "lib/api/fetch-transport.ts",
        "lib/api/computed-tools.ts",
        "lib/api/live-barrel.ts",
        "lib/api/live-conditional.ts",
        "lib/api/live-dynamic-barrel.ts",
        "lib/api/live-destructure.ts",
        "lib/api/live-mutation.ts",
        "lib/api/live-safe.ts",
        "lib/api/live-unknown.ts",
        "lib/api/live-update.ts",
        "lib/api/non-fetch-helper.ts",
        "lib/api/safe-dynamic-helper.ts",
        "lib/api/sdk-barrel.ts",
        "lib/api/sdk-dynamic-barrel.ts",
        "lib/api/sdk-transport.ts",
        "stores/aliased-rest.ts",
        "stores/imported-fetch.ts",
        "stores/live-binding-store.ts",
        "stores/safe-imported-helper.ts",
        "stores/sdk-patterns.ts",
        "stores/sdk-store.ts",
      ]),
    );
    expect(
      inventory.browserDirectStoragePaths.filter(
        (entry) => entry.file === "stores/aliased-rest.ts",
      ),
    ).toHaveLength(1);
    expect(
      inventory.browserDirectStoragePaths.filter(
        (entry) => entry.file === "stores/imported-fetch.ts",
      ),
    ).toHaveLength(1);
    expect(inventory.browserDirectStoragePaths).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "stores/safe-imported-helper.ts",
        }),
      ]),
    );
    expect(
      inventory.browserDirectStoragePaths.filter(
        (entry) => entry.file === "components/dynamic-binding-client.tsx",
      ),
    ).toHaveLength(6);
    expect(
      inventory.browserDirectStoragePaths.filter(
        (entry) => entry.file === "components/dynamic-unknown-sdk-client.tsx",
      ),
    ).toHaveLength(6);
    expect(
      inventory.browserDirectStoragePaths.filter(
        (entry) => entry.file === "components/live-binding-client.tsx",
      ),
    ).toHaveLength(7);
    expect(
      inventory.browserDirectStoragePaths.filter(
        (entry) => entry.file === "stores/sdk-patterns.ts",
      ),
    ).toHaveLength(3);
    expect(inventory.browserDirectStoragePaths).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "components/safe-dynamic-client.tsx",
        }),
      ]),
    );
    expect(inventory.browserDirectStoragePaths).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "components/live-binding-safe-client.tsx",
        }),
      ]),
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
