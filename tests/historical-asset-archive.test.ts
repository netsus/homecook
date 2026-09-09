import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

import { describe, expect, it } from "vitest";

const receiptPath = "ui/designs/evidence/historical-manifests/retired-assets-20260910.json";
const guidePath = "ui/designs/evidence/historical-manifests/retired-assets-20260910.md";
const sourceCommit = "b499f704b046823075f9bf02bdd27359438ec24c";

type ArchivedFile = {
  path: string;
  bytes: number;
  git_blob: string;
  sha256: string;
  dimensions: { width: number; height: number };
  replacement: string | null;
};
type Receipt = {
  source_commit: string;
  file_count: number;
  bytes: number;
  recovery_command: string;
  capture_sets: Array<{
    root: string;
    tree: string;
    file_count: number;
    bytes: number;
    files: ArchivedFile[];
  }>;
};

function readReceipt(): Receipt {
  expect(existsSync(receiptPath), "recovery receipt exists").toBe(true);
  return JSON.parse(readFileSync(receiptPath, "utf8"));
}

describe("retired asset recovery receipts", () => {
  it("retains an exact recovery identity for every removed PNG", () => {
    const receipt = readReceipt();
    expect(receipt.source_commit).toBe(sourceCommit);
    expect(receipt.recovery_command).toContain(`git archive ${sourceCommit}`);
    expect(receipt.capture_sets.map(({ root, file_count, bytes }) => [root, file_count, bytes])).toEqual([
      ["public/assets/plush", 66, 26_054_425],
      ["docs/design/assets/spoon-grade-characters", 16, 26_884_516],
      ["ui/designs/evidence/desktop-mvp-porting", 72, 8_540_064],
    ]);
    const files = receipt.capture_sets.flatMap((set) => set.files);
    expect(receipt.file_count).toBe(154);
    expect(files).toHaveLength(receipt.file_count);
    expect(new Set(files.map((file) => file.path)).size).toBe(files.length);
    expect(receipt.bytes).toBe(61_479_005);
    expect(files.reduce((sum, file) => sum + file.bytes, 0)).toBe(receipt.bytes);
    for (const set of receipt.capture_sets) {
      expect(set.tree).toMatch(/^[a-f0-9]{40}$/u);
      expect(set.files).toHaveLength(set.file_count);
      expect(set.files.reduce((sum, file) => sum + file.bytes, 0)).toBe(set.bytes);
      for (const file of set.files) {
        expect(file.path.startsWith(`${set.root}/`)).toBe(true);
        expect(file.path).not.toContain("..");
        expect(file.path).toMatch(/\.png$/u);
        expect(file.git_blob).toMatch(/^[a-f0-9]{40}$/u);
        expect(file.sha256).toMatch(/^[a-f0-9]{64}$/u);
        expect(file.dimensions.width).toBeGreaterThan(0);
        expect(file.dimensions.height).toBeGreaterThan(0);
        expect(existsSync(file.path), file.path).toBe(false);
        if (file.replacement) expect(existsSync(file.replacement), file.replacement).toBe(true);
      }
    }
    for (const file of receipt.capture_sets[0].files) {
      expect(file.replacement).toBe(`public/assets/plush-v2/${basename(file.path, ".png")}.webp`);
    }
  });

  it("keeps historical consumers linked to recoverable evidence", () => {
    const consumers = [
      "docs/workpacks/35a-growth-achievement-album-contract-evolution/README.md",
      "docs/workpacks/35a-growth-achievement-album-contract-evolution/automation-spec.json",
      "docs/workpacks/35c-mypage-achievement-album-ui/README.md",
      "docs/workpacks/35c-mypage-achievement-album-ui/automation-spec.json",
      "ui/designs/MYPAGE_ACHIEVEMENT_ALBUM.md",
      ...["slice1/porting-ledger.md", "slice2/closeout.md", "slice3/closeout.md", "slice4/README.md",
        "slice5/README.md", "slice5/claude-presignoff.md", "slice6/README.md", "slice7/README.md", "slice8/README.md"]
        .map((path) => `ui/designs/evidence/desktop-mvp-porting/${path}`),
    ];
    const removedPaths = readReceipt().capture_sets.flatMap((set) => set.files.map((file) => file.path));
    for (const consumer of consumers) {
      const source = readFileSync(consumer, "utf8");
      expect(source, consumer).toContain("retired-assets-20260910.md");
      for (const path of removedPaths) expect(source, consumer).not.toContain(path);
    }
    expect(readFileSync(guidePath, "utf8")).toContain(sourceCommit);
  });

  it("does not let legacy captures recreate the retired tracked directories", () => {
    for (const slice of [6, 7, 8]) {
      const source = readFileSync(`tests/e2e/qa-desktop-mvp-port-slice${slice}-evidence.spec.ts`, "utf8");
      expect(source).toContain(`.artifacts/desktop-mvp-porting/slice${slice}/screenshots`);
      expect(source).not.toContain("ui/designs/evidence/desktop-mvp-porting");
    }
  });

  it("pins the receipt itself against accidental recovery metadata drift", () => {
    expect(existsSync(guidePath), "recovery guide exists").toBe(true);
    const guide = readFileSync(guidePath, "utf8");
    const digest = createHash("sha256").update(readFileSync(receiptPath)).digest("hex");
    expect(guide).toContain(`Receipt SHA-256: ${digest}`);
  });
});
