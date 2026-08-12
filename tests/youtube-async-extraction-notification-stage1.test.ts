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

  it("uses the exact official CTA copy on every Stage 1 design surface", () => {
    const officialScreens = read("docs/화면정의서-v1.5.35.md");
    const officialFlow = read("docs/유저flow맵-v1.3.33.md");

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

  it("keeps the independent REVISE state and high-risk authority metadata explicit", () => {
    expect(workItem.status).toMatchObject({
      lifecycle: "planned",
      approval_state: "needs_revision",
      verification_status: "pending",
      evaluation_status: "fixable",
      evaluation_round: 1,
      blocked_reason_code: "independent-internal-1.5-rereview-pending",
    });
    expect(status).toMatchObject({
      lifecycle: "planned",
      approval_state: "needs_revision",
      verification_status: "pending",
      evaluation_status: "fixable",
      evaluation_round: 1,
      blocked_reason_code: "independent-internal-1.5-rereview-pending",
    });
    expect(workItem.status.last_evaluator_result).toContain(
      "019ff643-988a-7013-9edb-4d4f61986930",
    );

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
});
