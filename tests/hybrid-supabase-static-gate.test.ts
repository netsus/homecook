import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { inventoryHybridAuthorityPaths } from "../scripts/lib/hybrid-authority-inventory.mjs";

const temporaryRepositories: string[] = [];

function fixtureRepository(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "homecook-authority-inventory-"));
  temporaryRepositories.push(root);
  for (const [relativePath, source] of Object.entries(files)) {
    const absolutePath = join(root, relativePath);
    mkdirSync(join(absolutePath, ".."), { recursive: true });
    writeFileSync(absolutePath, source, "utf8");
  }
  return root;
}

afterEach(() => {
  while (temporaryRepositories.length > 0) {
    rmSync(temporaryRepositories.pop()!, { force: true, recursive: true });
  }
});

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

  it("removes the final legacy browser Storage mutation after Stage 4", () => {
    const inventory = inventoryHybridAuthorityPaths();

    expect(inventory.browserDirectStoragePaths).toEqual([]);
  });

  it("detects browser Data/REST mutation and aliased conditional service-role calls", () => {
    const root = fixtureRepository({
      "app/client-boundary.tsx": `"use client";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { createServiceRoleClient as elevated } from "@/lib/supabase/server";
import * as serverClients from "@/lib/supabase/server";

const client = getSupabaseBrowserClient();
client.from("recipes").update({ title: "blocked" });
client.storage.from("recipe-images-private").remove(["blocked.jpg"]);
fetch("https://data.example.test/rest/v1/recipes", { method: "PATCH" });
const fallback = Math.random() > 0.5
  ? elevated()
  : serverClients.createServiceRoleClient();
void fallback;
`,
    });

    const inventory = inventoryHybridAuthorityPaths(root);

    expect(inventory.browserDirectDataMutationPaths).toEqual([
      expect.objectContaining({
        file: "app/client-boundary.tsx",
        method: "update",
        table: "recipes",
      }),
    ]);
    expect(inventory.browserRawRestMutationPaths).toEqual([
      expect.objectContaining({
        file: "app/client-boundary.tsx",
        method: "PATCH",
      }),
    ]);
    expect(inventory.browserDirectStoragePaths).toHaveLength(1);
    expect(inventory.userDirectServiceRoleEntries).toEqual([
      expect.objectContaining({ file: "app/client-boundary.tsx" }),
      expect.objectContaining({ file: "app/client-boundary.tsx" }),
    ]);
  });

  it("does not mistake unrelated from/insert chains or REST reads for browser mutation", () => {
    const root = fixtureRepository({
      "components/safe-client.tsx": `"use client";
const localCollection = {
  from() {
    return { insert() { return "local-only"; } };
  },
};
localCollection.from().insert();
fetch("https://data.example.test/rest/v1/recipes");
`,
    });

    const inventory = inventoryHybridAuthorityPaths(root);

    expect(inventory.browserDirectDataMutationPaths).toEqual([]);
    expect(inventory.browserRawRestMutationPaths).toEqual([]);
    expect(inventory.userDirectServiceRoleEntries).toEqual([]);
  });

  it("keeps every remaining service-role call inside an exact allowlist", () => {
    const inventory = inventoryHybridAuthorityPaths();

    expect(inventory.serviceRoleEntries).toEqual([]);
    expect(inventory.genericLocalServiceRoleViolations).toEqual([]);
    expect(inventory.remoteCompatibilityEntries.map((entry) => entry.file))
      .toEqual(["app/api/v1/recipes/[id]/route.ts"]);
  });
});
