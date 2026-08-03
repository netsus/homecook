import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const manifestPath =
  "docs/security/recipe-content-snapshot-future-propagation-security-function-authorization-manifest.json";

describe("recipe snapshot entrypoint security function inventory", () => {
  it("classifies both service-only entrypoint projection functions", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      functions?: Array<{
        signature?: string;
        control_class?: string;
        effect?: string;
        exposure?: string;
        allowed_principals?: string[];
        security_mode?: string;
        safe_search_path?: string[];
      }>;
    };
    const validator = readFileSync(
      "scripts/validate-security-function-authorization.mjs",
      "utf8",
    );
    const fullLocalInventory = readFileSync(
      "scripts/lib/full-local-security-inventory.mjs",
      "utf8",
    );

    for (const [signature, safeSearchPath] of [
      [
        "public.read_recipe_snapshot_ui_mode()",
        ["pg_catalog", "public", "pg_temp"],
      ],
      [
        "public.read_recipe_snapshot_entrypoint_context(uuid, timestamp with time zone, text, integer, timestamp with time zone, uuid)",
        ["pg_catalog", "public", "private", "pg_temp"],
      ],
    ] as const) {
      expect(
        manifest.functions?.find((entry) => entry.signature === signature),
      ).toMatchObject({
        control_class: "application-controlled",
        effect: "read-only",
        exposure: "service-internal",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        safe_search_path: safeSearchPath,
      });
    }
    expect(validator).toContain(
      "20260804100000_recipe_snapshot_entrypoint_projection.sql",
    );
    expect(fullLocalInventory).toContain(
      "20260804100000_recipe_snapshot_entrypoint_projection.sql",
    );
  });
});
