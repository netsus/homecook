import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const sliceId = "recipe-snapshot-authority-foundation";

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath: string) {
  return JSON.parse(read(relativePath)) as Record<string, unknown>;
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

type ActiveProjection = {
  name: string;
  values: string[];
};

const retiredActiveGatePatterns = [
  /pnpm test:recipe-snapshot-authority:hybrid-cleanup-postgres/i,
  /tests\/recipe-snapshot-hybrid-account-cleanup-postgres\.integration\.test\.ts/i,
  /session[- ]liveness HMAC binding/i,
  /mirror[- ]terminal/i,
  /remote[- ]exact[- ]epoch/i,
  /hybrid[- ]exact[- ]epoch/i,
  /remote Auth control[- ]plane/i,
  /local auth\.users\s*=\s*0/i,
  /local-auth-users-(?:remains-)?zero/i,
  /verify-recipe-snapshot-authority-hybrid\.mjs/i,
  /tests\/recipe-snapshot-authority-hybrid-verifier\.test\.ts/i,
  /tests\/recipe-snapshot-authority-remote-verifier\.test\.ts/i,
  /hybrid-account-cleanup-only/i,
  /hybrid-delete-order/i,
];

describe("recipe snapshot full-local contract lock", () => {
  const readmePath = `docs/workpacks/${sliceId}/README.md`;
  const acceptancePath = `docs/workpacks/${sliceId}/acceptance.md`;
  const automationPath = `docs/workpacks/${sliceId}/automation-spec.json`;
  const workItemPath = `.workflow-v2/work-items/${sliceId}.json`;

  function activeMachineReadableProjections(): ActiveProjection[] {
    const automation = readJson(automationPath);
    const automationBackend = automation.backend as Record<string, unknown>;
    const workItem = readJson(workItemPath);
    const workflow = workItem.workflow as Record<string, unknown>;
    const verification = workItem.verification as Record<string, unknown>;
    const statusFile = readJson(".workflow-v2/status.json");
    const statusItems = statusFile.items as Array<Record<string, unknown>>;
    const statusItem = statusItems.find((item) => item.id === sliceId);

    const arrayProjections = (
      prefix: string,
      record: Record<string, unknown>,
    ): ActiveProjection[] =>
      Object.entries(record)
        .filter(([, value]) => Array.isArray(value))
        .map(([name, value]) => ({
          name: `${prefix}.${name}`,
          values: strings(value),
        }));

    return [
      {
        name: "automation.backend.invariants",
        values: strings(automationBackend.invariants),
      },
      {
        name: "automation.backend.verify_commands",
        values: strings(automationBackend.verify_commands),
      },
      {
        name: "automation.backend.required_test_targets",
        values: strings(automationBackend.required_test_targets),
      },
      {
        name: "automation.external_smokes",
        values: strings(automation.external_smokes),
      },
      {
        name: "automation.blocked_conditions",
        values: strings(automation.blocked_conditions),
      },
      ...arrayProjections("workItem.workflow", workflow),
      ...arrayProjections("workItem.verification", verification),
      {
        name: "status.required_checks",
        values: strings(statusItem?.required_checks),
      },
    ];
  }

  function activeGateBundle() {
    return activeMachineReadableProjections()
      .flatMap((projection) => projection.values)
      .join("\n");
  }

  function assertNoRetiredActiveGates(projections: ActiveProjection[]) {
    for (const projection of projections) {
      for (const value of projection.values) {
        const retiredPattern = retiredActiveGatePatterns.find((pattern) =>
          pattern.test(value),
        );
        if (retiredPattern) {
          throw new Error(
            `${projection.name}: retired active gate ${retiredPattern.source}: ${value}`,
          );
        }
      }
    }
  }

  it("uses only the current official document tuple", () => {
    const workItem = readJson(workItemPath);
    const docsRefs = workItem.docs_refs as Record<string, unknown>;
    const bundle = [
      read(readmePath),
      read(acceptancePath),
      read(automationPath),
      read(workItemPath),
    ].join("\n");

    expect(bundle).toContain("요구사항기준선-v1.7.28.md");
    expect(bundle).toContain("화면정의서-v1.5.32.md");
    expect(bundle).toContain("유저flow맵-v1.3.30.md");
    expect(bundle).toContain("db설계-v1.3.30.md");
    expect(bundle).toContain("api문서-v1.2.33.md");
    expect(strings(docsRefs.source_of_truth).join("\n")).not.toMatch(
      /v1\.7\.26|v1\.5\.30|v1\.3\.28|v1\.3\.27|v1\.2\.30/,
    );
  });

  it("locks the active gate to one local Auth DB and Storage authority", () => {
    const active = activeGateBundle();

    expect(active).toContain("self-hosted-local-auth-db-storage-single-authority");
    expect(active).toContain("stable-auth-user-uuid-and-auth-uid-rls-preserved");
    expect(active).toContain("local-session-binding-pre-expiry-revoke");
    expect(active).toContain("private-cross-owner-read-write-delete-zero");
    expect(active).toContain("account-delete-recreate-local-lifecycle-cleanup");
    expect(active).toContain("official-s3-rclone-restore-evidence");
    expect(active).toContain("app-and-auth-only-public-data-storage-studio-postgres-internal");

  });

  it("excludes every retired hybrid gate from each active projection", () => {
    for (const projection of activeMachineReadableProjections()) {
      expect(() => assertNoRetiredActiveGates([projection])).not.toThrow();
    }
  });

  it("rejects a retired hybrid gate injected into a copied active projection", () => {
    const mutated = activeMachineReadableProjections().map((projection) => ({
      name: projection.name,
      values: [...projection.values],
    }));
    const verifyCommands = mutated.find(
      (projection) => projection.name === "automation.backend.verify_commands",
    );

    expect(verifyCommands).toBeDefined();
    verifyCommands?.values.push(
      "pnpm test:recipe-snapshot-authority:hybrid-cleanup-postgres",
    );

    expect(() => assertNoRetiredActiveGates(mutated)).toThrow(
      /automation\.backend\.verify_commands/,
    );
  });

  it("keeps hybrid verifier evidence as history without making it an active release gate", () => {
    const evidenceBundle = [
      read(readmePath),
      read(acceptancePath),
      read(automationPath),
      read(workItemPath),
      read(".workflow-v2/status.json"),
    ].join("\n");

    expect(evidenceBundle).toContain("PR #1218");
    expect(evidenceBundle).toContain("PR #1219");
    expect(evidenceBundle).toContain("PR #1231");
    expect(evidenceBundle).toContain("PR #1232");
    expect(evidenceBundle).toContain("PR #1233");
    expect(evidenceBundle).toContain("PR #1251");
    expect(evidenceBundle).toContain(
      "4a7718ee6bac66fb39b5163742783ac2092e5b5c",
    );
    expect(evidenceBundle).toContain(
      "94ae1a2077d63974c73a506add7b6647bf69d6d0",
    );
    expect(evidenceBundle).toContain("verify-recipe-snapshot-authority-hybrid.mjs");
    expect(evidenceBundle).toContain("local auth.users=0");
    expect(evidenceBundle).toContain("historical evidence");
  });

  it("records merged Train B dependencies without closing recipe snapshot verification", () => {
    const roadmap = read("docs/workpacks/README.md");
    const workItem = readJson(workItemPath);
    const statusFile = readJson(".workflow-v2/status.json");
    const statusItems = statusFile.items as Array<Record<string, unknown>>;
    const statusItem = statusItems.find((item) => item.id === sliceId);
    const dependencies = strings(workItem.dependencies).join("\n");

    expect(dependencies).toContain("PR #1256");
    expect(dependencies).toContain("PR #1262");
    expect(dependencies).toContain("recipe-visibility-read-hardening");
    expect(dependencies).toContain("Storage/outbox");
    expect((workItem.status as Record<string, unknown>)).toMatchObject({
      lifecycle: "in_progress",
      verification_status: "pending",
      evaluation_status: "not_started",
    });
    expect(statusItem).toMatchObject({
      lifecycle: "in_progress",
      verification_status: "pending",
      evaluation_status: "not_started",
    });
    expect(roadmap).toMatch(
      /\|\s*4\s*\|\s*B\s*\|\s*`recipe-snapshot-authority-foundation`\s*\|\s*in-progress\s*\|/,
    );
  });

  it("records PR #1263 as deployable full-local authority without claiming activation", () => {
    const bundle = [
      read(readmePath),
      read(acceptancePath),
      read(automationPath),
      read(workItemPath),
      read(".workflow-v2/status.json"),
      read("docs/workpacks/README.md"),
    ].join("\n");

    expect(bundle).toContain("PR #1263");
    expect(bundle).toContain("Stage 3 deployable app/runtime authority");
    expect(bundle).toContain("OAuth flow ledger");
    expect(bundle).toContain("callback/refresh/guarded Data/Storage/logout");
    expect(bundle).toContain("loopback admin");
    expect(bundle).toContain("request attestation");
    expect(bundle).toContain("secret boundary");
    expect(bundle).toContain("explicit env+DB control");
    expect(bundle).toContain("provider live callback/link");
    expect(bundle).toContain("Cloudflare");
    expect(bundle).toContain("remote final backup");
    expect(bundle).toContain("off-Mac restore 2회");
    expect(bundle).toContain("first local mutation/cutover");
    expect(bundle).toContain("Manual Only");
    expect(bundle).toContain("pending");
    expect(activeGateBundle()).toContain(
      "planned-stage2-full-local-snapshot-verifier-not-yet-implemented",
    );
  });

  it("uses local session and lifecycle authority for snapshot account cleanup", () => {
    const acceptance = read(acceptancePath);

    expect(acceptance).toContain("stable local Auth UUID");
    expect(acceptance).toContain("active local session binding");
    expect(acceptance).toContain("auth.uid()");
    expect(acceptance).toContain("cross-owner");
    expect(acceptance).toContain("local owner fence/cleanup");
    expect(acceptance).toContain("local Auth identity delete");
    expect(acceptance).toContain("terminal readback");
    expect(acceptance).toContain("delete/recreate");
    expect(acceptance).toContain("owner-null public/shared");

    expect(acceptance).not.toContain("remote exact-epoch delete");
    expect(acceptance).not.toContain("mirror terminal");
  });

  it("separates the planned full-local gate from already implemented evidence", () => {
    const active = activeGateBundle();
    const readme = read(readmePath);

    expect(active).toContain("planned-stage2-full-local-snapshot-verifier-not-yet-implemented");
    expect(active).toContain("tests/full-local-auth-db-foundation.test.ts");
    expect(active).toContain(
      "tests/full-local-auth-db-foundation-postgres.integration.test.ts",
    );
    expect(active).not.toContain("verify-recipe-snapshot-authority-full-local.mjs");
    expect(readme).toContain("Stage 1 does not implement a new full-local verifier");
  });

  it("locks the first-local-state rollback floor", () => {
    const bundle = [
      read(readmePath),
      read(acceptancePath),
      read(automationPath),
      read(workItemPath),
    ].join("\n");

    expect(bundle).toContain("pre-floor");
    expect(bundle).toContain("first local production session");
    expect(bundle).toContain("provider identity link");
    expect(bundle).toContain("user-scoped local DB or Storage write");
    expect(bundle).toContain("env-only rollback forbidden");
  });

  it("bounds the retained historical PostgreSQL runner", () => {
    const runner = read(
      "scripts/run-recipe-snapshot-hybrid-account-cleanup-postgres-integration.mjs",
    );

    expect(runner).toContain("COMMAND_TIMEOUT_MS");
    expect(runner).toContain("timeout: COMMAND_TIMEOUT_MS");
    expect(runner).toContain("POSTGRES_STOP_FAILED");
  });
});
