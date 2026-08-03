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

const APPROVED_USER_SERVICE_ROLE_FILES = [
  "app/api/v1/cooking/session-attempts/[id]/cancel/route.ts",
  "app/api/v1/cooking/session-attempts/[id]/cook-mode/route.ts",
  "app/api/v1/cooking/session-attempts/route.ts",
  "app/api/v1/meals/[meal_id]/route.ts",
  "app/api/v1/meals/[meal_id]/route.ts",
  "app/api/v1/meals/route.ts",
  "app/api/v1/shopping/lists/route.ts",
];
const APPROVED_SERVICE_ROLE_FILES = [...APPROVED_USER_SERVICE_ROLE_FILES];

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
  it("has only the exact verified-session service-role routes and no direct bypass", () => {
    const inventory = inventoryHybridAuthorityPaths();

    expect(inventory.userServiceRoleViolations).toEqual([]);
    expect(inventory.userDirectServiceRoleEntries.map((entry) => entry.file))
      .toEqual(APPROVED_USER_SERVICE_ROLE_FILES);
    expect(inventory.userDirectServiceRoleEntries.every((entry) =>
      entry.classification === "user" && entry.kind === "service-role-call"
    )).toBe(true);
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
        factory: "createRecipeFuturePropagationInternalClient",
        file: "app/api/v1/recipes/[id]/future-plan-impact/route.ts",
      },
      {
        factory: "createRecipeFuturePropagationInternalClient",
        file: "app/api/v1/recipes/[id]/route.ts",
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

    expect(inventory.dataRouteResponseBoundaries).toHaveLength(56);
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
const recipeQuery = client.from("recipes");
recipeQuery.upsert({ title: "also blocked" });
client.storage.from("recipe-images-private").remove(["blocked.jpg"]);
const restBase = "https://data.example.test";
fetch(restBase + "/rest/v1/recipes", { method: "PATCH" });
const factory = elevated;
const fallback = Math.random() > 0.5
  ? factory()
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
      expect.objectContaining({
        file: "app/client-boundary.tsx",
        method: "upsert",
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

  it("detects a raw REST mutation when the path is interpolated from an identifier", () => {
    const root = fixtureRepository({
      "app/interpolated-rest-client.tsx": `"use client";
const restBase = "https://data.example.test";
const recipeMutationPath = "/rest/v1/recipes";
fetch(\`\${restBase}\${recipeMutationPath}\`, { method: "PATCH" });
`,
    });

    const inventory = inventoryHybridAuthorityPaths(root);

    expect(inventory.browserRawRestMutationPaths).toEqual([
      expect.objectContaining({
        file: "app/interpolated-rest-client.tsx",
        method: "PATCH",
      }),
    ]);
  });

  it("detects a conditionally selected and re-aliased service-role factory", () => {
    const root = fixtureRepository({
      "app/conditional-service-role-client.tsx": `"use client";
import { createServiceRoleClient as elevated } from "@/lib/supabase/server";
import * as serverClients from "@/lib/supabase/server";

const selectedFactory = Math.random() > 0.5
  ? elevated
  : serverClients.createServiceRoleClient;
const reAliasedFactory = selectedFactory;
const client = reAliasedFactory();
void client;
`,
    });

    const inventory = inventoryHybridAuthorityPaths(root);

    expect(inventory.userDirectServiceRoleEntries).toEqual([
      expect.objectContaining({
        file: "app/conditional-service-role-client.tsx",
      }),
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
const localQuery = localCollection.from();
localQuery.update?.({});
const localFactory = () => null;
const localFactoryAlias = localFactory;
localFactoryAlias();
const selectedLocalFactory = Math.random() > 0.5
  ? localFactory
  : () => null;
const reAliasedLocalFactory = selectedLocalFactory;
reAliasedLocalFactory();
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

    expect(inventory.serviceRoleEntries.map((entry) => entry.file))
      .toEqual(APPROVED_SERVICE_ROLE_FILES);
    expect(inventory.genericLocalServiceRoleViolations)
      .toEqual(inventory.serviceRoleEntries);
    expect(inventory.remoteCompatibilityEntries.map((entry) => entry.file))
      .toEqual(["app/api/v1/recipes/[id]/route.ts"]);
  });
});
