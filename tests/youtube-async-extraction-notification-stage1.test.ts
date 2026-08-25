import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const sliceId = "youtube-async-extraction-notification";

function read(relativePath: string) {
  return readFileSync(resolve(root, relativePath), "utf8");
}

function readJson(relativePath: string) {
  return JSON.parse(read(relativePath));
}

describe("YouTube async extraction Stage 1 contract", () => {
  const readme = read(`docs/workpacks/${sliceId}/README.md`);
  const acceptance = read(`docs/workpacks/${sliceId}/acceptance.md`);
  const automation = readJson(`docs/workpacks/${sliceId}/automation-spec.json`);
  const workItem = readJson(`.workflow-v2/work-items/${sliceId}.json`);
  const workflowStatus = readJson(".workflow-v2/status.json");
  const status = workflowStatus.items.find(
    (item: { id: string }) => item.id === sliceId,
  );
  const importDesign = read("ui/designs/YT_IMPORT_BACKGROUND.md");
  const shellDesign = read("ui/designs/APP_SHELL_YOUTUBE_NOTIFICATIONS.md");
  const importCritique = read(
    "ui/designs/critiques/YT_IMPORT_BACKGROUND-critique.md",
  );
  const shellCritique = read(
    "ui/designs/critiques/APP_SHELL_YOUTUBE_NOTIFICATIONS-critique.md",
  );
  const reviewEvidence = read(
    `docs/workpacks/${sliceId}/evidence/2026-08-12-stage1-internal1-5-rereview.md`,
  );
  const backendEvidence = read(
    `docs/workpacks/${sliceId}/evidence/2026-08-13-stage2-backend.md`,
  );

  it("uses the exact official CTA copy on every Stage 1 design surface", () => {
    const officialScreens = read("docs/화면정의서-v1.5.36.md");
    const officialFlow = read("docs/유저flow맵-v1.3.34.md");

    expect(officialScreens).toContain("[가져오기]");
    expect(officialScreens).toContain("`결과 확인`");
    expect(officialFlow).toContain("[결과 확인]");

    expect(importDesign).toContain("Primary CTA: `가져오기`");
    expect(shellDesign).toContain("성공 draft `결과 확인`");
    expect(acceptance).toContain("primary CTA `가져오기`");
    expect(acceptance).toContain("성공 draft CTA `결과 확인`");
    expect(importCritique).toContain("primary CTA `가져오기`");
    expect(shellCritique).toContain("success draft CTA `결과 확인`");

    const scopedStage1Surfaces = [
      readme,
      acceptance,
      importDesign,
      shellDesign,
      importCritique,
      shellCritique,
    ].join("\n");

    for (const forbiddenCopy of ["추출 시작", "레시피 확인"]) {
      expect(scopedStage1Surfaces).not.toContain(forbiddenCopy);
    }
  });

  it("uses local direct validation before merge and defers origin master workpack validation", () => {
    const currentCommands = workItem.verification.stage1_current_commands;
    const postMergePreflight =
      "BRANCH_NAME=feature/be-youtube-async-extraction-notification pnpm validate:workpack -- --slice youtube-async-extraction-notification";

    expect(workItem.verification.required_checks).toEqual(currentCommands);
    expect(workItem.verification.verify_commands).toEqual(currentCommands);
    expect(status.required_checks).toEqual(currentCommands);
    expect(currentCommands).toEqual(
      expect.arrayContaining([
        expect.stringContaining("evaluateDocGate"),
        expect.stringContaining(
          "tests/youtube-async-extraction-notification-stage1.test.ts",
        ),
        "node scripts/validate-automation-spec.mjs --slice youtube-async-extraction-notification",
        "pnpm validate:workflow-v2",
        "pnpm validate:omo-bookkeeping",
      ]),
    );
    expect(
      currentCommands.some((command: string) =>
        command.includes("validate:workpack"),
      ),
    ).toBe(false);

    expect(workItem.verification.stage2_post_merge_preflight).toEqual([
      postMergePreflight,
    ]);
    expect(workItem.verification.full_lifecycle_checks).toContain(
      postMergePreflight,
    );
    expect(automation.backend.verify_commands[0]).toBe(postMergePreflight);
    expect(readme).toContain("Stage 1 Validation Boundary");
    expect(readme).toContain(postMergePreflight);
  });

  it("projects the implemented slice and final high-risk authority metadata", () => {
    expect(workItem.status).toMatchObject({
      lifecycle: "in_progress",
      approval_state: "codex_approved",
      verification_status: "passed",
      evaluation_status: "passed",
      evaluation_round: 3,
      blocked_reason_code: null,
    });
    expect(status).toMatchObject({
      lifecycle: "in_progress",
      approval_state: "codex_approved",
      verification_status: "passed",
      evaluation_status: "passed",
      evaluation_round: 3,
      blocked_reason_code: null,
    });
    expect(workItem.status.last_evaluator_result).toContain(
      "eb8d915b44b63611904760375f7c0606e629b6e0",
    );
    expect(workItem.status.last_evaluator_result).toContain(
      "PASS — Findings 없음",
    );
    expect(reviewEvidence).toContain("**PASS**");
    expect(reviewEvidence).toContain("P0 0 / P1 0 / P2 0");

    expect(automation.frontend.design_authority).toMatchObject({
      ui_risk: "high-risk",
      generator_required: true,
      critic_required: true,
      authority_required: true,
    });
    expect(
      automation.frontend.design_authority.generator_artifact,
    ).toBeTruthy();
    expect(automation.frontend.design_authority.critic_artifact).toBeTruthy();
    expect(
      automation.frontend.design_authority.authority_report_paths,
    ).toHaveLength(2);
  });

  it("records the final frozen plan provenance without rewriting the plan artifact", () => {
    const serializedWorkItem = JSON.stringify(workItem);
    const exactTuple = "official tuple requirements 1.7.32 screen 1.5.36 Flow 1.3.34 DB 1.3.34 API 1.2.39";

    expect(readme).toContain(
      "/Users/cwj/01_vibe_coding/homecook/.omx/plans/youtube-background-extraction-notification-plan-20260808.md",
    );
    expect(readme).toContain(
      "7906f9ec975f309c310b2275714873cebb78e109770f885f09878e5c6bbed57a",
    );
    expect(readme).toContain("991 lines");
    expect(readme).toContain("019ffb44-5614-7af3-86a9-4ebd50977123");
    expect(readme).not.toContain(
      "b560b60ff758171e1d52ad56b2a63a2e1877cd762d1f691c9cea32c753f8d332",
    );
    expect(readme).not.toContain("873 lines");

    expect(workItem.dependencies).toContain(exactTuple);
    expect(serializedWorkItem).toContain(
      "7906f9ec975f309c310b2275714873cebb78e109770f885f09878e5c6bbed57a",
    );
    expect(serializedWorkItem).toContain("991");
    expect(serializedWorkItem).toContain("019ffb44-5614-7af3-86a9-4ebd50977123");
    expect(serializedWorkItem).toContain("approved-plan-sha256-and-991-line-lock");
    expect(serializedWorkItem).not.toContain("1.7.31");
    expect(serializedWorkItem).not.toContain("1.5.35");
    expect(serializedWorkItem).not.toContain("1.3.33");
    expect(serializedWorkItem).not.toContain("1.2.38");
    expect(serializedWorkItem).not.toContain(
      "b560b60ff758171e1d52ad56b2a63a2e1877cd762d1f691c9cea32c753f8d332",
    );
    expect(serializedWorkItem).not.toContain("873 lines");
  });

  it("rebaselines the backend evidence to the merged local-only repair contract", () => {
    const currentOfficialTuple = ["1.7.33", "1.5.37", "1.3.35", "1.3.35", "1.2.40"];
    for (const document of [readme, acceptance]) {
      for (const version of currentOfficialTuple) expect(document).toContain(version);
    }

    const historicalBackendTuple = ["1.7.32", "1.5.36", "1.3.34", "1.3.34", "1.2.39"];
    for (const version of historicalBackendTuple) expect(backendEvidence).toContain(version);

    for (const document of [readme, backendEvidence]) {
      expect(document).toContain("PR #1350");
      expect(document).toContain("a625aefa7baab63f183a9d46e6f12d607d4e017f");
      expect(document).toContain("c4045705ef72c76f7e7258d10c460f56b6847dd7");
    }
    expect(backendEvidence).not.toContain("SECURITY_FUNCTION_LINKED_ROOT");
    expect(backendEvidence).not.toContain("SUPABASE_ACCESS_TOKEN");
    expect(backendEvidence).not.toContain("linked-remote read-only authority");
    expect(backendEvidence).not.toContain("pnpm local:reset:demo");
  });
});
