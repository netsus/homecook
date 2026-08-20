import { mkdtemp, readFile, writeFile } from "node:fs/promises";
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
