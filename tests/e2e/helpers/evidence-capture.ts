import { mkdir } from "node:fs/promises";
import { basename, dirname } from "node:path";

import type { Page, TestInfo } from "@playwright/test";

type ScreenshotOptions = NonNullable<Parameters<Page["screenshot"]>[0]>;

const UPDATE_EVIDENCE_ENV = "HOMECOOK_UPDATE_EVIDENCE";

export async function captureEvidenceScreenshot(
  page: Pick<Page, "screenshot">,
  testInfo: Pick<TestInfo, "attach" | "outputPath">,
  trackedPath: string,
  options: Omit<ScreenshotOptions, "path"> = {},
) {
  const updateTrackedEvidence = process.env[UPDATE_EVIDENCE_ENV] === "1";
  const targetPath = updateTrackedEvidence
    ? trackedPath
    : testInfo.outputPath(`evidence-${basename(trackedPath)}`);
  await mkdir(dirname(targetPath), { recursive: true });
  await page.screenshot({ ...options, path: targetPath });
  if (!updateTrackedEvidence) {
    await testInfo.attach(`evidence:${basename(trackedPath)}`, {
      contentType: "image/png",
      path: targetPath,
    });
  }
  return targetPath;
}
