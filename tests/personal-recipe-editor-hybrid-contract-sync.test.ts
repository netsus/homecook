import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const sliceId = "personal-recipe-editor-decoupling";
const docsBranch = "docs/personal-recipe-editor-stage1-full-local-relock";

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function readJson(relativePath: string) {
  return JSON.parse(read(relativePath)) as Record<string, unknown>;
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

type Projection = {
  name: string;
  values: string[];
};

const retiredActiveGatePatterns = [
  /hybrid-remote-auth-control-plane/i,
  /remote Auth control-plane/i,
  /local auth\.users\s*=\s*0/i,
  /local-auth-users-(?:remains-)?zero/i,
  /identity epoch mirror/i,
  /remote liveness/i,
  /session-liveness HMAC binding/i,
  /verify-personal-recipe-editor-hybrid\.mjs/i,
  /personal-recipe-editor-hybrid-verifier\.test\.ts/i,
  /generate-hybrid-authority-inventories\.mjs/i,
];

describe("personal recipe editor full-local contract lock", () => {
  const readmePath = `docs/workpacks/${sliceId}/README.md`;
  const acceptancePath = `docs/workpacks/${sliceId}/acceptance.md`;
  const automationPath = `docs/workpacks/${sliceId}/automation-spec.json`;
  const workItemPath = `.workflow-v2/work-items/${sliceId}.json`;

  function statusItem() {
    const status = readJson(".workflow-v2/status.json");
    const items = status.items as Array<Record<string, unknown>>;
    const item = items.find((candidate) => candidate.id === sliceId);
    expect(item).toBeDefined();
    return item ?? {};
  }

  function collectStringArrayProjections(
    name: string,
    value: unknown,
  ): Projection[] {
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
        ([key, nested]) =>
          collectStringArrayProjections(`${name}.${key}`, nested),
      );
    }

    return [];
  }

  function activeProjections() {
    return [
      ...collectStringArrayProjections("automation", readJson(automationPath)),
      ...collectStringArrayProjections("workItem", readJson(workItemPath)),
      ...collectStringArrayProjections("status", statusItem()),
    ];
  }

  function activeBundle() {
    return activeProjections()
      .flatMap((projection) => projection.values)
      .join("\n");
  }

  function assertNoRetiredActiveGate(projections: Projection[]) {
    for (const projection of projections) {
      for (const value of projection.values) {
        const retired = retiredActiveGatePatterns.find((pattern) =>
          pattern.test(value),
        );
        if (retired) {
          throw new Error(
            `${projection.name}: retired active gate ${retired.source}: ${value}`,
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

    expect(strings(docsRefs.source_of_truth)).toEqual([
      "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
      "docs/요구사항기준선-v1.7.28.md",
      "docs/화면정의서-v1.5.32.md",
      "docs/유저flow맵-v1.3.30.md",
      "docs/db설계-v1.3.30.md",
      "docs/api문서-v1.2.33.md",
    ]);
    expect(bundle).toContain("요구사항기준선-v1.7.28.md");
    expect(bundle).toContain("화면정의서-v1.5.32.md");
    expect(bundle).toContain("유저flow맵-v1.3.30.md");
    expect(bundle).toContain("db설계-v1.3.30.md");
    expect(bundle).toContain("api문서-v1.2.33.md");
  });

  it("keeps slice 3 and media/tag foundations as the only implementation predecessors", () => {
    const readme = read(readmePath);
    const workItem = readJson(workItemPath);
    const dependencies = strings(workItem.dependencies).join("\n");
    const roadmap = read("docs/workpacks/README.md");

    expect(dependencies).toContain("recipe-visibility-read-hardening");
    expect(dependencies).toContain("31-recipe-media-tags");
    expect(dependencies).toContain("36e-recipe-tags-frontend");
    expect(
      strings(workItem.dependencies).filter(
        (dependency) =>
          /#4|recipe-snapshot/i.test(dependency) &&
          !/not a #5 implementation predecessor/i.test(dependency),
      ),
    ).toEqual([]);
    expect(readme).toContain("#4 is not a #5 implementation predecessor");
    expect(roadmap).toMatch(
      /\|\s*5\s*\|\s*C\s*\|\s*`personal-recipe-editor-decoupling`\s*\|\s*in-progress\s*\|\s*#3;/,
    );
  });

  it("locks one self-hosted local Auth DB and Storage authority", () => {
    const active = activeBundle();
    const automation = readJson(automationPath);
    const workItem = readJson(workItemPath);
    const workflow = workItem.workflow as Record<string, unknown>;

    expect(active).toContain("self-hosted-local-auth-db-storage-single-authority");
    expect(active).toContain("stable-remote-user-uuid-restored-to-local-gotrue");
    expect(active).toContain("remote-session-refresh-flow-state-excluded-relogin-all-users");
    expect(active).toContain("local-session-binding-and-auth-uid-rls-owner-boundary");
    expect(active).toContain(
      "app-and-narrow-auth-v1-allowlist-only-public-data-storage-studio-postgres-internal",
    );
    expect(active).toContain("browser-direct-data-storage-and-service-role-user-fallback-zero");
    expect(read(readmePath)).toContain(
      "narrow allowlisted subset under `/auth/v1`",
    );
    expect(read(readmePath)).not.toContain("allowlisted `/auth/v1/*`");
    expect(strings(automation.external_smokes)).toEqual(
      strings(workflow.external_smokes),
    );
  });

  it("removes every retired hybrid assumption from active machine-readable gates", () => {
    expect(() => assertNoRetiredActiveGate(activeProjections())).not.toThrow();
  });

  it("preserves historical implementation and hybrid verifier evidence without rechecking it", () => {
    const evidence = [
      read(readmePath),
      read(acceptancePath),
      read(automationPath),
      read(workItemPath),
      String(statusItem().notes),
    ].join("\n");

    expect(evidence).toContain("PR #1238");
    expect(evidence).toContain("PR #1243");
    expect(evidence).toContain("6565c2a84f3b7eba9f0579db7b91fed12fc08f23");
    expect(evidence).toContain("PR #1246");
    expect(evidence).toContain("354c569c8e40889bcfa7d9832cb9cec93f53db46");
    expect(evidence).toContain("historical evidence");
    expect(evidence).toContain("local auth.users=0");
    expect(evidence).toContain("verify-personal-recipe-editor-hybrid.mjs");
  });

  it("routes the active delta through Stage 2 to Stage 6 without claiming future activation", () => {
    const active = activeBundle();
    const readme = read(readmePath);
    const acceptance = read(acceptancePath);

    expect(active).toContain(
      "stage2-full-local-personal-editor-verifier-implementation-tdd-red-green",
    );
    expect(active).toContain("stage3-independent-code-security-review-pending");
    expect(active).toContain("stage4-existing-shell-consumer-revalidation-pending");
    expect(active).toContain("stage5-lightweight-no-visual-drift-review-pending");
    expect(active).toContain("stage6-merged-exact-head-closeout-pending");
    expect(active).toContain(
      "tests/personal-recipe-editor-full-local-verifier.test.ts",
    );
    expect(readme).toContain("Stage 2 read-only verifier");
    expect(acceptance).toContain("merged-exact-SHA full-local verifier");
    expect(readme).toContain("#6/#7/#8");
    expect(readme).toContain("capability-off");
    expect(active).toContain(
      "capability-on smoke is successor #8 Manual Only/pending and unclaimed",
    );
    expect(active).toContain(
      "external write smoke is successor #6/#8 Manual Only/pending and unclaimed",
    );
  });

  it("separates automatic isolated evidence from Manual Only activation and cutover", () => {
    const bundle = [
      read(readmePath),
      read(acceptancePath),
      read(automationPath),
      read(workItemPath),
    ].join("\n");

    expect(bundle).toContain("self-owned isolated local Auth/DB/Storage rehearsal");
    expect(bundle).toContain("Manual Only/pending");
    expect(bundle).toContain("activated provider callback/link");
    expect(bundle).toContain("Cloudflare");
    expect(bundle).toContain("off-Mac restore");
    expect(bundle).toContain("first local mutation/cutover");
    expect(bundle).toContain("post-floor recovery");
    expect(bundle).toContain("production/staging/remote application write 0");
  });

  it("keeps product and design contracts unchanged", () => {
    const bundle = [read(readmePath), read(acceptancePath)].join("\n");

    expect(bundle).toContain("planner-add | personal-create | personal-edit | public-fork");
    expect(bundle).toContain("owner-private");
    expect(bundle).toContain("other-owner");
    expect(bundle).toContain("dirty");
    expect(bundle).toContain("return-to-action");
    expect(bundle).toContain("image_object_id");
    expect(bundle).toContain("owner cancel");
    expect(bundle).toContain("Design Status");
    expect(bundle).toContain("confirmed");
    expect(bundle).toContain("no visual/product change");
  });

  it("keeps lifecycle pending and projects the fresh docs branch", () => {
    const workItem = readJson(workItemPath);
    const item = statusItem();
    const verification = workItem.verification as Record<string, unknown>;
    const requiredChecks = strings(verification.required_checks);
    const statusChecks = strings(item.required_checks);

    expect(workItem.status).toMatchObject({
      lifecycle: "in_progress",
      verification_status: "pending",
      evaluation_status: "not_started",
    });
    expect(item).toMatchObject({
      branch: docsBranch,
      pr_path: "pending",
      lifecycle: "in_progress",
      verification_status: "pending",
      evaluation_status: "not_started",
    });
    expect(requiredChecks).toContain(
      `BRANCH_NAME=${docsBranch} pnpm validate:workpack -- --slice ${sliceId}`,
    );
    expect(statusChecks).toEqual(requiredChecks);
  });
});
