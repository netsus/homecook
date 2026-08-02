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

type NamedTextProjection = {
  name: string;
  value: string;
  requiredTokens: Array<{
    name: string;
    pattern: RegExp;
  }>;
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

  function collectStringArrayProjections(
    name: string,
    value: unknown,
  ): ActiveProjection[] {
    if (Array.isArray(value)) {
      if (value.every((item) => typeof item === "string")) {
        return [{ name, values: value.map(String) }];
      }
      return value.flatMap((item, index) =>
        collectStringArrayProjections(`${name}[${index}]`, item),
      );
    }

    if (value && typeof value === "object") {
      return Object.entries(value as Record<string, unknown>).flatMap(
        ([key, nestedValue]) =>
          collectStringArrayProjections(`${name}.${key}`, nestedValue),
      );
    }

    return [];
  }

  function targetStatusItem() {
    const statusFile = readJson(".workflow-v2/status.json");
    const statusItems = statusFile.items as Array<Record<string, unknown>>;
    const statusItem = statusItems.find((item) => item.id === sliceId);
    expect(statusItem).toBeDefined();
    return statusItem ?? {};
  }

  function activeMachineReadableProjections(): ActiveProjection[] {
    const automation = readJson(automationPath);
    const workItem = readJson(workItemPath);

    return [
      ...collectStringArrayProjections("automation", automation),
      ...collectStringArrayProjections("workItem", workItem),
      ...collectStringArrayProjections("status", targetStatusItem()),
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

  function lineContaining(text: string, marker: string) {
    const line = text.split("\n").find((candidate) => candidate.includes(marker));
    expect(line).toBeDefined();
    return line ?? "";
  }

  function pr1263NamedProjections(): NamedTextProjection[] {
    const automation = readJson(automationPath);
    const workItem = readJson(workItemPath);
    const workflow = workItem.workflow as Record<string, unknown>;
    const statusItem = targetStatusItem();
    const roadmap = read("docs/workpacks/README.md");

    return [
      {
        name: "README full-local dependency row",
        value: lineContaining(
          read(readmePath),
          "`full-local-supabase-production` PR #1263",
        ),
        requiredTokens: [
          { name: "PR #1263", pattern: /PR #1263/ },
          {
            name: "Stage 3 deployable app/runtime authority",
            pattern: /Stage 3 deployable app\/runtime authority/,
          },
          {
            name: "explicit env+DB activation",
            pattern: /activation은 explicit env\+DB control/,
          },
          { name: "Manual Only", pattern: /Manual Only/ },
        ],
      },
      {
        name: "README Manual Only boundary line",
        value: lineContaining(read(readmePath), "first local mutation/cutover"),
        requiredTokens: [
          { name: "PR #1263", pattern: /PR #1263/ },
          {
            name: "first local mutation/cutover",
            pattern: /first local mutation\/cutover/,
          },
          { name: "Manual Only/pending", pattern: /Manual Only\/pending/ },
        ],
      },
      {
        name: "acceptance accept-snapshot-remote line",
        value: lineContaining(read(acceptancePath), "accept-snapshot-remote"),
        requiredTokens: [
          { name: "PR #1263", pattern: /PR #1263/ },
          {
            name: "Stage 3 deployable app/runtime authority",
            pattern: /Stage 3 deployable app\/runtime authority/,
          },
          { name: "pending snapshot gate", pattern: /pending snapshot gate/ },
        ],
      },
      {
        name: "acceptance accept-snapshot-full-local-manual line",
        value: lineContaining(
          read(acceptancePath),
          "accept-snapshot-full-local-manual",
        ),
        requiredTokens: [
          { name: "PR #1263", pattern: /PR #1263/ },
          {
            name: "explicit env+DB control",
            pattern: /explicit env\+DB control/,
          },
          { name: "Manual Only/pending", pattern: /Manual Only\/pending/ },
        ],
      },
      {
        name: "automation external_smokes array",
        value: strings(automation.external_smokes).join("\n"),
        requiredTokens: [
          { name: "PR #1263", pattern: /PR #1263/ },
          {
            name: "Stage 3 deployable app/runtime authority",
            pattern: /Stage 3 deployable app\/runtime authority/,
          },
          {
            name: "explicit env+DB activation",
            pattern: /local authority activation requires explicit env\+DB control/i,
          },
          { name: "Manual Only/pending", pattern: /Manual Only\/pending/ },
        ],
      },
      {
        name: "automation notes scalar",
        value: String(automation.notes),
        requiredTokens: [
          { name: "PR #1263", pattern: /PR #1263 merged the/ },
          {
            name: "Stage 3 deployable app/runtime authority",
            pattern: /Stage 3 deployable app\/runtime authority/,
          },
          {
            name: "explicit env+DB activation",
            pattern: /local authority activation requires explicit env\+DB control/i,
          },
          { name: "Manual Only/pending", pattern: /Manual Only\/pending/ },
        ],
      },
      {
        name: "workItem dependencies array",
        value: strings(workItem.dependencies).join("\n"),
        requiredTokens: [
          { name: "PR #1263", pattern: /PR #1263/ },
          {
            name: "Stage 3 deployable app/runtime authority",
            pattern: /Stage 3 deployable app\/runtime authority/,
          },
          {
            name: "explicit env+DB activation",
            pattern: /activation requires explicit env\+DB control/,
          },
          { name: "Manual Only/pending", pattern: /Manual Only\/pending/ },
        ],
      },
      {
        name: "workItem workflow.external_smokes array",
        value: strings(workflow.external_smokes).join("\n"),
        requiredTokens: [
          {
            name: "PR #1263 deployable authority slug",
            pattern: /full-local-stage3-deployable-app-runtime-authority-pr1263-merged/,
          },
          {
            name: "activation slug",
            pattern: /local-authority-activation-requires-explicit-env-and-db-control/,
          },
          { name: "Manual Only/pending", pattern: /Manual Only\/pending/ },
        ],
      },
      {
        name: "workItem notes scalar",
        value: String(workItem.notes),
        requiredTokens: [
          { name: "PR #1263", pattern: /PR #1263 merged the/ },
          {
            name: "Stage 3 deployable app/runtime authority",
            pattern: /Stage 3 deployable app\/runtime authority/,
          },
          {
            name: "explicit env+DB activation",
            pattern: /local authority activation requires explicit env\+DB control/i,
          },
          { name: "Manual Only/pending", pattern: /Manual Only\/pending/ },
        ],
      },
      {
        name: "status notes scalar",
        value: String(statusItem.notes),
        requiredTokens: [
          { name: "PR #1263", pattern: /PR #1263/ },
          {
            name: "Stage 3 deployable app/runtime authority",
            pattern: /Stage 3 deployable app\/runtime authority/,
          },
          {
            name: "explicit env+DB activation",
            pattern: /local authority activation requires explicit env\+DB control/i,
          },
          { name: "Manual Only/pending", pattern: /Manual Only\/pending/ },
        ],
      },
      {
        name: "roadmap full-local-supabase-production row",
        value: lineContaining(roadmap, "`full-local-supabase-production` | docs"),
        requiredTokens: [
          { name: "PR #1263", pattern: /PR #1263/ },
          {
            name: "Stage 3 deployable app/runtime authority",
            pattern: /Stage 3 deployable app\/runtime authority/,
          },
          {
            name: "explicit env+DB activation",
            pattern: /activation은 explicit env\+DB control/,
          },
          { name: "Manual Only/pending", pattern: /Manual Only\/pending/ },
        ],
      },
      {
        name: "roadmap recipe-snapshot index row",
        value: lineContaining(
          roadmap,
          "`recipe-snapshot-authority-foundation` | in-progress",
        ),
        requiredTokens: [
          { name: "PR #1263", pattern: /PR #1263/ },
          {
            name: "Stage 3 deployable app/runtime authority",
            pattern: /Stage 3 deployable app\/runtime authority/i,
          },
          { name: "Stage 2 verifier", pattern: /Stage 2 fail-closed verifier/ },
          { name: "Manual Only pending", pattern: /Manual Only.*pending/ },
        ],
      },
      {
        name: "roadmap Train B dependency row",
        value: lineContaining(
          roadmap,
          "| 4 | B | `recipe-snapshot-authority-foundation`",
        ),
        requiredTokens: [
          { name: "PR #1263", pattern: /PR #1263/ },
          {
            name: "deployable app/runtime authority",
            pattern: /deployable app\/runtime authority/,
          },
          { name: "activation", pattern: /activation/ },
          { name: "Manual Only", pattern: /Manual Only/ },
          { name: "미완료", pattern: /미완료/ },
        ],
      },
    ];
  }

  function assertPr1263Projections(projections: NamedTextProjection[]) {
    for (const projection of projections) {
      for (const requiredToken of projection.requiredTokens) {
        if (!requiredToken.pattern.test(projection.value)) {
          throw new Error(
            `${projection.name}: missing ${requiredToken.name} (${requiredToken.pattern.source})`,
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
    expect(bundle).toContain("api문서-v1.2.34.md");
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

  it.each(
    activeMachineReadableProjections().map((projection) => [projection.name]),
  )("rejects a retired gate injected into copied projection %s", (path) => {
    const original = activeMachineReadableProjections().find(
      (projection) => projection.name === path,
    );
    expect(original).toBeDefined();
    const retiredGate =
      path === "automation.backend.required_endpoints"
        ? "remote exact-epoch hybrid verifier gate"
        : path === "automation.frontend.verify_commands"
          ? "pnpm test:recipe-snapshot-authority:hybrid-cleanup-postgres"
          : "session-liveness HMAC binding";
    const mutated = {
      name: path,
      values: [...(original?.values ?? []), retiredGate],
    };

    expect(() => assertNoRetiredActiveGates([mutated])).toThrow(path);
  });

  it.each([
    "automation.backend.required_endpoints",
    "automation.frontend.verify_commands",
  ])("collects active projection %s", (path) => {
    expect(
      activeMachineReadableProjections().map((projection) => projection.name),
    ).toContain(path);
  });

  it.each(
    pr1263NamedProjections().flatMap((projection) =>
      projection.requiredTokens.map((requiredToken) => [
        `${projection.name} :: ${requiredToken.name}`,
        projection,
        requiredToken,
      ] as const),
    ),
  )(
    "rejects required token mutation %s",
    (_caseName, projection, requiredToken) => {
      const mutatedValue = projection.value.replace(
        requiredToken.pattern,
        "required-token-removed",
      );
      expect(mutatedValue).not.toBe(projection.value);
      const mutated = { ...projection, value: mutatedValue };

      expect(() => assertPr1263Projections([mutated])).toThrow(
        `${projection.name}: missing ${requiredToken.name}`,
      );
    },
  );

  it.each([
    "roadmap recipe-snapshot index row",
    "roadmap Train B dependency row",
  ])("collects named projection %s", (name) => {
    expect(
      pr1263NamedProjections().map((projection) => projection.name),
    ).toContain(name);
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

  it("records PR #1263 authority independently in every named projection", () => {
    for (const projection of pr1263NamedProjections()) {
      expect(() => assertPr1263Projections([projection])).not.toThrow();
    }
    expect(activeGateBundle()).toContain(
      "stage2-full-local-snapshot-verifier-implemented-merged-exact-execution-pending",
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

  it("routes the active full-local gate through the Stage 2 verifier", () => {
    const active = activeGateBundle();
    const readme = read(readmePath);

    expect(active).toContain(
      "stage2-full-local-snapshot-verifier-implemented-merged-exact-execution-pending",
    );
    expect(active).toContain("tests/full-local-auth-db-foundation.test.ts");
    expect(active).toContain(
      "tests/full-local-auth-db-foundation-postgres.integration.test.ts",
    );
    expect(active).toContain("tests/recipe-snapshot-authority-full-local-verifier.test.ts");
    expect(readme).toContain("verify-recipe-snapshot-authority-full-local.mjs");
    expect(readme).toContain("merged exact SHA");
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
