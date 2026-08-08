import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const INVENTORY_PATH = "docs/security/account-session-generation-inventory.json";
const VALIDATOR_PATH = "scripts/validate-account-session-generation-inventory.mjs";

interface RouteInventoryEntry {
  route: string;
  method: "DELETE" | "PATCH" | "POST" | "PUT";
  owner_scope: string;
  persists_personal_state: boolean;
  guard_mode: string;
  expected_generation: string;
  activation_phase: string;
}

interface WriteInventoryEntry {
  kind: "direct_dml" | "rpc" | "service_external_write" | "storage";
  operation: string;
  target: string;
  source_file: string;
  persists_personal_state: boolean;
  guard_mode: string;
  expected_generation: string;
  activation_phase: string;
}

interface AuthUsersInboundFkEntry {
  table: string;
  column: string;
  on_delete: string;
}

describe("account session generation inventory", () => {
  it("pins repo write surfaces and auth.users inbound fks with fail-closed validation", async () => {
    const inventory = JSON.parse(await readFile(INVENTORY_PATH, "utf8")) as {
      schema_version: number;
      route_inventory: RouteInventoryEntry[];
      write_inventory: WriteInventoryEntry[];
      auth_users_inbound_fks: AuthUsersInboundFkEntry[];
    };

    expect(inventory.schema_version).toBe(1);
    expect(inventory.route_inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        route: "/api/v1/users/me",
        method: "DELETE",
        owner_scope: "authenticated-user",
        persists_personal_state: true,
      }),
      expect.objectContaining({
        route: "/api/v1/recipes/images",
        method: "POST",
        owner_scope: "authenticated-user",
        persists_personal_state: true,
      }),
      expect.objectContaining({
        route: "/api/v1/cooking/session-attempts",
        method: "POST",
        owner_scope: "authenticated-user",
        persists_personal_state: true,
      }),
      expect.objectContaining({
        route: "/api/v1/cooking/session-attempts/[id]/cancel",
        method: "POST",
        owner_scope: "authenticated-user",
        persists_personal_state: true,
      }),
      expect.objectContaining({
        route: "/api/v1/cooking/session-attempts/[id]/complete",
        method: "POST",
        owner_scope: "authenticated-user",
        persists_personal_state: true,
      }),
      expect.objectContaining({
        route: "/api/v1/cooked-batches/[id]/weight",
        method: "PATCH",
        owner_scope: "authenticated-user",
        persists_personal_state: true,
      }),
      expect.objectContaining({
        route: "/api/v1/cooked-batches/[id]/discard",
        method: "POST",
        owner_scope: "authenticated-user",
        persists_personal_state: true,
      }),
      expect.objectContaining({
        route: "/api/v1/cooked-batches/[id]/adjust",
        method: "POST",
        owner_scope: "authenticated-user",
        persists_personal_state: true,
      }),
      expect.objectContaining({
        route: "/api/v1/cooked-batches/[id]/close-unweighed",
        method: "POST",
        owner_scope: "authenticated-user",
        persists_personal_state: true,
      }),
      expect.objectContaining({
        route: "/api/v1/recipes/[id]",
        method: "PATCH",
        owner_scope: "authenticated-user",
        persists_personal_state: true,
      }),
      expect.objectContaining({
        route: "/api/v1/recipes/[id]",
        method: "DELETE",
        owner_scope: "authenticated-user",
        persists_personal_state: true,
      }),
      expect.objectContaining({
        route: "/api/v1/recipes/[id]/future-plan-impact",
        method: "POST",
        owner_scope: "authenticated-user",
        persists_personal_state: false,
      }),
    ]));
    expect(inventory.write_inventory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "rpc",
        operation: "call",
        target: "delete_user_private_data_with_generation_receipt",
        source_file: "app/api/v1/users/me/route.ts",
      }),
      expect.objectContaining({
        kind: "service_external_write",
        operation: "upload",
        target: "recipe-images",
        source_file: "app/api/v1/recipes/images/route.ts",
      }),
      expect.objectContaining({
        kind: "rpc",
        operation: "call",
        target: "start_legacy_external_write_attempt",
        source_file: "lib/server/account-generation/external-write.ts",
        guard_mode: "protected-rpc-or-mutated-table-before-trigger",
      }),
      expect.objectContaining({
        kind: "rpc",
        operation: "call",
        target: "finalize_legacy_external_write_attempt",
        source_file: "lib/server/account-generation/external-write.ts",
        guard_mode: "protected-rpc-or-mutated-table-before-trigger",
      }),
      expect.objectContaining({
        kind: "rpc",
        operation: "call",
        target: "complete_recipe_image_account_lifecycle",
        source_file: "lib/server/recipe-image-lifecycle-completion.ts",
        persists_personal_state: false,
        guard_mode: "not_applicable",
        expected_generation: "not_applicable",
        activation_phase: "always",
      }),
      expect.objectContaining({
        kind: "rpc",
        operation: "call",
        target: "scan_stale_recipe_image_uploads",
        source_file: "lib/server/recipe-image-stale-scanner.ts",
        persists_personal_state: false,
        guard_mode: "not_applicable",
        expected_generation: "not_applicable",
        activation_phase: "always",
      }),
      expect.objectContaining({
        kind: "rpc",
        operation: "call",
        target: "prepare_recipe_image_legacy_visibility_migration",
        source_file:
          "lib/server/recipe-image-legacy-visibility-copy.ts",
        persists_personal_state: false,
        guard_mode: "not_applicable",
        expected_generation: "not_applicable",
        activation_phase: "always",
      }),
      expect.objectContaining({
        kind: "rpc",
        operation: "call",
        target: "finalize_recipe_image_legacy_visibility_target",
        source_file:
          "lib/server/recipe-image-legacy-visibility-copy.ts",
        persists_personal_state: false,
        guard_mode: "not_applicable",
        expected_generation: "not_applicable",
        activation_phase: "always",
      }),
    ]));
    for (const entry of [
      ...inventory.route_inventory,
      ...inventory.write_inventory,
    ].filter((candidate) => candidate.persists_personal_state)) {
      expect(entry.guard_mode).not.toBe("not_applicable");
      expect(entry.expected_generation).toBe(
        "joint-promote-server-verified-session-binding",
      );
      expect(entry.activation_phase).toBe("f0-expand-legacy-guard");
    }
    expect(
      inventory.auth_users_inbound_fks
        .map((entry) => `${entry.table}.${entry.column}:${entry.on_delete}`)
        .sort(),
    ).toEqual([
      "admin_audit_logs.actor_admin_user_id:restrict",
      "admin_members.granted_by:set null",
      "admin_members.user_id:cascade",
    ]);

    const result = spawnSync("node", [VALIDATOR_PATH], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("account session generation inventory is valid");
  });
});
