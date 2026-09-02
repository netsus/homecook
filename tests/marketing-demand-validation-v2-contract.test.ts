import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const rootDir = process.cwd();

function readRequired(relativePath: string) {
  const absolutePath = join(rootDir, relativePath);
  expect(existsSync(absolutePath), `${relativePath} must exist`).toBe(true);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

const officialFiles = {
  requirements: "docs/요구사항기준선-v1.7.36.md",
  screens: "docs/화면정의서-v1.5.40.md",
  flow: "docs/유저flow맵-v1.3.38.md",
  db: "docs/db설계-v1.3.38.md",
  api: "docs/api문서-v1.2.43.md",
} as const;

const resultKeys = [
  "homecook-passer",
  "eyeballing-master",
  "ingredient-tracker",
  "pro-measurer",
] as const;

const anonymousActions = [
  "view",
  "quiz_started",
  "quiz_completed",
  "result_viewed",
  "experience_started",
  "experience_completed",
  "beta_form_viewed",
] as const;

describe("marketing demand validation v2 document contract", () => {
  it("promotes one synchronized official tuple", () => {
    const currentSource = readRequired("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");

    for (const relativePath of Object.values(officialFiles)) {
      expect(currentSource).toContain(`\`${relativePath}\``);
      readRequired(relativePath);
    }
    expect(currentSource).toContain("63f8ef2a019c6d260a96a42fab9d67f727d93557");
    expect(currentSource).toContain("01a0630e-81f1-7f42-8b1b-cb259d1d5997");
  });

  it("locks the exact four-question and four-result taxonomy", () => {
    const requirements = readRequired(officialFiles.requirements);
    const quizSpec = readRequired("docs/marketing/quiz-content-spec.md");
    const acceptance = readRequired("docs/workpacks/marketing-demand-validation-v2/acceptance.md");

    for (const question of ["q1", "q2", "q3", "q4"]) {
      expect(`${requirements}\n${quizSpec}\n${acceptance}`).toContain(`\`${question}\``);
    }
    for (const resultKey of resultKeys) {
      expect(`${requirements}\n${quizSpec}\n${acceptance}`).toContain(`\`${resultKey}\``);
    }
    expect(quizSpec).toContain("Q3 하나로만 결정");
    expect(quizSpec).toContain("`q5`는 허용하지 않는다");
  });

  it("keeps one POST and one table while separating anonymous actions from lead PII", () => {
    const api = readRequired(officialFiles.api);
    const db = readRequired(officialFiles.db);

    expect(api).toContain("`POST /api/v1/marketing/validation`");
    expect(db).toContain("`public.marketing_validation_sessions`");
    for (const action of anonymousActions) {
      expect(api).toContain(`\`${action}\``);
    }
    expect(api).toContain("`lead_submitted`");
    expect(api).toContain("`ad_variant`");
    expect(api).toContain("`{ success, data, error }`");
    expect(api).toContain("`{ code, message, fields[] }`");
    expect(db).toContain("anonymous action은 email을 쓰지 않는다");
    expect(db).toContain("`consent_version=marketing-demand-validation-v2`");
    expect(db).toContain("duplicate");
    expect(db).toContain("PII");
  });

  it("relocks the workpack for a later backend and frontend implementation", () => {
    const readme = readRequired("docs/workpacks/marketing-demand-validation-v2/README.md");
    const automation = readRequired("docs/workpacks/marketing-demand-validation-v2/automation-spec.json");
    const workItem = readRequired(".workflow-v2/work-items/marketing-demand-validation-v2.json");

    expect(readme).toContain("source prototype commit: `63f8ef2a019c6d260a96a42fab9d67f727d93557`");
    expect(readme).toContain("iPhone/Pixel frame");
    expect(readme).toContain("이미지 권리");
    expect(readme).toContain("제품 예시");
    expect(readme).toContain("fail-closed");
    expect(automation).toContain("marketing-demand-validation-v2");
    expect(workItem).toContain("01a0630e-81f1-7f42-8b1b-cb259d1d5997");
    expect(workItem).toContain("internal 1.5");
  });
});
