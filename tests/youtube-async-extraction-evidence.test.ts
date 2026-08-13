import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const evidenceRoot = resolve(
  process.cwd(),
  "ui/designs/evidence/youtube-async-extraction-notification",
);

describe("YouTube async extraction portable exploratory evidence", () => {
  it("keeps every referenced raw QA artifact tracked under the evidence folder", () => {
    const summary = JSON.parse(
      readFileSync(resolve(evidenceRoot, "exploratory-qa.json"), "utf8"),
    ) as { local_bundle?: string; portable_bundle?: string };

    expect(summary.local_bundle).toBeUndefined();
    expect(summary.portable_bundle).toBeTypeOf("string");
    expect(isAbsolute(summary.portable_bundle ?? "")).toBe(false);
    expect(summary.portable_bundle).not.toContain(".artifacts");

    const bundlePath = resolve(evidenceRoot, summary.portable_bundle ?? "");
    expect(bundlePath.startsWith(`${evidenceRoot}/`)).toBe(true);
    expect(existsSync(bundlePath)).toBe(true);
    expect(statSync(bundlePath).isDirectory()).toBe(true);
    for (const fileName of [
      "README.md",
      "exploratory-checklist.json",
      "exploratory-report.json",
      "eval-result.json",
    ]) {
      expect(existsSync(resolve(bundlePath, fileName)), fileName).toBe(true);
    }
  });
});
