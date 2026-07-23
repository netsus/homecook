import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ADDITIVE_MANIFEST_PATH =
  "docs/security/account-session-generation-security-function-authorization-manifest.json";
const HISTORICAL_INVENTORY_PATH =
  "docs/security/security-definer-function-authorization-inventory.json";

describe("account session generation security function inventory", () => {
  it("records an additive F0 function authorization manifest", () => {
    expect(existsSync(ADDITIVE_MANIFEST_PATH)).toBe(true);
  });

  it("validates the additive manifest without requiring a live database", () => {
    const manifest = JSON.parse(readFileSync(ADDITIVE_MANIFEST_PATH, "utf8")) as {
      functions: unknown[];
    };
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
      `${manifest.functions.length} pre-deployment additive application functions`,
    );
  }, 15_000);

  it("fails closed when the F0 migration contains an unclassified function", async () => {
    const fixtureRoot = await mkdtemp(
      path.join(tmpdir(), "homecook-security-function-additive-"),
    );
    const fixtureManifestPath = path.join(fixtureRoot, "manifest.json");
    const manifest = JSON.parse(readFileSync(ADDITIVE_MANIFEST_PATH, "utf8")) as {
      functions: unknown[];
    };
    await writeFile(
      fixtureManifestPath,
      `${JSON.stringify({
        ...manifest,
        functions: manifest.functions.slice(0, -1),
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
            SECURITY_FUNCTION_ADDITIVE_MANIFEST_PATH: fixtureManifestPath,
            SECURITY_FUNCTION_DATABASE_URL:
              "postgresql://postgres:postgres@127.0.0.1:1/postgres",
          },
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).not.toBe(0);
      expect(output).toContain("additive function contract drift; unclassified=");
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("fails closed when the historical inventory drifts in contract-only mode", async () => {
    const fixtureRoot = await mkdtemp(
      path.join(tmpdir(), "homecook-security-function-inventory-"),
    );
    const fixtureInventoryPath = path.join(fixtureRoot, "inventory.json");
    const inventory = JSON.parse(
      readFileSync(HISTORICAL_INVENTORY_PATH, "utf8"),
    ) as { functions: unknown[] };
    await writeFile(
      fixtureInventoryPath,
      `${JSON.stringify({
        ...inventory,
        functions: inventory.functions.slice(1),
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
            SECURITY_FUNCTION_DATABASE_URL:
              "postgresql://postgres:postgres@127.0.0.1:1/postgres",
            SECURITY_FUNCTION_INVENTORY_PATH: fixtureInventoryPath,
          },
        },
      );
      const output = `${result.stdout}\n${result.stderr}`;

      expect(result.status).not.toBe(0);
      expect(output).toContain(
        "inventory application contract does not match the migration contract",
      );
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
