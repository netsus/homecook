import { createHash } from "node:crypto";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

const AFFECTED_SOURCES = [
  ["tests/e2e/slice-31-recipe-media-tags.spec.ts", 4],
  ["tests/e2e/slice-32-youtube-visual-quantity-enrichment.spec.ts", 1],
  ["tests/e2e/slice-cooked-batch-weight-ledger.spec.ts", 1],
  ["tests/e2e/youtube-async-extraction-notification.spec.ts", 1],
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("tracked evidence capture boundary", () => {
  it("keeps removed historical captures recoverable through a compact manifest", async () => {
    const manifestPath =
      "ui/designs/evidence/historical-manifests/unreferenced-wave1-home-and-cook-mode-theme.json";
    const manifestSource = await readFile(manifestPath, "utf8");
    const manifest = JSON.parse(manifestSource) as {
      capture_sets: Array<{
        bytes: number;
        file_count: number;
        files: Array<{ git_blob: string; path: string; sha256: string }>;
        source_commit: string;
        tree: string;
      }>;
      recovery_command: string;
    };
    const verdict = JSON.parse(
      await readFile("ui/designs/evidence/wave1-mobile-phase4-home/visual-verdict.json", "utf8"),
    ) as { historical_evidence_manifest?: string };

    expect(verdict.historical_evidence_manifest).toBe(manifestPath);
    expect(createHash("sha256").update(manifestSource).digest("hex")).toBe(
      "d36554daa1dc89fb1ff9dadbf93eec1b1bb0ba1950da0bac3d077eebde7250f2",
    );
    expect(manifest.capture_sets.reduce((sum, set) => sum + set.file_count, 0)).toBe(22);
    expect(manifest.capture_sets.reduce((sum, set) => sum + set.bytes, 0)).toBe(1_850_318);
    expect(manifest.recovery_command).toContain("git archive");

    for (const captureSet of manifest.capture_sets) {
      expect(captureSet.source_commit).toMatch(/^[0-9a-f]{40}$/u);
      expect(captureSet.tree).toMatch(/^[0-9a-f]{40}$/u);
      expect(captureSet.files).toHaveLength(captureSet.file_count);
      for (const file of captureSet.files) {
        expect(file.git_blob).toMatch(/^[0-9a-f]{40}$/u);
        expect(file.sha256).toMatch(/^[0-9a-f]{64}$/u);
        await expect(access(file.path)).rejects.toThrow();
      }
    }
  });

  it("routes all affected evidence screenshots through the opt-in helper", async () => {
    for (const [sourcePath, expectedCalls] of AFFECTED_SOURCES) {
      const source = await readFile(sourcePath, "utf8");
      expect(source.match(/captureEvidenceScreenshot\(/gu)).toHaveLength(
        expectedCalls,
      );
    }
  });

  it("keeps tracked evidence unchanged by default and updates it explicitly", async () => {
    const helperPath = "./e2e/helpers/evidence-capture";
    const { captureEvidenceScreenshot } = await import(
      /* @vite-ignore */ helperPath
    ) as {
      captureEvidenceScreenshot: (
        page: { screenshot(options: { path?: string }): Promise<unknown> },
        testInfo: {
          attach(name: string, options: { path: string }): Promise<void>;
          outputPath(name: string): string;
        },
        trackedPath: string,
      ) => Promise<string>;
    };
    const root = await mkdtemp(join(tmpdir(), "homecook-evidence-boundary-"));
    const trackedPath = join(root, "tracked.png");
    const outputRoot = join(root, "test-output");
    await writeFile(trackedPath, "baseline");
    const page = {
      screenshot: vi.fn(async ({ path }: { path?: string }) => {
        if (!path) throw new Error("screenshot path missing");
        await writeFile(path, "captured");
      }),
    };
    const testInfo = {
      attach: vi.fn(async () => undefined),
      outputPath: (name: string) => join(outputRoot, name),
    };

    const verificationPath = await captureEvidenceScreenshot(
      page,
      testInfo,
      trackedPath,
    );

    expect(await readFile(trackedPath, "utf8")).toBe("baseline");
    expect(await readFile(verificationPath, "utf8")).toBe("captured");
    expect(testInfo.attach).toHaveBeenCalledOnce();

    vi.stubEnv("HOMECOOK_UPDATE_EVIDENCE", "1");
    await captureEvidenceScreenshot(page, testInfo, trackedPath);

    expect(await readFile(trackedPath, "utf8")).toBe("captured");
  });
});
