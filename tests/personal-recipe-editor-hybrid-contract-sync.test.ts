import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  readWorkpackChecklistContract,
  validateChecklistContract,
} from "../scripts/lib/omo-checklist-contract.mjs";
import { evaluateDocGate } from "../scripts/lib/omo-doc-gate.mjs";

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
      "app-and-official-auth-v1-wildcard-only-public-data-storage-studio-postgres-internal",
    );
    expect(active).toContain("browser-direct-data-storage-and-service-role-user-fallback-zero");
    expect(read(readmePath)).toContain("official `/auth/v1/*`");
    expect(read(readmePath)).toContain(
      "future user-approved contract-evolution",
    );
    expect(read(readmePath)).not.toContain(
      "narrow allowlisted subset under `/auth/v1`",
    );
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

  it("passes the Stage 1 document, checklist, and design authority gates", () => {
    const result = evaluateDocGate({ rootDir: repoRoot, slice: sliceId });
    const contract = readWorkpackChecklistContract({
      rootDir: repoRoot,
      slice: sliceId,
    });
    const automation = readJson(automationPath);
    const frontend = automation.frontend as Record<string, unknown>;
    const designAuthority = frontend.design_authority as Record<string, unknown>;

    expect(result.outcome, JSON.stringify(result.findings, null, 2)).toBe(
      "pass",
    );
    expect(validateChecklistContract(contract)).toEqual([]);
    expect(strings(designAuthority.required_screens)).toEqual([
      "RECIPE_DETAIL",
      "MANUAL_RECIPE_CREATE",
    ]);

    const acceptanceItems = contract.acceptanceItems.filter(
      (item) => !item.manualOnly && item.metadata,
    );
    const acceptanceItemsById = new Map<
      string,
      (typeof acceptanceItems)[number]
    >();
    for (const item of acceptanceItems) {
      if (item.metadata?.id) acceptanceItemsById.set(item.metadata.id, item);
    }
    expect(acceptanceItems.length).toBeGreaterThan(0);
    for (const item of acceptanceItems) {
      const metadata = item.metadata;
      expect(metadata).not.toBeNull();
      if (!metadata) throw new Error(`missing metadata for ${item.text}`);
      expect([2, 4]).toContain(metadata.stage);
      if (metadata.stage === 2) {
        expect(metadata.review).toEqual([3, 6]);
      } else if (metadata.scope === "frontend") {
        expect(metadata.review).toEqual([5, 6]);
      } else {
        expect(metadata.scope).toBe("shared");
        expect(metadata.review).toEqual([6]);
      }
    }

    for (const id of [
      "accept-editor-no-extra-contract",
      "accept-editor-successor-boundary",
      "accept-editor-dark-ship",
      "accept-editor-hybrid-client-boundary",
    ]) {
      expect(acceptanceItemsById.get(id)?.metadata).toMatchObject({
        stage: 4,
        scope: "shared",
        review: [6],
      });
    }

    for (const id of [
      "accept-editor-stage1-wireframe",
      "accept-editor-design-critic",
      "accept-editor-stage1-honesty",
      "accept-editor-independent-reviews",
    ]) {
      expect(acceptanceItemsById.has(id)).toBe(false);
      expect(read(acceptancePath)).toContain(`<!-- omo:id=${id} -->`);
    }

    const manualOnlyItems = contract.acceptanceItems.filter(
      (item) => item.manualOnly,
    );
    expect(manualOnlyItems.length).toBeGreaterThan(0);
    expect(manualOnlyItems.every((item) => item.metadata === null)).toBe(true);
  });

  it("keeps lifecycle pending and projects the fresh docs branch", () => {
    const workItem = readJson(workItemPath);
    const item = statusItem();
    const readme = read(readmePath);
    const verification = workItem.verification as Record<string, unknown>;
    const requiredChecks = strings(verification.required_checks);
    const statusChecks = strings(item.required_checks);

    expect(workItem.status).toMatchObject({
      lifecycle: "in_progress",
      approval_state: "not_started",
      verification_status: "pending",
      evaluation_status: "not_started",
      last_evaluator_result: null,
    });
    expect(item).toMatchObject({
      branch: docsBranch,
      pr_path: "https://github.com/netsus/homecook/pull/1270",
      lifecycle: "in_progress",
      approval_state: "not_started",
      verification_status: "pending",
      evaluation_status: "not_started",
      last_evaluator_result: null,
    });

    for (const projection of [String(workItem.notes), String(item.notes)]) {
      expect(projection).toContain("Stage 1 docs gate pass");
      expect(projection).toContain(
        "8dbf99f6cf78fdcd66d2a5de1c07e2d37d55f047",
      );
      expect(projection).toContain(
        "019fbf9e-055d-7e81-89c9-83bfe845b1c6",
      );
      expect(projection).toContain(
        "019fbf9e-055d-7e81-89c9-83dae1459246",
      );
      expect(projection).toContain("P0/P1/P2=0/0/0");
      expect(projection).toContain("findings=0");
      expect(projection).toContain(
        "raw checks 17 = 12 success + 5 intended skip",
      );
      expect(projection).toContain("pending/fail/cancel/rerun=0");
      expect(projection).toContain("full tests 5,040 pass/283 skip");
      expect(projection).toContain("final exact-head verifier pending");
    }
    expect(requiredChecks).toContain(
      `BRANCH_NAME=${docsBranch} pnpm validate:workpack -- --slice ${sliceId}`,
    );
    expect(statusChecks).toEqual(requiredChecks);
    expect(readme).toContain(
      "Stage 1 author가 review finding을 repair하고, fresh independent internal 1.5 reviewer가 repaired exact head를 다시 검토한다",
    );
    expect(String((workItem.owners as Record<string, unknown>).codex)).toContain(
      "Stage 1 author repairs findings; a fresh independent internal 1.5 reviewer re-reviews the repaired exact head",
    );
    expect([readme, read(workItemPath)].join("\n")).not.toContain(
      "internal 1.5 reviewer/repair-final",
    );
  });
});
