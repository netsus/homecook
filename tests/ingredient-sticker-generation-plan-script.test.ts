import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import stickerManifest from "@/public/assets/ingredients/plush-v2/manifest.json";

const SCRIPT_PATH = "scripts/ingredient-sticker-generation-plan.mjs";

function runPlan(args: string[]) {
  return spawnSync("node", [SCRIPT_PATH, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function getAbsoluteTempDir() {
  const tempDir = tmpdir();
  return isAbsolute(tempDir) ? tempDir : join("/", tempDir);
}

describe("ingredient sticker generation plan script", () => {
  it("writes a missing plush-v2 plan that freezes existing approved assets", () => {
    const tempDir = mkdtempSync(join(getAbsoluteTempDir(), "homecook-ingredient-sticker-plan-"));
    const jsonPath = join(tempDir, "plan.json");
    const markdownPath = join(tempDir, "plan.md");

    const result = runPlan([
      "--write-json",
      jsonPath,
      "--write-md",
      markdownPath,
      "--generated-at",
      "2026-06-30T00:00:00.000Z",
      "--pilot-size",
      "5",
      "--rollout-batch-size",
      "20",
    ]);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(markdownPath)).toBe(true);

    const plan = JSON.parse(readFileSync(jsonPath, "utf8"));
    const markdown = readFileSync(markdownPath, "utf8");
    const manifestNames = Object.keys(stickerManifest.items);
    const missingNames = new Set(
      plan.missingIngredients.map((ingredient: { standardName: string }) => ingredient.standardName),
    );

    expect(plan.generatedAt).toBe("2026-06-30T00:00:00.000Z");
    expect(plan.summary.approvedExistingCount).toBe(manifestNames.length);
    expect(plan.summary.missingIngredientCount).toBe(
      plan.summary.totalIngredientCount - manifestNames.length,
    );
    expect(plan.summary.pilotBatchSize).toBe(5);
    expect(plan.styleContract.format).toMatchObject({
      width: 512,
      height: 512,
      type: "image/webp",
      quality: 95,
    });
    expect(plan.styleContract.composition.subjectFill).toContain("90%");
    expect(plan.styleContract.rendering.blush).toContain("flat graphic");

    for (const name of manifestNames) {
      expect(missingNames.has(name)).toBe(false);
    }

    expect(plan.firstPilotBatch.ingredients).toHaveLength(5);
    for (const ingredient of plan.firstPilotBatch.ingredients as Array<{ standardName: string }>) {
      expect(missingNames.has(ingredient.standardName)).toBe(true);
      expect(manifestNames.includes(ingredient.standardName)).toBe(false);
    }
    expect(markdown).toContain("Frozen Existing Assets");
    expect(markdown).toContain(`The existing ${manifestNames.length} plush-v2 images are approved`);
  });
});
