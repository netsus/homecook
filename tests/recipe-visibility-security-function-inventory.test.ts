import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertHistoricalReplacementIdentity,
  classifyAdditiveDeploymentState,
} from "../scripts/security-function-additive-state.mjs";

const MANIFEST_PATH =
  "docs/security/recipe-visibility-read-hardening-security-function-authorization-manifest.json";

describe("recipe visibility security function inventory", () => {
  it("classifies the guard and every recreated baseline function", () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);

    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
      functions: Array<Record<string, unknown>>;
    };

    expect(manifest.functions).toEqual([
      expect.objectContaining({
        signature: "public.set_recipe_tags(uuid, jsonb, uuid, text)",
        allowed_principals: ["service_role"],
        security_mode: "definer",
        replaces_baseline: true,
      }),
      expect.objectContaining({
        signature: "public.find_recipe_ids_by_public_tags(text, text)",
        allowed_principals: ["anon", "authenticated"],
        security_mode: "invoker",
        replaces_baseline: true,
      }),
      expect.objectContaining({
        signature:
          "public.list_public_recipe_tags(text, text, boolean, integer)",
        allowed_principals: ["anon", "authenticated"],
        security_mode: "invoker",
        replaces_baseline: true,
      }),
      expect.objectContaining({
        signature: "public.list_home_theme_recipes(integer, integer)",
        allowed_principals: ["anon", "authenticated"],
        security_mode: "invoker",
        replaces_baseline: true,
      }),
      expect.objectContaining({
        signature:
          "recipe_visibility_guard.is_owner_publicly_visible(uuid)",
        control_class: "application-controlled",
        effect: "read-only",
        exposure: "public",
        allowed_principals: ["anon", "authenticated"],
        security_mode: "definer",
        owner: "homecook_recipe_visibility_guard_owner",
        safe_search_path: ["pg_catalog", "public", "pg_temp"],
      }),
    ]);
  });

  it("uses new functions as deployment markers and rejects incomplete replacements", () => {
    const contract = [
      {
        signature: "public.recreated_baseline()",
        replaces_baseline: true,
      },
      {
        signature: "recipe_visibility_guard.marker()",
      },
    ];

    expect(
      classifyAdditiveDeploymentState(contract, [
        { signature: "public.recreated_baseline()" },
      ]),
    ).toBe("pre-deployment");
    expect(
      classifyAdditiveDeploymentState(contract, [
        { signature: "public.recreated_baseline()" },
        { signature: "recipe_visibility_guard.marker()" },
      ]),
    ).toBe("post-migration");
    expect(() =>
      classifyAdditiveDeploymentState(contract, [
        { signature: "recipe_visibility_guard.marker()" },
      ]),
    ).toThrow(
      "partially deployed additive function contract: public.recreated_baseline()",
    );
  });

  it("keeps the historical owner and function shape for deployed replacements", () => {
    const expectedObservation = {
      owner: "postgres",
      extension_name: null,
      result_type: "void",
      volatility: "v",
    };
    const currentRow = {
      owner: "broader_runtime_owner",
      extension_name: null,
      result_type: "void",
      provolatile: "v",
    };

    expect(() =>
      assertHistoricalReplacementIdentity(
        "public.set_recipe_tags(uuid, jsonb, uuid, text)",
        expectedObservation,
        currentRow,
      ),
    ).toThrow(
      "deployed baseline replacement owner drift for public.set_recipe_tags(uuid, jsonb, uuid, text)",
    );
  });

  it("validates every additive manifest without a live database", () => {
    const result = spawnSync(
      "node",
      ["scripts/validate-security-function-authorization.mjs", "--contract-only"],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          SECURITY_FUNCTION_DATABASE_URL:
            "postgresql://postgres:postgres@127.0.0.1:1/postgres",
        },
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;

    expect(result.status, output).toBe(0);
    expect(output).toContain(
      "recipe-visibility-read-hardening:5 pre-deployment additive application functions",
    );
  }, 15_000);

  it("fails closed when the guard owner contract drifts", async () => {
    const fixtureRoot = await mkdtemp(
      path.join(tmpdir(), "homecook-recipe-visibility-security-function-"),
    );
    const fixtureManifestPath = path.join(fixtureRoot, "manifest.json");
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
      functions: Array<Record<string, unknown>>;
    };
    await writeFile(
      fixtureManifestPath,
      `${JSON.stringify({
        ...manifest,
        functions: manifest.functions.map((entry) =>
          entry.signature ===
          "recipe_visibility_guard.is_owner_publicly_visible(uuid)"
            ? { ...entry, owner: "postgres" }
            : entry,
        ),
      }, null, 2)}\n`,
    );

    try {
      const result = spawnSync(
        "node",
        [
          "scripts/validate-security-function-authorization.mjs",
          "--contract-only",
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            SECURITY_FUNCTION_RECIPE_VISIBILITY_MANIFEST_PATH:
              fixtureManifestPath,
          },
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).not.toBe(0);
      expect(output).toContain(
        "additive function owner drift for recipe_visibility_guard.is_owner_publicly_visible(uuid)",
      );
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("fails closed when a recreated baseline function is unclassified", async () => {
    const fixtureRoot = await mkdtemp(
      path.join(tmpdir(), "homecook-recipe-visibility-baseline-override-"),
    );
    const fixtureManifestPath = path.join(fixtureRoot, "manifest.json");
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
      functions: Array<Record<string, unknown>>;
    };
    await writeFile(
      fixtureManifestPath,
      `${JSON.stringify({
        ...manifest,
        functions: manifest.functions.filter(
          (entry) =>
            entry.signature !==
            "public.list_home_theme_recipes(integer, integer)",
        ),
      }, null, 2)}\n`,
    );

    try {
      const result = spawnSync(
        "node",
        [
          "scripts/validate-security-function-authorization.mjs",
          "--contract-only",
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            SECURITY_FUNCTION_RECIPE_VISIBILITY_MANIFEST_PATH:
              fixtureManifestPath,
          },
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).not.toBe(0);
      expect(output).toContain(
        "unclassified=public.list_home_theme_recipes(integer, integer)",
      );
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
