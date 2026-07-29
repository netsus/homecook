import { readFileSync } from "node:fs";

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
        "app/api/v1/cooking-methods/route.ts",
        "app/api/v1/ingredients/route.ts",
        "app/api/v1/recipes/[id]/route.ts",
        "app/api/v1/recipes/themes/route.ts",
      ]);
    expect(inventory.internalOperationEntries.map((entry) => ({
      factory: entry.factory,
      file: entry.file,
    }))).toEqual([
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
        factory: "createAuthCallbackInternalDataClient",
        file: "app/auth/callback/route.ts",
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

  it("keeps the one legacy browser Storage mutation as Stage 4 evidence", () => {
    const inventory = inventoryHybridAuthorityPaths();

    expect(inventory.browserDirectStoragePaths).toEqual([
      expect.objectContaining({
        file: "components/recipe/manual-recipe-create-screen.tsx",
        stage: 4,
      }),
    ]);
  });

  it("keeps every remaining service-role call inside an exact allowlist", () => {
    const inventory = inventoryHybridAuthorityPaths();

    expect(inventory.serviceRoleEntries.every((entry) =>
      entry.classification === "public"
      || entry.classification === "admin"
      || entry.classification === "internal"
    )).toBe(true);
    expect(inventory.publicServiceRoleEntries.length).toBeGreaterThan(0);
    expect(inventory.internalServiceRoleEntries.length).toBeGreaterThan(0);
  });
});
