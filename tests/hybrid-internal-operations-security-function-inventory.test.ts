import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { inventoryHybridAuthorityPaths } from "../scripts/lib/hybrid-authority-inventory.mjs";

const MANIFEST_PATH =
  "docs/security/hybrid-internal-operations-security-function-authorization-manifest.json";
const MIGRATION_PATH =
  "supabase/migrations/20260730140000_hybrid_internal_operations_facades.sql";

describe("hybrid internal operation security function inventory", () => {
  it("classifies both scoped facade RPCs as service-role-only pre-deployment functions", async () => {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8")) as {
      deployment_state: string;
      functions: Array<{
        allowed_principals: string[];
        security_mode: string;
        signature: string;
      }>;
    };

    expect(manifest.deployment_state).toBe("pre-deployment");
    expect(manifest.functions).toEqual([
      expect.objectContaining({
        allowed_principals: ["service_role"],
        security_mode: "definer",
        signature:
          "public.bootstrap_legacy_auth_callback_identity(uuid, text, text, text, text, text)",
      }),
      expect.objectContaining({
        allowed_principals: ["service_role"],
        security_mode: "definer",
        signature:
          "public.record_internal_operational_event(text, text, text, uuid, uuid, text, integer, text, text, jsonb)",
      }),
    ]);
  });

  it("connects the manifest and migration to the live security-function validator", async () => {
    const [migration, validator] = await Promise.all([
      readFile(MIGRATION_PATH, "utf8"),
      readFile("scripts/validate-security-function-authorization.mjs", "utf8"),
    ]);

    expect(validator).toContain(MANIFEST_PATH.split("/").at(-1));
    expect(validator).toContain(MIGRATION_PATH.split("/").at(-1));
    expect(migration).toMatch(
      /revoke all on function public\.bootstrap_legacy_auth_callback_identity[\s\S]+from public, anon, authenticated[\s\S]+grant execute[\s\S]+to service_role/iu,
    );
    expect(migration).toMatch(
      /revoke all on function public\.record_internal_operational_event[\s\S]+from public, anon, authenticated[\s\S]+grant execute[\s\S]+to service_role/iu,
    );
  });

  it("allows only the approved derived recipe POST helper to use the future propagation internal client", () => {
    const inventory = inventoryHybridAuthorityPaths(process.cwd());

    expect(
      inventory.internalOperationFunctionAllowlist
        .createRecipeFuturePropagationInternalClient?.["app/api/v1/recipes/route.ts"],
    ).toEqual(["postRecipe"]);
    expect(
      inventory.internalOperationViolations.filter(
        (entry) => entry.factory === "createRecipeFuturePropagationInternalClient",
      ),
    ).toEqual([]);
  });
});
