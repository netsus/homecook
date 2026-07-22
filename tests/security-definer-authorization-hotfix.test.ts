import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { resolveSecurityFunctionLinkedRoot } from "../scripts/security-function-linked-root.mjs";

const MIGRATION_PATH =
  "supabase/migrations/20260723090000_security_definer_mutation_authorization_hotfix.sql";
const INVENTORY_PATH =
  "docs/security/security-definer-function-authorization-inventory.json";
const POSTGRES_RUNNER_PATH =
  "scripts/run-security-function-authorization-postgres-integration.mjs";
const VALIDATOR_PATH =
  "scripts/validate-security-function-authorization.mjs";

interface FunctionInventoryEntry {
  allowed_principals: string[];
  control_class: "application-controlled" | "provider/extension-managed";
  effect: "read-only" | "mutation" | "trigger/internal" | "auth-hook";
  exposure: "public" | "authenticated-self" | "service-internal" | "auth-hook-internal";
  signature: string;
}

describe("SECURITY DEFINER mutation authorization hotfix", () => {
  it("tracks every application function and provider SECURITY DEFINER baseline", async () => {
    const inventory = JSON.parse(await readFile(INVENTORY_PATH, "utf8")) as {
      environment_states: Record<string, "pre-deployment" | "post-migration">;
      functions: FunctionInventoryEntry[];
    };
    const signatures = inventory.functions.map((entry) => entry.signature);

    expect(new Set(signatures).size).toBe(signatures.length);
    expect(inventory.functions.filter(
      (entry) => entry.control_class === "application-controlled",
    )).toHaveLength(74);
    expect(inventory.functions.filter(
      (entry) => entry.control_class === "provider/extension-managed",
    )).toHaveLength(8);
    expect(inventory.environment_states.local).toBe("post-migration");
    expect(inventory.environment_states.fresh).toBe("post-migration");
    expect(inventory.environment_states.remote).toBe("pre-deployment");
    expect(signatures).toEqual(expect.arrayContaining([
      "public.delete_user_private_data(uuid)",
      "public.complete_standalone_cooking(uuid, uuid, integer, uuid[])",
      "public.complete_cooking_session(uuid, uuid, uuid[])",
      "public.complete_shopping_list(uuid, uuid, uuid[])",
      "public.create_shopping_list_from_payload(uuid, text, date, date, boolean, uuid[], jsonb, jsonb, jsonb, jsonb, integer)",
      "public.consume_youtube_ingredient_registration_rate_limit(uuid, uuid, uuid, text)",
      "public.increment_recipe_view_count(uuid)",
      "public.register_youtube_ingredient(text, text, text, text)",
      "public.register_youtube_ingredient(text, text, text, text, text)",
      "net.http_get(text, jsonb, jsonb, integer)",
      "net.http_post(text, jsonb, jsonb, jsonb, integer)",
    ]));
  });

  it("pins exact principals, NULL-auth guards, and safe search paths in one migration", async () => {
    const migration = (await readFile(MIGRATION_PATH, "utf8")).toLowerCase();

    expect(migration).toContain("revoke execute on function public.delete_user_private_data(uuid)");
    expect(migration).toContain("grant execute on function public.delete_user_private_data(uuid) to service_role");
    expect(migration).toContain("revoke execute on function public.register_youtube_ingredient(text, text, text, text)");
    expect(migration).toContain("revoke execute on function public.increment_recipe_view_count(uuid)");
    expect(migration).toContain("auth.uid() is null");
    expect(migration).toContain("auth.role() = 'service_role'");
    expect(migration).toContain("pg_temp");
    expect(migration).toContain("application-controlled function inventory drift");
    expect(migration).not.toMatch(/alter\s+function\s+net\./);
    expect(migration).not.toMatch(/(?:revoke|grant).+function\s+net\./);
  });

  it("records a separate denial and unchanged checksum for all eight formerly anon-callable mutations", async () => {
    const runner = await readFile(POSTGRES_RUNNER_PATH, "utf8");
    const anonCalls = runner.match(/const anonMutationCalls = \[([\s\S]*?)\n\];/)?.[1] ?? "";

    expect(anonCalls).toContain("complete_cooking_session");
    expect(anonCalls).toContain("complete_shopping_list");
    expect(anonCalls).toContain("complete_standalone_cooking");
    expect(anonCalls).toContain("create_shopping_list_from_payload");
    expect(anonCalls).toContain("delete_user_private_data");
    expect(anonCalls).toContain("increment_recipe_view_count");
    expect(anonCalls.match(/signature: "public\.register_youtube_ingredient/g)).toHaveLength(2);
    expect(runner).toContain("for (const { signature, sql } of anonMutationCalls)");
    expect(runner).toContain("const beforeChecksum = databaseChecksum()");
    expect(runner).toContain("const afterChecksum = databaseChecksum()");
    expect(runner).toContain("anon_mutation_evidence: anonMutationEvidence");
    expect(runner).toContain('process.argv.includes("--linked-remote")');
    expect(runner).toContain("resolveSecurityFunctionLinkedRoot()");
    expect(runner).toContain('process.argv.includes("--check-linked-environment")');
  });

  it("keeps pre-deployment remote baselines verifiable without enforcing unmerged grants", async () => {
    const validator = await readFile(VALIDATOR_PATH, "utf8");

    expect(validator).toContain('environmentState === "pre-deployment"');
    expect(validator).toContain("assertEnvironment(inventory, environment, rows)");
  });

  it("resolves the linked primary worktree from an isolated closeout worktree", async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), "homecook-security-linked-root-"));
    const primaryRoot = path.join(fixtureRoot, "primary");
    const closeoutRoot = path.join(fixtureRoot, "closeout");
    const environment = { ...process.env };
    delete environment.SECURITY_FUNCTION_LINKED_ROOT;
    const git = (cwd: string, args: string[]) => {
      const result = spawnSync("git", args, { cwd, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
    };

    try {
      await mkdir(path.join(primaryRoot, "supabase/.temp"), { recursive: true });
      await writeFile(path.join(primaryRoot, "supabase/.temp/project-ref"), "fixture-ref\n");
      await writeFile(path.join(primaryRoot, ".env.local"), "NEXT_PUBLIC_SUPABASE_URL=https://example.invalid\n");
      await writeFile(path.join(primaryRoot, "tracked.txt"), "fixture\n");
      git(primaryRoot, ["init"]);
      git(primaryRoot, ["config", "user.name", "Security Fixture"]);
      git(primaryRoot, ["config", "user.email", "security-fixture@example.invalid"]);
      git(primaryRoot, ["add", "tracked.txt"]);
      git(primaryRoot, ["commit", "-m", "fixture"]);
      git(primaryRoot, ["worktree", "add", "-b", "closeout-fixture", closeoutRoot]);

      expect(resolveSecurityFunctionLinkedRoot({
        argv: [],
        cwd: closeoutRoot,
        environment,
        requireEnvironment: true,
      })).toBe(await realpath(primaryRoot));
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
