import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Page } from "@playwright/test";

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
