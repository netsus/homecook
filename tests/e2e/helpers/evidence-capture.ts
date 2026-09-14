import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";

import type { Page, TestInfo } from "@playwright/test";

type ScreenshotOptions = NonNullable<Parameters<Page["screenshot"]>[0]>;

const UPDATE_EVIDENCE_ENV = "HOMECOOK_UPDATE_EVIDENCE";

export function shouldUpdateTrackedEvidence() {
  return process.env[UPDATE_EVIDENCE_ENV] === "1";
}

export async function captureTrackedEvidenceOnDemand(
  page: Pick<Page, "screenshot">,
  options: ScreenshotOptions & { path: string },
) {
  if (!shouldUpdateTrackedEvidence()) return null;

  await mkdir(dirname(options.path), { recursive: true });
  await page.screenshot(options);
  return options.path;
}

export async function writeTrackedEvidenceOnDemand(
  trackedPath: string,
  contents: string,
) {
  if (!shouldUpdateTrackedEvidence()) return false;

  await mkdir(dirname(trackedPath), { recursive: true });
  await writeFile(trackedPath, contents);
  return true;
}

export async function captureEvidenceScreenshot(
  page: Pick<Page, "screenshot">,
  testInfo: Pick<TestInfo, "attach" | "outputPath">,
  trackedPath: string,
  options: Omit<ScreenshotOptions, "path"> = {},
) {
  const updateTrackedEvidence = shouldUpdateTrackedEvidence();
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
